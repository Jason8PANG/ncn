import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { logger } from '../utils/logger';
import { isAuthenticated, getCurrentUserLanId } from '../middleware/auth';
import {
  canManageAttachment,
  extractSerialNoFromUploadFileName,
  resolveSafeDownloadPath
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
    const { serialNo } = req.body;
    const ext = path.extname(file.originalname);
    const fileName = `NCN_${serialNo}${ext}`;
    cb(null, fileName);
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

    const filePath = req.file.path;
    const fileName = req.file.filename;

    logger.info(`File uploaded: ${fileName} by ${lanId}`);

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

    const safeResolved = resolveSafeDownloadPath(config.upload.path, filePath);
    if (!safeResolved) {
      return res.status(403).json({ error: 'Forbidden - Invalid file path' });
    }

    const serialNo = extractSerialNoFromUploadFileName(safeResolved);
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

    const downloadFile = safeResolved;

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
