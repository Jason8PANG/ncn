import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { NCN_Entry, NCN_Action_Detail, NAI_Staff_Info, Code_Table } from '../models';
import { isAuthenticated, getCurrentUserLanId } from '../middleware/auth';
import { canEditNCNEntry, canCloseNCNEntry, canDeleteNCNEntry } from '../middleware/authorization';
import { logger } from '../utils/logger';
import { sequelize } from '../models';
import { QueryTypes } from 'sequelize';
import { sendNewNCNNotification } from '../utils/email';

const router = Router();

const APP_URL = process.env.NCN_APP_URL || 'http://localhost:5173';

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

const ALLOWED_NCN_TYPES = new Set(['A', 'F', 'P', 'L', 'B']);
const SERIAL_NO_PATTERN = /^NCN\d{7}$/;
const EDITABLE_ENTRY_FIELDS = new Set([
  'NCN_Type',
  'SBU',
  'SBU_Des',
  'Finder_Dept',
  'Finder',
  'Finder_Date',
  'WO',
  'Part_ID',
  'Customer',
  'Defect_Description',
  'Defect_Qty',
  'Defect_Rate',
  'Issue_Type',
  'Deep_Annlysis',
  'Tooling_Code',
  'RawMaterialLot',
  'RMpart',
  'OwnerDept',
  'Owner',
  'OwnerMail',
  'ME_Engineer',
  'QualityEngineer',
  'FilePath',
  'Comments',
  'LineLeader'
]);

const isValidDate = (value: unknown): boolean => {
  if (!value) return false;
  const str = String(value);
  // 支持 MM/DD/YYYY 或 YYYY-MM-DD 格式
  const parts = str.includes('/') ? str.split('/') : str.split('-');
  if (parts.length === 3) {
    let year: number, month: number, day: number;
    if (str.includes('/')) {
      // MM/DD/YYYY
      month = parseInt(parts[0], 10);
      day = parseInt(parts[1], 10);
      year = parseInt(parts[2], 10);
    } else {
      // YYYY-MM-DD
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900) {
      return true;
    }
  }
  const parsed = new Date(str);
  return !Number.isNaN(parsed.getTime());
};

const generateNewSerialNo = async (): Promise<string> => {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2).padStart(2, '0');
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const prefix = `NCN${year}${month}`;

  const result = await sequelize.query(
    `SELECT TOP 1 SerialNo FROM NCN_Entry WHERE SerialNo LIKE '${prefix}%' ORDER BY SerialNo DESC`,
    { type: QueryTypes.SELECT }
  ) as any[];

  if (result.length > 0 && result[0].SerialNo) {
    const lastNo = String(result[0].SerialNo);
    const lastSeq = parseInt(lastNo.substring(7), 10);
    if (!Number.isNaN(lastSeq)) {
      return `${prefix}${(lastSeq + 1).toString().padStart(3, '0')}`;
    }
  }

  return `${prefix}001`;
};

router.get('/serialno/new', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const newSerialNo = await generateNewSerialNo();

    res.json({ success: true, serialNo: newSerialNo });
  } catch (error) {
    logger.error('Error generating serial number:', error);
    res.status(500).json({ error: 'Failed to generate serial number' });
  }
});

router.get('/wo/:woCode', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { woCode } = req.params;
    res.json({
      success: true,
      data: { partId: '', customer: '', sbu: '', sbuDes: '' },
      message: 'WO lookup requires external database connection'
    });
  } catch (error) {
    logger.error('Error fetching WO info:', error);
    res.status(500).json({ error: 'Failed to fetch WO info' });
  }
});

router.get('/staff/:empId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { empId } = req.params;
    const staff = await NAI_Staff_Info.findOne({
      where: {
        Emp_ID: empId,
        Leave_Date: null
      },
      attributes: ['Emp_ID', 'Lan_ID', 'Staff_Name', 'Department']
    });

    res.json({ success: true, data: staff });
  } catch (error) {
    logger.error('Error fetching staff info:', error);
    res.status(500).json({ error: 'Failed to fetch staff info' });
  }
});

router.get('/sbu/options', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { sbu } = req.query;
    const sbus = await Code_Table.findAll({
      where: {
        Code_Category: 'ProjectCode_SBU',
        Status: 'Active',
        ...(sbu && typeof sbu === 'string' ? { Code_Description: sbu } : {})
      },
      attributes: ['Code_Description'],
      order: [['Code_Description', 'ASC']]
    });

    const descriptions = Array.from(
      new Set(
        sbus
          .map((row: any) => String(row.Code_Description || '').trim())
          .filter(Boolean)
      )
    );

    res.json({ success: true, data: descriptions });
  } catch (error) {
    logger.error('Error fetching SBU options:', error);
    res.status(500).json({ error: 'Failed to fetch SBU options' });
  }
});

router.get('/issue-type/options', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const issueTypes = await Code_Table.findAll({
      where: { Code_Category: 'NCN_Issue_Type', Status: 'Active' },
      attributes: ['Code', 'Code_Description'],
      order: [['Code', 'ASC']]
    });

    // 按 Code 去重，保留每个 Code 的第一条记录
    const seen = new Set<string>();
    const deduplicated = issueTypes.filter(item => {
      const code = (item as any).Code;
      if (seen.has(code)) return false;
      seen.add(code);
      return true;
    });

    res.json({ success: true, data: deduplicated });
  } catch (error) {
    logger.error('Error fetching Issue Type options:', error);
    res.status(500).json({ error: 'Failed to fetch Issue Type options' });
  }
});

router.get('/owner/options', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { dept } = req.query;

    const departments = await NAI_Staff_Info.findAll({
      where: { Email_Addr: { [Op.ne]: '' }, Leave_Date: null },
      attributes: ['Department'],
      group: ['Department'],
      order: [['Department', 'ASC']]
    });

    let owners: { Lan_ID: string; Staff_Name: string }[] = [];
    if (dept && typeof dept === 'string') {
      owners = await NAI_Staff_Info.findAll({
        where: {
          Department: dept,
          Email_Addr: { [Op.ne]: '' },
          Leave_Date: null,
          Lan_ID: { [Op.ne]: '' }
        },
        attributes: ['Lan_ID', 'Staff_Name'],
        order: [['Lan_ID', 'ASC']]
      });
    }

    res.json({
      success: true,
      data: {
        departments: departments.map((d: any) => d.Department),
        owners: owners.map(o => ({ lanId: o.Lan_ID, name: o.Staff_Name }))
      }
    });
  } catch (error) {
    logger.error('Error fetching Owner options:', error);
    res.status(500).json({ error: 'Failed to fetch Owner options' });
  }
});

router.get('/deep-analysis/options', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { issueType } = req.query;
    if (!issueType || typeof issueType !== 'string') {
      return res.json({ success: true, data: [] });
    }
    const rows = await Code_Table.findAll({
      where: {
        Code_Category: 'NCN_Issue_Type',
        Status: 'Active',
        Code: issueType
      },
      attributes: ['Code_Description'],
      order: [['Code_Description', 'ASC']]
    });
    const options = rows
      .map((r: any) => String(r.Code_Description || '').trim())
      .filter(Boolean);
    res.json({ success: true, data: options });
  } catch (error) {
    logger.error('Error fetching Deep Analysis options:', error);
    res.status(500).json({ error: 'Failed to fetch Deep Analysis options' });
  }
});

router.get('/me-engineer/options', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const engineers = await Code_Table.findAll({
      where: { Code_Category: 'NCN_ME', Status: 'Active' },
      attributes: ['Code_Description'],
      order: [['Code_Description', 'ASC']]
    });
    const options = Array.from(new Set(
      engineers.map((row: any) => String(row.Code_Description || '').trim()).filter(Boolean)
    ));
    res.json({ success: true, data: options });
  } catch (error) {
    logger.error('Error fetching ME Engineer options:', error);
    res.status(500).json({ error: 'Failed to fetch ME Engineer options' });
  }
});

router.get('/qe-engineer/options', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const engineers = await Code_Table.findAll({
      where: { Code_Category: 'NCN_QE', Status: 'Active' },
      attributes: ['Code_Description'],
      order: [['Code_Description', 'ASC']]
    });
    const options = Array.from(new Set(
      engineers.map((row: any) => String(row.Code_Description || '').trim()).filter(Boolean)
    ));
    res.json({ success: true, data: options });
  } catch (error) {
    logger.error('Error fetching QE Engineer options:', error);
    res.status(500).json({ error: 'Failed to fetch QE Engineer options' });
  }
});

router.post('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const lanId = getCurrentUserLanId(req);
    const entryData = { ...req.body };
    logger.info(`[CREATE] Start creating NCN, user=${lanId}`);
    logger.info(`[CREATE] Received data:`, JSON.stringify(entryData, null, 2));

    const requiredFields = ['NCN_Type', 'Finder_Dept', 'Finder',
      'WO', 'Finder_Date', 'Part_ID', 'Defect_Description',
      'Defect_Qty', 'Defect_Rate', 'ME_Engineer', 'SBU', 'SBU_Des'];

    for (const field of requiredFields) {
      if (!entryData[field]) {
        logger.warn(`[CREATE] Missing field: ${field}`);
        return res.status(400).json({ error: `Missing required field: ${field}` });
      }
    }

    if (!ALLOWED_NCN_TYPES.has(String(entryData.NCN_Type))) {
      return res.status(400).json({ error: 'Invalid NCN_Type' });
    }

    if (!isValidDate(entryData.Finder_Date)) {
      return res.status(400).json({ error: 'Finder_Date is required and must be a valid date' });
    }

    // Mirror legacy logic: regenerate serial number at submit time to reduce collision risk.
    logger.info('[CREATE] Generating serial number...');
    entryData.SerialNo = await generateNewSerialNo();
    logger.info(`[CREATE] SerialNo generated: ${entryData.SerialNo}`);

    if (!SERIAL_NO_PATTERN.test(String(entryData.SerialNo))) {
      return res.status(400).json({ error: 'Invalid SerialNo format' });
    }

    logger.info('[CREATE] Checking for duplicates...');
    const existing = await NCN_Entry.findOne({
      where: { NCN_Type: entryData.NCN_Type, SerialNo: entryData.SerialNo }
    });

    if (existing) {
      if (existing.Status === 'Closed') {
        return res.status(400).json({ error: `NCN ${entryData.SerialNo} has already closed` });
      }
      return res.status(400).json({ error: `NCN ${entryData.SerialNo} already exists` });
    }

    // Parse Finder_Date from MM/DD/YYYY format (matching original .NET code)
    const finderDateStr = String(entryData.Finder_Date || '');
    const dateParts = finderDateStr.split('/');
    
    if (dateParts.length !== 3) {
      return res.status(400).json({ error: 'Invalid Finder_Date format. Expected MM/DD/YYYY' });
    }
    
    const month = dateParts[0];
    const day = dateParts[1];
    const year = dateParts[2];
    const finderDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    
    if (isNaN(finderDate.getTime())) {
      return res.status(400).json({ error: 'Invalid Finder_Date' });
    }
    
    const week = getWeekOfYear(finderDate);
    const monthNum = (finderDate.getMonth() + 1).toString();

    // Format date as SQL Server datetime string: YYYY-MM-DD HH:mm:ss
    const pad = (n: number) => n.toString().padStart(2, '0');
    const sqlFinderDate = `${year}-${month}-${day} 12:00:00`;
    const sqlNow = `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}-${pad(new Date().getDate())}`; // YYYY-MM-DD

    // Use raw SQL insert to avoid Sequelize date formatting issues
    const insertSQL = `
      INSERT INTO dbo.NCN_Entry (
        NCN_Type, SerialNo, SBU, SBU_Des, Finder_Dept, Finder, Finder_Date,
        WO, Part_ID, Customer, Defect_Description, Defect_Qty, Defect_Rate,
        Issue_Type, Deep_Annlysis, Tooling_Code, RawMaterialLot, RMpart,
        OwnerDept, Owner, OwnerMail, ME_Engineer, QualityEngineer, LineLeader,
        Comments, Week, Month, Status, UpdateBy, UpdateDate
      ) VALUES (
        :NCN_Type, :SerialNo, :SBU, :SBU_Des, :Finder_Dept, :Finder, :Finder_Date,
        :WO, :Part_ID, :Customer, :Defect_Description, :Defect_Qty, :Defect_Rate,
        :Issue_Type, :Deep_Annlysis, :Tooling_Code, :RawMaterialLot, :RMpart,
        :OwnerDept, :Owner, :OwnerMail, :ME_Engineer, :QualityEngineer, :LineLeader,
        :Comments, :Week, :Month, :Status, :UpdateBy, :UpdateDate
      )
    `;

    const [result] = await sequelize.query(insertSQL, {
      replacements: {
        NCN_Type: entryData.NCN_Type,
        SerialNo: entryData.SerialNo,
        SBU: entryData.SBU,
        SBU_Des: entryData.SBU_Des,
        Finder_Dept: entryData.Finder_Dept,
        Finder: entryData.Finder,
        Finder_Date: sqlFinderDate,
        WO: entryData.WO,
        Part_ID: entryData.Part_ID,
        Customer: entryData.Customer || '',
        Defect_Description: entryData.Defect_Description,
        Defect_Qty: parseInt(entryData.Defect_Qty) || 0,
        Defect_Rate: entryData.Defect_Rate || '',
        Issue_Type: entryData.Issue_Type || '',
        Deep_Annlysis: entryData.Deep_Annlysis || '',
        Tooling_Code: entryData.Tooling_Code || '',
        RawMaterialLot: entryData.RawMaterialLot || '',
        RMpart: entryData.RMpart || '',
        OwnerDept: entryData.OwnerDept || '',
        Owner: entryData.Owner || '',
        OwnerMail: entryData.OwnerMail || '',
        ME_Engineer: entryData.ME_Engineer || '',
        QualityEngineer: entryData.QualityEngineer || '',
        LineLeader: entryData.LineLeader || '',
        Comments: entryData.Comments || '',
        Week: week.toString(),
        Month: monthNum,
        Status: 'On-going',
        UpdateBy: lanId,
        UpdateDate: sqlNow
      },
      type: QueryTypes.INSERT
    });

    logger.info(`[CREATE] NCN Entry created successfully: ${entryData.SerialNo} by ${lanId}`);

    // 发送邮件通知 ME Engineer
    if (entryData.ME_Engineer) {
      const meEmail = await getStaffEmail(entryData.ME_Engineer);
      if (meEmail) {
        sendNewNCNNotification(
          [meEmail],
          [],
          entryData.SerialNo,
          APP_URL
        ).catch(err => logger.error('[CREATE] Failed to send ME email:', err));
        logger.info(`[CREATE] Email sent to ME Engineer: ${meEmail}`);
      }
    }

    res.json({ success: true, data: { SerialNo: entryData.SerialNo, ROWID: result } });
  } catch (error: any) {
    logger.error('[CREATE] Error creating NCN Entry:', error);
    const errorMessage = error?.message || error?.parent?.message || 'Unknown error';
    logger.error('[CREATE] Detailed error:', errorMessage);
    res.status(500).json({ error: `Failed to create NCN Entry: ${errorMessage}` });
  }
});

// Close NCN Entry - 将状态改为 Closed，设置 CloseDate
router.put('/:rowid/close', isAuthenticated, async (req: Request, res: Response) => {
  let transaction;

  try {
    const { rowid } = req.params;
    const lanId = getCurrentUserLanId(req);
    const closeDate = new Date().toISOString().substring(0, 10); // YYYY-MM-DD

    logger.info(`[CLOSE] rowid=${rowid}, user=${lanId}, closeDate=${closeDate}`);

    const entry = await NCN_Entry.findByPk(rowid);
    if (!entry) {
      logger.warn(`[CLOSE] NCN Entry not found: rowid=${rowid}`);
      return res.status(404).json({ error: 'NCN Entry not found' });
    }

    // 只有 QE 或 Admin 可以关闭 NCN Entry
    if (!canCloseNCNEntry(req, entry)) {
      logger.warn(`[CLOSE] Permission denied for user=${lanId}, QE=${entry.QualityEngineer}`);
      return res.status(403).json({ error: 'Forbidden - Only Quality Engineer or Admin can close this NCN entry' });
    }

    if (entry.Status === 'Closed') {
      logger.warn(`[CLOSE] NCN is already closed: SerialNo=${entry.SerialNo}`);
      return res.status(400).json({ error: 'NCN has already been closed' });
    }

    transaction = await sequelize.transaction();
    const updateDate = new Date().toISOString().substring(0, 10); // YYYY-MM-DD
    await entry.update({
      Status: 'Closed',
      CloseBy: lanId,
      CloseDate: closeDate,
      UpdateBy: lanId,
      UpdateDate: updateDate
    }, { transaction });
    await transaction.commit();

    logger.info(`[CLOSE] Success: SerialNo=${entry.SerialNo}, CloseDate=${closeDate}`);

    // 刷新 entry 以获取最新数据
    const updatedEntry = await NCN_Entry.findByPk(rowid);
    res.json({ success: true, data: updatedEntry });
  } catch (error: any) {
    if (transaction) {
      await transaction.rollback();
    }
    logger.error('[CLOSE] Error:', error);
    const errorMessage = error?.message || error?.original?.message || 'Unknown error';
    res.status(500).json({ error: `Failed to close NCN Entry: ${errorMessage}` });
  }
});

router.put('/:rowid', isAuthenticated, async (req: Request, res: Response) => {
  let transaction;

  try {
    const { rowid } = req.params;
    const lanId = getCurrentUserLanId(req);
    const rawUpdateData = req.body || {};

    logger.info(`[UPDATE] rowid=${rowid}, user=${lanId}`);
    logger.info(`[UPDATE] rawUpdateData:`, JSON.stringify(rawUpdateData, null, 2));

    const disallowedFields = Object.keys(rawUpdateData).filter(field => !EDITABLE_ENTRY_FIELDS.has(field));
    if (disallowedFields.length > 0) {
      logger.warn(`[UPDATE] Disallowed fields: ${disallowedFields.join(', ')}`);
      return res.status(400).json({
        error: `Invalid update fields: ${disallowedFields.join(', ')}`
      });
    }

    const updateData: any = {};
    for (const key of Object.keys(rawUpdateData)) {
      updateData[key] = rawUpdateData[key];
    }

    if (updateData.NCN_Type && !ALLOWED_NCN_TYPES.has(String(updateData.NCN_Type))) {
      return res.status(400).json({ error: 'Invalid NCN_Type' });
    }

    if (updateData.Finder_Date && !isValidDate(updateData.Finder_Date)) {
      return res.status(400).json({ error: 'Finder_Date must be a valid date' });
    }

    const entry = await NCN_Entry.findByPk(rowid);
    if (!entry) {
      logger.warn(`[UPDATE] NCN Entry not found: rowid=${rowid}`);
      return res.status(404).json({ error: 'NCN Entry not found' });
    }

    logger.info(`[UPDATE] Found entry: SerialNo=${entry.SerialNo}, Status=${entry.Status}`);

    if (!canEditNCNEntry(req, entry)) {
      logger.warn(`[UPDATE] Permission denied for user=${lanId}`);
      return res.status(403).json({ error: 'Forbidden - No permission to edit this NCN entry' });
    }

    if (entry.Status === 'Closed') {
      logger.warn(`[UPDATE] NCN is closed: SerialNo=${entry.SerialNo}`);
      return res.status(400).json({ error: 'NCN has been closed and cannot be modified' });
    }

    if (updateData.Finder_Date) {
      // 解析 MM/DD/YYYY 或 YYYY-MM-DD 格式
      const finderDateStr = String(updateData.Finder_Date);
      let finderDate: Date;
      if (finderDateStr.includes('/')) {
        const parts = finderDateStr.split('/');
        finderDate = new Date(parseInt(parts[2], 10), parseInt(parts[0], 10) - 1, parseInt(parts[1], 10));
      } else {
        finderDate = new Date(finderDateStr);
      }
      if (!Number.isNaN(finderDate.getTime())) {
        updateData.Week = getWeekOfYear(finderDate).toString();
        updateData.Month = (finderDate.getMonth() + 1).toString();
      }
    }

    const updateDate = new Date().toISOString().substring(0, 10); // YYYY-MM-DD
    updateData.UpdateBy = lanId;
    updateData.UpdateDate = updateDate;

    logger.info(`[UPDATE] Final updateData:`, JSON.stringify(updateData, null, 2));

    // Start transaction only right before the actual write
    transaction = await sequelize.transaction();
    const updateResult = await entry.update(updateData, { transaction });
    await transaction.commit();

    // Sequelize 7 中 update 返回 { affectedCount: number }
    const affectedCount = typeof updateResult === 'object' && 'affectedCount' in updateResult 
      ? updateResult.affectedCount 
      : 1;

    logger.info(`[UPDATE] Success: SerialNo=${entry.SerialNo}, affectedCount=${affectedCount}`);

    // 刷新 entry 以获取最新数据
    const updatedEntry = await NCN_Entry.findByPk(rowid);
    res.json({ success: true, data: updatedEntry, affectedCount });
  } catch (error: any) {
    if (transaction) {
      await transaction.rollback();
    }
    logger.error('[UPDATE] Error:', error);
    const errorMessage = error?.message || error?.original?.message || 'Unknown error';
    res.status(500).json({ error: `Failed to update NCN Entry: ${errorMessage}` });
  }
});

router.get('/:serialNo', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { serialNo } = req.params;
    const data = await NCN_Entry.findOne({ where: { SerialNo: serialNo } });

    if (!data) {
      return res.status(404).json({ error: 'NCN Entry not found' });
    }

    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error fetching NCN Entry:', error);
    res.status(500).json({ error: 'Failed to fetch NCN Entry' });
  }
});

// 通过 ROWID 获取 NCN Entry
router.get('/id/:rowid', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { rowid } = req.params;
    const data = await NCN_Entry.findByPk(rowid);

    if (!data) {
      return res.status(404).json({ error: 'NCN Entry not found' });
    }

    res.json({ success: true, data });
  } catch (error) {
    logger.error('Error fetching NCN Entry by ROWID:', error);
    res.status(500).json({ error: 'Failed to fetch NCN Entry' });
  }
});

// DELETE - 删除 NCN Entry 及其关联的 Action（仅管理员）
router.delete('/:rowid', isAuthenticated, async (req: Request, res: Response) => {
  let transaction;

  try {
    const { rowid } = req.params;
    const lanId = getCurrentUserLanId(req);

    logger.info(`[DELETE] rowid=${rowid}, user=${lanId}`);

    // 只有 Admin 可以删除
    if (!canDeleteNCNEntry(req)) {
      logger.warn(`[DELETE] Permission denied for user=${lanId}`);
      return res.status(403).json({ error: 'Forbidden - Only Admin can delete NCN entries' });
    }

    // 检查 NCN Entry 是否存在
    const entry = await NCN_Entry.findByPk(rowid);
    if (!entry) {
      logger.warn(`[DELETE] NCN Entry not found: rowid=${rowid}`);
      return res.status(404).json({ error: 'NCN Entry not found' });
    }

    const serialNo = entry.SerialNo;

    transaction = await sequelize.transaction();

    // 先删除关联的 NCN_Action_Detail 记录
    const deletedActions = await NCN_Action_Detail.destroy({
      where: { NCN_ID: rowid },
      transaction
    });
    logger.info(`[DELETE] Deleted ${deletedActions} action records for NCN_ID=${rowid}`);

    // 再删除 NCN_Entry 记录
    await entry.destroy({ transaction });

    await transaction.commit();

    logger.info(`[DELETE] Success: SerialNo=${serialNo}, deleted actions count=${deletedActions}`);

    res.json({ success: true, message: `NCN ${serialNo} and ${deletedActions} action(s) deleted successfully` });
  } catch (error: any) {
    if (transaction) {
      await transaction.rollback();
    }
    logger.error('[DELETE] Error:', error);
    const errorMessage = error?.message || error?.original?.message || 'Unknown error';
    res.status(500).json({ error: `Failed to delete NCN Entry: ${errorMessage}` });
  }
});

function getWeekOfYear(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDays = Math.floor((date.getTime() - firstDayOfYear.getTime()) / 86400000);
  return Math.ceil((pastDays + firstDayOfYear.getDay() + 1) / 7);
}

export default router;
