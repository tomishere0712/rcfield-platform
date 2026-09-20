import type { Request, Response, NextFunction } from 'express';
import { AuthRequest, AppError, UserRole } from '../types';
import {
  CreateReviewSchema,
  ProviderReviewQuerySchema,
  UpdateReviewVisibilitySchema,
} from '../validate';
import * as reviewService from '../services/review.service';

// ── Customer endpoints ────────────────────────────────────────────────────────

// POST /api/v1/customer/reviews  [auth]
export async function submitReview(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    const body = CreateReviewSchema.parse(req.body);
    const review = await reviewService.createReview(req.user.userId, body);
    res.status(201).json({ success: true, data: review });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/customer/reviews/:bookingId/dismiss  [auth]
export async function dismissReview(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    await reviewService.dismissReview(req.user.userId, req.params.bookingId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/customer/reviews/:bookingId/snooze  [auth]
export async function snoozeReviewReminder(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    await reviewService.snoozeReviewReminder(req.user.userId, req.params.bookingId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/customer/reviews/pending  [auth]
export async function listPending(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    const includeSnoozed = req.query.include_snoozed === 'true';
    const data = await reviewService.getPendingReviews(req.user.userId, includeSnoozed);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/customer/reviews  [auth]
export async function listCustomerReviews(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    const page = parseInt(String(req.query.page ?? 1), 10);
    const limit = parseInt(String(req.query.limit ?? 20), 10);
    const result = await reviewService.listCustomerReviews(req.user.userId, page, limit);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

// ── Provider endpoints ────────────────────────────────────────────────────────

// GET /api/v1/provider/reviews  [auth]
export async function listProviderReviews(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    if (req.user.role !== UserRole.PROVIDER && req.user.role !== UserRole.ADMIN) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    const { cafe_id: cafeId, status, page, limit } = ProviderReviewQuerySchema.parse(req.query);
    const result = await reviewService.getProviderReviews(
      { userId: req.user.userId, role: req.user.role },
      { cafeId, status, page, limit },
    );
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/provider/reviews/:reviewId/visibility  [auth]
export async function updateVisibility(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
    if (req.user.role !== UserRole.PROVIDER && req.user.role !== UserRole.ADMIN) {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    const { status } = UpdateReviewVisibilitySchema.parse(req.body);
    const review = await reviewService.setVisibility(
      req.params.reviewId,
      { userId: req.user.userId, role: req.user.role },
      status,
    );
    res.json({ success: true, data: review });
  } catch (err) {
    next(err);
  }
}

// ── Public endpoint ───────────────────────────────────────────────────────────

// GET /api/v1/cafes/:cafeId/reviews  [public]
export async function getCafeReviews(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const page = parseInt(String(req.query.page ?? 1), 10);
    const limit = Math.min(parseInt(String(req.query.limit ?? 10), 10), 50);
    const result = await reviewService.getCafeReviews(req.params.cafeId, page, limit);
    const aggregate = await reviewService.getCafeAggregate(req.params.cafeId);
    res.json({ success: true, aggregate, ...result });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/reviews/recent  [public]
export async function getRecentReviews(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? 5), 10), 20);
    const result = await reviewService.getRecentReviews(limit);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}
