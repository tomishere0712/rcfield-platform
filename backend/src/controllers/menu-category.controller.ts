import type { NextFunction, Response } from 'express';
import { logger } from '../config/logger';
import * as menuCategoryService from '../services/menu-category.service';
import { AppError, AuthRequest } from '../types';
import {
  CafeIdParamsSchema,
  CreateMenuCategorySchema,
  MenuCategoryParamsSchema,
  ReorderMenuCategoriesSchema,
  UpdateMenuCategorySchema,
} from '../validate';

function viewerFromRequest(req: AuthRequest) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  return { userId: req.user.userId, role: req.user.role };
}

function optionalViewerFromRequest(req: AuthRequest) {
  if (!req.user) return undefined;
  return { userId: req.user.userId, role: req.user.role };
}

export const menuCategoryController = {
  // GET /api/v1/cafes/:cafeId/menu/categories
  async list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId } = CafeIdParamsSchema.parse(req.params);
      const data = await menuCategoryService.listCategories(cafeId, optionalViewerFromRequest(req));
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/cafes/:cafeId/menu/categories  [auth]
  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId } = CafeIdParamsSchema.parse(req.params);
      const body = CreateMenuCategorySchema.parse(req.body);
      const category = await menuCategoryService.createCategory(
        cafeId,
        viewerFromRequest(req),
        body,
      );
      logger.info('MenuCategory', 'created', { cafeId, categoryId: category.id });
      res.status(201).json({ success: true, data: category });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/v1/cafes/:cafeId/menu/categories/:categoryId  [auth]
  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId, categoryId } = MenuCategoryParamsSchema.parse(req.params);
      const body = UpdateMenuCategorySchema.parse(req.body);
      const category = await menuCategoryService.updateCategory(
        cafeId,
        categoryId,
        viewerFromRequest(req),
        body,
      );
      logger.info('MenuCategory', 'updated', { cafeId, categoryId });
      res.json({ success: true, data: category });
    } catch (err) {
      next(err);
    }
  },

  // DELETE /api/v1/cafes/:cafeId/menu/categories/:categoryId  [auth]
  async remove(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId, categoryId } = MenuCategoryParamsSchema.parse(req.params);
      await menuCategoryService.deleteCategory(cafeId, categoryId, viewerFromRequest(req));
      logger.info('MenuCategory', 'deleted', { cafeId, categoryId });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/v1/cafes/:cafeId/menu/categories/reorder  [auth]
  async reorder(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId } = CafeIdParamsSchema.parse(req.params);
      const body = ReorderMenuCategoriesSchema.parse(req.body);
      const data = await menuCategoryService.reorderCategories(
        cafeId,
        viewerFromRequest(req),
        body.category_ids,
      );
      logger.info('MenuCategory', 'reordered', { cafeId, count: body.category_ids.length });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
};
