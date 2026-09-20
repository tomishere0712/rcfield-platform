import { api } from '@/shared/lib/api';
import type { 
  Contest, 
  ContestRegistration, 
  ContestMatch, 
  VehicleSource 
} from '../types/contests.types';

export interface ListContestsParams {
  page?: number;
  limit?: number;
  status?: string;
  contest_type_id?: string;
  contest_format_id?: string;
  cafe_id?: string;
  query?: string;
}

export interface RegisterContestPayload {
  vehicle_source: VehicleSource;
  rental?: {
    cafe_id: string;
    vehicle_catalog_id: string;
  } | null;
  byoc_vehicle_name?: string;
  byoc_vehicle_brand?: string;
  byoc_vehicle_class?: string;
  byoc_vehicle_notes?: string;
  byoc_vehicle_photos?: string[];
}

export interface UpdateByocDeclarationPayload {
  vehicle_name: string;
  vehicle_brand?: string | null;
  vehicle_class?: string | null;
  notes?: string | null;
  photos?: string[];
}

export interface ContestRentalCafeOption {
  id: string;
  name: string;
  city: string | null;
  district: string | null;
}

export interface ContestRentalVehicleCatalog {
  id: string;
  cafe_id: string;
  name: string;
  tier: string;
  hourly_rate: number;
  cover_image_url: string | null;
}

export interface ContestRentalOptions {
  cafes: ContestRentalCafeOption[];
  vehicle_catalogs: ContestRentalVehicleCatalog[];
}

export interface ContestAvailableRentalCatalogGroup {
  catalog_id: string;
  catalog_name: string;
  tier: string;
  cover_image_url: string | null;
  total_units: number;
  remaining_slots: number;
}

export const contestsApi = {
  // GET /contests - Lấy danh sách giải đấu công khai
  getPublicContests: async (params?: ListContestsParams): Promise<Contest[]> => {
    try {
      const response = await api.get('/contests', { params });
      return response.data?.data || [];
    } catch (error) {
      console.error('[ContestsAPI] Error fetching public contests:', error);
      return [];
    }
  },

  // GET /contests/:contestId - Lấy chi tiết giải đấu
  getContestDetail: async (contestId: string): Promise<Contest | null> => {
    try {
      const response = await api.get(`/contests/${contestId}`);
      return response.data?.data || null;
    } catch (error) {
      console.error(`[ContestsAPI] Error fetching contest ${contestId}:`, error);
      return null;
    }
  },

  // GET /contests/:contestId/matches - Lấy danh sách các trận đấu và sơ đồ thi đấu
  getContestMatches: async (contestId: string): Promise<ContestMatch[]> => {
    try {
      const response = await api.get(`/contests/${contestId}/matches`);
      return response.data?.data || [];
    } catch (error) {
      console.error(`[ContestsAPI] Error fetching matches for contest ${contestId}:`, error);
      return [];
    }
  },

  // GET /contests/:contestId/rental-options - Lấy danh sách chi nhánh và dòng xe được phép thuê trong giải đấu
  getRentalOptions: async (contestId: string): Promise<ContestRentalOptions | null> => {
    try {
      const response = await api.get(`/contests/${contestId}/rental-options`);
      return response.data?.data || null;
    } catch (error) {
      console.error(`[ContestsAPI] Error fetching rental options for contest ${contestId}:`, error);
      return null;
    }
  },

  // GET /contests/:contestId/available-rental-vehicles - Lấy danh sách xe thi đấu khả dụng theo chi nhánh
  getAvailableRentalVehicles: async (contestId: string, cafeId: string): Promise<ContestAvailableRentalCatalogGroup[]> => {
    try {
      const response = await api.get(`/contests/${contestId}/available-rental-vehicles`, {
        params: { cafe_id: cafeId }
      });
      return response.data?.data || [];
    } catch (error) {
      console.error(`[ContestsAPI] Error fetching available rental vehicles for contest ${contestId}:`, error);
      return [];
    }
  },

  // POST /contests/:contestId/register - Đăng ký giải đấu
  registerContest: async (contestId: string, payload: RegisterContestPayload): Promise<ContestRegistration> => {
    const response = await api.post(`/contests/${contestId}/register`, payload);
    return response.data?.data;
  },

  // GET /me/contest-registrations - Lấy danh sách giải đấu mà tôi đã đăng ký tham gia
  listMyRegistrations: async (params?: { query?: string; contest_status?: string }): Promise<ContestRegistration[]> => {
    try {
      const response = await api.get('/me/contest-registrations', { params });
      return response.data?.data || [];
    } catch (error) {
      console.error('[ContestsAPI] Error fetching my registrations:', error);
      return [];
    }
  },

  // POST /contest-registrations/:registrationId/create-entry-fee-payment - Tạo link thanh toán VNPay
  createEntryFeePayment: async (registrationId: string, returnUrl: string): Promise<{ payment_url: string; confirmed: boolean }> => {
    const response = await api.post(`/contest-registrations/${registrationId}/create-entry-fee-payment`, {
      return_url: returnUrl
    });
    return response.data?.data;
  },

  // POST /contest-registrations/:registrationId/cancel - Hủy đăng ký giải đấu
  cancelRegistration: async (registrationId: string, reason?: string): Promise<any> => {
    const response = await api.post(`/contest-registrations/${registrationId}/cancel`, {
      reason: reason || 'Khách hàng yêu cầu hủy qua ứng dụng di động'
    });
    return response.data?.data;
  },

  // PATCH /contest-registrations/:registrationId/byoc-declaration - Sửa khai báo xe BYOC
  updateByocDeclaration: async (registrationId: string, payload: UpdateByocDeclarationPayload): Promise<any> => {
    const response = await api.patch(`/contest-registrations/${registrationId}/byoc-declaration`, payload);
    return response.data?.data;
  }
};
