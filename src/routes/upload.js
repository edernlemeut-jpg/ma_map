/**
 * upload.js — File upload endpoint for images (ship illustrations, faction icons, etc.)
 * POST /api/upload → { url: '/uploads/<uuid>.<ext>' }
 * Requires authentication. Max 5 MB. jpeg/png/webp/gif only.
 */
import { Router } from 'express';
import multer from 'multer';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import authMiddleware from '../middleware/auth.js';
import { success, validationError, error as serverError } from '../utils/response.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = join(__dirname, '../../public/uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
    cb(null, `${randomUUID()}${ext || '.bin'}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.has(file.mimetype)) cb(null, true);
    else cb(new Error('Type non autorisé (jpeg/png/webp/gif uniquement)'));
  }
});

const router = Router();
router.use(authMiddleware);

router.post('/', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return validationError(res, err.code === 'LIMIT_FILE_SIZE'
        ? 'Fichier trop volumineux (max 5 Mo)'
        : err.message);
    }
    if (err) return validationError(res, err.message);
    if (!req.file) return validationError(res, 'Aucun fichier reçu');
    success(res, { url: `/uploads/${req.file.filename}` }, 201);
  });
});

export default router;
