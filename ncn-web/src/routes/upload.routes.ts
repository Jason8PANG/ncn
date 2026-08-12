import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { logger } from '../utils/logger';
import { isAuthenticated, getCurrentUserLanId } from '../middleware/auth';
import {
  canManageAttachment,
  extractSerialNoFromUploadFileName
} from '../middleware/authorization';
import { NCN_Entry } from '../models';

const router = Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = config.upload.path;
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // 先存临时名，避免 filename 回调阶段 req.body.serialNo 尚未解析到
    //（FormData 里 serialNo 字段若在 file 之后，multer 读不到 → NCN_undefined.{ext}）
    const ext = path.extname(file.originalname);
    const tmpName = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, tmpName);
  }
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedExts = ['.jpg', '.jpeg', '.bmp', '.gif', '.png', '.xls', '.xlsx', '.docx', '.pptx', '.ppt', '.pdf'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${ext}`));
  }
};

const upload = multer({
  storage,
  limits: { fileSize: config.upload.maxSize },
  fileFilter
});

router.post('/', isAuthenticated, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const lanId = getCurrentUserLanId(req);
    const serialNo = String(req.body?.serialNo || '');

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!serialNo) {
      return res.status(400).json({ error: 'serialNo is required' });
    }

    const entry = await NCN_Entry.findOne({ where: { SerialNo: serialNo } });
    if (!entry) {
      return res.status(404).json({ error: 'NCN not found for this serialNo' });
    }

    if (!canManageAttachment(req, entry)) {
      return res.status(403).json({ error: 'Forbidden - No permission to upload attachment for this NCN' });
    }

    // 重命名为规范文件名 NCN_{serialNo}.{ext}（临时名 → 最终名，覆盖已存在文件）
    const ext = path.extname(req.file.filename);
    const finalName = `NCN_${serialNo}${ext}`;
    const finalPath = path.join(config.upload.path, finalName);
    if (req.file.path !== finalPath) {
      if (fs.existsSync(finalPath)) {
        fs.unlinkSync(finalPath);
      }
      fs.renameSync(req.file.path, finalPath);
    }

    const filePath = finalPath;
    const fileName = finalName;

    // 传统方案：把附件路径写入 NCN_Entry.FilePath（共享路径方式，NCN-list 据此显示附件标识）
    await entry.update({ FilePath: filePath, UpdateBy: lanId });

    logger.info(`File uploaded: ${fileName} by ${lanId}, FilePath saved for ${serialNo}`);

    res.json({
      success: true,
      data: {
        filePath,
        fileName,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype
      }
    });
  } catch (error) {
    logger.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

router.get('/download', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { filePath } = req.query;

    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ error: 'File path is required' });
    }

    // 文件名必须符合 NCN 附件命名规范：NCN_{serialNo}.{ext}
    const serialNo = extractSerialNoFromUploadFileName(filePath);
    if (!serialNo) {
      return res.status(403).json({ error: 'Forbidden - Invalid NCN attachment file name' });
    }

    const entry = await NCN_Entry.findOne({ where: { SerialNo: serialNo } });
    if (!entry) {
      return res.status(404).json({ error: 'NCN not found for requested file' });
    }

    if (!canManageAttachment(req, entry)) {
      return res.status(403).json({ error: 'Forbidden - No permission to download attachment for this NCN' });
    }

    // 统一从上传根目录读取（数据库 FilePath 可能是 UNC 路径 \\suzvfile02\TaskManager\...
    // 或挂载路径，这里只取文件名拼到 UPLOAD_PATH 下，兼容共享路径方案）
    const normalizedFilePath = String(filePath).replace(/\\/g, '/');
    const downloadFile = path.join(config.upload.path, path.basename(normalizedFilePath));

    if (!fs.existsSync(downloadFile)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const fileName = path.basename(downloadFile);
    logger.info(`File downloaded: ${fileName} by ${(req.user as any)?.lanId}`);

    res.download(downloadFile, fileName);
  } catch (error) {
    logger.error('Error downloading file:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// 删除附件：删除共享目录文件 + 清空 NCN_Entry.FilePath
router.delete('/:serialNo', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const serialNo = String(req.params.serialNo || '').trim();
    if (!serialNo) {
      return res.status(400).json({ error: 'serialNo is required' });
    }

    const entry = await NCN_Entry.findOne({ where: { SerialNo: serialNo } });
    if (!entry) {
      return res.status(404).json({ error: 'NCN not found for this serialNo' });
    }

    if (!canManageAttachment(req, entry)) {
      return res.status(403).json({ error: 'Forbidden - No permission to delete attachment for this NCN' });
    }

    if (entry.FilePath) {
      // 统一从上传根目录定位文件（兼容 UNC/挂载路径，只取文件名）
      const normalized = String(entry.FilePath).replace(/\\/g, '/');
      const fileName = path.basename(normalized);
      const target = path.join(config.upload.path, fileName);
      if (fs.existsSync(target)) {
        fs.unlinkSync(target);
        logger.info(`Attachment file deleted: ${fileName} for ${serialNo} by ${(req.user as any)?.lanId}`);
      }
      await entry.update({ FilePath: '', UpdateBy: (req.user as any)?.lanId || '' });
    }

    res.json({ success: true, data: { serialNo, filePath: '' } });
  } catch (error) {
    logger.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

router.use((error: any, req: Request, res: Response, next: any) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size exceeds limit' });
    }
    return res.status(400).json({ error: error.message });
  }
  next(error);
});

export default router;
