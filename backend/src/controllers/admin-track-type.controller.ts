import type { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../config/database';
import { TrackType } from '../models/track-type.entity';
import { AppError } from '../types';
import { CreateTrackTypeSchema, UpdateTrackTypeSchema } from '../validate';
import { logger } from '../config/logger';

export const adminTrackTypeController = {
  // GET /api/v1/admin/track-types  [auth]
  async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const items = await AppDataSource.getRepository(TrackType).find({
        order: { sortOrder: 'ASC', code: 'ASC' },
      });
      res.json(items.map(formatTrackType));
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/admin/track-types  [auth]
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = CreateTrackTypeSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('Dữ liệu không hợp lệ', 400, 'VALIDATION_ERROR');
      }

      const { code, name, description, is_active, sort_order } = parsed.data;
      const repo = AppDataSource.getRepository(TrackType);

      // Check if duplicate code
      const existing = await repo.findOne({ where: { code } });
      if (existing) {
        throw new AppError('Mã loại đường đua đã tồn tại', 400, 'DUPLICATE_CODE');
      }

      const trackType = new TrackType();
      trackType.code = code;
      trackType.name = name;
      trackType.description = description ?? null;
      trackType.isActive = is_active;
      trackType.sortOrder = sort_order;

      const saved = await repo.save(trackType);
      logger.info('TrackType', 'created', { id: saved.id, code: saved.code });
      res.status(201).json(formatTrackType(saved));
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/v1/admin/track-types/:id  [auth]
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = UpdateTrackTypeSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('Dữ liệu không hợp lệ', 400, 'VALIDATION_ERROR');
      }

      const repo = AppDataSource.getRepository(TrackType);
      const trackType = await repo.findOne({ where: { id: req.params.id } });
      if (!trackType) throw new AppError('Không tìm thấy', 404, 'NOT_FOUND');

      const { name, description, is_active, sort_order } = parsed.data;
      if (name !== undefined) trackType.name = name;
      if (description !== undefined) trackType.description = description ?? null;
      if (is_active !== undefined) trackType.isActive = is_active;
      if (sort_order !== undefined) trackType.sortOrder = sort_order;

      const saved = await repo.save(trackType);
      logger.info('TrackType', 'updated', { id: saved.id, code: saved.code });
      res.json(formatTrackType(saved));
    } catch (err) {
      next(err);
    }
  },
};

function formatTrackType(t: TrackType) {
  return {
    id: t.id,
    code: t.code,
    name: t.name,
    description: t.description,
    isActive: t.isActive,
    sortOrder: t.sortOrder,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}
