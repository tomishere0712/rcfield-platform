import { api } from '@/shared/lib/api';

export type BookingPlayMode = 'RENTAL' | 'BYOC';

export type BookingStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'NO_SHOW'
  | 'AWAITING_PAYMENT'
  | 'COMPLETED'
  | 'CANCELLED';

export interface BookingListItem {
  id: string;
  customerId: string;
  cafeId: string;
  playMode: BookingPlayMode;
  status: BookingStatus;
  slotStart: string;
  slotEnd: string;
  totalAmount: number | string;
  paymentExpiresAt: string | null;
  checkInCode: string | null;
  createdAt: string;
  updatedAt: string;
  session: {
    id: string;
    status: string;
    plannedEndAt: string;
    actualStartAt: string | null;
  } | null;
  cafe?: { name: string; address: string; city: string } | null;
}

export interface ListMyBookingsParams {
  status?: BookingStatus;
  playMode?: BookingPlayMode;
  page?: number;
  limit?: number;
}

export async function getMyBookings(params: ListMyBookingsParams = {}): Promise<{
  data: BookingListItem[];
  total: number;
}> {
  try {
    const response = await api.get('/bookings', {
      params: {
        page: params.page ?? 1,
        limit: params.limit ?? 10,
        status: params.status,
        play_mode: params.playMode,
      },
    });
    
    // Đối với mỗi booking, backend trả về cafeId.
    // Nếu muốn hiển thị tên Cafe trên Home, ta có thể load danh sách cafes hoặc 
    // trong GET /bookings backend có tự động join cafe không?
    // Hãy xem listMyBookings controller của backend:
    // Nó dùng createQueryBuilder và b.customer_id = :customerId.
    // Nó không join cafe! Nhưng nó trả về đối tượng Booking entity (có cafeId).
    // Ở detail API thì nó có cafe object. Ở list API thì chỉ có cafeId.
    // Vì vậy ta có thể map hoặc lấy thêm thông tin cafe nếu cần.
    return {
      data: response.data?.data || [],
      total: response.data?.total || 0,
    };
  } catch (error) {
    console.error('[BookingAPI] Error fetching bookings:', error);
    return { data: [], total: 0 };
  }
}
