import type { ActivePromotion } from "@/features/promotions/api/promotion.api"

export type CafeStatus = "PENDING" | "ACTIVE" | "SUSPENDED"

export type TrackType = {
  id: string
  code: string
  name: string
  sortOrder: number
  isActive: boolean
  description: string | null
}

export type CafeOperatingHour = {
  open?: string
  close?: string
  is_closed?: boolean
}

export type CafeOperatingHours = Record<string, CafeOperatingHour>

export type AmenityCatalogItem = {
  id: string
  title: string
  description: string | null
  icon: string
  sortOrder: number
}

export type BackendCafe = {
  id: string
  providerId: string
  name: string
  slug: string
  description: string | null
  phone: string | null
  status: CafeStatus
  coverImageUrl: string | null
  address: string
  district: string
  city: string
  latitude: number | string | null
  longitude: number | string | null
  operatingHours: CafeOperatingHours
  trackTypes: TrackType[]
  slotDurationMinutes: number
  slotFeeRate: number | string
  maxConcurrentBookings: number
  minBookingNoticeMinutes: number
  maxAdvanceBookingDays: number
  byocCapacity: number
  rating?: number
  reviewsCount?: number
  minPrice?: number
  /** Tên doanh nghiệp của chủ cơ sở. */
  providerName?: string | null
  amenityIds: string[]
  rules: string[]
  amenities?: AmenityCatalogItem[]
  activePromotions?: ActivePromotion[]
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  /** Chỉ có ở endpoint chi tiết, không có ở danh sách. */
  provider_business?: CafeProviderBusiness | null
}

/**
 * Thông tin doanh nghiệp công khai của chi nhánh.
 *
 * Backend trả theo danh sách trắng — giấy tờ KYC và trạng thái duyệt hồ sơ
 * không nằm trong đây và không được thêm vào.
 */
export type CafeProviderBusiness = {
  business_name: string
  business_legal_name: string | null
  tax_code: string | null
  business_address: string | null
  business_email: string | null
  business_type: string | null
  tax_verified: boolean
}

export type CafeImage = {
  id: string
  cafeId: string
  url: string
  sortOrder: number
  createdAt: string
}

export type CafeListParams = {
  page?: number
  limit?: number
  scope?: "managed"
  query?: string
  slug?: string
  district?: string
  city?: string
  track_type?: string
  price_min?: number
  price_max?: number
  amenities?: string[]
  vehicle_type?: string
  sort_by?: "popularity" | "price_asc" | "price_desc" | "rating"
  popular_filters?: string[]
  status?: CafeStatus
  /** "YYYY-MM-DD" — chỉ giữ cơ sở còn slot trống ngày đó. */
  date?: string
  /** Khung giờ chọn từ trang chủ (vd: "08:00 - 10:00"). */
  time?: string
  /** RENTAL = chi nhánh còn xe cho thuê; BYOC = có nhận khách mang xe riêng. */
  play_mode?: "RENTAL" | "BYOC"
}

export type CafeUpsertBody = {
  name: string
  description?: string | null
  phone?: string | null
  cover_image_url?: string | null
  address: string
  district: string
  city: string
  latitude?: number | null
  longitude?: number | null
  operating_hours: CafeOperatingHours
  track_types: string[]
  slot_duration_minutes: number
  slot_fee_rate: number
  max_concurrent_bookings: number
  min_booking_notice_minutes: number
  max_advance_booking_days: number
  byoc_capacity: number
  amenity_ids?: string[]
  rules?: string[]
}

export type CafeListMeta = {
  total: number
  page: number
  limit: number
}

export type ApiEnvelope<T> = {
  success: boolean
  data: T
}

export type CafeListResponse = ApiEnvelope<BackendCafe[]> & {
  meta: CafeListMeta
}

export type WidgetPosition = "BOTTOM_RIGHT" | "BOTTOM_LEFT"

export type KbDocumentStatus = "PENDING" | "INDEXED" | "FAILED"
export type KbContentType = "POLICY" | "FAQ" | "ANNOUNCEMENT" | "CUSTOM"

export type KbDocument = {
  id: string
  title: string
  original_filename: string
  content_type: KbContentType
  status: KbDocumentStatus
  chunk_count: number
  created_at: string
  updated_at: string
}

export type CafeWidgetConfig = {
  cafeId: string
  cafeSlug: string
  greetingMessage: string
  welcomeMessage: string
  position: WidgetPosition
  primaryColor: string
  avatarUrl: string | null
  quickReplies: string[]
  systemPrompt: string | null
  isEnabled: boolean
  fullPageEnabled: boolean
}

export type TrackConfig = {
  id: string
  cafe_id: string
  track_type_id: string
  track_type?: {
    id: string
    code: string
    name: string
    description: string | null
  }
  max_concurrent: number
  byoc_capacity: number
  images: string[]
  description: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CreateTrackConfigBody = {
  track_type_id: string
  max_concurrent: number
  byoc_capacity: number
  description?: string | null
  sort_order?: number
}

export type UpdateTrackConfigBody = {
  max_concurrent?: number
  byoc_capacity?: number
  description?: string | null
  images?: string[]
  sort_order?: number
  is_active?: boolean
}

export type WidgetConfigBody = {
  greeting_message?: string
  welcome_message?: string
  position?: WidgetPosition
  primary_color?: string
  avatar_url?: string | null
  quick_replies?: string[]
  system_prompt?: string | null
  is_enabled?: boolean
  full_page_enabled?: boolean
}
