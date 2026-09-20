import type { NextFunction, Response } from 'express';
import { logger } from '../config/logger';
import * as cafeImageService from '../services/cafe-image.service';
import { AppError, AuthRequest, UserRole } from '../types';
import { CafeImageCreateSchema } from '../validate';

function viewerFromRequest(req: AuthRequest) {
  if (!req.user) return undefined;
  return { userId: req.user.userId, role: req.user.role };
}

function formatImage(image: {
  id: string;
  cafeId: string;
  url: string;
  sortOrder: number;
  createdAt: Date;
}) {
  return {
    id: image.id,
    cafeId: image.cafeId,
    url: image.url,
    sortOrder: image.sortOrder,
    createdAt: image.createdAt,
  };
}

function assertImageFiles(
  files: Express.Multer.File[] | undefined,
): asserts files is Express.Multer.File[] {
  if (!files || files.length === 0) {
    throw new AppError('File là bắt buộc.', 400, 'FILE_REQUIRED');
  }

  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/jpg']);
  const invalidFile = files.find((file) => !allowed.has(file.mimetype));
  if (invalidFile) {
    throw new AppError('Chỉ hỗ trợ ảnh JPG, PNG, WEBP.', 422, 'UNSUPPORTED_FORMAT');
  }
}

export const cafeImageController = {
  // GET /api/v1/cafes/:cafeId/images
  async listImages(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await cafeImageService.listCafeImages(req.params.cafeId, viewerFromRequest(req));
      res.json({ success: true, data: data.map(formatImage) });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/cafes/:cafeId/images  [auth]
  async createImages(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      if (req.user.role !== UserRole.PROVIDER) {
        throw new AppError('Forbidden', 403, 'FORBIDDEN');
      }

      const body = CafeImageCreateSchema.parse(req.body);
      const files = req.files as Express.Multer.File[] | undefined;
      assertImageFiles(files);

      const images = await cafeImageService.createCafeImages({
        cafeId: req.params.cafeId,
        viewer: { userId: req.user.userId, role: req.user.role },
        baseSortOrder: body.sort_order,
        files,
      });

      logger.info('CafeImage', 'created', {
        cafeId: req.params.cafeId,
        count: images.length,
      });
      res.status(201).json({ success: true, data: images.map(formatImage) });
    } catch (err) {
      next(err);
    }
  },

  // DELETE /api/v1/cafe-images/:id  [auth]
  async deleteImage(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      if (req.user.role !== UserRole.PROVIDER) {
        throw new AppError('Forbidden', 403, 'FORBIDDEN');
      }

      await cafeImageService.deleteCafeImage({
        imageId: req.params.id,
        viewer: { userId: req.user.userId, role: req.user.role },
      });

      logger.info('CafeImage', 'deleted', { imageId: req.params.id });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
};
