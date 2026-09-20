import { Navigate } from "react-router"

import { routePaths } from "@/app/router/route-paths"

/**
 * Cấu hình vận hành luôn thuộc về một cơ sở cụ thể. Trang cũ là mock và có
 * dữ liệu giờ hoạt động hard-code, nên chuyển người dùng đến danh sách cơ sở
 * để chọn đúng chi nhánh trước khi chỉnh sửa.
 */
export function ProviderConfigurationPage() {
  return <Navigate replace to={routePaths.providerCafes} />
}
