/* eslint-disable @typescript-eslint/no-explicit-any */
import { api } from "@/shared/lib/axios"
import type { BankTransferCheckout } from "@/features/booking/types/booking.types"

export type DamagePartType =
  | "TIRE_WHEEL"
  | "SPOILER"
  | "CHASSIS"
  | "MOTOR"
  | "SHELL"
  | "SERVO"
  | "REMOTE"
  | "OTHER"

export interface DamageLineItemInput {
  partType: DamagePartType
  customPartName?: string
  partsPrice: number
  laborPrice?: number
}

export interface DamageLineItemDetail {
  id: string
  partType: DamagePartType
  customPartName: string | null
  partsPrice: number
  laborPrice: number
  lineTotal: number
}

export interface StaffMaintenanceLogItem {
  logId: string
  logCode: string
  vehicleId: string
  vehicleIdentifier: string
  vehicleName: string
  vehicleImageUrl?: string
  cafeId: string
  cafeName: string
  categoryId: string
  categoryName: string
  categoryTier: string
  issueDescription: string
  staffNotes: string | null
  cost: number
  performedBy: string | null
  status: "SENT_TO_PROVIDER" | "PENDING_REPAIR" | "RECEIVED" | "COMPLETED"
  createdAt: string
  completedAt: string | null
  inspectionPhotos?: { angle: string; url: string }[]
  damagedChecklist?: {
    itemKey: string
    itemLabel: string
    status: string
    note?: string
  }[]
}

export interface StaffListItem {
  id: string
  email: string
  fullName: string
  phone: string | null
  cafeId: string
  cafeName: string
  status: "PENDING" | "ACTIVE" | "DISABLED"
  createdAt: string
  activatedAt: string | null
  inviteExpiresAt: string | null
  lastActiveAt: string | null
}

export interface InviteStaffBody {
  cafe_id: string
  full_name: string
  email: string
  phone?: string
}

export interface InviteStaffResult extends StaffListItem {
  emailSent: boolean
}

export interface StaffImpersonateResponse {
  token: string
  staff: {
    id: string
    email: string
    fullName: string
    cafeName: string
    cafeId: string
  }
}

export interface CreateWalkInBookingInput {
  play_mode: "RENTAL" | "BYOC"
  track_type_id: string
  slot_start: string
  slot_end: string
  payment_method: "CASH" | "BANK_TRANSFER"
  vehicle_ids: string[]
  participants: {
    guest_name: string
    guest_phone: string
    participant_type: string
  }[]
  fnb_items?: {
    menu_item_id: string
    variant_id?: string
    quantity: number
    notes?: string
  }[]
}

export interface CreateWalkInBookingResponse {
  bookingId: string
  bookingCode: string
  status: string
  source: string
  paymentStatus: string
  totalAmount: number
  bankTransfer?: BankTransferCheckout
}

export interface TodayBookingItem {
  bookingId: string
  shortCode: string
  cafeId: string
  cafeName: string
  cafeAddress: string
  cafePhone: string
  trackName: string
  trackType: string
  bookingMode: "SINGLE" | "PACKAGE" | "SUBSCRIPTION"
  playMode: "RENTAL" | "BYOC" | "MIXED"
  source: "APP" | "STAFF_MANUAL" | "CONTEST" | "FACEBOOK"
  contestId?: string | null
  status:
    | "PENDING"
    | "CONFIRMED"
    | "CANCELLED"
    | "NO_SHOW"
    | "AWAITING_PAYMENT"
    | "COMPLETED"
  slotStart: string
  slotEnd: string
  slotCount: number
  depositAmount: number
  slotFee: number
  rentalFee: number
  fnbPreorderFee: number
  fnbOnsiteFee: number
  discountAmount: number
  totalAmount: number
  paymentStatus: "UNPAID" | "PAID" | "REFUNDED"
  payment_components?: any[]
  plannedParticipants: string[]
  participantDetails?: { name: string; phone?: string; isBooker: boolean }[]
  plannedVehicles: string[]
  sessions: any[]
  hasPendingRefund?: boolean
  createdAt?: string

  // Legacy aliases used by older UI widgets/mocks while the staff API was stabilizing.
  id?: string
  customerName?: string
  customerPhone?: string | null
  startTime?: string
  endTime?: string
  mode?: string
  vehicleName?: string | null
  trackTypeName?: string | null
  participantCount?: number
  vehicleCount?: number
}

export interface ContestCheckinInfo {
  registrationId: string | null
  synced: boolean
  previousStatus: string | null
}

export type StaffCheckInResponse = {
  id?: string
  sessionId?: string
  contest_checkin?: ContestCheckinInfo | null
} & Record<string, any>

export interface FnbOrderItemDetail {
  name: string
  variantName: string | null
  quantity: number
  unitPrice: number
  subtotal: number
  notes: string | null
}

export interface TodayFnbOrderItem {
  id: string
  bookingId: string
  orderType: "PRE_ORDER" | "ON_SITE"
  status: "PENDING" | "CONFIRMED" | "DELIVERED" | "CANCELLED"
  totalAmount: number
  createdAt: string
  slotStart: string
  customerName: string
  items: FnbOrderItemDetail[]
}

export interface StaffDetailProfile {
  id: string
  fullName: string
  email: string
  phone: string | null
  cafeName: string
  cafeId: string
  status: "PENDING" | "ACTIVE" | "DISABLED"
  createdAt: string
  activatedAt: string | null
  lastActiveAt: string | null
}

export interface StaffKpiSummary {
  staffId: string
  period: "7d" | "30d" | "90d"
  totalCheckIns: number
  totalFnbOrdersHandled: number
  totalExtensionsApproved: number
  onTimeCheckInRate: number | null
  activeDaysCount: number
}

export interface StaffActivityEvent {
  id: string
  type: "CHECK_IN" | "CHECK_OUT" | "FNB_ORDER" | "EXTENSION_APPROVED"
  eventTime: string
  label: string
  bookingId: string
  bookingSource: "APP" | "STAFF_MANUAL"
}

export interface StaffActivityPage {
  events: StaffActivityEvent[]
  total: number
  hasMore: boolean
}

export const staffQueryKeys = {
  all: ["staff"] as const,
  list: (cafeId?: string) =>
    [...staffQueryKeys.all, "list", cafeId ?? "all"] as const,
  todayBookings: () => [...staffQueryKeys.all, "today-bookings"] as const,
  bookingLists: () => [...staffQueryKeys.all, "bookings"] as const,
  bookings: (date: string) => [...staffQueryKeys.bookingLists(), date] as const,
  fnbOrders: () => [...staffQueryKeys.all, "fnb-orders"] as const,
  staffDetail: (staffId: string) =>
    [...staffQueryKeys.all, "detail", staffId] as const,
  staffKpi: (staffId: string, period: string) =>
    [...staffQueryKeys.all, "kpi", staffId, period] as const,
  staffActivity: (staffId: string) =>
    [...staffQueryKeys.all, "activity", staffId] as const,
  maintenanceLogs: (cafeId?: string, status?: string, search?: string) =>
    [
      ...staffQueryKeys.all,
      "maintenance-logs",
      cafeId ?? "all",
      status ?? "all",
      search ?? "none",
    ] as const,
}

export const staffApi = {
  listStaff: async (cafeId?: string): Promise<StaffListItem[]> => {
    const res = await api.get<{ success: boolean; data: StaffListItem[] }>(
      "/v1/provider/staff",
      {
        params: cafeId ? { cafe_id: cafeId } : undefined,
      },
    )
    return res.data.data
  },

  inviteStaff: async (body: InviteStaffBody): Promise<InviteStaffResult> => {
    const res = await api.post<{ success: boolean; data: InviteStaffResult }>(
      "/v1/provider/staff",
      body,
    )
    return res.data.data
  },

  deactivateStaff: async (staffId: string): Promise<void> => {
    await api.patch(`/v1/provider/staff/${staffId}/deactivate`)
  },

  reactivateStaff: async (staffId: string): Promise<void> => {
    await api.patch(`/v1/provider/staff/${staffId}/reactivate`)
  },

  transferStaff: async (staffId: string, cafeId: string): Promise<void> => {
    await api.patch(`/v1/provider/staff/${staffId}/branch`, { cafe_id: cafeId })
  },

  impersonateStaff: async (
    staffId: string,
  ): Promise<StaffImpersonateResponse> => {
    const res = await api.post<StaffImpersonateResponse>(
      `/v1/provider/staff/${staffId}/impersonate`,
    )
    return res.data
  },

  resendInvite: async (staffId: string): Promise<{ emailSent: boolean }> => {
    const res = await api.post<{
      success: boolean
      data: { emailSent: boolean }
    }>(`/v1/provider/staff/${staffId}/resend-invite`)
    return res.data.data
  },

  getTodayBookings: async (): Promise<TodayBookingItem[]> => {
    const res = await api.get<{ success: boolean; data: TodayBookingItem[] }>(
      "/v1/staff/today-bookings",
    )
    return res.data.data
  },

  getBookings: async (date: string): Promise<TodayBookingItem[]> => {
    const res = await api.get<{ success: boolean; data: TodayBookingItem[] }>(
      "/v1/staff/bookings",
      {
        params: { date },
      },
    )
    return res.data.data
  },

  getFnbOrders: async (): Promise<TodayFnbOrderItem[]> => {
    const res = await api.get<{ success: boolean; data: TodayFnbOrderItem[] }>(
      "/v1/staff/fnb-orders",
    )
    return res.data.data
  },

  updateFnbOrder: async (orderId: string, status: string): Promise<void> => {
    await api.patch(`/v1/staff/fnb-orders/${orderId}`, { status })
  },

  validateInviteToken: async (
    token: string,
  ): Promise<{ email: string; fullName: string }> => {
    const res = await api.get<{
      success: boolean
      data: { email: string; fullName: string }
    }>("/v1/auth/staff-invite/validate", { params: { token } })
    return res.data.data
  },

  activateAccount: async (
    token: string,
    password: string,
  ): Promise<{
    access_token: string
    refresh_token: string
    user: {
      id: string
      email: string
      fullName: string
      role: string
      cafeId: string | null
    }
  }> => {
    const res = await api.post("/v1/auth/staff-invite/activate", {
      token,
      password,
    })
    return res.data.data
  },

  getStaffDetail: async (staffId: string): Promise<StaffDetailProfile> => {
    const res = await api.get<{ success: boolean; data: StaffDetailProfile }>(
      `/v1/provider/staff/${staffId}`,
    )
    return res.data.data
  },

  getStaffKpi: async (
    staffId: string,
    period: "7d" | "30d" | "90d",
  ): Promise<StaffKpiSummary> => {
    const res = await api.get<{ success: boolean; data: StaffKpiSummary }>(
      `/v1/provider/staff/${staffId}/kpi`,
      { params: { period } },
    )
    return res.data.data
  },

  getStaffActivity: async (
    staffId: string,
    limit = 20,
    offset = 0,
  ): Promise<StaffActivityPage> => {
    const res = await api.get<{ success: boolean; data: StaffActivityPage }>(
      `/v1/provider/staff/${staffId}/activity`,
      { params: { limit, offset } },
    )
    return res.data.data
  },

  checkIn: async (bookingId: string): Promise<StaffCheckInResponse> => {
    const res = await api.post<{
      success: boolean
      data: StaffCheckInResponse
    }>(`/v1/staff/bookings/${bookingId}/check-in`)
    return res.data.data
  },

  getSessionDetail: async (sessionId: string): Promise<any> => {
    const res = await api.get<{ success: boolean; data: any }>(
      `/v1/staff/sessions/${sessionId}`,
    )
    return res.data.data
  },

  submitInspection: async (
    sessionId: string,
    data: {
      type: "CHECK_IN" | "CHECK_OUT"
      photos?: { angle: string; url: string; notes?: string }[]
      checklist?: {
        itemKey: string
        itemLabel: string
        status: string
        note?: string
      }[]
      staffNotes?: string
      damageFlagged: boolean
      damageLineItems?: DamageLineItemInput[]
    },
  ): Promise<any> => {
    const res = await api.post<{ success: boolean; data: any }>(
      `/v1/staff/sessions/${sessionId}/inspections`,
      data,
    )
    return res.data.data
  },

  confirmCheckout: async (
    sessionId: string,
    inspectionId: string,
  ): Promise<any> => {
    const res = await api.post<{ success: boolean; data: any }>(
      `/v1/staff/sessions/${sessionId}/confirm-checkout`,
      { inspectionId },
    )
    return res.data.data
  },

  updateDamageItems: async (
    sessionId: string,
    inspectionId: string,
    payload:
      | DamageLineItemInput[]
      | {
          damageLineItems: DamageLineItemInput[]
          checklist?: { itemKey?: string; itemLabel: string; status: string; note?: string }[]
          staffNotes?: string
        },
  ): Promise<{
    damageLineItems: DamageLineItemDetail[]
    totalDamageCharge: number
    checklist?: any[]
    staffNotes?: string
  }> => {
    const body = Array.isArray(payload) ? { damageLineItems: payload } : payload
    const res = await api.put<{
      success: boolean
      data: {
        inspectionId: string
        damageLineItems: DamageLineItemDetail[]
        totalDamageCharge: number
        checklist?: any[]
        staffNotes?: string
      }
    }>(
      `/v1/staff/sessions/${sessionId}/inspections/${inspectionId}/damage-items`,
      body,
    )
    return res.data.data
  },

  proposeExtension: async (
    sessionId: string,
    data: { extraMinutes: number; additionalFee?: number; direct?: boolean },
  ): Promise<any> => {
    const res = await api.post<{ success: boolean; data: any }>(
      `/v1/staff/sessions/${sessionId}/extensions`,
      data,
    )
    return res.data.data
  },

  addSessionFnbOrder: async (
    sessionId: string,
    data: {
      items: {
        menu_item_id: string
        variant_id?: string
        quantity: number
        notes?: string
      }[]
    },
  ): Promise<any> => {
    const res = await api.post<{ success: boolean; data: any }>(
      `/v1/staff/sessions/${sessionId}/fnb-orders`,
      data,
    )
    return res.data.data
  },

  swapSessionVehicle: async (
    sessionId: string,
    data: {
      oldVehicleId: string
      newVehicleId: string
      oldVehicleNewStatus: string
    },
  ): Promise<any> => {
    const res = await api.post<{ success: boolean; data: any }>(
      `/v1/staff/sessions/${sessionId}/swap-vehicle`,
      data,
    )
    return res.data.data
  },

  simulateClientCheckOut: async (sessionId: string): Promise<any> => {
    const res = await api.post<{ success: boolean; data: any }>(
      `/v1/staff/sessions/${sessionId}/simulate-check-out-response`,
    )
    return res.data.data
  },

  /*
    Hai hàm dưới đây là đường THAO TÁC HỘ chính thức, khác hẳn `simulate*`.

    Khác biệt không nằm ở kết quả mà ở trách nhiệm:

      • `simulate-*` là công cụ thử — không kiểm khách có tự bấm được không, và
        ghi nhật ký như thể chính khách đã bấm;
      • `*-for-customer` chỉ chạy khi chủ đơn là tài khoản mềm (backend trả
        `403 CUSTOMER_CAN_SELF_SERVE` nếu khách có mật khẩu), và nhật ký ghi rõ
        nhân viên nào làm hộ khách nào.

    Giải quyết tranh chấp sau này đọc nhật ký. Ghi sai người thực hiện là xoá
    mất chính thứ mà biên bản bàn giao sinh ra để bảo vệ.
  */
  respondExtensionForCustomer: async (
    sessionId: string,
    data: { approved: boolean; reason?: string },
  ): Promise<unknown> => {
    const res = await api.post<{ success: boolean; data: unknown }>(
      `/v1/sessions/${sessionId}/extension/respond-for-customer`,
      data,
    )
    return res.data.data
  },

  confirmInspectionForCustomer: async (
    sessionId: string,
    inspectionId: string,
    data: { agreed: boolean; reason?: string },
  ): Promise<unknown> => {
    const res = await api.post<{ success: boolean; data: unknown }>(
      `/v1/sessions/${sessionId}/inspections/${inspectionId}/confirm-for-customer`,
      data,
    )
    return res.data.data
  },

  simulateClientExtension: async (
    sessionId: string,
    data: { approved: boolean },
  ): Promise<any> => {
    const res = await api.post<{ success: boolean; data: any }>(
      `/v1/staff/sessions/${sessionId}/simulate-extension-response`,
      data,
    )
    return res.data.data
  },

  settlePendingPayments: async (bookingId: string): Promise<any> => {
    const res = await api.post<{ success: boolean; data: any }>(
      `/v1/staff/bookings/${bookingId}/settle-pending-payments`,
    )
    return res.data.data
  },

  completeByocSession: async (sessionId: string): Promise<any> => {
    const res = await api.post<{ success: boolean; data: any }>(
      `/v1/staff/sessions/${sessionId}/complete-byoc`,
    )
    return res.data.data
  },

  confirmRefund: async (
    bookingId: string,
    confirmation: { method: "CASH" | "BANK_TRANSFER" },
  ): Promise<any> => {
    const res = await api.post<{ success: boolean; data: any }>(
      `/v1/staff/bookings/${bookingId}/confirm-refund`,
      confirmation,
    )
    return res.data.data
  },

  createWalkInBooking: async (
    body: CreateWalkInBookingInput,
  ): Promise<CreateWalkInBookingResponse> => {
    const res = await api.post<{
      success: boolean
      data: CreateWalkInBookingResponse
    }>("/v1/staff/bookings", body)
    return res.data.data
  },

  confirmWalkInBankTransfer: async (
    bookingId: string,
  ): Promise<{ success: boolean; bookingId: string; status: string }> => {
    const res = await api.post<{
      success: boolean
      data: { success: boolean; bookingId: string; status: string }
    }>(`/v1/staff/bookings/${bookingId}/confirm-bank-transfer`)
    return res.data.data
  },

  initiateWalkInSettleBankTransfer: async (
    bookingId: string,
  ): Promise<{
    success: boolean
    bookingId: string
    amount: number
    bankTransfer: BankTransferCheckout
  }> => {
    const res = await api.post<{
      success: boolean
      data: {
        success: boolean
        bookingId: string
        amount: number
        bankTransfer: BankTransferCheckout
      }
    }>(`/v1/staff/bookings/${bookingId}/settle-bank-transfer`)
    return res.data.data
  },

  getMaintenanceLogs: async (params?: {
    cafe_id?: string
    status?: string
    search?: string
  }): Promise<StaffMaintenanceLogItem[]> => {
    const res = await api.get<{
      success: boolean
      data: StaffMaintenanceLogItem[]
    }>("/v1/staff/maintenance-logs", {
      params,
    })
    return res.data.data
  },

  createMaintenanceLog: async (body: {
    vehicleId: string
    issueDescription: string
    cost?: number
    performedBy?: string
    staffNotes?: string
  }): Promise<StaffMaintenanceLogItem> => {
    const res = await api.post<{
      success: boolean
      data: StaffMaintenanceLogItem
    }>("/v1/staff/maintenance-logs", body)
    return res.data.data
  },

  updateMaintenanceStatus: async (
    logId: string,
    body: {
      status: "SENT_TO_PROVIDER" | "PENDING_REPAIR" | "RECEIVED" | "COMPLETED"
      cost?: number
      staffNotes?: string
    },
  ): Promise<{ success: boolean; logId: string; status: string }> => {
    const res = await api.patch<{
      success: boolean
      data: { success: boolean; logId: string; status: string }
    }>(`/v1/staff/maintenance-logs/${logId}/status`, body)
    return res.data.data
  },

  lookupCustomerPackages: async (query: string): Promise<any> => {
    const res = await api.get<{ success: boolean; data: any }>(
      "/v1/staff/packages/lookup",
      {
        params: { query },
      },
    )
    return res.data.data
  },

  getTopCustomers: async (): Promise<any> => {
    const res = await api.get<{ success: boolean; data: any }>(
      "/v1/staff/packages/top-customers",
    )
    return res.data.data
  },

  searchCustomers: async (query: string): Promise<any[]> => {
    const res = await api.get<{ success: boolean; data: any[] }>(
      "/v1/staff/packages/search-customers",
      {
        params: { query },
      },
    )
    return res.data.data
  },
}
