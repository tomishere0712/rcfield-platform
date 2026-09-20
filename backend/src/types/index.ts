// ── User ─────────────────────────────────────────────────────────────────────

export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  PROVIDER = 'PROVIDER',
  STAFF = 'STAFF',
  ADMIN = 'ADMIN',
}

export enum AuthProvider {
  LOCAL = 'LOCAL',
  GOOGLE = 'GOOGLE',
}

export enum TrustScoreReason {
  NO_SHOW = 'NO_SHOW',
  DAMAGE_CONFIRMED = 'DAMAGE_CONFIRMED',
  DISPUTE_LOST = 'DISPUTE_LOST',
  BOOKING_STREAK = 'BOOKING_STREAK',
  ADMIN_ADJUSTMENT = 'ADMIN_ADJUSTMENT',
}

// ── Cafe ─────────────────────────────────────────────────────────────────────

export enum CafeStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export interface TrackTypeDTO {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface CafeOperatingHour {
  open?: string;
  close?: string;
  is_closed?: boolean;
}

export type CafeOperatingHours = Record<string, CafeOperatingHour>;

// ── Vehicle ───────────────────────────────────────────────────────────────────

export enum AssetTier {
  STANDARD = 'STANDARD',
  PREMIUM = 'PREMIUM',
  RESTRICTED = 'RESTRICTED',
}

export enum VehicleStatus {
  AVAILABLE = 'AVAILABLE',
  IN_USE = 'IN_USE',
  MAINTENANCE = 'MAINTENANCE',
  RETIRED = 'RETIRED',
}

// ── Booking ───────────────────────────────────────────────────────────────────

export enum BookingMode {
  RENTAL = 'RENTAL',
  BYOC = 'BYOC',
}

export enum BookingSource {
  APP = 'APP',
  STAFF_MANUAL = 'STAFF_MANUAL',
  CONTEST = 'CONTEST',
  FACEBOOK = 'FACEBOOK',
}

/**
 * Hậu tố email tổng hợp cho tài khoản mềm (khách vãng lai, khách đặt qua
 * Facebook). Địa chỉ dạng `{số điện thoại}@guest.rcfield.local` chỉ tồn tại để
 * thoả ràng buộc duy nhất của `users.email` — nó KHÔNG phải hòm thư gửi tới
 * được.
 *
 * Ba nơi phải dùng chung đúng hằng số này, lệch một nơi là địa chỉ tổng hợp lọt
 * qua bộ lọc và cả loạt thư đi vào hư không:
 *   1. nơi tạo tài khoản mềm
 *   2. nơi phân giải tài khoản mềm
 *   3. bộ lọc chặn gửi thư trong `email.service`
 */
export const GUEST_EMAIL_SUFFIX = '@guest.rcfield.local';

/** Địa chỉ này có phải email tổng hợp nội bộ không (tức là không gửi được). */
export function isSyntheticGuestEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.toLowerCase().endsWith(GUEST_EMAIL_SUFFIX);
}

export enum BookingStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  NO_SHOW = 'NO_SHOW',
  AWAITING_PAYMENT = 'AWAITING_PAYMENT',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum SessionStatus {
  CHECKED_IN = 'CHECKED_IN',
  ACTIVE = 'ACTIVE',
  EXTENDING = 'EXTENDING',
  CHECKING_OUT = 'CHECKING_OUT',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum BookingParticipantType {
  BOOKER = 'BOOKER',
  REGISTERED_USER = 'REGISTERED_USER',
  WALK_IN_GUEST = 'WALK_IN_GUEST',
}

// ── Payment ───────────────────────────────────────────────────────────────────

export enum PaymentComponentType {
  SLOT_FEE = 'SLOT_FEE',
  RENTAL_FEE = 'RENTAL_FEE',
  SECURITY_DEPOSIT = 'SECURITY_DEPOSIT',
  EXTENSION_FEE = 'EXTENSION_FEE',
  DAMAGE_CHARGE = 'DAMAGE_CHARGE',
  FB_PREORDER = 'FNB_PREORDER',
  FNB_ON_SITE = 'FNB_ON_SITE',
  PACKAGE_PURCHASE = 'PACKAGE_PURCHASE',
  CONTEST_ENTRY_FEE = 'CONTEST_ENTRY_FEE',
}

export enum CustomerPackageStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  ACTIVE = 'ACTIVE',
  EXHAUSTED = 'EXHAUSTED',
  EXPIRED = 'EXPIRED',
}

export enum PaymentComponentStatus {
  PENDING = 'PENDING',
  HELD = 'HELD',
  DISBURSED = 'DISBURSED',
  // Deposit-specific statuses: system calculates refund amount, Staff confirms actual handoff
  PENDING_REFUND = 'PENDING_REFUND', // System computed refund amount, awaiting Staff confirmation
  REFUNDED = 'REFUNDED', // Staff confirmed full deposit returned to customer
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED', // Staff confirmed partial return (damage deducted)
}

export enum PaymentTransactionType {
  PAYMENT = 'PAYMENT',
  REFUND = 'REFUND',
}

export enum PaymentTransactionSubjectType {
  BOOKING = 'BOOKING',
  CONTEST_ENTRY = 'CONTEST_ENTRY',
  CUSTOMER_PACKAGE = 'CUSTOMER_PACKAGE',
}

export enum PaymentTransactionStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export enum DiscountType {
  PERCENT = 'PERCENT',
  FIXED = 'FIXED',
}

export enum PromoApplicableTo {
  ALL = 'ALL',
  RENTAL = 'RENTAL',
  BYOC = 'BYOC',
}

export enum PromotionScheduleMode {
  ONCE = 'ONCE',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
}

export enum PackageBillingPeriod {
  WEEK = 'WEEK',
  MONTH = 'MONTH',
}

export enum PackageStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ARCHIVED = 'ARCHIVED',
}

// ── Inspection ────────────────────────────────────────────────────────────────

export enum InspectionType {
  CHECK_IN = 'CHECK_IN',
  CHECK_OUT = 'CHECK_OUT',
}

export enum DamagePartType {
  TIRE_WHEEL = 'TIRE_WHEEL',
  SPOILER = 'SPOILER',
  CHASSIS = 'CHASSIS',
  MOTOR = 'MOTOR',
  SHELL = 'SHELL',
  SERVO = 'SERVO',
  REMOTE = 'REMOTE',
  OTHER = 'OTHER',
}

export enum ParticipantRole {
  DRIVER = 'DRIVER',
  PLAYER = 'PLAYER',
  SPECTATOR = 'SPECTATOR',
  GUARDIAN = 'GUARDIAN',
}

export enum VehicleSource {
  RENTAL = 'RENTAL',
  BYOC = 'BYOC',
}

// ── Contest ──────────────────────────────────────────────────────────────────

export enum ContestStatus {
  DRAFT = 'DRAFT',
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum ContestResourceScope {
  FULL_BRANCH = 'FULL_BRANCH',
  SELECTED_TRACKS = 'SELECTED_TRACKS',
}

export enum ContestBanScopeType {
  CONTEST = 'CONTEST',
  PROVIDER = 'PROVIDER',
}

export enum ContestRegistrationStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  CHECKED_IN = 'CHECKED_IN',
}

export enum ContestEntryFeePaymentStatus {
  NOT_REQUIRED = 'NOT_REQUIRED',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  WAIVED = 'WAIVED',
  MARKED_PAID = 'MARKED_PAID',
}

export enum ContestMatchType {
  HEAD_TO_HEAD = 'HEAD_TO_HEAD',
  MULTI_DRIVER = 'MULTI_DRIVER',
  TIME_ATTACK = 'TIME_ATTACK',
  FINAL = 'FINAL',
}

export enum ContestMatchStatus {
  DRAFT = 'DRAFT',
  READY = 'READY',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum ContestParticipantStatus {
  READY = 'READY',
  STARTED = 'STARTED',
  FINISHED = 'FINISHED',
  DNS = 'DNS',
  DNF = 'DNF',
  DQ = 'DQ',
}

/** Vòng đời đơn phí tổ chức giải. */
export enum ContestFeeOrderStatus {
  /** Đã chọn gói, chưa khai báo chuyển khoản. */
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  /** Đã khai báo chuyển khoản, chờ admin đối soát. */
  PENDING_REVIEW = 'PENDING_REVIEW',
  PAID = 'PAID',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

/** Suất quảng bá do provider trả phí phải qua admin duyệt nội dung mới lên trang chủ. */
export enum FeaturedPopupReviewStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum FeaturedPopupPlacement {
  EXPLORE = 'EXPLORE',
}

export enum FeaturedPopupAudienceScope {
  ALL = 'ALL',
}

/** Chiều tiền của một bút toán trong sổ thu chi giải đấu. */
export enum ContestLedgerDirection {
  IN = 'IN',
  OUT = 'OUT',
}

/**
 * Loại khoản thu — chỉ hợp lệ khi direction = IN.
 *
 * Tập đóng: chủ doanh nghiệp không tự thêm loại. Khoản không thuộc loại nào có
 * sẵn thì dùng OTHER và mô tả ở tiêu đề, nhờ vậy báo cáo của các giải khác nhau
 * so sánh được với nhau.
 */
export enum ContestLedgerIncomeCategory {
  ENTRY_FEE_ADJUSTMENT = 'ENTRY_FEE_ADJUSTMENT',
  SPONSORSHIP = 'SPONSORSHIP',
  TICKET = 'TICKET',
  FNB = 'FNB',
  OTHER = 'OTHER',
}

/**
 * Loại khoản chi — chỉ hợp lệ khi direction = OUT.
 *
 * FNB và OTHER cố ý trùng tên với enum thu: quán vừa thu tiền đồ uống bán trong
 * ngày thi, vừa chi tiền mua nước cho trọng tài. Cột direction phân biệt nên
 * trùng tên không gây nhập nhằng.
 */
export enum ContestLedgerExpenseCategory {
  PRIZE_CASH = 'PRIZE_CASH',
  PRIZE_ITEM = 'PRIZE_ITEM',
  VENUE = 'VENUE',
  STAFF = 'STAFF',
  MARKETING = 'MARKETING',
  FNB = 'FNB',
  OTHER = 'OTHER',
}

/** Đường tiền lệ phí đi vào, cần để đối chiếu báo cáo với sao kê ngân hàng. */
export enum ContestEntryFeePaymentMethod {
  ONLINE = 'ONLINE',
  CASH = 'CASH',
  TRANSFER = 'TRANSFER',
}

// ── Thanh toán chuyển khoản theo chi nhánh (feature 019) ──────────────────────

/** Cách một chi nhánh nhận tiền booking. */
export enum CafePaymentMethod {
  /** Cổng thanh toán dùng chung — mặc định của mọi chi nhánh chưa cấu hình. */
  VNPAY = 'VNPAY',
  /** Chuyển khoản thẳng vào tài khoản của chi nhánh, đối soát qua webhook. */
  BANK_TRANSFER = 'BANK_TRANSFER',
}

/**
 * Phán quyết của hệ thống về một khoản tiền được báo là đã về tài khoản.
 *
 * Tách khỏi `BankTransactionMatchReason` có chủ đích: nhân viên chỉ lọc đúng
 * `NEEDS_REVIEW` (một điều kiện, một index), còn lý do cụ thể thì thêm mới
 * thoải mái mà không phải sửa mọi chỗ lọc.
 */
export enum BankTransactionMatchStatus {
  MATCHED = 'MATCHED',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
  IGNORED = 'IGNORED',
}

/** Vì sao một giao dịch không khớp sạch. `null` nghĩa là khớp không vướng gì. */
export enum BankTransactionMatchReason {
  /** Tiền nhiều hơn số phải trả — booking vẫn được xác nhận. */
  OVERPAID = 'OVERPAID',
  /** Nội dung chuyển khoản không chứa mã tham chiếu. */
  NO_REF_CODE = 'NO_REF_CODE',
  /** Có mã nhưng không tra ra giao dịch thanh toán nào. */
  REF_NOT_FOUND = 'REF_NOT_FOUND',
  /** Tiền ít hơn số phải trả — không xác nhận booking. */
  SHORT_PAID = 'SHORT_PAID',
  /** Giao dịch thanh toán đã SUCCESS — khách chuyển lần thứ hai. */
  ALREADY_PAID = 'ALREADY_PAID',
  /** Giao dịch thanh toán đã FAILED — khách đã đổi sang phương thức khác. */
  SESSION_REPLACED = 'SESSION_REPLACED',
  /** Tiền về sau khi hết hạn giữ chỗ. Không bao giờ tự xác nhận lại. */
  BOOKING_EXPIRED = 'BOOKING_EXPIRED',
  /** Tài khoản nhận không thuộc chi nhánh nào trong hệ thống. */
  UNKNOWN_ACCOUNT = 'UNKNOWN_ACCOUNT',
}

/** Nguồn gửi thông báo tiền về. */
export enum BankTransactionGateway {
  /** Dịch vụ đối soát ngân hàng thật (SePay và tương đương). */
  SEPAY = 'SEPAY',
  /** Bên mô phỏng nội bộ, chỉ sống khi SANDBOX_BANK_ENABLED=true. */
  SANDBOX = 'SANDBOX',
}

export enum RaceRecordSourceType {
  CONTEST = 'CONTEST',
  SESSION_TIME_ATTACK = 'SESSION_TIME_ATTACK',
  ADMIN_IMPORT = 'ADMIN_IMPORT',
}

export enum RaceRecordVerificationStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  SUPERSEDED = 'SUPERSEDED',
}

export enum SessionVehicleStatus {
  ASSIGNED = 'ASSIGNED',
  IN_USE = 'IN_USE',
  RETURNED = 'RETURNED',
  DAMAGED = 'DAMAGED',
}

export enum InspectionSubjectType {
  RENTAL_VEHICLE = 'RENTAL_VEHICLE',
  BYOC_VEHICLE = 'BYOC_VEHICLE',
}

export enum InspectionItemStatus {
  OK = 'OK',
  SCRATCHED = 'SCRATCHED',
  BROKEN = 'BROKEN',
  MISSING = 'MISSING',
  DIRTY = 'DIRTY',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
}

export enum PhotoAngle {
  FRONT = 'FRONT',
  BACK = 'BACK',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  TOP = 'TOP',
  BOTTOM = 'BOTTOM',
  DETAIL = 'DETAIL',
  OTHER = 'OTHER',
}

export enum ExtensionProposalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

// ── Dispute ───────────────────────────────────────────────────────────────────

export enum DisputeStatus {
  OPEN = 'OPEN',
  UNDER_REVIEW = 'UNDER_REVIEW',
  RESOLVED = 'RESOLVED',
}

// ── F&B ───────────────────────────────────────────────────────────────────────

// FnbCategory (enum cố định FOOD/DRINK/SNACK/DESSERT/COMBO/OTHER) đã bị gỡ bỏ.
// Danh mục F&B nay do Provider tự tạo cho từng chi nhánh — xem bảng `menu_categories`
// và entity `MenuCategory`. Món không gắn danh mục nào = "Chưa phân loại".

export enum FnbOrderType {
  PRE_ORDER = 'PRE_ORDER',
  ON_SITE = 'ON_SITE',
}

export enum FnbOrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

// ── Notification ──────────────────────────────────────────────────────────────

export enum NotificationChannel {
  PUSH = 'PUSH',
  SMS = 'SMS',
  EMAIL = 'EMAIL',
}

// ── Provider KYC ─────────────────────────────────────────────────────────────

export enum KycBusinessType {
  INDIVIDUAL = 'INDIVIDUAL',
  BUSINESS = 'BUSINESS',
}

export enum KycDocumentType {
  CCCD_FRONT = 'CCCD_FRONT',
  CCCD_BACK = 'CCCD_BACK',
  GPKD = 'GPKD',
  REPRESENTATIVE_ID = 'REPRESENTATIVE_ID',
  VENUE_PHOTO = 'VENUE_PHOTO',
}

export interface KycDocumentItem {
  documentType: KycDocumentType;
  cloudinaryUrl: string;
  cloudinaryPublicId: string;
  originalFilename: string | null;
}

// ── Provider Onboarding & Subscription ───────────────────────────────────────

export enum ProviderStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
}

export enum SubscriptionStatus {
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  GRACE_PERIOD = 'GRACE_PERIOD',
  EXPIRED = 'EXPIRED',
}

export enum PlanName {
  TRIAL = 'TRIAL',
  STARTER = 'STARTER',
  GROWTH = 'GROWTH',
  PRO = 'PRO',
}

export enum PaymentRequestStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
}

export enum NotificationType {
  SYSTEM = 'SYSTEM',
  VEHICLE_MAINTENANCE_CREATED = 'VEHICLE_MAINTENANCE_CREATED',
  MAINTENANCE_LOG_UPDATED = 'MAINTENANCE_LOG_UPDATED',
  ACCOUNT_APPROVED = 'ACCOUNT_APPROVED',
  ACCOUNT_REJECTED = 'ACCOUNT_REJECTED',
  ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED',
  ACCOUNT_UNSUSPENDED = 'ACCOUNT_UNSUSPENDED',
  TRIAL_EXPIRING_SOON = 'TRIAL_EXPIRING_SOON',
  /**
   * Gói TRẢ PHÍ sắp hết hạn — tách khỏi `TRIAL_EXPIRING_SOON`.
   *
   * Dùng chung một loại thì không lọc ra được ai là khách trả tiền sắp rời đi,
   * và nội dung thông báo buộc phải viết chung chung cho cả hai. Nói với người
   * đang dùng gói Pro rằng "gói dùng thử sắp hết hạn" là sai sự thật.
   */
  SUBSCRIPTION_EXPIRING_SOON = 'SUBSCRIPTION_EXPIRING_SOON',
  GRACE_PERIOD_STARTED = 'GRACE_PERIOD_STARTED',
  SUBSCRIPTION_EXPIRED = 'SUBSCRIPTION_EXPIRED',
  SUBSCRIPTION_ACTIVATED = 'SUBSCRIPTION_ACTIVATED',
  PAYMENT_REQUEST_CONFIRMED = 'PAYMENT_REQUEST_CONFIRMED',
  PAYMENT_REQUEST_REJECTED = 'PAYMENT_REQUEST_REJECTED',
  SESSION_CHECKIN_INSPECTION = 'SESSION_CHECKIN_INSPECTION',
  SESSION_CHECKOUT_INSPECTION = 'SESSION_CHECKOUT_INSPECTION',
  SESSION_EXTENSION_PROPOSED = 'SESSION_EXTENSION_PROPOSED',
  SESSION_FNB_ORDER_ADDED = 'SESSION_FNB_ORDER_ADDED',
  FNB_ORDER_READY_FOR_PREP = 'FNB_ORDER_READY_FOR_PREP',
  FNB_ORDER_SERVED = 'FNB_ORDER_SERVED',
  SESSION_OVERDUE_ALERT = 'SESSION_OVERDUE_ALERT',
  CUSTOMER_CHECKIN_CONFIRMED = 'CUSTOMER_CHECKIN_CONFIRMED',
  CUSTOMER_CHECKOUT_CONFIRMED = 'CUSTOMER_CHECKOUT_CONFIRMED',
  CUSTOMER_INSPECTION_DISPUTED = 'CUSTOMER_INSPECTION_DISPUTED',
  CUSTOMER_EXTENSION_APPROVED = 'CUSTOMER_EXTENSION_APPROVED',
  CUSTOMER_EXTENSION_REJECTED = 'CUSTOMER_EXTENSION_REJECTED',
  CUSTOMER_PAYMENT_CONFIRMED = 'CUSTOMER_PAYMENT_CONFIRMED',
  BOOKING_REVIEW_REQUEST = 'BOOKING_REVIEW_REQUEST',
  /** Đơn đặt sân vừa được thanh toán — báo cho nhân viên chi nhánh và chủ sân. */
  BOOKING_CREATED = 'BOOKING_CREATED',
  CONTEST_REGISTRATION_CREATED = 'CONTEST_REGISTRATION_CREATED',
  CONTEST_REGISTRATION_APPROVED = 'CONTEST_REGISTRATION_APPROVED',
  CONTEST_REGISTRATION_REJECTED = 'CONTEST_REGISTRATION_REJECTED',
  CONTEST_REGISTRATION_CANCELLED = 'CONTEST_REGISTRATION_CANCELLED',
  CONTEST_CHECKIN_CONFIRMED = 'CONTEST_CHECKIN_CONFIRMED',
  CONTEST_REMINDER = 'CONTEST_REMINDER',
  BOOKING_CANCELLED = 'BOOKING_CANCELLED',
}

// ── Review ────────────────────────────────────────────────────────────────────

export enum ReviewStatus {
  VISIBLE = 'VISIBLE',
  HIDDEN = 'HIDDEN',
}

// ── Pricing ───────────────────────────────────────────────────────────────────

export enum PricingRuleType {
  WEEKEND = 'WEEKEND',
  PEAK_HOURS = 'PEAK_HOURS',
}

export enum HolidayType {
  SYSTEM = 'SYSTEM',
  CUSTOM = 'CUSTOM',
}

// ── Express extensions ────────────────────────────────────────────────────────

import { Request } from 'express';

export interface AuthPayload {
  userId: string;
  role: UserRole;
  email: string;
  cafeId?: string;
  impersonated_by?: string;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

// ── Widget Config ─────────────────────────────────────────────────────────────

export interface WidgetConfigData {
  greetingMessage: string;
  welcomeMessage: string;
  position: string;
  primaryColor: string;
  avatarUrl: string | null;
  quickReplies: string[];
  systemPrompt: string | null;
  isEnabled: boolean;
  fullPageEnabled: boolean;
}

// ── AI Chat ───────────────────────────────────────────────────────────────────

export enum KbDocumentStatus {
  PENDING = 'PENDING',
  INDEXED = 'INDEXED',
  FAILED = 'FAILED',
}

export enum KbContentType {
  POLICY = 'POLICY',
  FAQ = 'FAQ',
  ANNOUNCEMENT = 'ANNOUNCEMENT',
  CUSTOM = 'CUSTOM',
}

export enum WidgetPosition {
  BOTTOM_RIGHT = 'BOTTOM_RIGHT',
  BOTTOM_LEFT = 'BOTTOM_LEFT',
}

export type ChatResponseType =
  | 'greeting'
  | 'thanks'
  | 'farewell'
  | 'text'
  | 'slot_list'
  | 'vehicle_list';

export interface SlotItem {
  time: string;
  availableCount: number;
}

export interface VehicleItem {
  name: string;
  tier: string;
  hourlyRate: number;
  status: string;
}

export interface ChatResponse {
  answer: string;
  responseType: ChatResponseType;
  data?: {
    date?: string;
    slots?: SlotItem[];
    vehicles?: VehicleItem[];
  };
  sources?: string[];
  quickReplies?: string[];
}

// ── Channel ───────────────────────────────────────────────────────────────────

export enum ChannelType {
  FACEBOOK_MESSENGER = 'FACEBOOK_MESSENGER',
}

export enum ChannelStatus {
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
}

export interface FbButton {
  type: 'web_url';
  url: string;
  title: string;
}

export interface FbFormattedMessage {
  text: string;
  quickReplies: FbQuickReply[];
  buttons?: FbButton[]; // present → renders as button template, URL hidden from user
}

export interface FbQuickReply {
  content_type: 'text';
  title: string;
  payload: string;
}

export interface FbMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    is_echo?: boolean;
    attachments?: unknown[];
    quick_reply?: { payload: string };
  };
  postback?: { payload: string; title: string };
}

// ── Error ─────────────────────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string,
    /** Dữ liệu phụ trợ cho client dựng UI (vd: số món chặn xóa danh mục). */
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Hành động admin thực hiện trên tài khoản người dùng.
 *
 * Khoá dùng lại đúng cờ `users.is_active` mà luồng đăng nhập đã kiểm
 * (`auth.service.ts:150`), nên không phải dựng thêm cơ chế chặn nào — người bị
 * khoá nhận `ACCOUNT_LOCKED` ngay ở bước đăng nhập.
 */
export enum UserModerationAction {
  LOCK = 'LOCK',
  UNLOCK = 'UNLOCK',
}
