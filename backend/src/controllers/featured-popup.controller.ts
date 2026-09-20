import type { NextFunction, Response } from 'express';
import { AuthRequest, AppError, FeaturedPopupPlacement, UserRole } from '../types';
import {
  CreateFeaturedPopupSchema,
  FeaturedPopupListQuerySchema,
  FeaturedPopupReviewSchema,
  UpdateFeaturedPopupSchema,
} from '../validate';
import * as featuredPopupService from '../services/featured-popup.service';

function requireAdminViewer(req: AuthRequest) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  if (req.user.role !== UserRole.ADMIN) throw new AppError('Forbidden', 403, 'FORBIDDEN');
  return { userId: req.user.userId, role: req.user.role };
}

export const featuredPopupController = {
  // GET /api/v1/admin/featured-popups  [auth]
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      requireAdminViewer(req);
      const query = FeaturedPopupListQuerySchema.parse(req.query);
      const data = await featuredPopupService.listFeaturedPopups(query);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // POST /api/v1/admin/featured-popups  [auth]
  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireAdminViewer(req);
      const body = CreateFeaturedPopupSchema.parse(req.body);
      const data = await featuredPopupService.createFeaturedPopup(viewer, body);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // PATCH /api/v1/admin/featured-popups/:popupId  [auth]
  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireAdminViewer(req);
      const body = UpdateFeaturedPopupSchema.parse(req.body);
      const data = await featuredPopupService.updateFeaturedPopup(req.params.popupId, viewer, body);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/v1/admin/featured-popups/pending  [auth]
  async listPending(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      requireAdminViewer(req);
      const data = await featuredPopupService.listPendingFeaturedPopups();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // POST /api/v1/admin/featured-popups/:popupId/review  [auth]
  async review(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const viewer = requireAdminViewer(req);
      const body = FeaturedPopupReviewSchema.parse(req.body);
      const data = await featuredPopupService.reviewFeaturedPopup(req.params.popupId, viewer, body);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/v1/explore/featured-popup  [public]
  async getActive(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await featuredPopupService.getActiveFeaturedPopup(
        FeaturedPopupPlacement.EXPLORE,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/v1/explore/featured-popups
  async listActive(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await featuredPopupService.listActiveFeaturedPopups(
        FeaturedPopupPlacement.EXPLORE,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
};
