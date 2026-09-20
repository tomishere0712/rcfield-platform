import { Router } from 'express';
import { adminDashboardController } from '../controllers/admin-dashboard.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { UserRole } from '../types';

export const adminDashboardRouter = Router();

// GET /api/v1/admin/dashboard/summary
adminDashboardRouter.get(
  '/summary',
  authenticate,
  authorize(UserRole.ADMIN),
  adminDashboardController.getSummary,
);
