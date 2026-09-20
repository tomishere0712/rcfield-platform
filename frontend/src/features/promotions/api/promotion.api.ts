import { api } from "@/shared/lib/axios"

export type ProviderCafe = {
  id: string
  name: string
  status: "PENDING" | "ACTIVE" | "SUSPENDED"
  address: string
  district: string
  city: string
}

export type DiscountType = "PERCENT" | "FIXED"
export type PromoApplicableTo = "ALL" | "RENTAL" | "BYOC"
export type PromotionScheduleMode = "ONCE" | "DAILY" | "WEEKLY"

export type Promotion = {
  id: string
  code: string
  description: string | null
  discountType: DiscountType
  discountValue: string
  maxDiscountAmount: string | null
  minOrderAmount: string | null
  maxUses: number | null
  maxUsesPerUser: number
  usesCount: number
  applicableTo: PromoApplicableTo
  cafeId: string
  startsAt: string
  expiresAt: string | null
  scheduleMode: PromotionScheduleMode
  scheduleStartTime: string | null
  scheduleEndTime: string | null
  scheduleWeekdays: string[]
  isActive: boolean
  showOnCafePage: boolean
  createdAt: string
  updatedAt: string
}

export type PromotionPayload = {
  code: string
  description?: string | null
  discount_type: DiscountType
  discount_value: number
  max_discount_amount?: number | null
  min_order_amount?: number | null
  max_uses?: number | null
  max_uses_per_user?: number
  applicable_to?: PromoApplicableTo
  starts_at: string
  expires_at?: string | null
  schedule_mode?: PromotionScheduleMode
  schedule_start_time?: string | null
  schedule_end_time?: string | null
  schedule_weekdays?: string[]
  is_active?: boolean
  show_on_cafe_page?: boolean
}

type ApiListResponse<T> = {
  success?: boolean
  data: T[]
}

type ApiItemResponse<T> = {
  success: boolean
  data: T
}

export type ActivePromotion = {
  code: string
  description: string | null
  discount_type: DiscountType
  discount_value: number
  max_discount_amount: number | null
  min_order_amount: number | null
  applicable_to: PromoApplicableTo
  expires_at: string | null
}

export const promotionApi = {
  listActive: async (cafeId: string): Promise<ActivePromotion[]> => {
    const res = await api.get<ApiListResponse<ActivePromotion>>(`/v1/cafes/${cafeId}/promotions/active`)
    return res.data.data
  },

  listProviderCafes: async (): Promise<ProviderCafe[]> => {
    const res = await api.get<ApiListResponse<ProviderCafe>>("/v1/cafes", {
      params: { limit: 100, scope: "managed" },
    })
    return res.data.data
  },

  listByCafe: async (cafeId: string): Promise<Promotion[]> => {
    const res = await api.get<ApiListResponse<Promotion>>(`/v1/cafes/${cafeId}/promotions`)
    return res.data.data
  },

  create: async (cafeId: string, payload: PromotionPayload): Promise<Promotion> => {
    const res = await api.post<ApiItemResponse<Promotion>>(`/v1/cafes/${cafeId}/promotions`, payload)
    return res.data.data
  },

  update: async (cafeId: string, promotionId: string, payload: Partial<PromotionPayload>): Promise<Promotion> => {
    const res = await api.patch<ApiItemResponse<Promotion>>(`/v1/cafes/${cafeId}/promotions/${promotionId}`, payload)
    return res.data.data
  },

  remove: async (cafeId: string, promotionId: string): Promise<void> => {
    await api.delete(`/v1/cafes/${cafeId}/promotions/${promotionId}`)
  },

  preview: async (
    cafeId: string,
    payload: { code: string; play_mode: "RENTAL" | "BYOC"; slot_start: string; subtotal: number },
  ): Promise<{ code: string; discount_amount: number; discount_type: DiscountType; description: string | null }> => {
    const res = await api.post<ApiItemResponse<{
      code: string
      discount_amount: number
      discount_type: DiscountType
      description: string | null
    }>>(`/v1/cafes/${cafeId}/promotions/preview`, payload)
    return res.data.data
  },
}
