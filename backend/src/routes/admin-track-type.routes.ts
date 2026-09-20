import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { UserRole } from '../types';
import { adminTrackTypeController } from '../controllers/admin-track-type.controller';

export const adminTrackTypeRouter = Router();

adminTrackTypeRouter.use(authenticate, authorize(UserRole.ADMIN));

adminTrackTypeRouter.get('/', adminTrackTypeController.list);
adminTrackTypeRouter.post('/', adminTrackTypeController.create);
adminTrackTypeRouter.patch('/:id', adminTrackTypeController.update);
