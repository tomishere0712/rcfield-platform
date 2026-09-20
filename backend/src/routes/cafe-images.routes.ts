import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { cafeImageController } from '../controllers/cafe-image.controller';
import { UserRole } from '../types';

export const cafeImagesRouter = Router();

cafeImagesRouter.delete(
  '/cafe-images/:id',
  authenticate,
  authorize(UserRole.PROVIDER),
  cafeImageController.deleteImage,
);
