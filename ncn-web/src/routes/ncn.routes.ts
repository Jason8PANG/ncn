import { Router, Request, Response } from 'express';
import { Op, literal } from 'sequelize';
import { NCN_Entry, NCN_Action_Detail, Code_Table } from '../models';
import { isAuthenticated } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();
const ALLOWED_NCN_TYPES = new Set(['A', 'F', 'P', 'L', 'B']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SERIAL_NO_PATTERN = /^NCN\d{7}$/;

const normalizeListParam = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(v => String(v).trim()).filter(Boolean);
  }

  return String(value)
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
};

router.get('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const {
      customer, partId, issueType, qualityEngineer, meEngineer,
      finderDept, owner, sbu, sbuList, sbuDes, dateFrom, dateTo, status, serialNo, ncnType
    } = req.query;

    const whereClause: any = {};
    const dateConditions: any[] = [];

    if (customer) whereClause.Customer = customer;
    if (partId) whereClause.Part_ID = partId;
    if (issueType) whereClause.Issue_Type = issueType;
    if (ncnType) {
      const ncnTypeValue = String(ncnType).trim().toUpperCase();
      if (!ALLOWED_NCN_TYPES.has(ncnTypeValue)) {
        return res.status(400).json({ error: 'Invalid ncnType. Allowed values: A,F,P,L,B' });
      }
      whereClause.NCN_Type = ncnTypeValue;
    }
    if (qualityEngineer) whereClause.QualityEngineer = qualityEngineer;
    if (meEngineer) whereClause.ME_Engineer = meEngineer;
    if (finderDept) whereClause.Finder_Dept = finderDept;
    if (owner) whereClause.Owner = { [Op.like]: `%${owner}%` };
    const normalizedSbuList = normalizeListParam(sbuList);
    if (normalizedSbuList.length > 0) {
      whereClause.SBU = { [Op.in]: normalizedSbuList };
    } else if (sbu) {
      whereClause.SBU = String(sbu).trim();
    }
    if (sbuDes) whereClause.SBU_Des = { [Op.like]: `%${sbuDes}%` };
    if (status) whereClause.Status = status;
    if (serialNo) {
      const serialNoValue = String(serialNo).trim();
      if (!SERIAL_NO_PATTERN.test(serialNoValue)) {
        return res.status(400).json({ error: 'Invalid serialNo format. Use NCN + 7 digits' });
      }
      whereClause.SerialNo = serialNoValue;
    }

    if (dateFrom) {
      const from = String(dateFrom);
      if (!DATE_PATTERN.test(from)) {
        return res.status(400).json({ error: 'Invalid dateFrom format. Use YYYY-MM-DD' });
      }
      dateConditions.push(literal(`[NCN_Entry].[Finder_Date] >= '${from} 00:00:00'`));
    }
    if (dateTo) {
      const to = String(dateTo);
      if (!DATE_PATTERN.test(to)) {
        return res.status(400).json({ error: 'Invalid dateTo format. Use YYYY-MM-DD' });
      }
      dateConditions.push(literal(`[NCN_Entry].[Finder_Date] <= '${to} 23:59:59'`));
    }
    if (dateConditions.length > 0) {
      whereClause[Op.and] = dateConditions;
    }

    // Try without include first to diagnose the issue
    const data = await NCN_Entry.findAll({
      where: whereClause,
      order: [['ROWID', 'DESC']]
    });

    logger.info(`Fetched ${data.length} NCN records`);
    res.json({ success: true, data: { entries: data, total: data.length } });
  } catch (error: any) {
    logger.error('Error fetching NCN list:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to fetch NCN list', details: error.message });
  }
});

router.get('/:serialNo', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serialNo } = req.params;
    const data = await NCN_Entry.findOne({
      where: { SerialNo: serialNo },
      include: [{ model: NCN_Action_Detail, as: 'actions', order: [['CreateDate', 'ASC']] }]
    });

    if (!data) {
      return res.status(404).json({ error: 'NCN not found' });
    }

    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error fetching NCN detail:', error);
    res.status(500).json({ error: 'Failed to fetch NCN detail' });
  }
});

router.get('/params/dropdowns', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const customers = await Code_Table.findAll({
      where: { Code_Category: 'PartBasic_Customer', Status: 'Active' },
      attributes: ['Code'],
      order: [['Code', 'ASC']]
    });

    const issueTypes = await Code_Table.findAll({
      where: { Code_Category: 'NCN_Issue_Type', Status: 'Active' },
      attributes: ['Code'],
      order: [['Code', 'ASC']]
    });

    const meEngineers = await Code_Table.findAll({
      where: { Code_Category: 'NCN_ME', Status: 'Active' },
      attributes: ['Code_Description'],
      order: [['Code_Description', 'ASC']]
    });

    const qeEngineers = await Code_Table.findAll({
      where: { Code_Category: 'NCN_QE', Status: 'Active' },
      attributes: ['Code_Description'],
      order: [['Code_Description', 'ASC']]
    });

    res.json({
      success: true,
      data: {
        customers: customers.map(c => c.Code),
        issueTypes: issueTypes.map(i => i.Code),
        meEngineers: meEngineers.map(m => m.Code_Description),
        qeEngineers: qeEngineers.map(q => q.Code_Description)
      }
    });
  } catch (error) {
    logger.error('Error fetching dropdowns:', error);
    res.status(500).json({ error: 'Failed to fetch dropdown options' });
  }
});

export default router;
