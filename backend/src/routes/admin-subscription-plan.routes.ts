import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { UserRole } from '../types';
import { adminSubscriptionPlanController } from '../controllers/admin-subscription-plan.controller';

export const adminSubscriptionPlanRouter = Router();

adminSubscriptionPlanRouter.use(authenticate, authorize(UserRole.ADMIN));

adminSubscriptionPlanRouter.get('/', adminSubscriptionPlanController.listPlans);
adminSubscriptionPlanRouter.patch('/:id', adminSubscriptionPlanController.updatePlan);
