import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { UserRole } from '../types';
import { adminUserController } from '../controllers/admin-user.controller';

/**
 * Quản lý người dùng cho admin — theo dõi hành vi rồi khoá khi cần.
 *
 * Chặn quyền ở CẢ router thay vì từng route: thêm endpoint mới về sau mà quên
 * gắn `authorize` thì nó thừa hưởng luôn, không hở ra một cửa không ai để ý.
 */
export const adminUserRouter = Router();

adminUserRouter.use(authenticate, authorize(UserRole.ADMIN));

adminUserRouter.get('/', adminUserController.listUsers);
adminUserRouter.get('/:userId', adminUserController.getUserDetail);
adminUserRouter.post('/:userId/lock', adminUserController.lockUser);
adminUserRouter.post('/:userId/unlock', adminUserController.unlockUser);
