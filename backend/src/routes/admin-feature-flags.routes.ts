import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { UserRole } from '../types';
import { adminFeatureFlagsController } from '../controllers/admin-feature-flags.controller';

export const adminFeatureFlagsRouter = Router();

adminFeatureFlagsRouter.use(authenticate, authorize(UserRole.ADMIN));

adminFeatureFlagsRouter.get('/', adminFeatureFlagsController.list);
adminFeatureFlagsRouter.patch('/:id', adminFeatureFlagsController.update);
