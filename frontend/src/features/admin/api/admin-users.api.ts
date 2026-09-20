import { api } from "@/shared/lib/axios"

/**
 * Số liệu hành vi đặt lịch của một người dùng.
 *
 * `self_cancelled` và `cancelled_by_others` tách riêng có chủ đích: chỉ lần
 * khách TỰ huỷ mới quy được trách nhiệm. Khách bị quán huỷ lịch không có lỗi
 * gì, hiển thị gộp là admin khoá đúng người đang chịu thiệt.
 */
export interface UserBehaviour {
  total_bookings: number
  self_cancelled: number
  cancelled_by_others: number
  no_show: number
  completed: number
  /** (tự huỷ + vắng mặt) / tổng, tính theo phần trăm. */
  broken_rate: number
  last_booking_at: string | null
}

export interface AdminUserRow {
  id: string
  email: string
  full_name: string | null
  phone: string | null
  is_active: boolean
  trust_score: number
  created_at: string
  behaviour: UserBehaviour
}

export interface AdminUserBooking {
  id: string
  cafe_name: string
  slot_start: string
  status: string
  cancelled_at: string | null
  cancellation_reason: string | null
  cancelled_by_self: boolean | null
}

export interface ModerationLog {
  id: string
  action: "LOCK" | "UNLOCK"
  reason: string
  created_at: string
  actor_email: string
  metadata: { behaviour_at_decision?: UserBehaviour }
}

export interface AdminUserDetail extends Omit<AdminUserRow, "behaviour"> {
  behaviour: UserBehaviour
  recent_bookings: AdminUserBooking[]
  moderation_history: ModerationLog[]
}

export interface ListUsersParams {
  page?: number
  limit?: number
  q?: string
  status?: "active" | "locked"
  sort?: "newest" | "risk"
}

export const adminUsersApi = {
  list: async (params: ListUsersParams) => {
    const res = await api.get<{
      success: boolean
      data: AdminUserRow[]
      meta: { total: number; page: number; limit: number }
    }>("/v1/admin/users", { params })
    return res.data
  },

  detail: async (userId: string): Promise<AdminUserDetail> => {
    const res = await api.get<{ success: boolean; data: AdminUserDetail }>(
      `/v1/admin/users/${userId}`,
    )
    return res.data.data
  },

  // Lý do là bắt buộc ở cả hai chiều — mở khoá cũng là một quyết định cần giải trình.
  lock: async (userId: string, reason: string) => {
    const res = await api.post<{ success: boolean; data: { id: string; is_active: boolean } }>(
      `/v1/admin/users/${userId}/lock`,
      { reason },
    )
    return res.data.data
  },

  unlock: async (userId: string, reason: string) => {
    const res = await api.post<{ success: boolean; data: { id: string; is_active: boolean } }>(
      `/v1/admin/users/${userId}/unlock`,
      { reason },
    )
    return res.data.data
  },
}
