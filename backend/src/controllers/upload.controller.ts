import type { NextFunction, Response } from 'express';
import { AppError, AuthRequest } from '../types';
import { uploadImage } from '../services/cloudinary.service';

function assertImageFile(
  file: Express.Multer.File | undefined,
): asserts file is Express.Multer.File {
  if (!file) {
    throw new AppError('File là bắt buộc.', 400, 'FILE_REQUIRED');
  }

  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/jpg']);
  if (!allowed.has(file.mimetype)) {
    throw new AppError('Chỉ hỗ trợ ảnh JPG, PNG, WEBP.', 422, 'UNSUPPORTED_FORMAT');
  }
}

export const uploadController = {
  // POST /api/v1/uploads/images  [auth]
  async image(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');

      const file = req.file;
      assertImageFile(file);

      const usage = typeof req.body?.usage === 'string' ? req.body.usage : 'general';
      const safeUsage = usage
        .replace(/[^a-zA-Z0-9-_]/g, '-')
        .toLowerCase()
        .slice(0, 40);
      let result: { publicId: string; url: string };
      try {
        result = await uploadImage({
          buffer: file.buffer,
          folder: `rcfield/uploads/${safeUsage}/${req.user.userId}`,
          publicIdPrefix: `${safeUsage}-${req.user.userId}`,
        });
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(
          'Không thể upload ảnh lên dịch vụ lưu trữ. Vui lòng thử lại.',
          502,
          'IMAGE_UPLOAD_FAILED',
        );
      }

      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
};
