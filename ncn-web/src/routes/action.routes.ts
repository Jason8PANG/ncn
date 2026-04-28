import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { NCN_Action_Detail, NCN_Entry, NAI_Staff_Info } from '../models';
import { isAuthenticated, getCurrentUserLanId } from '../middleware/auth';
import {
  canCloseAction,
  canDeleteAction,
  canEditAction,
  canManageActionOnEntry
} from '../middleware/authorization';
import { logger } from '../utils/logger';
import { sequelize } from '../models';
import { sendNCNActionReminder, sendQECloseNotification } from '../utils/email';
import { config } from '../config';

const router = Router();

// 根据姓名或 LAN ID 查询员工邮箱
const getStaffEmail = async (nameOrLanId: string): Promise<string | null> => {
  if (!nameOrLanId) return null;
  const staff = await NAI_Staff_Info.findOne({
    where: {
      [Op.or]: [
        { Lan_ID: nameOrLanId },
        { Staff_Name: nameOrLanId }
      ]
    },
    attributes: ['Email_Addr']
  });
  return staff?.Email_Addr || null;
};

// Get actions by NCN ID - support both /api/action/ncn/:ncnId and /api/action/:ncnId
router.get('/ncn/:ncnId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { ncnId } = req.params;
    const actions = await NCN_Action_Detail.findAll({
      where: { NCN_ID: parseInt(ncnId, 10) },
      order: [['RowID', 'ASC']]
    });

    const currentActions = actions.filter(a => a.Type === 'C');
    const futureActions = actions.filter(a => a.Type === 'F');

    res.json({ success: true, data: { currentActions, futureActions } });
  } catch (error: any) {
    logger.error('Error fetching actions:', {
      message: error?.message,
      name: error?.name,
      original: error?.original,
      parent: error?.parent,
      sql: error?.sql,
      stack: error?.stack
    });
    res.status(500).json({ error: 'Failed to fetch actions', details: error?.message || error });
  }
});

// Also support /api/action/:ncnId for frontend compatibility
router.get('/:ncnId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { ncnId } = req.params;
    const actions = await NCN_Action_Detail.findAll({
      where: { NCN_ID: parseInt(ncnId, 10) },
      order: [['RowID', 'ASC']]
    });

    const currentActions = actions.filter(a => a.Type === 'C');
    const futureActions = actions.filter(a => a.Type === 'F');

    res.json({ success: true, data: { currentActions, futureActions } });
  } catch (error: any) {
    logger.error('Error fetching actions:', {
      message: error?.message,
      name: error?.name,
      original: error?.original,
      parent: error?.parent,
      sql: error?.sql
    });
    res.status(500).json({ error: 'Failed to fetch actions', details: error?.message || error });
  }
});

router.post('/', isAuthenticated, async (req: Request, res: Response) => {
  let transaction;

  try {
    transaction = await sequelize.transaction();
    const lanId = getCurrentUserLanId(req);
    const { NCN_ID, Type } = req.body;

    if (!NCN_ID) {
      await transaction.rollback();
      return res.status(400).json({ error: 'NCN_ID is required' });
    }

    const entry = await NCN_Entry.findByPk(NCN_ID, { transaction });
    if (!entry) {
      await transaction.rollback();
      return res.status(404).json({ error: 'NCN not found' });
    }

    if (!canManageActionOnEntry(req, entry)) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Forbidden - No permission to create action for this NCN' });
    }

    // NCN 已关闭，禁止增加 Action
    if (entry.Status === 'Closed') {
      await transaction.rollback();
      return res.status(400).json({ error: 'NCN is closed and cannot add new actions' });
    }

    // 直接使用日期字符串，避免时区问题
    let actionDuedate: string | null = null;
    const dueDateStr = req.body.ActionDuedate;
    if (dueDateStr) {
      const dateStr = String(dueDateStr).trim();
      // 验证格式 YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        actionDuedate = dateStr;
      }
    }

    const createData = {
      NCN_ID,
      Type,
      ActionStatus: 'Open',
      CreateBy: lanId,
      CreateDate: new Date().toISOString().substring(0, 10), // YYYY-MM-DD 格式
      CloseBy: null,
      CloseDate: null,
      ActionDept: req.body.ActionDept || '',
      ActionOwner: req.body.ActionOwner || '',
      OwnerAnalysis: req.body.OwnerAnalysis || '',
      OwnerAction: req.body.OwnerAction || '',
      ActionDuedate: actionDuedate,
      RemindMail: null
    };

    const newAction = await NCN_Action_Detail.create(createData, { transaction });

    await checkAndCloseNCN(NCN_ID, lanId, transaction);

    await transaction.commit();
    logger.info(`New Action created for NCN ${NCN_ID} by ${lanId}`);

    // 发送邮件通知 ActionOwner
    const actionOwner = req.body.ActionOwner;
    if (actionOwner) {
      const ownerEmail = await getStaffEmail(actionOwner);
      if (ownerEmail) {
        const ncnEntry = await NCN_Entry.findByPk(NCN_ID);
        sendNCNActionReminder(
          ownerEmail,
          actionOwner,
          ncnEntry?.SerialNo || String(NCN_ID),
          NCN_ID,
          ncnEntry?.WO || '',
          ncnEntry?.Part_ID || '',
          req.body.OwnerAction || '',
          actionDuedate || '',
          config.appUrl
        ).catch(err => logger.error('[ACTION] Failed to send email to owner:', err));
        logger.info(`[ACTION] Email sent to ActionOwner: ${ownerEmail}`);
      }
    }

    res.json({ success: true, data: newAction });
  } catch (error: any) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        logger.error('Error rolling back transaction:', rollbackError);
      }
    }
    logger.error('Error creating Action:', {
      message: error?.message,
      name: error?.name,
      original: error?.original,
      parent: error?.parent,
      sql: error?.sql
    });
    res.status(500).json({ 
      error: 'Failed to create Action',
      details: error?.message,
      original: error?.original?.message
    });
  }
});

router.put('/:rowid', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { rowid } = req.params;
    const lanId = getCurrentUserLanId(req);
    const updateData = req.body;

    const action = await NCN_Action_Detail.findByPk(rowid);
    if (!action) {
      return res.status(404).json({ error: 'Action not found' });
    }

    const entry = await NCN_Entry.findByPk(action.NCN_ID);
    if (!entry) {
      return res.status(404).json({ error: 'NCN not found' });
    }

    if (!canEditAction(req, action, entry)) {
      return res.status(403).json({ error: 'Forbidden - No permission to edit this action' });
    }

    // 直接使用日期字符串，避免时区问题
    if (updateData.ActionDuedate) {
      const dateStr = String(updateData.ActionDuedate).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        updateData.ActionDuedate = dateStr;
      } else if (typeof updateData.ActionDuedate === 'string' && updateData.ActionDuedate.length >= 10) {
        // 如果是其他格式的日期字符串，只取前10个字符 (YYYY-MM-DD)
        updateData.ActionDuedate = updateData.ActionDuedate.substring(0, 10);
      }
    }

    if (updateData.ActionStatus && updateData.ActionStatus !== 'Closed') {
      updateData.CloseBy = null;
      updateData.CloseDate = null;
    }

    await action.update(updateData);

    if (!action.RemindMail && updateData.ActionOwner &&
        updateData.ActionDuedate && updateData.OwnerAction &&
        updateData.ActionStatus === 'Open') {
      logger.info(`Action reminder would be sent to ${updateData.ActionOwner}`);
    }

    await checkAndCloseNCN(action.NCN_ID, lanId);

    logger.info(`Action updated: ${rowid} by ${lanId}`);
    res.json({ success: true, data: action });
  } catch (error: any) {
    logger.error('Error updating Action:', {
      message: error?.message,
      name: error?.name,
      original: error?.original,
      parent: error?.parent,
      sql: error?.sql
    });
    res.status(500).json({ 
      error: 'Failed to update Action',
      details: error?.message,
      original: error?.original?.message
    });
  }
});

router.put('/:rowid/close', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { rowid } = req.params;
    const lanId = getCurrentUserLanId(req);

    const action = await NCN_Action_Detail.findByPk(rowid);
    if (!action) {
      return res.status(404).json({ error: 'Action not found' });
    }

    const entry = await NCN_Entry.findByPk(action.NCN_ID);
    if (!entry) {
      return res.status(404).json({ error: 'NCN not found' });
    }

    if (!canCloseAction(req, action, entry)) {
      return res.status(403).json({ error: 'Forbidden - No permission to close this action' });
    }

    await action.update({ ActionStatus: 'Closed', CloseBy: lanId, CloseDate: new Date().toISOString().substring(0, 10) });
    await checkAndCloseNCN(action.NCN_ID, lanId);

    logger.info(`Action closed: ${rowid} by ${lanId}`);
    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error closing Action:', {
      message: error?.message,
      name: error?.name,
      original: error?.original,
      parent: error?.parent,
      sql: error?.sql
    });
    res.status(500).json({ 
      error: 'Failed to close Action', 
      details: error?.message,
      original: error?.original?.message
    });
  }
});

router.delete('/:rowid', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { rowid } = req.params;
    const lanId = getCurrentUserLanId(req);

    const action = await NCN_Action_Detail.findByPk(rowid);
    if (!action) {
      return res.status(404).json({ error: 'Action not found' });
    }

    const entry = await NCN_Entry.findByPk(action.NCN_ID);
    if (!entry) {
      return res.status(404).json({ error: 'NCN not found' });
    }

    if (!canDeleteAction(req, entry)) {
      return res.status(403).json({ error: 'Forbidden - No permission to delete this action' });
    }

    const ncnId = action.NCN_ID;
    await action.destroy();

    logger.info(`Action deleted: ${rowid} by ${lanId}`);
    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error deleting Action:', {
      message: error?.message,
      name: error?.name,
      original: error?.original,
      parent: error?.parent,
      sql: error?.sql
    });
    res.status(500).json({ 
      error: 'Failed to delete Action',
      details: error?.message,
      original: error?.original?.message
    });
  }
});

router.get('/staff/departments', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const departments = await NAI_Staff_Info.findAll({
      where: { Email_Addr: { [Op.ne]: '' }, Leave_Date: null },
      attributes: ['Department'],
      group: ['Department'],
      order: [['Department', 'ASC']]
    });

    res.json({ success: true, data: departments.map(d => d.Department).filter(Boolean) });
  } catch (error) {
    logger.error('Error fetching departments:', error);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

router.get('/staff/by-dept/:dept', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { dept } = req.params;
    const staff = await NAI_Staff_Info.findAll({
      where: {
        Department: dept,
        Email_Addr: { [Op.ne]: '' },
        Leave_Date: null,
        Lan_ID: { [Op.ne]: '' }
      },
      attributes: ['Lan_ID', 'Staff_Name'],
      order: [['Lan_ID', 'ASC']]
    });

    res.json({ success: true, data: staff });
  } catch (error) {
    logger.error('Error fetching staff by department:', error);
    res.status(500).json({ error: 'Failed to fetch staff' });
  }
});

async function checkAndCloseNCN(ncnId: number, lanId: string, transaction?: any) {
  try {
    // 使用事务执行查询，确保数据一致性
    const openActions = await NCN_Action_Detail.findOne({
      where: { NCN_ID: ncnId, ActionStatus: 'Open' },
      transaction
    });

    if (!openActions) {
      // 所有 action 都已关闭，发送邮件通知 Quality Engineer
      const ncn = await NCN_Entry.findByPk(ncnId, { transaction });
      if (ncn) {
        const qeEmail = await getStaffEmail(ncn.QualityEngineer || '');
        if (qeEmail) {
          // 发送邮件通知 QE 可以关闭 NCN
          sendQECloseNotification(
            qeEmail,
            ncn.SerialNo,
            config.appUrl
          ).catch(err => logger.error('[ACTION] Failed to send QE close notification:', err));
          logger.info(`[ACTION] QE close notification sent to ${qeEmail} for NCN ${ncn.SerialNo}`);
        }

        // Type A 的 NCN 自动关闭
        if (ncn.NCN_Type === 'A') {
          const closeDate = new Date().toISOString().substring(0, 10); // YYYY-MM-DD
          const updateDate = new Date().toISOString().substring(0, 10); // YYYY-MM-DD
          await ncn.update({
            Status: 'Closed',
            CloseBy: lanId,
            CloseDate: closeDate,
            UpdateBy: lanId,
            UpdateDate: updateDate
          }, { transaction });
          logger.info(`NCN ${ncnId} auto-closed (Type A, all actions completed)`);
        }
      }
    }
  } catch (error) {
    logger.error('Error in checkAndCloseNCN:', error);
    // 不抛出错误，以免影响主流程
  }
}

export default router;
