import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { UserRole } from '../types';
import { featuredPopupController } from '../controllers/featured-popup.controller';

export const featuredPopupRouter = Router();

featuredPopupRouter.get('/explore/featured-popup', featuredPopupController.getActive);
featuredPopupRouter.get('/explore/featured-popups', featuredPopupController.listActive);

featuredPopupRouter.use('/admin/featured-popups', authenticate, authorize(UserRole.ADMIN));
// Đường tĩnh '/pending' phải đứng trước ':popupId', nếu không Express khớp
// 'pending' thành id và trả 404.
featuredPopupRouter.get('/admin/featured-popups/pending', featuredPopupController.listPending);
featuredPopupRouter.get('/admin/featured-popups', featuredPopupController.list);
featuredPopupRouter.post('/admin/featured-popups', featuredPopupController.create);
featuredPopupRouter.patch('/admin/featured-popups/:popupId', featuredPopupController.update);
featuredPopupRouter.post('/admin/featured-popups/:popupId/review', featuredPopupController.review);
