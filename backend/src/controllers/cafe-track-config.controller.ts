import type { NextFunction, Response } from 'express';
import { logger } from '../config/logger';
import * as trackConfigService from '../services/cafe-track-config.service';
import { AppError, AuthRequest } from '../types';
import { CreateCafeTrackConfigSchema, UpdateCafeTrackConfigSchema } from '../validate';

function viewerFromRequest(req: AuthRequest) {
  if (!req.user) return undefined;
  return { userId: req.user.userId, role: req.user.role };
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

export const cafeTrackConfigController = {
  // GET /api/v1/cafes/:cafeId/track-configs
  async listConfigs(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      // Mặc định chỉ trả sân đang bật. Màn quản lý cấu hình sân phải xin thêm
      // `?include_inactive=true`, và service còn kiểm quyền lần nữa.
      const includeInactive = req.query.include_inactive === 'true';
      const data = await trackConfigService.listTrackConfigs(
        req.params.cafeId,
        viewerFromRequest(req),
        { includeInactive },
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/cafes/:cafeId/track-configs  [auth]
  async createConfig(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');

      const body = CreateCafeTrackConfigSchema.parse(req.body);
      const data = await trackConfigService.createTrackConfig(
        req.params.cafeId,
        { userId: req.user.userId, role: req.user.role },
        body,
      );

      logger.info('CafeTrackConfig', 'created', {
        cafeId: req.params.cafeId,
        configId: data.id,
        trackTypeId: data.track_type_id,
      });
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/v1/cafes/:cafeId/track-configs/:configId  [auth]
  async updateConfig(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');

      const body = UpdateCafeTrackConfigSchema.parse(req.body);
      const data = await trackConfigService.updateTrackConfig(
        req.params.cafeId,
        req.params.configId,
        { userId: req.user.userId, role: req.user.role },
        body,
      );

      logger.info('CafeTrackConfig', 'updated', {
        cafeId: req.params.cafeId,
        configId: req.params.configId,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/cafes/:cafeId/track-configs/:configId/images  [auth]
  async uploadImages(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');

      const files = req.files as Express.Multer.File[] | undefined;
      assertImageFiles(files);

      const images = await trackConfigService.uploadTrackConfigImages(
        req.params.cafeId,
        req.params.configId,
        { userId: req.user.userId, role: req.user.role },
        files,
      );

      logger.info('CafeTrackConfig', 'images uploaded', {
        cafeId: req.params.cafeId,
        configId: req.params.configId,
        count: files.length,
      });
      res.status(201).json({ success: true, data: { images } });
    } catch (err) {
      next(err);
    }
  },
};
