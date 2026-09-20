import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { customerPackageController } from '../controllers/customer-package.controller';
import { UserRole } from '../types';

export const customerPackageRouter = Router({ mergeParams: true });

// POST /api/v1/cafes/:cafeId/packages/:packageId/purchase
customerPackageRouter.post(
  '/cafes/:cafeId/packages/:packageId/purchase',
  authenticate,
  authorize(UserRole.CUSTOMER),
  customerPackageController.purchasePackage,
);

// GET /api/v1/customers/me/packages
customerPackageRouter.get(
  '/customers/me/packages',
  authenticate,
  authorize(UserRole.CUSTOMER),
  customerPackageController.listMyPackages,
);

// GET /api/v1/customers/me/packages/:customerPackageId/usage
customerPackageRouter.get(
  '/customers/me/packages/:customerPackageId/usage',
  authenticate,
  authorize(UserRole.CUSTOMER),
  customerPackageController.getUsageHistory,
);

// POST /api/v1/customers/me/packages/:customerPackageId/repay
customerPackageRouter.post(
  '/customers/me/packages/:customerPackageId/repay',
  authenticate,
  authorize(UserRole.CUSTOMER),
  customerPackageController.getRepayUrl,
);
