import type { KycDocumentType } from "../../provider-kyc/types"

export type SubscriptionStatus = "TRIAL" | "ACTIVE" | "GRACE_PERIOD" | "EXPIRED"
export type ProviderStatus = "PENDING" | "ACTIVE" | "REJECTED" | "SUSPENDED"
export type PaymentRequestStatus = "PENDING" | "CONFIRMED" | "REJECTED"
export type PlanName = "TRIAL" | "STARTER" | "GROWTH" | "PRO"

export interface SubscriptionPlan {
  id: string
  name: PlanName
  branchLimit: number
  aiQuotaPerMonth: number
  channelLimit: number
  pricePerMonth: number
  isTrial: boolean
}

export interface ProviderSubscription {
  id: string
  providerId: string
  planId: string
  status: SubscriptionStatus
  startedAt: string
  expiresAt: string
  graceEndsAt: string | null
  aiMessagesUsed: number
  aiQuotaResetAt: string
  plan?: SubscriptionPlan
}

export interface PaymentRequest {
  id: string
  providerId: string
  planId: string
  status: PaymentRequestStatus
  transferReference: string
  transferDate: string
  transferAmount: number
  adminNotes: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
}

export interface ProviderListItem {
  id: string
  email: string
  full_name: string
  created_at: string
  business_name: string
  registration_status: ProviderStatus
  plan_name: PlanName | null
  subscription_status: SubscriptionStatus | null
  expires_at: string | null
}

export interface KycDocument {
  documentType: KycDocumentType
  cloudinaryUrl: string
  originalFilename: string | null
}

export interface ProviderDetail extends ProviderListItem {
  phone: string | null
  business_description: string | null
  /** NULL ở hồ sơ tạo trước khi hai cột này tồn tại; đăng ký mới luôn có. */
  tax_code: string | null
  business_email: string | null
  rejection_reason: string | null
  suspended_at: string | null
  suspended_reason: string | null
  started_at: string | null
  grace_ends_at: string | null
  ai_messages_used: number | null
  ai_quota_per_month: number | null
  branch_limit: number | null
  channel_limit: number | null
  kyc: {
    businessType: string | null
    submittedAt: string | null
    documents: KycDocument[]
  } | null
}

export interface CafeListItem {
  id: string
  name: string
  address: string
  status: string
}

export interface ImpersonateResponse {
  token: string
  expires_in: number
  provider: {
    id: string
    business_name: string
  }
}

export interface AdminPaymentRequestItem {
  id: string
  provider_id: string
  plan_id: string
  status: PaymentRequestStatus
  transfer_reference: string
  transfer_date: string
  transfer_amount: number
  admin_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  email: string
  business_name: string | null
  plan_name: PlanName | null
  price_per_month: number | null
}

/** Thông tin doanh nghiệp lấy từ dữ liệu Cục Thuế. */
export interface TaxBusinessInfo {
  taxCode: string
  legalName: string
  internationalName: string | null
  shortName: string | null
  address: string | null
  /** Nguyên văn, ví dụ "NNT đang hoạt động". */
  taxStatus: string
}

export type TaxLookupResult =
  | { status: "ACTIVE"; business: TaxBusinessInfo }
  | { status: "INACTIVE"; business: TaxBusinessInfo }
  | { status: "NOT_FOUND" }
  | { status: "INVALID" }
  /** Không hỏi được Cục Thuế; cho đi tiếp nhưng hồ sơ bị đánh dấu chưa xác minh. */
  | { status: "UNAVAILABLE" }

/** Một dòng trong sổ giao dịch nền tảng của admin. */
export type LedgerSource = "SAAS" | "CONTEST_FEE"

export interface LedgerRow {
  id: string
  source: LedgerSource
  code: string
  party: string | null
  subject: string | null
  amount: number
  gateway: string | null
  status: string
  created_at: string
}

export interface LedgerSummary {
  saas_revenue: number
  contest_fee_revenue: number
  platform_revenue: number
  pending_amount: number
}
