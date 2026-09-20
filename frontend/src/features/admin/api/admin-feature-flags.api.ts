import { api } from "@/shared/lib/axios"

export interface ApiFeatureFlag {
  id: string
  feature_key: string
  /** Tên do người khai đặt — thứ phân biệt các dòng cùng feature_key. */
  display_name: string | null
  description: string | null
  entity_type: "GLOBAL" | "CAFE" | string
  entity_id: string | null
  /** Tên chi nhánh khi cờ chỉ áp cho một chi nhánh. */
  cafe_name: string | null
  is_enabled: boolean
  config: Record<string, unknown>
  updated_at: string
}

export const adminFeatureFlagsApi = {
  list: async (): Promise<ApiFeatureFlag[]> => {
    const res = await api.get<{ success: boolean; data: ApiFeatureFlag[] }>(
      "/v1/admin/feature-flags",
    )
    return res.data.data
  },

  // Địa chỉ theo id, không theo feature_key: một feature_key có nhiều dòng.
  update: async (
    id: string,
    payload: { isEnabled?: boolean; config?: Record<string, unknown> },
  ): Promise<ApiFeatureFlag> => {
    const res = await api.patch<{ success: boolean; data: ApiFeatureFlag }>(
      `/v1/admin/feature-flags/${id}`,
      payload,
    )
    return res.data.data
  },
}
