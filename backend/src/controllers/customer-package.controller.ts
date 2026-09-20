import type { Request, Response, NextFunction } from 'express';
import { AppError, AuthRequest, UserRole } from '../types';
import { ListMyPackagesQuerySchema, PurchasePackageSchema } from '../validate';
import * as customerPackageService from '../services/customer-package.service';
import { getPublicPackages } from '../services/package.service';

function customerViewer(req: AuthRequest) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  if (req.user.role !== UserRole.CUSTOMER) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  return { userId: req.user.userId, role: req.user.role };
}

export const customerPackageController = {
  // GET /api/v1/cafes/:cafeId/packages/public
  async listPublicPackages(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await getPublicPackages(req.params.cafeId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/cafes/:cafeId/packages/:packageId/purchase  [auth]
  async purchasePackage(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = PurchasePackageSchema.parse(req.body);
      const viewer = customerViewer(req);
      const ipAddr =
        (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
        req.socket.remoteAddress ??
        '127.0.0.1';
      const data = await customerPackageService.purchasePackage(
        req.params.cafeId,
        req.params.packageId,
        viewer,
        ipAddr,
        body.return_url,
        body.gateway,
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/customers/me/packages  [auth]
  async listMyPackages(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const viewer = customerViewer(req);
      const query = ListMyPackagesQuerySchema.parse(req.query);
      const data = await customerPackageService.listMyPackages(viewer.userId, query);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/v1/customers/me/packages/:customerPackageId/usage  [auth]
  async getUsageHistory(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const viewer = customerViewer(req);
      const data = await customerPackageService.getPackageUsageHistory(
        req.params.customerPackageId,
        viewer.userId,
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/v1/customers/me/packages/:customerPackageId/repay  [auth]
  async getRepayUrl(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const viewer = customerViewer(req);
      const ipAddr =
        (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
        req.socket.remoteAddress ??
        '127.0.0.1';
      const returnUrl = typeof req.body?.return_url === 'string' ? req.body.return_url : undefined;
      const data = await customerPackageService.getRepayUrl(
        req.params.customerPackageId,
        viewer.userId,
        ipAddr,
        returnUrl,
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
};
