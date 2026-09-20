import { api } from "@/shared/lib/axios"

export type ProviderCafe = {
  id: string
  name: string
  status: "PENDING" | "ACTIVE" | "SUSPENDED"
  address: string
  district: string
  city: string
}

export type PackageBillingPeriod = "WEEK" | "MONTH"
export type PackageApplicablePlayMode = "RENTAL" | "BYOC"

export type RecurringPackage = {
  id: string
  cafeId: string
  code: string
  name: string
  description: string | null
  slotCount: number
  billingPeriod: PackageBillingPeriod
  price: string
  benefits: string[]
  applicablePlayModes: PackageApplicablePlayMode[]
  isPopular: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type PackagePayload = {
  code: string
  name: string
  description?: string | null
  slot_count: number
  billing_period: PackageBillingPeriod
  price: number
  benefits?: string[]
  applicable_play_modes?: PackageApplicablePlayMode[]
  is_popular?: boolean
  is_active?: boolean
}

type ApiListResponse<T> = {
  success?: boolean
  data: T[]
}

export const packageApi = {
  listProviderCafes: async (): Promise<ProviderCafe[]> => {
    const res = await api.get<ApiListResponse<ProviderCafe>>("/v1/cafes", {
      params: { limit: 100, scope: "managed" },
    })
    return res.data.data
  },

  listByCafe: async (cafeId: string): Promise<RecurringPackage[]> => {
    const res = await api.get<ApiListResponse<RecurringPackage>>(`/v1/cafes/${cafeId}/packages`)
    return res.data.data
  },

  create: async (cafeId: string, payload: PackagePayload): Promise<RecurringPackage> => {
    const res = await api.post<ApiItemResponse<RecurringPackage>>(`/v1/cafes/${cafeId}/packages`, payload)
    return res.data.data
  },

  update: async (cafeId: string, packageId: string, payload: Partial<PackagePayload>): Promise<RecurringPackage> => {
    const res = await api.patch<ApiItemResponse<RecurringPackage>>(`/v1/cafes/${cafeId}/packages/${packageId}`, payload)
    return res.data.data
  },

  remove: async (cafeId: string, packageId: string): Promise<void> => {
    await api.delete(`/v1/cafes/${cafeId}/packages/${packageId}`)
  },
}

type ApiItemResponse<T> = {
  success: boolean
  data: T
}
