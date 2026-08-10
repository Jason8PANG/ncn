import { Router, Request, Response } from 'express';
import multer from 'multer';
import { logger } from '../utils/logger';
import { isAuthenticated, getCurrentUserLanId } from '../middleware/auth';
import { canEditNCNEntry } from '../middleware/authorization';
import { NCN_Entry, NCN_Attachment } from '../models';

const router = Router();

// 文件直接进内存（Buffer），随后写入数据库 VARBINARY(MAX)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB，与旧上传接口一致
  fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowedExts = ['.jpg', '.jpeg', '.bmp', '.gif', '.png', '.xls', '.xlsx', '.docx', '.pptx', '.ppt', '.pdf'];
    const ext = file.originalname.split('.').pop()?.toLowerCase() || '';
    if (allowedExts.includes(`.${ext}`)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: .${ext}`));
    }
  }
});

// 附件元数据（不含 FileData 二进制）
const attachmentMeta = (att: NCN_Attachment) => ({
  ROWID: att.ROWID,
  NCN_ID: att.NCN_ID,
  FileName: att.FileName,
  FileType: att.FileType,
  FileSize: att.FileSize,
  UploadBy: att.UploadBy,
  UploadDate: att.UploadDate
});

// 上传附件（二进制存数据库）
router.post('/', isAuthenticated, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const lanId = getCurrentUserLanId(req);
    const ncnId = parseInt(String(req.body?.ncnId || ''), 10);

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    if (!ncnId) {
      return res.status(400).json({ error: 'ncnId is required' });
    }

    const entry = await NCN_Entry.findByPk(ncnId);
    if (!entry) {
      return res.status(404).json({ error: 'NCN entry not found' });
    }

    if (!canEditNCNEntry(req, entry)) {
      return res.status(403).json({ error: 'Forbidden - No permission to upload attachment for this NCN' });
    }

    const attachment = await NCN_Attachment.create({
      NCN_ID: ncnId,
      FileName: req.file.originalname,
      FileType: req.file.mimetype || '',
      FileSize: req.file.size,
      FileData: req.file.buffer,
      UploadBy: lanId,
      UploadDate: new Date()
    });

    logger.info(`[ATTACHMENT] Uploaded "${attachment.FileName}" (${attachment.FileSize}B) to NCN ${ncnId} by ${lanId}`);
    res.json({ success: true, data: attachmentMeta(attachment) });
  } catch (error) {
    logger.error('[ATTACHMENT] Upload error:', error);
    res.status(500).json({ error: 'Failed to upload attachment' });
  }
});

// 附件列表（某 NCN 的元数据，不含二进制）
router.get('/ncn/:ncnId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const ncnId = parseInt(req.params.ncnId, 10);
    if (!ncnId) {
      return res.status(400).json({ error: 'Invalid NCN ID' });
    }

    const entry = await NCN_Entry.findByPk(ncnId);
    if (!entry) {
      return res.status(404).json({ error: 'NCN entry not found' });
    }

    if (!canEditNCNEntry(req, entry)) {
      return res.status(403).json({ error: 'Forbidden - No permission to view attachments for this NCN' });
    }

    const attachments = await NCN_Attachment.findAll({
      where: { NCN_ID: ncnId },
      attributes: { exclude: ['FileData'] },
      order: [['ROWID', 'ASC']]
    });

    res.json({ success: true, data: attachments.map(attachmentMeta) });
  } catch (error) {
    logger.error('[ATTACHMENT] List error:', error);
    res.status(500).json({ error: 'Failed to load attachments' });
  }
});

// 下载附件（从数据库读取二进制）
router.get('/:rowid/download', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const rowid = parseInt(req.params.rowid, 10);
    const attachment = await NCN_Attachment.findByPk(rowid);
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const entry = await NCN_Entry.findByPk(attachment.NCN_ID);
    if (!entry) {
      return res.status(404).json({ error: 'NCN entry not found' });
    }

    if (!canEditNCNEntry(req, entry)) {
      return res.status(403).json({ error: 'Forbidden - No permission to download attachment for this NCN' });
    }

    logger.info(`[ATTACHMENT] Downloaded "${attachment.FileName}" (ROWID=${rowid}) by ${(req.user as any)?.lanId}`);

    res.setHeader('Content-Type', attachment.FileType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(attachment.FileName)}`);
    res.setHeader('Content-Length', attachment.FileSize);
    res.send(attachment.FileData);
  } catch (error) {
    logger.error('[ATTACHMENT] Download error:', error);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

// 删除附件
router.delete('/:rowid', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const rowid = parseInt(req.params.rowid, 10);
    const attachment = await NCN_Attachment.findByPk(rowid);
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const entry = await NCN_Entry.findByPk(attachment.NCN_ID);
    if (!entry) {
      return res.status(404).json({ error: 'NCN entry not found' });
    }

    if (!canEditNCNEntry(req, entry)) {
      return res.status(403).json({ error: 'Forbidden - No permission to delete attachment for this NCN' });
    }

    await attachment.destroy();
    logger.info(`[ATTACHMENT] Deleted "${attachment.FileName}" (ROWID=${rowid}) by ${(req.user as any)?.lanId}`);
    res.json({ success: true });
  } catch (error) {
    logger.error('[ATTACHMENT] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

// multer 错误处理
router.use((error: any, req: Request, res: Response, next: any) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size exceeds limit (10MB)' });
    }
    return res.status(400).json({ error: error.message });
  }
  if (error?.message?.includes('Unsupported file type')) {
    return res.status(400).json({ error: error.message });
  }
  next(error);
});

export default router;
