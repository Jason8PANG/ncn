import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { Code_Table } from '../models';
import { isAuthenticated } from '../middleware/auth';
import { isAdminRequest } from '../middleware/authorization';
import { logger } from '../utils/logger';

const router = Router();

// 参数维护接口：仅 Admin 可增删改，登录用户可查看

// 可选类别列表（ncn 相关）
const NCN_CATEGORIES = ['NCN_Issue_Type', 'NCN_ME', 'NCN_QE'];

// 获取 ncn 相关类别列表
router.get('/categories', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const rows = await Code_Table.findAll({
      attributes: ['Code_Category'],
      where: { Code_Category: { [Op.like]: 'ncn%' } },
      group: ['Code_Category'],
      order: [['Code_Category', 'ASC']]
    });
    const categories = (rows as any[]).map((r: any) => r.Code_Category).filter(Boolean);
    res.json({ success: true, data: categories });
  } catch (error) {
    logger.error('[CODEFTABLE] categories error:', error);
    res.status(500).json({ error: 'Failed to load categories' });
  }
});

// 列表：默认 ncn% 类别，可按 category 精确筛选 + keyword 搜索描述/代码
router.get('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { category, keyword, status } = req.query;
    const where: any = {};

    if (category && NCN_CATEGORIES.includes(String(category))) {
      where.Code_Category = String(category);
    } else {
      where.Code_Category = { [Op.like]: 'ncn%' };
    }

    if (keyword && String(keyword).trim()) {
      const kw = String(keyword).trim();
      where[Op.or] = [
        { Code_Description: { [Op.like]: `%${kw}%` } },
        { Code: { [Op.like]: `%${kw}%` } }
      ];
    }

    if (status && String(status).trim()) {
      where.Status = String(status).trim();
    }

    const rows = await Code_Table.findAll({
      where,
      order: [
        ['Code_Category', 'ASC'],
        ['Code', 'ASC'],
        ['Code_Description', 'ASC']
      ]
    });

    res.json({ success: true, data: rows });
  } catch (error) {
    logger.error('[CODEFTABLE] list error:', error);
    res.status(500).json({ error: 'Failed to load code table' });
  }
});

// 新增
router.post('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    if (!isAdminRequest(req)) {
      return res.status(403).json({ error: 'Forbidden - Admin only' });
    }

    const { Code_Category, Code, Code_Description, Status, Note, remark } = req.body || {};
    if (!Code_Category || !Code_Category.trim()) {
      return res.status(400).json({ error: 'Code_Category is required' });
    }
    if (!NCN_CATEGORIES.includes(String(Code_Category).trim())) {
      return res.status(400).json({ error: `Invalid Code_Category. Allowed: ${NCN_CATEGORIES.join(', ')}` });
    }
    if (!Code_Description || !String(Code_Description).trim()) {
      return res.status(400).json({ error: 'Code_Description is required' });
    }

    const row = await Code_Table.create({
      Code_Category: String(Code_Category).trim(),
      Code: String(Code || '').trim(),
      Code_Description: String(Code_Description).trim(),
      Status: String(Status || 'Active').trim(),
      Note: String(Note || '').trim() || null,
      remark: String(remark || '').trim() || null
    });

    logger.info(`[CODEFTABLE] Created ID=${row.ID} [${row.Code_Category}] ${row.Code_Description}`);
    res.json({ success: true, data: row });
  } catch (error) {
    logger.error('[CODEFTABLE] create error:', error);
    res.status(500).json({ error: 'Failed to create code table record' });
  }
});

// 更新
router.put('/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    if (!isAdminRequest(req)) {
      return res.status(403).json({ error: 'Forbidden - Admin only' });
    }

    const id = parseInt(req.params.id, 10);
    const row = await Code_Table.findByPk(id);
    if (!row) {
      return res.status(404).json({ error: 'Record not found' });
    }

    const { Code_Category, Code, Code_Description, Status, Note, remark } = req.body || {};
    if (Code_Category && !NCN_CATEGORIES.includes(String(Code_Category).trim())) {
      return res.status(400).json({ error: `Invalid Code_Category. Allowed: ${NCN_CATEGORIES.join(', ')}` });
    }

    await row.update({
      Code_Category: Code_Category !== undefined ? String(Code_Category).trim() : row.Code_Category,
      Code: Code !== undefined ? String(Code).trim() : row.Code,
      Code_Description: Code_Description !== undefined ? String(Code_Description).trim() : row.Code_Description,
      Status: Status !== undefined ? String(Status).trim() : row.Status,
      Note: Note !== undefined ? (String(Note).trim() || null) : row.Note,
      remark: remark !== undefined ? (String(remark).trim() || null) : row.remark
    });

    logger.info(`[CODEFTABLE] Updated ID=${id} [${row.Code_Category}] ${row.Code_Description}`);
    res.json({ success: true, data: row });
  } catch (error) {
    logger.error('[CODEFTABLE] update error:', error);
    res.status(500).json({ error: 'Failed to update code table record' });
  }
});

// 删除
router.delete('/:id', isAuthenticated, async (req: Request, res: Response) => {
  try {
    if (!isAdminRequest(req)) {
      return res.status(403).json({ error: 'Forbidden - Admin only' });
    }

    const id = parseInt(req.params.id, 10);
    const row = await Code_Table.findByPk(id);
    if (!row) {
      return res.status(404).json({ error: 'Record not found' });
    }

    await row.destroy();
    logger.info(`[CODEFTABLE] Deleted ID=${id} [${row.Code_Category}] ${row.Code_Description}`);
    res.json({ success: true });
  } catch (error) {
    logger.error('[CODEFTABLE] delete error:', error);
    res.status(500).json({ error: 'Failed to delete code table record' });
  }
});

export default router;
