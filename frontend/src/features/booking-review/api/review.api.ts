import { api } from '@/shared/lib/axios';
import type { Review, ReviewAggregate, PendingBookingReview } from '../types';

export async function submitReview(body: {
  booking_id: string;
  overall_score: number;
  vehicle_score?: number | null;
  staff_score?: number | null;
  facility_score?: number | null;
  note?: string | null;
}): Promise<Review> {
  const { data } = await api.post('/v1/customer/reviews', body);
  return data.data;
}

export async function dismissReview(bookingId: string): Promise<void> {
  await api.post(`/v1/customer/reviews/${bookingId}/dismiss`);
}

export async function snoozeReview(bookingId: string): Promise<void> {
  await api.post(`/v1/customer/reviews/${bookingId}/snooze`);
}

export async function getPendingReviews(options?: {
  includeSnoozed?: boolean;
}): Promise<PendingBookingReview[]> {
  const { data } = await api.get('/v1/customer/reviews/pending', {
    params: options?.includeSnoozed ? { include_snoozed: true } : undefined,
  });
  return data.data;
}

export async function getCustomerReviews(page = 1): Promise<{
  data: Review[];
  total: number;
}> {
  const { data } = await api.get('/v1/customer/reviews', { params: { page } });
  return { data: data.data, total: data.total };
}

export async function getCafeReviews(
  cafeId: string,
  page = 1,
): Promise<{ data: Review[]; total: number; aggregate: ReviewAggregate }> {
  const { data } = await api.get(`/v1/cafes/${cafeId}/reviews`, { params: { page } });
  return { data: data.data, total: data.total, aggregate: data.aggregate };
}

export async function getProviderReviews(params: {
  cafe_id?: string;
  status?: 'VISIBLE' | 'HIDDEN';
  page?: number;
  limit?: number;
}): Promise<{ data: Review[]; total: number; newSince24h: number }> {
  const { data } = await api.get('/v1/provider/reviews', { params });
  return { data: data.data, total: data.total, newSince24h: data.newSince24h };
}

export async function updateReviewVisibility(
  reviewId: string,
  status: 'VISIBLE' | 'HIDDEN',
): Promise<Review> {
  const { data } = await api.patch(`/v1/provider/reviews/${reviewId}/visibility`, { status });
  return data.data;
}
