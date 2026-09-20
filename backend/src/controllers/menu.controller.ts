import type { NextFunction, Response } from 'express';
import { logger } from '../config/logger';
import * as menuService from '../services/menu.service';
import { AppError, AuthRequest } from '../types';
import {
  CafeIdParamsSchema,
  CreateComboSchema,
  CreateMenuItemSchema,
  MenuItemParamsSchema,
  MenuListQuerySchema,
  UpdateComboSchema,
  UpdateMenuItemSchema,
} from '../validate';

function viewerFromRequest(req: AuthRequest) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  return { userId: req.user.userId, role: req.user.role };
}

function optionalViewerFromRequest(req: AuthRequest) {
  if (!req.user) return undefined;
  return { userId: req.user.userId, role: req.user.role };
}

export const menuController = {
  // GET /api/v1/cafes/:cafeId/menu  [auth]
  async listMenuItems(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId } = CafeIdParamsSchema.parse(req.params);
      const { page, limit, category_id, available } = MenuListQuerySchema.parse(req.query);
      const result = await menuService.listMenuItems({
        cafeId,
        viewer: optionalViewerFromRequest(req),
        page,
        limit,
        categoryId: category_id,
        available,
      });

      res.json({
        success: true,
        data: result.data,
        meta: { total: result.total, page, limit },
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/cafes/:cafeId/menu/popular
  async listPopularMenuItems(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId } = CafeIdParamsSchema.parse(req.params);
      const data = await menuService.getPopularMenuItems(cafeId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/cafes/:cafeId/menu  [auth]
  async createMenuItem(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId } = CafeIdParamsSchema.parse(req.params);
      const body = CreateMenuItemSchema.parse(req.body);
      const item = await menuService.createMenuItem(cafeId, viewerFromRequest(req), body);
      logger.info('Menu', 'created item', { cafeId, itemId: item.id });
      res.status(201).json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/v1/cafes/:cafeId/menu/:itemId  [auth]
  async updateMenuItem(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId, itemId } = MenuItemParamsSchema.parse(req.params);
      const body = UpdateMenuItemSchema.parse(req.body);
      const item = await menuService.updateMenuItem(cafeId, itemId, viewerFromRequest(req), body);
      logger.info('Menu', 'updated item', { cafeId, itemId });
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  },

  // DELETE /api/v1/cafes/:cafeId/menu/:itemId  [auth]
  async deleteMenuItem(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId, itemId } = MenuItemParamsSchema.parse(req.params);
      await menuService.deleteMenuItem(cafeId, itemId, viewerFromRequest(req));
      logger.info('Menu', 'deleted item', { cafeId, itemId });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/cafes/:cafeId/menu/combos  [auth]
  async createCombo(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId } = CafeIdParamsSchema.parse(req.params);
      const body = CreateComboSchema.parse(req.body);
      const combo = await menuService.createCombo(cafeId, viewerFromRequest(req), body);
      logger.info('Menu', 'created combo', { cafeId, comboId: combo.id });
      res.status(201).json({ success: true, data: combo });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/v1/cafes/:cafeId/menu/combos/:itemId  [auth]
  async updateCombo(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { cafeId, itemId } = MenuItemParamsSchema.parse(req.params);
      const body = UpdateComboSchema.parse(req.body);
      const combo = await menuService.updateCombo(cafeId, itemId, viewerFromRequest(req), body);
      logger.info('Menu', 'updated combo', { cafeId, comboId: itemId });
      res.json({ success: true, data: combo });
    } catch (err) {
      next(err);
    }
  },
};
