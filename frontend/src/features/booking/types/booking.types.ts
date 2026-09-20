export type BookingPlayMode = "RENTAL" | "BYOC"

export type BookingStatus =
  | "PENDING"
  | "CONFIRMED"
  | "AWAITING_PAYMENT"
  | "NO_SHOW"
  | "COMPLETED"
  | "CANCELLED"

export type PaymentComponentType =
  | "SLOT_FEE"
  | "RENTAL_FEE"
  | "CONTEST_ENTRY_FEE"
  | "FNB_PREORDER"
  | "FB_PREORDER"
  | "FNB_ON_SITE"
  | "EXTENSION_FEE"
  | "DAMAGE_CHARGE"
  | "PLATFORM_FEE"

export type PaymentComponentStatus =
  | "PENDING"
  | "HELD"
  | "CAPTURED"
  | "REFUNDED"
  | "DISBURSED"
  | "PENDING_REFUND"
  | "PARTIALLY_REFUNDED"

export interface PaymentComponentResponse {
  id: string
  bookingId: string
  type: PaymentComponentType
  amount: number
  status: PaymentComponentStatus
  bookingVehicleId: string | null
  refundedAmount?: number
  refundedAt?: string | null
}

export type PaymentGateway = "VNPAY" | "DIRECT" | "MOCK" | "VIETQR" | "CASH"
export type PaymentTransactionType = "PAYMENT" | "REFUND" | "CAPTURE" | "HOLD"
export type PaymentTransactionStatus = "SUCCESS" | "PENDING" | "FAILED"

export interface PaymentTransactionResponse {
  id: string
  txnRef?: string
  type: PaymentTransactionType
  gateway: PaymentGateway
  amount: number
  status: PaymentTransactionStatus
  createdAt: string
}

export interface BookingFinancialLine {
  componentId: string
  type: PaymentComponentType
  label: string
  amount: number
  status: PaymentComponentStatus
  group: "PREPAID" | "ON_SITE"
  payment?: {
    transactionId: string
    txnRef: string
    gateway: string
    paidAt: string
  }
}

export interface BookingFinancialSummary {
  prepaidLines: BookingFinancialLine[]
  additionalLines: BookingFinancialLine[]
  prepaidServiceTotal: number
  prepaidDiscountAmount: number
  prepaidPaidAmount: number
  prepaidOutstandingAmount: number
  additionalTotal: number
  additionalPaidAmount: number
  additionalOutstandingAmount: number
  totalPaidAmount: number
  totalRefundedAmount: number
  netPaidAmount?: number
  outstandingAmount: number
  isSettled: boolean
}

export interface PaymentResultTransaction {
  bookingId: string
  amount: number
  status: PaymentTransactionStatus
  gateway: PaymentGateway
  type: PaymentTransactionType
  additionalPayment: boolean
  components: { type: string; amount: number }[]
  createdAt: string
  paidAt: string
}

export interface CancellationQuote {
  canCancel: boolean
  reason?: string
  refund: {
    slotFeeRefund: number
    rentalFeeRefund: number
    depositRefund: number
    fnbRefund: number
    totalRefund: number
  }
}

export interface AvailableVehicle {
  vehicle_id: string
  vehicle_identifier: string
  catalog_name: string
  tier: string
  rental_fee_per_hour: number
}

export interface AvailabilityResponse {
  play_mode: BookingPlayMode
  available: boolean
  byoc_remaining?: number
  vehicles: AvailableVehicle[]
  /**
   * Vì sao khung giờ này không đặt được, khi lý do KHÔNG phải là hết chỗ.
   *
   * Vắng mặt nghĩa là hết chỗ theo sức chứa — trường hợp thường gặp, không cần
   * giải thích gì thêm.
   */
  unavailable_reason?: "CONTEST"
  /** Giải đang giữ sân, chỉ có khi `unavailable_reason === "CONTEST"`. */
  contest?: { id: string; name: string }
}

export interface BookingParticipant {
  id: string
  bookingId: string
  userId: string | null
  participantType: "BOOKER" | "REGISTERED_USER" | "WALK_IN_GUEST"
  isPrimaryResponsible: boolean
  guestName: string | null
  guestPhone: string | null
  resolvedName: string | null
  resolvedPhone: string | null
  resolvedAvatarUrl: string | null
}

export interface BookingVehicleItem {
  id: string
  bookingId: string
  vehicleId: string
  rentalFeeSnapshot: number | null
  catalogName: string | null
  tier: string | null
  identifier: string | null
  color: string | null
  coverImageUrl: string | null
}

export interface FnbOrderItem {
  id: string
  menuItemId: string
  itemName: string | null
  variantName: string | null
  quantity: number
  unitPrice: number
  subtotal: number
  notes: string | null
}

export interface FnbOrder {
  id: string
  bookingId: string
  orderType: string
  status?: string
  totalAmount?: number
  createdAt?: string
  items: FnbOrderItem[]
}

export interface BookingResponse {
  id: string
  customerId: string
  cafeId: string
  playMode: BookingPlayMode
  status: BookingStatus
  slotStart: string
  slotEnd: string
  snapshot: Record<string, unknown> | null
  paymentExpiresAt: string | null
  checkInCode: string | null
  contestId?: string | null
  discountAmount: number
  promotionId: string | null
  cancellationReason?: string | null
  cancelledBy?: string | null
  createdAt: string
  updatedAt: string
  participants: BookingParticipant[]
  vehicles: BookingVehicleItem[]
  payment_components: PaymentComponentResponse[]
  payment_transactions: PaymentTransactionResponse[]
  financial_summary?: BookingFinancialSummary
  /** Orders are intentionally preserved by origin (pre-order vs in-session). */
  fnb_orders?: FnbOrder[]
  /** @deprecated Use fnb_orders when available. Kept for older API payloads. */
  fnb_order: FnbOrder | null
  cafe: {
    name: string
    address: string
    city: string
    coverImageUrl: string | null
  } | null
  track_type_name: string | null
  track_type_cover_image?: string | null
  session: {
    id: string
    status: string
    plannedEndAt: string
    actualStartAt: string
    actualEndAt: string | null
    proposedExtensionMinutes?: number | null
    approvedExtensionMinutes?: number | null
  } | null
  damage_breakdown: {
    lineItems: {
      id: string
      partType: string
      customPartName: string | null
      partsPrice: number
      laborPrice: number
      subtotal: number
    }[]
    totalDamageCharge: number
    status: "PENDING" | "SETTLED" | "AWAITING_PAYMENT"
  } | null
}

export interface BookingListItem {
  id: string
  customerId: string
  cafeId: string
  playMode: BookingPlayMode
  status: BookingStatus
  slotStart: string
  slotEnd: string
  paymentExpiresAt: string | null
  checkInCode: string | null
  contestId?: string | null
  createdAt: string
  updatedAt: string
  session: {
    id: string
    status: string
    plannedEndAt: string
    actualStartAt: string | null
  } | null
}

export interface BookingListResponse {
  data: BookingListItem[]
  total: number
  page: number
  limit: number
}

export interface FnbItemBody {
  menu_item_id: string
  variant_id?: string
  quantity: number
  notes?: string
}

export type BookingParticipantType = "REGISTERED_USER" | "WALK_IN_GUEST"

export interface ParticipantBody {
  user_id?: string
  participant_type: BookingParticipantType
  guest_name?: string
  guest_phone?: string
}

export interface CreateBookingBody {
  cafe_id: string
  play_mode: BookingPlayMode
  slot_start: string
  slot_end: string
  vehicle_ids: string[]
  participants: ParticipantBody[]
  fnb_items: FnbItemBody[]
  promotion_code?: string
  track_type_id?: string
  track_config_id?: string
  customer_package_id?: string
}

export interface CreateBookingResult {
  booking_id: string
  status: BookingStatus
  payment_expires_at: string
  total_amount: number
  breakdown: {
    slot_fee: number
    rental_fee: number
    fnb_total: number
    discount: number
    total: number
  }
}

/** Phương thức nhận tiền khả dụng của một chi nhánh. */
export type CafePaymentMethodOption = "vnpay" | "bank_transfer" | "pay_later"

/**
 * Cách màn hình thanh toán xử lý kết quả checkout.
 *
 * `redirect` là hành vi có từ trước — chuyển hướng sang cổng thanh toán.
 * `bank_transfer` giữ khách ở lại và hiện mã QR, màn hình tự đổi trạng thái
 * khi tiền về. Mặc định phải là `redirect` để booking cũ không đổi hành vi.
 */
export type CheckoutFlow = "redirect" | "bank_transfer"

export interface BankTransferCheckout {
  qr_payload: string
  qr_image_data_url: string
  ref_code: string
  bank_name: string
  account_number: string
  account_name: string
  amount: number
  expires_at: string
  /** True khi đang chạy ngân hàng mô phỏng — giao diện phải nói rõ với khách. */
  is_sandbox: boolean
  /** Đường dẫn trang ngân hàng mô phỏng, chỉ có khi `is_sandbox`. */
  sandbox_url?: string
}

export interface CheckoutResponse {
  payment_url: string | null
  txn_ref: string
  total_amount: number
  confirmed?: boolean
  slots_used?: number
  slots_remaining_after?: number
  flow?: CheckoutFlow
  bank_transfer?: BankTransferCheckout
}

export interface CafePaymentSettings {
  method: "VNPAY" | "BANK_TRANSFER"
  bank_code: string | null
  bank_name: string | null
  /** Che bớt ở mọi màn hiển thị; số đầy đủ chỉ trả ở endpoint chỉnh sửa. */
  account_number: string | null
  account_name: string | null
  is_verified: boolean
  verified_at: string | null
}

export interface BankTransactionItem {
  id: string
  amount: number
  content: string
  ref_code: string | null
  transaction_date: string
  match_status: "MATCHED" | "NEEDS_REVIEW" | "IGNORED"
  match_reason: string | null
  booking_id: string | null
  resolved_by: string | null
  resolved_at: string | null
}

export interface CheckAvailabilityParams {
  slot_start: string
  slot_end: string
  play_mode: BookingPlayMode
  track_type_id?: string
  track_config_id?: string
}

export interface ListMyBookingsParams {
  status?: BookingStatus
  play_mode?: BookingPlayMode
  page?: number
  limit?: number
}

export interface CafeBookingListItem {
  id: string
  status: BookingStatus
  playMode: BookingPlayMode
  slotStart: string
  slotEnd: string
  createdAt: string
  paymentExpiresAt: string | null
  cancelledBy: string | null
  cancellationReason: string | null
  customerName: string
  customerPhone: string | null
  sessionStatus?: string | null
  /** Giờ kết thúc dự kiến của phiên — đã tính cả gia hạn, khác `slotEnd`. */
  sessionPlannedEndAt?: string | null
}

export interface CafeBookingListResponse {
  data: CafeBookingListItem[]
  total: number
  page: number
  limit: number
  summary: {
    totalBookings: number
    pendingPaymentCount: number
    awaitingAdditionalPaymentCount: number
    confirmedBookingCount: number
    activeSessionCount: number
  }
}

export interface ListCafeBookingsParams {
  date?: string
  from?: string
  to?: string
  status?: BookingStatus
  page?: number
  limit?: number
}

export interface CafeSessionVehicle {
  catalogName: string | null
  identifier: string | null
  color: string | null
  tier: string | null
  vehicleSource: string
}

export interface CafeSessionListItem {
  sessionId: string
  sessionCode: string
  bookingId: string
  bookingCode: string
  vehicles: CafeSessionVehicle[]
  staffName: string
  customerName: string
  customerPhone: string | null
  actualStartAt: string
  plannedEndAt: string
  actualEndAt: string | null
  status: string
  hasIssue: boolean
}

export interface CafeSessionListResponse {
  sessions: CafeSessionListItem[]
  total: number
  page: number
  limit: number
}

export interface ListCafeSessionsParams {
  date: string
  status?: string
  page?: number
  limit?: number
}

export interface CafeSessionStatsResponse {
  active: number
  extending: number
  checkingOut: number
  issue: number
}
