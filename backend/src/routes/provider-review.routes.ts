import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { UserRole } from '../types';
import { listProviderReviews, updateVisibility } from '../controllers/review.controller';

export const providerReviewRouter = Router();

providerReviewRouter.use(authenticate);
providerReviewRouter.use(authorize(UserRole.PROVIDER, UserRole.ADMIN));

providerReviewRouter.get('/', listProviderReviews);
providerReviewRouter.patch('/:reviewId/visibility', updateVisibility);
