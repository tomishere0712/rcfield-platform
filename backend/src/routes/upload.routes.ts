import { Router } from 'express';
import multer from 'multer';
import { uploadController } from '../controllers/upload.controller';
import { authenticate } from '../middlewares/auth.middleware';

export const uploadRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

uploadRouter.post('/images', authenticate, upload.single('file'), uploadController.image);
