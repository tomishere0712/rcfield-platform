import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { UserRole } from '../types';
import { adminAmenityController } from '../controllers/admin-amenity.controller';

export const adminAmenityRouter = Router();

adminAmenityRouter.use(authenticate, authorize(UserRole.ADMIN));

adminAmenityRouter.get('/', adminAmenityController.list);
adminAmenityRouter.post('/', adminAmenityController.create);
adminAmenityRouter.patch('/:id', adminAmenityController.update);
adminAmenityRouter.delete('/:id', adminAmenityController.remove);
