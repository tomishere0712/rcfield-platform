import { api } from '@/shared/lib/api';

export type StaffBookingStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'AWAITING_PAYMENT'
  | 'COMPLETED';

export type StaffFnbOrderStatus = 'PENDING' | 'CONFIRMED' | 'DELIVERED' | 'CANCELLED';
export type StaffInspectionType = 'CHECK_IN' | 'CHECK_OUT';
export type StaffBookingSource = 'APP' | 'STAFF_MANUAL' | 'WALK_IN' | 'FACEBOOK' | 'CONTEST';
export type StaffPlayMode = 'RENTAL' | 'BYOC' | 'MIXED';
export type StaffInspectionItemStatus = 'OK' | 'BROKEN';
export type DamagePartType =
  | 'TIRE_WHEEL'
  | 'SPOILER'
  | 'CHASSIS'
  | 'MOTOR'
  | 'SHELL'
  | 'SERVO'
  | 'REMOTE'
  | 'OTHER';

export interface DamageLineItemInput {
  partType: DamagePartType;
  customPartName?: string;
  partsPrice: number;
  laborPrice?: number;
}

export interface DamageLineItemDetail extends DamageLineItemInput {
  id?: string;
  lineTotal: number;
}

export interface BankTransferCheckout {
  qr_image_data_url: string;
  qr_payload: string;
  ref_code: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  amount: number;
  expires_at: string;
  is_sandbox?: boolean;
  sandbox_url?: string;
}

export interface TodayBookingItem {
  bookingId: string;
  shortCode: string;
  cafeId: string;
  cafeName: string;
  cafeAddress: string;
  trackName: string;
  trackType: string;
  playMode: 'RENTAL' | 'BYOC' | 'MIXED';
  source: 'APP' | 'STAFF_MANUAL';
  status: StaffBookingStatus;
  slotStart: string;
  slotEnd: string;
  totalAmount: number;
  paymentStatus: 'UNPAID' | 'PAID' | 'REFUNDED';
  plannedParticipants: string[];
  participantDetails?: { name: string; phone?: string; isBooker: boolean }[];
  plannedVehicles: string[];
  sessions: StaffSessionSummary[];
}

/** Minimal detail returned by GET /bookings/:id for a scanned booking QR. */
export interface StaffQrBookingLookup {
  id: string;
  status: StaffBookingStatus;
  slotStart: string;
  slotEnd: string;
  playMode?: TodayBookingItem['playMode'];
  session?: {
    id: string;
    status?: string;
    plannedEndAt?: string;
  } | null;
}

export interface StaffSessionSummary {
  sessionId?: string;
  id?: string;
  status?: string;
  plannedEnd?: string;
  plannedEndAt?: string;
  operationalTiming?: {
    state: 'NOT_APPLICABLE' | 'ON_TIME' | 'DUE_FOR_CHECKOUT' | 'OVERDUE';
    minutesUntilPlannedEnd: number;
    minutesPastPlannedEnd: number;
    isOverdue: boolean;
    shouldAlert: boolean;
    graceMinutes?: number;
    alertAfterMinutes?: number;
  };
}

export interface TodayFnbOrderItem {
  id: string;
  bookingId: string;
  status: StaffFnbOrderStatus;
  totalAmount: number;
  createdAt: string;
  slotStart: string;
  customerName: string;
  items: {
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    notes: string | null;
  }[];
}

export interface StaffSessionDetail {
  sessionId: string;
  bookingId: string;
  cafeId?: string;
  cafeName?: string;
  cafeAddress?: string;
  bookingSource?: StaffBookingSource;
  playMode?: StaffPlayMode;
  status: string;
  staffName: string;
  actualStart?: string;
  actualEnd?: string;
  plannedEnd: string;
  operationalTiming?: StaffSessionSummary['operationalTiming'];
  participants: { name: string; type: string; avatarUrl?: string }[];
  vehicles: {
    vehicleId: string;
    name: string;
    type: 'RENT' | 'BYOC';
    imageUrl?: string;
    damageMultiplier?: number;
  }[];
  inspections: {
    inspectionId: string;
    type: 'CHECK_IN' | 'CHECK_OUT';
    photos: { url: string; angle: string; notes?: string }[];
    checklist: { itemKey: string; itemLabel: string; status: string; note?: string | null }[];
    staffNotes?: string;
    customerConfirmed?: boolean;
    customerConfirmedAt?: string;
    damageFlagged?: boolean;
    damageLineItems?: DamageLineItemDetail[];
    totalDamageCharge?: number;
  }[];
  extensionProposal?: {
    proposalId: string;
    extraMinutes: number;
    additionalFee: number;
    newPlannedEnd: string;
    expiresAt?: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  };
  approvedExtensionFee?: number;
  approvedExtensionMinutes?: number;
  approvedExtensions?: {
    proposalId: string;
    extraMinutes: number;
    additionalFee: number;
    approvedAt?: string;
  }[];
  extensionPricingOptions?: {
    extraMinutes: number;
    additionalFee: number;
    newPlannedEnd: string;
    available: boolean;
    blockedReason?: string;
  }[];
  fnbOrders: {
    orderId: string;
    orderType: string;
    status: string;
    items: { name: string; qty: number; price: number }[];
    total: number;
  }[];
  financialSummary?: {
    prepaidLines: { componentId: string; label: string; amount: number }[];
    prepaidDiscountAmount: number;
    prepaidPaidAmount: number;
    additionalLines: { componentId: string; type?: string; label: string; amount: number; status: string }[];
    additionalTotal: number;
    additionalOutstandingAmount: number;
    totalPaidAmount: number;
    depositAmount: number;
    depositConsumed: number;
    depositRemaining: number;
  };
  paymentSummary?: {
    outstandingAmount: number;
    pendingRefundAmount: number;
    pendingPaymentCount: number;
    pendingRefundCount: number;
    requiresSettlement: boolean;
  };
}

export interface SubmitInspectionPayload {
  type: StaffInspectionType;
  photos?: { url: string; angle: string; notes?: string }[];
  checklist?: {
    itemKey: string;
    itemLabel: string;
    status: StaffInspectionItemStatus;
    note?: string;
  }[];
  staffNotes?: string;
  damageFlagged?: boolean;
  damageLineItems?: DamageLineItemInput[];
}

export interface StaffMenuVariant {
  id: string;
  name: string;
  price: number | string;
  displayOrder?: number;
  isAvailable?: boolean;
}

export interface StaffMenuItem {
  id: string;
  name: string;
  price: number | string;
  description?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  image?: string | null;
  imageUrl?: string | null;
  image_url?: string | null;
  available?: boolean;
  isAvailable?: boolean;
  variants?: StaffMenuVariant[];
}

export interface StaffVehicleUnit {
  id: string;
  status: string;
  identifier?: string | null;
  color?: string | null;
  distinctiveImageUrl?: string | null;
  distinctive_image_url?: string | null;
  catalog?: {
    id?: string;
    name?: string;
    tier?: string;
    cover_image_url?: string | null;
  } | null;
}

function normalizeStaffMenuItems(value: unknown): StaffMenuItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((rawItem) => {
    if (!rawItem || typeof rawItem !== 'object') return [];

    const item = rawItem as Record<string, unknown>;
    if (typeof item.id !== 'string' || typeof item.name !== 'string') return [];

    const variants = Array.isArray(item.variants)
      ? item.variants.flatMap((rawVariant) => {
          if (!rawVariant || typeof rawVariant !== 'object') return [];
          const variant = rawVariant as Record<string, unknown>;
          if (typeof variant.id !== 'string' || typeof variant.name !== 'string') return [];

          return [{
            id: variant.id,
            name: variant.name,
            price: Number(variant.price ?? 0),
            displayOrder:
              typeof variant.displayOrder === 'number' ? variant.displayOrder : undefined,
            isAvailable:
              typeof variant.isAvailable === 'boolean' ? variant.isAvailable : true,
          }];
        })
      : [];

    return [{
      id: item.id,
      name: item.name,
      price: Number(item.price ?? 0),
      description: typeof item.description === 'string' ? item.description : null,
      categoryId: typeof item.categoryId === 'string' ? item.categoryId : null,
      categoryName: typeof item.categoryName === 'string' ? item.categoryName : null,
      image: typeof item.image === 'string' ? item.image : null,
      imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : null,
      image_url: typeof item.image_url === 'string' ? item.image_url : null,
      available: typeof item.available === 'boolean' ? item.available : undefined,
      isAvailable: typeof item.isAvailable === 'boolean' ? item.isAvailable : undefined,
      variants,
    }];
  });
}

export const staffApi = {
  async getTodayBookings(): Promise<TodayBookingItem[]> {
    const response = await api.get<{ success: boolean; data: TodayBookingItem[] }>(
      '/staff/today-bookings'
    );
    return response.data.data || [];
  },

  async getBookings(date: string): Promise<TodayBookingItem[]> {
    const response = await api.get<{ success: boolean; data: TodayBookingItem[] }>('/staff/bookings', {
      params: { date },
    });
    return response.data.data || [];
  },

  async checkIn(bookingId: string): Promise<any> {
    const response = await api.post<{ success: boolean; data: any }>(
      `/staff/bookings/${bookingId}/check-in`
    );
    return response.data.data;
  },

  /**
   * QR data is the booking UUID, not a short code. This endpoint also applies
   * the backend's cafe-assignment authorization before a check-in is started.
   */
  async getBookingForQrCheckIn(bookingId: string): Promise<StaffQrBookingLookup> {
    const response = await api.get<{ success: boolean; data: StaffQrBookingLookup }>(
      `/bookings/${bookingId}`
    );
    return response.data.data;
  },

  async getFnbOrders(): Promise<TodayFnbOrderItem[]> {
    const response = await api.get<{ success: boolean; data: TodayFnbOrderItem[] }>(
      '/staff/fnb-orders'
    );
    return response.data.data || [];
  },

  async updateFnbOrder(orderId: string, status: StaffFnbOrderStatus): Promise<void> {
    await api.patch(`/staff/fnb-orders/${orderId}`, { status });
  },

  async getSessionDetail(sessionId: string): Promise<StaffSessionDetail> {
    const response = await api.get<{ success: boolean; data: StaffSessionDetail }>(
      `/staff/sessions/${sessionId}`
    );
    return response.data.data;
  },

  async submitInspection(sessionId: string, payload: SubmitInspectionPayload): Promise<any> {
    const response = await api.post<{ success: boolean; data: any }>(
      `/staff/sessions/${sessionId}/inspections`,
      payload
    );
    return response.data.data;
  },

  async confirmCheckout(sessionId: string, inspectionId: string): Promise<any> {
    const response = await api.post<{ success: boolean; data: any }>(
      `/staff/sessions/${sessionId}/confirm-checkout`,
      { inspectionId }
    );
    return response.data.data;
  },

  async updateDamageItems(
    sessionId: string,
    inspectionId: string,
    payload:
      | {
          damageLineItems: DamageLineItemInput[];
          checklist?: { itemKey?: string; itemLabel: string; status: string; note?: string | null }[];
          staffNotes?: string;
        }
      | DamageLineItemInput[]
  ): Promise<{ inspectionId: string; damageLineItems: DamageLineItemDetail[]; totalDamageCharge: number }> {
    const body = Array.isArray(payload) ? { damageLineItems: payload } : payload;
    const response = await api.put<{
      success: boolean;
      data: { inspectionId: string; damageLineItems: DamageLineItemDetail[]; totalDamageCharge: number };
    }>(`/staff/sessions/${sessionId}/inspections/${inspectionId}/damage-items`, body);
    return response.data.data;
  },

  async simulateClientCheckOut(sessionId: string): Promise<any> {
    const response = await api.post<{ success: boolean; data: any }>(
      `/staff/sessions/${sessionId}/simulate-check-out-response`
    );
    return response.data.data;
  },

  async proposeExtension(
    sessionId: string,
    payload: { extraMinutes: number; additionalFee?: number; direct?: boolean }
  ): Promise<any> {
    const response = await api.post<{ success: boolean; data: any }>(
      `/staff/sessions/${sessionId}/extensions`,
      payload
    );
    return response.data.data;
  },

  async simulateClientExtension(sessionId: string, data: { approved: boolean }): Promise<any> {
    const response = await api.post<{ success: boolean; data: any }>(
      `/staff/sessions/${sessionId}/simulate-extension-response`,
      data
    );
    return response.data.data;
  },

  async addSessionFnbOrder(
    sessionId: string,
    payload: {
      items: {
        menu_item_id: string;
        variant_id?: string;
        quantity: number;
        notes?: string;
      }[];
    }
  ): Promise<any> {
    const response = await api.post<{ success: boolean; data: any }>(
      `/staff/sessions/${sessionId}/fnb-orders`,
      payload
    );
    return response.data.data;
  },

  async swapSessionVehicle(
    sessionId: string,
    payload: { oldVehicleId: string; newVehicleId: string; oldVehicleNewStatus: 'AVAILABLE' | 'MAINTENANCE' }
  ): Promise<any> {
    const response = await api.post<{ success: boolean; data: any }>(
      `/staff/sessions/${sessionId}/swap-vehicle`,
      payload
    );
    return response.data.data;
  },

  async getCafeMenu(cafeId: string): Promise<StaffMenuItem[]> {
    const response = await api.get<{ success: boolean; data: unknown }>(
      `/cafes/${cafeId}/menu`,
      { params: { available: true, limit: 100 } }
    );
    return normalizeStaffMenuItems(response.data.data);
  },

  async getCafeVehicles(cafeId: string): Promise<StaffVehicleUnit[]> {
    const response = await api.get<{ success: boolean; data: StaffVehicleUnit[] }>(
      `/cafes/${cafeId}/vehicles`,
      { params: { status: 'AVAILABLE', exclude_retired: true } }
    );
    return response.data.data || [];
  },

  async settlePendingPayments(bookingId: string): Promise<any> {
    const response = await api.post<{ success: boolean; data: any }>(
      `/staff/bookings/${bookingId}/settle-pending-payments`
    );
    return response.data.data;
  },

  async initiateWalkInSettleBankTransfer(bookingId: string): Promise<{
    success: boolean;
    bookingId: string;
    amount: number;
    bankTransfer: BankTransferCheckout;
  }> {
    const response = await api.post<{
      success: boolean;
      data: {
        success: boolean;
        bookingId: string;
        amount: number;
        bankTransfer: BankTransferCheckout;
      };
    }>(`/staff/bookings/${bookingId}/settle-bank-transfer`);
    return response.data.data;
  },

  async confirmWalkInBankTransfer(bookingId: string): Promise<any> {
    const response = await api.post<{
      success: boolean;
      data: any;
    }>(`/staff/bookings/${bookingId}/confirm-bank-transfer`);
    return response.data.data;
  },

  async completeByocSession(sessionId: string): Promise<any> {
    const response = await api.post<{
      success: boolean;
      data: any;
    }>(`/staff/sessions/${sessionId}/complete-byoc`);
    return response.data.data;
  },
};
