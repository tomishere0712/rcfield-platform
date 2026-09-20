import { api } from '@/shared/lib/api';

export type Companion = {
  name: string;
  phone: string;
};

export interface TrackConfig {
  id: string;
  name: string;
  description: string | null;
  status: string;
  track_type_id: string;
  track_type?: {
    id: string;
    name: string;
    description?: string | null;
  } | null;
  images?: string[];
  max_concurrent?: number;
  byoc_capacity?: number;
}

export interface VehicleCatalog {
  id: string;
  name: string;
  description: string | null;
  tier: string;
  hourlyRate: number | string;
  securityDeposit: number | string;
  coverImageUrl: string | null;
  total_units?: number;
  available_units?: number;
  compatibleTrackTypes?: {
    id: string;
    name: string;
    code: string;
  }[];
}

export interface MenuItemVariant {
  id: string;
  name: string;
  price: string;
  displayOrder: number;
  isAvailable: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  price: number | string;
  image: string | null;
  imageUrl?: string | null;
  available: boolean;
  isAvailable?: boolean;
  categoryName?: string | null;
  variants?: MenuItemVariant[];
}

export interface PopularMenuItemEntry {
  menuItemId: string;
  orderCount: number;
}

export interface CheckAvailabilityParams {
  slot_start: string;
  slot_end: string;
  play_mode: 'RENTAL' | 'BYOC';
  track_config_id?: string;
}

export interface AvailabilityResponse {
  play_mode: 'RENTAL' | 'BYOC';
  available: boolean;
  byoc_remaining?: number;
  vehicles?: RentalVehicleAvailability[];
}

export interface RentalVehicleAvailability {
  vehicle_id: string;
  vehicle_identifier: string;
  catalog_name: string;
  tier: string;
  rental_fee_per_hour: number;
  security_deposit: number;
}

export interface RentalVehicleUnit {
  id: string;
  catalogId: string;
  status: string;
  identifier?: string | null;
  color?: string | null;
  distinctive_image_url?: string | null;
  catalog?: {
    id: string;
    name: string;
    tier: string;
    cover_image_url?: string | null;
    hourlyRate: number;
  } | null;
}

export interface CreateBookingPayload {
  cafe_id: string;
  play_mode: 'RENTAL' | 'BYOC';
  slot_start: string;
  slot_end: string;
  vehicle_ids?: string[];
  participants: {
    participant_type: 'WALK_IN_GUEST';
    guest_name?: string;
    guest_phone?: string;
  }[];
  fnb_items?: { menu_item_id: string; quantity: number }[];
  track_type_id?: string;
  track_config_id?: string;
  customer_package_id?: string;
  promotion_code?: string;
}

export interface CreateBookingResult {
  booking_id: string;
  total_amount: number;
}

export interface BankTransferCheckout {
  qr_payload: string;
  qr_image_data_url: string;
  ref_code: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  amount: number;
  expires_at: string;
  is_sandbox: boolean;
  sandbox_url?: string;
  txn_ref?: string;
}

export interface CheckoutResponse {
  confirmed: boolean;
  payment_url?: string;
  txn_ref?: string;
  total_amount?: number;
  flow?: 'redirect' | 'bank_transfer';
  bank_transfer?: BankTransferCheckout;
}

export interface PromoValidationResult {
  code: string;
  discount_amount: number;
  discount_type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  value: number;
}

export const bookingWizardApi = {
  getCafeTrackConfigs: async (cafeId: string): Promise<TrackConfig[]> => {
    try {
      const response = await api.get(`/cafes/${cafeId}/track-configs`);
      return response.data?.data || [];
    } catch (error) {
      console.error('[BookingWizardAPI] Error fetching track configs:', error);
      return [];
    }
  },

  getCafeCatalogs: async (cafeId: string): Promise<VehicleCatalog[]> => {
    try {
      const response = await api.get(`/cafes/${cafeId}/vehicle-catalogs`);
      return response.data?.data || [];
    } catch (error) {
      console.error('[BookingWizardAPI] Error fetching vehicle catalogs:', error);
      return [];
    }
  },

  getCafeVehicleUnits: async (cafeId: string): Promise<RentalVehicleUnit[]> => {
    const response = await api.get(`/cafes/${cafeId}/vehicles`, {
      params: { status: 'AVAILABLE', exclude_retired: true },
    });
    return response.data?.data || [];
  },

  getCafeMenu: async (cafeId: string): Promise<MenuItem[]> => {
    try {
      const response = await api.get(`/cafes/${cafeId}/menu`, {
        params: { available: true, limit: 100 },
      });
      // Backend trả về MenuItemWithComponents (có variants, categoryName, imageUrl)
      // Map về MenuItem interface của mobile
      const items: any[] = response.data?.data || [];
      return items.map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        image: item.imageUrl ?? item.image ?? null,
        available: item.isAvailable ?? item.available ?? true,
        categoryName: item.categoryName ?? null,
        variants: item.variants ?? [],
      }));
    } catch (error) {
      console.error('[BookingWizardAPI] Error fetching menu items:', error);
      return [];
    }
  },

  getCafeMenuPopular: async (cafeId: string): Promise<PopularMenuItemEntry[]> => {
    try {
      const response = await api.get(`/cafes/${cafeId}/menu/popular`);
      return response.data?.data || [];
    } catch (error) {
      console.error('[BookingWizardAPI] Error fetching popular menu items:', error);
      return [];
    }
  },

  checkAvailability: async (
    cafeId: string,
    params: CheckAvailabilityParams
  ): Promise<AvailabilityResponse> => {
    const response = await api.get(`/cafes/${cafeId}/availability`, { params });
    return response.data?.data;
  },

  validatePromoCode: async (
    code: string,
    cafeId: string,
    slotStart: string
  ): Promise<PromoValidationResult> => {
    const response = await api.post('/promotions/validate', {
      code,
      cafe_id: cafeId,
      slot_start: slotStart,
    });
    return response.data?.data;
  },

  createBooking: async (payload: CreateBookingPayload): Promise<CreateBookingResult> => {
    const response = await api.post('/bookings', payload);
    return response.data?.data;
  },

  createCheckout: async (
    bookingId: string,
    returnUrl?: string,
    paymentMethod?: 'vnpay' | 'bank_transfer' | 'pay_later'
  ): Promise<CheckoutResponse> => {
    const response = await api.post(`/bookings/${bookingId}/checkout`, {
      return_url: returnUrl,
      payment_method: paymentMethod,
    });
    return response.data?.data;
  },

  getCafePaymentMethods: async (cafeId: string): Promise<string[]> => {
    try {
      const response = await api.get(`/cafes/${cafeId}/payment-methods`);
      return response.data?.data || ['vnpay', 'bank_transfer'];
    } catch (error) {
      console.error('[BookingWizardAPI] Error fetching cafe payment methods:', error);
      return ['vnpay', 'bank_transfer'];
    }
  },

  mockCheckout: async (bookingId: string): Promise<void> => {
    await api.post(`/bookings/${bookingId}/mock-checkout`);
  },

  createCheckoutAdditionalPayment: async (
    bookingId: string,
    returnUrl?: string,
    paymentMethod?: 'vnpay' | 'bank_transfer'
  ): Promise<CheckoutResponse> => {
    const response = await api.post(`/bookings/${bookingId}/checkout-additional-payment`, {
      return_url: returnUrl,
      payment_method: paymentMethod,
    });
    return response.data?.data;
  },

  getBooking: async (bookingId: string): Promise<any> => {
    const response = await api.get(`/bookings/${bookingId}`);
    return response.data?.data;
  },

  cancelBooking: async (bookingId: string, reason: string): Promise<any> => {
    const response = await api.post(`/bookings/${bookingId}/cancel`, { reason });
    return response.data?.data;
  },

  getSessionDetail: async (sessionId: string): Promise<any> => {
    const response = await api.get(`/sessions/${sessionId}`);
    return response.data?.data;
  },

  confirmInspection: async (
    sessionId: string,
    inspectionId: string,
    payload: { agreed: boolean; disagreementNote?: string }
  ): Promise<any> => {
    const response = await api.post(`/sessions/${sessionId}/inspections/${inspectionId}/confirm`, payload);
    return response.data?.data;
  },

  respondExtension: async (sessionId: string, approved: boolean): Promise<any> => {
    const response = await api.post(`/sessions/${sessionId}/extensions/respond`, { approved });
    return response.data?.data;
  },
};
