import { Router, Request, Response } from 'express';
import { NCN_Entry, NCN_Action_Detail } from '../models';
import { isAuthenticated, getCurrentUserLanId } from '../middleware/auth';
import { canQECloseNCN } from '../middleware/authorization';
import { logger } from '../utils/logger';
import { sequelize } from '../models';

const router = Router();

router.get('/:ncnId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { ncnId } = req.params;

    const ncnEntry = await NCN_Entry.findByPk(ncnId, {
      attributes: ['ROWID', 'SerialNo', 'WO', 'Part_ID', 'NCN_Type', 'Status']
    });

    if (!ncnEntry) {
      return res.status(404).json({ error: 'NCN not found' });
    }

    const actions = await NCN_Action_Detail.findAll({
      where: { NCN_ID: parseInt(ncnId, 10) },
      order: [['CreateDate', 'ASC']]
    });

    const currentActions = actions.filter(a => a.Type === 'C');
    const futureActions = actions.filter(a => a.Type === 'F');

    res.json({
      success: true,
      data: {
        ncn: ncnEntry,
        currentActions,
        futureActions,
        canCloseToQE: currentActions.every(a => a.ActionStatus === 'Closed') &&
                       futureActions.every(a => a.ActionStatus === 'Closed') &&
                       actions.length > 0
      }
    });
  } catch (error) {
    logger.error('Error fetching Issue Log:', error);
    res.status(500).json({ error: 'Failed to fetch Issue Log' });
  }
});

router.post('/:ncnId/qe-close', isAuthenticated, async (req: Request, res: Response) => {
  const transaction = await sequelize.transaction();

  try {
    const { ncnId } = req.params;
    const lanId = getCurrentUserLanId(req);

    const openAction = await NCN_Action_Detail.findOne({
      where: { NCN_ID: parseInt(ncnId, 10), ActionStatus: 'Open' }
    });

    if (openAction) {
      await transaction.rollback();
      return res.status(400).json({ error: 'Please close all action lines first' });
    }

    const ncnEntry = await NCN_Entry.findByPk(ncnId);
    if (!ncnEntry) {
      await transaction.rollback();
      return res.status(404).json({ error: 'NCN not found' });
    }

    if (!canQECloseNCN(req, ncnEntry)) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Forbidden - Only QE owner or admin can close NCN' });
    }

    logger.info(`Email would be sent to QE ${ncnEntry.QualityEngineer} for NCN ${ncnEntry.SerialNo}`);

    if (ncnEntry.NCN_Type !== 'A') {
      const closeDate = new Date().toISOString().substring(0, 10); // YYYY-MM-DD
      const updateDate = new Date().toISOString().substring(0, 10); // YYYY-MM-DD
      await ncnEntry.update({
        Status: 'Closed',
        CloseBy: lanId,
        CloseDate: closeDate,
        UpdateBy: lanId,
        UpdateDate: updateDate
      }, { transaction });
    }

    await transaction.commit();
    logger.info(`NCN ${ncnId} sent to QE for closing by ${lanId}`);
    res.json({ success: true });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error sending to QE:', error);
    res.status(500).json({ error: 'Failed to send to QE' });
  }
});

router.get('/return', (req: Request, res: Response) => {
  res.json({ success: true, redirectTo: '/api/ncn' });
});

export default router;
