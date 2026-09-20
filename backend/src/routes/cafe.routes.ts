import { Router } from 'express';
import multer from 'multer';
import {
  authenticate,
  authorize,
  optionalAuthenticate,
  requireActiveProvider,
} from '../middlewares/auth.middleware';
import { cafeController } from '../controllers/cafe.controller';
import { cafeImageController } from '../controllers/cafe-image.controller';
import { cafeTrackConfigController } from '../controllers/cafe-track-config.controller';
import { vehicleController } from '../controllers/vehicle.controller';
import { menuController } from '../controllers/menu.controller';
import { menuCategoryController } from '../controllers/menu-category.controller';
import { menuRouter } from './menu.routes';
import { promotionController } from '../controllers/promotion.controller';
import { packageController } from '../controllers/package.controller';
import { customerPackageController } from '../controllers/customer-package.controller';
import { UserRole } from '../types';
import { getCafeReviews } from '../controllers/review.controller';

export const cafeRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

cafeRouter.get('/', optionalAuthenticate, cafeController.listCafes);
// Danh mục phải đăng ký TRƯỚC '/:cafeId/menu' và trước menuRouter
cafeRouter.get('/:cafeId/menu/categories', optionalAuthenticate, menuCategoryController.list);
cafeRouter.get('/:cafeId/menu/popular', optionalAuthenticate, menuController.listPopularMenuItems);
cafeRouter.get('/:cafeId/menu', optionalAuthenticate, menuController.listMenuItems);
cafeRouter.use('/:cafeId/menu', menuRouter);
cafeRouter.get('/:cafeId', optionalAuthenticate, cafeController.getCafeById);
cafeRouter.get('/:cafeId/images', cafeImageController.listImages);
cafeRouter.get('/:cafeId/vehicles', optionalAuthenticate, vehicleController.listUnits);
cafeRouter.get('/:cafeId/availability', optionalAuthenticate, cafeController.getAvailability);
// Public active promotions — no auth, must be BEFORE parameterized routes
cafeRouter.get('/:cafeId/promotions/active', promotionController.listActive);
// Customer preview — must be registered BEFORE the parameterized /:promotionId routes
cafeRouter.post(
  '/:cafeId/promotions/preview',
  authenticate,
  authorize(UserRole.CUSTOMER, UserRole.PROVIDER, UserRole.ADMIN),
  promotionController.preview,
);
cafeRouter.get(
  '/:cafeId/promotions',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.ADMIN),
  promotionController.list,
);
cafeRouter.post(
  '/:cafeId/promotions',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.ADMIN),
  promotionController.create,
);
cafeRouter.patch(
  '/:cafeId/promotions/:promotionId',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.ADMIN),
  promotionController.update,
);
cafeRouter.delete(
  '/:cafeId/promotions/:promotionId',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.ADMIN),
  promotionController.remove,
);
// Public package listing — no auth required
cafeRouter.get('/:cafeId/packages/public', customerPackageController.listPublicPackages);

cafeRouter.get(
  '/:cafeId/packages',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.ADMIN),
  packageController.list,
);
cafeRouter.post(
  '/:cafeId/packages',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.ADMIN),
  packageController.create,
);
cafeRouter.patch(
  '/:cafeId/packages/:packageId',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.ADMIN),
  packageController.update,
);
cafeRouter.delete(
  '/:cafeId/packages/:packageId',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.ADMIN),
  packageController.remove,
);
cafeRouter.post(
  '/',
  authenticate,
  authorize(UserRole.PROVIDER),
  requireActiveProvider,
  cafeController.createCafe,
);
cafeRouter.patch(
  '/:cafeId',
  authenticate,
  authorize(UserRole.PROVIDER),
  requireActiveProvider,
  cafeController.updateCafe,
);
cafeRouter.patch(
  '/:cafeId/status',
  authenticate,
  authorize(UserRole.ADMIN, UserRole.PROVIDER),
  cafeController.updateCafeStatus,
);
cafeRouter.post(
  '/:cafeId/images',
  authenticate,
  authorize(UserRole.PROVIDER),
  requireActiveProvider,
  upload.array('files', 20),
  cafeImageController.createImages,
);
// ── track configs ─────────────────────────────────────────────────────────────
cafeRouter.get(
  '/:cafeId/track-configs',
  optionalAuthenticate,
  cafeTrackConfigController.listConfigs,
);
cafeRouter.post(
  '/:cafeId/track-configs',
  authenticate,
  authorize(UserRole.PROVIDER),
  requireActiveProvider,
  cafeTrackConfigController.createConfig,
);
cafeRouter.patch(
  '/:cafeId/track-configs/:configId',
  authenticate,
  authorize(UserRole.PROVIDER),
  requireActiveProvider,
  cafeTrackConfigController.updateConfig,
);
cafeRouter.post(
  '/:cafeId/track-configs/:configId/images',
  authenticate,
  authorize(UserRole.PROVIDER),
  requireActiveProvider,
  upload.array('files', 20),
  cafeTrackConfigController.uploadImages,
);

cafeRouter.get('/:cafeId/reviews', getCafeReviews);

cafeRouter.get('/:cafeId/widget-config', cafeController.getWidgetConfig);
cafeRouter.put(
  '/:cafeId/widget-config',
  authenticate,
  authorize(UserRole.PROVIDER, UserRole.ADMIN),
  requireActiveProvider,
  cafeController.updateWidgetConfig,
);
