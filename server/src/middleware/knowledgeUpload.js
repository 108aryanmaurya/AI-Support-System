import multer from 'multer';
import { KNOWLEDGE_MAX_UPLOAD_BYTES } from '@ai-support/shared';
import { HttpError } from '../utils/httpError.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: KNOWLEDGE_MAX_UPLOAD_BYTES, files: 1 },
});

function knowledgeUploadMiddleware(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        error: `File exceeds maximum size of ${Math.round(KNOWLEDGE_MAX_UPLOAD_BYTES / 1024)} KB.`,
      });
      return;
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      res.status(400).json({ error: 'Upload field name must be "file".' });
      return;
    }
    next(new HttpError(400, err.message || 'Upload failed.'));
  });
}

export { knowledgeUploadMiddleware };
