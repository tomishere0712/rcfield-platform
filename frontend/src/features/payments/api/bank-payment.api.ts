import { api } from "@/shared/lib/axios"
import type {
  BankTransactionItem,
  CafePaymentMethodOption,
  CafePaymentSettings,
} from "@/features/booking/types/booking.types"

type ApiEnvelope<T> = { success: boolean; data: T }

export interface BankOption {
  code: string
  name: string
}

export interface SampleQr {
  qr_payload: string
  qr_image_data_url: string
  amount: number
  memo: string
  bank_name: string
  account_number: string
  account_name: string
}

export interface UpdatePaymentSettingsBody {
  method: "VNPAY" | "BANK_TRANSFER"
  bank_code?: string | null
  account_number?: string | null
  account_name?: string | null
}

export interface OwnerLedger {
  items: BankTransactionItem[]
  total: number
  summary: { matched_total: number; needs_review_count: number }
}

/**
 * Một dòng sao kê dưới góc nhìn đối soát.
 *
 * Khác `BankTransactionItem` (sổ per-cafe) ở ba trường bên dưới, và đó chính là
 * ba trường khiến việc đối soát làm được: `external_id` để dò ngược về dòng
 * trên sao kê ngân hàng, `account_number` để biết tiền vào tài khoản nào, và
 * `expected_amount` để nhìn ra khách chuyển thiếu hay dư.
 */
/**
 * Nguồn tiền — quyết định dòng này đối chiếu với báo cáo của bên nào.
 *
 * `BANK` vào thẳng tài khoản ngân hàng chi nhánh → so với sao kê ngân hàng.
 * `VNPAY` nằm ở tài khoản người bán của cổng → so với báo cáo đối soát VNPay.
 * Hai bên không được cộng chung, vì con số gộp không khớp với bên nào cả.
 */
export type ReconciliationChannel = "BANK" | "VNPAY" | "REFUND"

export interface ReconciliationRow {
  id: string
  channel: ReconciliationChannel
  external_id: string
  gateway: string
  account_number: string
  amount: number
  content: string
  ref_code: string | null
  transaction_date: string
  match_status: "MATCHED" | "NEEDS_REVIEW" | "IGNORED"
  match_reason: string | null
  cafe_id: string | null
  cafe_name: string | null
  txn_ref: string | null
  expected_amount: number | null
  subject: "BOOKING" | "PACKAGE" | "CONTEST" | null
  subject_id: string | null
  resolved_by_name: string | null
  resolved_at: string | null
  resolution_note: string | null
}

export interface ReconciliationSummary {
  total_count: number
  total_amount: number
  /** Con số so với SAO KÊ NGÂN HÀNG. */
  bank_count: number
  bank_amount: number
  /** Con số so với BÁO CÁO ĐỐI SOÁT CỦA VNPAY. */
  vnpay_count: number
  vnpay_amount: number
  /** Tiền hoàn trả khách (Outflow) trong kỳ. */
  refund_count: number
  refund_amount: number
  /** Doanh thu thực nhận sau khi trừ hoàn tiền. */
  net_amount: number
  matched_count: number
  matched_amount: number
  needs_review_count: number
  needs_review_amount: number
  ignored_count: number
  ignored_amount: number
  unreconciled_amount: number
}

export interface ReconciliationPage {
  items: ReconciliationRow[]
  total: number
  page: number
  limit: number
  summary: ReconciliationSummary
}

export interface ReconciliationFilters {
  from?: string
  to?: string
  cafe_id?: string
  channel?: ReconciliationChannel
  status?: string
  q?: string
  page?: number
  limit?: number
}

export const bankPaymentApi = {
  /**
   * Danh sách ngân hàng hỗ trợ VietQR — công khai, không gắn với chi nhánh.
   *
   * Lấy từ backend chứ không viết cứng ở đây: backend là nơi validate mã ngân
   * hàng lúc lưu, nên nó phải là nguồn duy nhất. Chép thành hai bản thì sớm
   * muộn cũng lệch, và lúc lệch thì chủ quán không chọn được ngân hàng của mình.
   */
  listBanks: async (): Promise<BankOption[]> => {
    const res = await api.get<ApiEnvelope<{ banks: BankOption[] }>>("/v1/banks")
    return res.data.data.banks
  },

  /** Công khai — màn thanh toán dùng để biết có phải hiện lựa chọn không. */
  listPaymentMethods: async (
    cafeId: string,
  ): Promise<CafePaymentMethodOption[]> => {
    const res = await api.get<ApiEnvelope<{ methods: CafePaymentMethodOption[] }>>(
      `/v1/cafes/${cafeId}/payment-methods`,
    )
    return res.data.data.methods
  },

  /** Số tài khoản đã che. */
  getSettings: async (cafeId: string): Promise<CafePaymentSettings | null> => {
    const res = await api.get<ApiEnvelope<CafePaymentSettings | null>>(
      `/v1/cafes/${cafeId}/payment-settings`,
    )
    return res.data.data
  },

  /** Số tài khoản đầy đủ — chỉ dùng khi mở form chỉnh sửa. */
  getSettingsForEdit: async (
    cafeId: string,
  ): Promise<CafePaymentSettings | null> => {
    const res = await api.get<ApiEnvelope<CafePaymentSettings | null>>(
      `/v1/cafes/${cafeId}/payment-settings/edit`,
    )
    return res.data.data
  },

  updateSettings: async (
    cafeId: string,
    body: UpdatePaymentSettingsBody,
  ): Promise<CafePaymentSettings> => {
    const res = await api.put<ApiEnvelope<CafePaymentSettings>>(
      `/v1/cafes/${cafeId}/payment-settings`,
      body,
    )
    return res.data.data
  },

  getSampleQr: async (cafeId: string): Promise<SampleQr> => {
    const res = await api.get<ApiEnvelope<SampleQr>>(
      `/v1/cafes/${cafeId}/payment-settings/sample-qr`,
    )
    return res.data.data
  },

  verifySettings: async (cafeId: string): Promise<CafePaymentSettings> => {
    const res = await api.post<ApiEnvelope<CafePaymentSettings>>(
      `/v1/cafes/${cafeId}/payment-settings/verify`,
      {},
    )
    return res.data.data
  },

  listTransactions: async (
    cafeId: string,
    params: { status?: string; page?: number; limit?: number } = {},
  ): Promise<OwnerLedger> => {
    const res = await api.get<ApiEnvelope<OwnerLedger>>(
      `/v1/cafes/${cafeId}/bank-transactions`,
      { params },
    )
    return res.data.data
  },

  /** Hàng đợi của nhân viên — mảng phẳng, không có con số tổng nào. */
  listPendingTransactions: async (
    cafeId: string,
  ): Promise<BankTransactionItem[]> => {
    const res = await api.get<ApiEnvelope<BankTransactionItem[]>>(
      `/v1/cafes/${cafeId}/bank-transactions/pending`,
    )
    return res.data.data
  },

  assignTransaction: async (
    transactionId: string,
    body: { booking_id: string; note?: string },
  ): Promise<BankTransactionItem> => {
    const res = await api.post<ApiEnvelope<BankTransactionItem>>(
      `/v1/bank-transactions/${transactionId}/assign`,
      body,
    )
    return res.data.data
  },

  ignoreTransaction: async (
    transactionId: string,
    body: { note: string },
  ): Promise<BankTransactionItem> => {
    const res = await api.post<ApiEnvelope<BankTransactionItem>>(
      `/v1/bank-transactions/${transactionId}/ignore`,
      body,
    )
    return res.data.data
  },

  /** Sổ đối soát gộp mọi chi nhánh, lọc theo kỳ. */
  listReconciliation: async (
    filters: ReconciliationFilters,
  ): Promise<ReconciliationPage> => {
    const res = await api.get<ApiEnvelope<ReconciliationPage>>(
      "/v1/provider/reconciliation",
      { params: filters },
    )
    return res.data.data
  },

  /**
   * Tải kỳ đang lọc về dạng CSV.
   *
   * `responseType: "blob"` là bắt buộc: để mặc định thì axios cố parse thân
   * phản hồi thành JSON, và tệp về tới nơi đã hỏng mã tiếng Việt.
   */
  exportReconciliation: async (
    filters: Omit<ReconciliationFilters, "page" | "limit">,
  ): Promise<Blob> => {
    const res = await api.get<Blob>("/v1/provider/reconciliation/export", {
      params: filters,
      responseType: "blob",
    })
    return res.data
  },
}

export const bankPaymentQueryKeys = {
  banks: () => ["vietqr-banks"] as const,
  methods: (cafeId?: string) => ["cafe-payment-methods", cafeId] as const,
  settings: (cafeId?: string) => ["cafe-payment-settings", cafeId] as const,
  settingsEdit: (cafeId?: string) =>
    ["cafe-payment-settings", cafeId, "edit"] as const,
  sampleQr: (cafeId?: string) => ["cafe-payment-sample-qr", cafeId] as const,
  transactions: (cafeId?: string, status?: string) =>
    ["bank-transactions", cafeId, status ?? "all"] as const,
  pending: (cafeId?: string) => ["bank-transactions", cafeId, "pending"] as const,
  reconciliation: (filters: ReconciliationFilters) =>
    ["provider-reconciliation", filters] as const,
}
