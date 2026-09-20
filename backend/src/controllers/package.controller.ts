import type { Response, NextFunction } from 'express';
import { AuthRequest, AppError, UserRole } from '../types';
import { CreatePackageSchema, PackageIdParamsSchema, UpdatePackageSchema } from '../validate';
import * as packageService from '../services/package.service';

function providerViewer(req: AuthRequest) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  if (req.user.role !== UserRole.PROVIDER && req.user.role !== UserRole.ADMIN) {
    throw new AppError('Forbidden', 403, 'FORBIDDEN');
  }
  return { userId: req.user.userId, role: req.user.role };
}

export const packageController = {
  async list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await packageService.listPackages(req.params.cafeId, providerViewer(req));
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = CreatePackageSchema.parse(req.body);
      const data = await packageService.createPackage(req.params.cafeId, providerViewer(req), body);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { packageId } = PackageIdParamsSchema.parse(req.params);
      const body = UpdatePackageSchema.parse(req.body);
      const data = await packageService.updatePackage(
        req.params.cafeId,
        packageId,
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
      const { packageId } = PackageIdParamsSchema.parse(req.params);
      await packageService.deletePackage(req.params.cafeId, packageId, providerViewer(req));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
};
