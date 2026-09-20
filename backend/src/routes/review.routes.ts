import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { UserRole } from '../types';
import {
  submitReview,
  dismissReview,
  snoozeReviewReminder,
  listPending,
  listCustomerReviews,
} from '../controllers/review.controller';

export const reviewRouter = Router();

reviewRouter.use(authenticate);
reviewRouter.use(authorize(UserRole.CUSTOMER));

reviewRouter.post('/', submitReview);
reviewRouter.post('/:bookingId/dismiss', dismissReview);
reviewRouter.post('/:bookingId/snooze', snoozeReviewReminder);
reviewRouter.get('/pending', listPending);
reviewRouter.get('/', listCustomerReviews);
