import { api } from '@/shared/lib/axios'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PricingRule {
  id: string
  rule_type: 'WEEKEND' | 'PEAK_HOURS'
  multiplier: number
  is_active: boolean
  peak_start_time?: string
  peak_end_time?: string
}

export interface ProviderPricingResponse {
  base_price_per_hour: number
  rules: PricingRule[]
}

export interface PeakHourInput {
  start: string
  end: string
  multiplier: number
}

export interface UpdatePricingRulesBody {
  weekend_multiplier: number | null
  peak_hours: PeakHourInput[]
}

export interface PublicPricingResponse {
  base_price_per_hour: number
  slot_duration_minutes: number
  rules: {
    weekend: { multiplier: number; label: string } | null
    peak_hours: Array<{ start: string; end: string; multiplier: number; label: string }>
    upcoming_holidays: Array<{ date: string; name: string; multiplier: number; label: string }>
  }
}

export interface PricingPreviewResponse {
  base_price_per_hour: number
  effective_price_per_hour: number
  multiplier: number
  label: string | null
  slot_fee_total: number
}

export interface HolidayItem {
  id: string
  date: string
  name: string
  multiplier: number
  holiday_type: 'SYSTEM' | 'CUSTOM'
  can_delete: boolean
  can_override: boolean
  override_multiplier: number | null
}

export interface HolidayListResponse {
  holidays: HolidayItem[]
}

export interface CreateHolidayBody {
  date: string
  name: string
  multiplier: number
}

export interface UpdateHolidayBody {
  multiplier: number
  name?: string
}

// ── Query Keys ────────────────────────────────────────────────────────────────

export const pricingQueryKeys = {
  all: ['pricing'] as const,
  provider: (cafeId: string) => [...pricingQueryKeys.all, 'provider', cafeId] as const,
  public: (cafeId: string) => [...pricingQueryKeys.all, 'public', cafeId] as const,
  preview: (cafeId: string, slotStart: string, slotEnd: string) =>
    [...pricingQueryKeys.all, 'preview', cafeId, slotStart, slotEnd] as const,
  holidays: (cafeId: string, year?: number) =>
    [...pricingQueryKeys.all, 'holidays', cafeId, year] as const,
}

// ── API ───────────────────────────────────────────────────────────────────────

export const pricingApi = {
  getProviderPricing: async (cafeId: string): Promise<ProviderPricingResponse> => {
    const res = await api.get<ProviderPricingResponse>(`/v1/provider/cafes/${cafeId}/pricing`)
    return res.data
  },

  updatePricingRules: async (cafeId: string, body: UpdatePricingRulesBody): Promise<void> => {
    await api.put(`/v1/provider/cafes/${cafeId}/pricing/rules`, body)
  },

  getPublicPricing: async (cafeId: string): Promise<PublicPricingResponse> => {
    const res = await api.get<PublicPricingResponse>(`/v1/cafes/${cafeId}/pricing`)
    return res.data
  },

  getPricingPreview: async (
    cafeId: string,
    slotStart: string,
    slotEnd: string,
  ): Promise<PricingPreviewResponse> => {
    const res = await api.get<PricingPreviewResponse>(`/v1/cafes/${cafeId}/pricing-preview`, {
      params: { slot_start: slotStart, slot_end: slotEnd },
    })
    return res.data
  },

  listHolidays: async (cafeId: string, year?: number): Promise<HolidayListResponse> => {
    const res = await api.get<HolidayListResponse>(
      `/v1/provider/cafes/${cafeId}/pricing/holidays`,
      { params: year ? { year } : undefined },
    )
    return res.data
  },

  createHoliday: async (cafeId: string, body: CreateHolidayBody): Promise<{ id: string }> => {
    const res = await api.post<{ id: string }>(
      `/v1/provider/cafes/${cafeId}/pricing/holidays`,
      body,
    )
    return res.data
  },

  updateHoliday: async (
    cafeId: string,
    holidayId: string,
    body: UpdateHolidayBody,
  ): Promise<void> => {
    await api.put(`/v1/provider/cafes/${cafeId}/pricing/holidays/${holidayId}`, body)
  },

  deleteHoliday: async (cafeId: string, holidayId: string): Promise<void> => {
    await api.delete(`/v1/provider/cafes/${cafeId}/pricing/holidays/${holidayId}`)
  },

  deleteHolidayOverride: async (cafeId: string, holidayId: string): Promise<void> => {
    await api.delete(`/v1/provider/cafes/${cafeId}/pricing/holidays/${holidayId}/override`)
  },
}
