import type { Response, NextFunction } from 'express';
import { AuthRequest, AppError, UserRole } from '../types';
import {
  CreatePromotionSchema,
  PreviewPromoSchema,
  PromotionIdParamsSchema,
  UpdatePromotionSchema,
} from '../validate';
import * as promotionService from '../services/promotion.service';

function providerViewer(req: AuthRequest) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  if (req.user.role !== UserRole.PROVIDER && req.user.role !== UserRole.ADMIN) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  return { userId: req.user.userId, role: req.user.role };
}

export const promotionController = {
  async list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await promotionService.listPromotions(req.params.cafeId, providerViewer(req));
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = CreatePromotionSchema.parse(req.body);
      const data = await promotionService.createPromotion(
        req.params.cafeId,
        providerViewer(req),
        body,
      );
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { promotionId } = PromotionIdParamsSchema.parse(req.params);
      const body = UpdatePromotionSchema.parse(req.body);
      const data = await promotionService.updatePromotion(
        req.params.cafeId,
        promotionId,
        providerViewer(req),
        body,
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async remove(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { promotionId } = PromotionIdParamsSchema.parse(req.params);
      await promotionService.deletePromotion(req.params.cafeId, promotionId, providerViewer(req));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/cafes/:cafeId/promotions/active  [public]
  async listActive(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await promotionService.listActivePublicPromotions(req.params.cafeId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/cafes/:cafeId/promotions/preview  [auth]
  async preview(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
      const body = PreviewPromoSchema.parse(req.body);
      const result = await promotionService.validatePromoCode({
        cafeId: req.params.cafeId,
        code: body.code,
        customerId: req.user.userId,
        subtotal: body.subtotal,
        playMode: body.play_mode,
        slotStart: new Date(body.slot_start),
      });
      res.json({
        success: true,
        data: {
          code: result.promotion.code,
          discount_amount: result.discountAmount,
          discount_type: result.promotion.discountType,
          description: result.promotion.description,
        },
      });
    } catch (err) {
      next(err);
    }
  },
};
