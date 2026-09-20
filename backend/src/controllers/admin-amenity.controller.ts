import type { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../config/database';
import { AmenityCatalog } from '../models/amenity-catalog.entity';
import { AppError } from '../types';
import { CreateAmenitySchema, UpdateAmenitySchema } from '../validate';
import { logger } from '../config/logger';

export const adminAmenityController = {
  // GET /api/v1/admin/amenities  [auth]
  async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const items = await AppDataSource.getRepository(AmenityCatalog).find({
        order: { sortOrder: 'ASC' },
      });
      res.json(items.map(formatAmenity));
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/admin/amenities  [auth]
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = CreateAmenitySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('Dữ liệu không hợp lệ', 400, 'VALIDATION_ERROR');
      }

      const { title, description, icon, sort_order } = parsed.data;
      const repo = AppDataSource.getRepository(AmenityCatalog);
      const amenity = new AmenityCatalog();
      amenity.title = title;
      amenity.description = description ?? null;
      amenity.icon = icon;
      amenity.sortOrder = sort_order;

      const saved = await repo.save(amenity);
      logger.info('AmenityCatalog', 'created', { id: saved.id, title: saved.title });
      res.status(201).json(formatAmenity(saved));
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/v1/admin/amenities/:id  [auth]
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = UpdateAmenitySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('Dữ liệu không hợp lệ', 400, 'VALIDATION_ERROR');
      }

      const repo = AppDataSource.getRepository(AmenityCatalog);
      const amenity = await repo.findOne({ where: { id: req.params.id } });
      if (!amenity) throw new AppError('Không tìm thấy', 404, 'NOT_FOUND');

      const { title, description, icon, sort_order } = parsed.data;
      if (title !== undefined) amenity.title = title;
      if (description !== undefined) amenity.description = description ?? null;
      if (icon !== undefined) amenity.icon = icon;
      if (sort_order !== undefined) amenity.sortOrder = sort_order;

      const saved = await repo.save(amenity);
      res.json(formatAmenity(saved));
    } catch (err) {
      next(err);
    }
  },

  // DELETE /api/v1/admin/amenities/:id  [auth]
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(AmenityCatalog);
      const amenity = await repo.findOne({ where: { id: req.params.id } });
      if (!amenity) throw new AppError('Không tìm thấy', 404, 'NOT_FOUND');

      await repo.remove(amenity);
      logger.info('AmenityCatalog', 'deleted', { id: req.params.id, title: amenity.title });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
};

function formatAmenity(a: AmenityCatalog) {
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    icon: a.icon,
    sortOrder: a.sortOrder,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}
