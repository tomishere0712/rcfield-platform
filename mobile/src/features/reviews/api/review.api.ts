import { api } from '@/shared/lib/api';

export interface SubmitReviewPayload {
  booking_id: string;
  overall_score: number;
  vehicle_score?: number | null;
  staff_score?: number | null;
  facility_score?: number | null;
  note?: string | null;
}

export async function submitReview(payload: SubmitReviewPayload): Promise<any> {
  const response = await api.post('/customer/reviews', payload);
  return response.data?.data;
}

export async function dismissReview(bookingId: string): Promise<void> {
  await api.post(`/customer/reviews/${bookingId}/dismiss`);
}

export async function getMyReviews(page = 1, limit = 20): Promise<{ data: any[]; total: number }> {
  const response = await api.get('/customer/reviews', { params: { page, limit } });
  return {
    data: response.data?.data || [],
    total: response.data?.total || 0,
  };
}
