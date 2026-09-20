import { Router } from 'express';
import { menuController } from '../controllers/menu.controller';
import { menuCategoryController } from '../controllers/menu-category.controller';
import { authenticate, authorize, requireActiveProvider } from '../middlewares/auth.middleware';
import { UserRole } from '../types';

export const menuRouter = Router({ mergeParams: true });

menuRouter.use(authenticate, authorize(UserRole.PROVIDER), requireActiveProvider);

// ⚠️ THỨ TỰ ĐĂNG KÝ QUAN TRỌNG — mọi path tĩnh phải đứng TRƯỚC '/:itemId',
// nếu không Express khớp '/categories/<uuid>' vào '/:itemId' với itemId = "categories"
// và trả lỗi UUID không hợp lệ. Tương tự '/categories/reorder' phải đứng trước
// '/categories/:categoryId'.
menuRouter.post('/categories', menuCategoryController.create);
menuRouter.patch('/categories/reorder', menuCategoryController.reorder);
menuRouter.patch('/categories/:categoryId', menuCategoryController.update);
menuRouter.delete('/categories/:categoryId', menuCategoryController.remove);

menuRouter.post('/combos', menuController.createCombo);
menuRouter.patch('/combos/:itemId', menuController.updateCombo);

menuRouter.post('/', menuController.createMenuItem);
menuRouter.patch('/:itemId', menuController.updateMenuItem);
menuRouter.delete('/:itemId', menuController.deleteMenuItem);
