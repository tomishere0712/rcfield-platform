import { api } from "@/shared/lib/axios"
import type { ContestItem } from "@/features/contests/types"

export type FeaturedPopupItem = {
  id: string
  title: string
  subtitle: string | null
  image_url: string | null
  cta_label: string
  cta_url: string | null
  contest_id: string | null
  placement: "EXPLORE"
  audience_scope: "ALL"
  starts_at: string
  ends_at: string
  is_active: boolean
  /** Nội dung phải được duyệt mới lên trang, kể cả khi `is_active` là true. */
  review_status: "PENDING" | "APPROVED" | "REJECTED"
  review_notes: string | null
  priority: number
  created_at: string
  updated_at: string
}

/** Suất quảng bá kèm dữ liệu giải đấu liên kết, dùng cho dải carousel. */
export type FeaturedContestSlot = FeaturedPopupItem & {
  contest: ContestItem | null
}

export const featuredPopupQueryKeys = {
  all: ["featured-popup"] as const,
  active: () => [...featuredPopupQueryKeys.all, "active"] as const,
  activeList: () => [...featuredPopupQueryKeys.all, "active-list"] as const,
}

export const featuredPopupApi = {
  getActive: async (): Promise<FeaturedPopupItem | null> => {
    const res = await api.get<{ success: boolean; data: FeaturedPopupItem | null }>(
      "/v1/explore/featured-popup",
    )
    return res.data.data ?? null
  },

  /**
   * Mọi suất quảng bá đang chạy. Giải không mua gói sẽ không có suất nào nên
   * không xuất hiện — danh sách rỗng đồng nghĩa với ẩn hẳn dải carousel.
   */
  listActive: async (): Promise<FeaturedContestSlot[]> => {
    const res = await api.get<{ success: boolean; data: FeaturedContestSlot[] }>(
      "/v1/explore/featured-popups",
    )
    return res.data.data ?? []
  },
}
