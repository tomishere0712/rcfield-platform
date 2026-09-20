import type { BankTransferCheckout } from '@/features/booking/types/booking.types'
import { api } from '@/shared/lib/axios'

interface ApiEnvelope<T> {
  success: boolean
  data: T
}

export type CustomerPackageStatus = 'PENDING_PAYMENT' | 'ACTIVE' | 'EXHAUSTED' | 'EXPIRED'

export interface PublicPackage {
  id: string
  code: string
  name: string
  description: string | null
  slot_count: number
  price: number
  valid_days: number
  applicable_play_modes: string[]
  benefits: string[]
  is_popular: boolean
}

export interface MyPackageItem {
  id: string
  package_id: string
  cafe_id: string
  cafe_name: string
  /** Đường dẫn trang chi nhánh đi theo slug, không theo id. */
  cafe_slug?: string
  package_name: string
  applicable_play_modes?: string[]
  slots_total: number
  slots_remaining: number
  expires_at: string
  status: CustomerPackageStatus
  purchased_price: number
  created_at: string
}

export type PackagePaymentGateway = "vnpay" | "bank_transfer"

export interface PurchasePackageResult {
  customer_package_id: string
  /** Null khi trả bằng chuyển khoản — khách ở lại quét mã, không chuyển trang. */
  payment_url: string | null
  txn_ref: string
  amount: number
  expires_at: string
  flow: "redirect" | "bank_transfer"
  /** Chỉ có khi cổng là chuyển khoản. */
  bank_transfer?: BankTransferCheckout
}

export interface UsageHistoryEntry {
  booking_id: string
  slot_start: string
  slot_end: string
  slots_used: number
  cafe_name: string
  booking_status: string
}

export const customerPackageQueryKeys = {
  all: ['customer-packages'] as const,
  public: (cafeId?: string) => [...customerPackageQueryKeys.all, 'public', cafeId] as const,
  mine: (params?: { status?: string; cafe_id?: string }) =>
    [...customerPackageQueryKeys.all, 'mine', params ?? {}] as const,
  usage: (customerPackageId?: string) =>
    [...customerPackageQueryKeys.all, 'usage', customerPackageId] as const,
}

export const customerPackageApi = {
  listPublic: async (cafeId: string): Promise<PublicPackage[]> => {
    const res = await api.get<ApiEnvelope<PublicPackage[]>>(
      `/v1/cafes/${cafeId}/packages/public`,
    )
    return res.data.data
  },

  purchase: async (
    cafeId: string,
    packageId: string,
    gateway: PackagePaymentGateway = "vnpay",
  ): Promise<PurchasePackageResult> => {
    const res = await api.post<ApiEnvelope<PurchasePackageResult>>(
      `/v1/cafes/${cafeId}/packages/${packageId}/purchase`,
      { gateway },
    )
    return res.data.data
  },

  listMine: async (params?: {
    status?: CustomerPackageStatus
    cafe_id?: string
  }): Promise<MyPackageItem[]> => {
    const res = await api.get<ApiEnvelope<MyPackageItem[]>>('/v1/customers/me/packages', {
      params,
    })
    return res.data.data
  },

  getUsageHistory: async (customerPackageId: string): Promise<UsageHistoryEntry[]> => {
    const res = await api.get<ApiEnvelope<UsageHistoryEntry[]>>(
      `/v1/customers/me/packages/${customerPackageId}/usage`,
    )
    return res.data.data
  },

  repay: async (customerPackageId: string): Promise<PurchasePackageResult> => {
    const res = await api.post<ApiEnvelope<PurchasePackageResult>>(
      `/v1/customers/me/packages/${customerPackageId}/repay`,
      {},
    )
    return res.data.data
  },
}
