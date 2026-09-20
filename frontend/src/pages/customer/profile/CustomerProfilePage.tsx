import { CustomerSubNav } from "@/pages/customer/components/CustomerSubNav"
import { CustomerPageShell } from "@/pages/customer/components/CustomerPageShell"
import { ProfileSettingsCard } from "./components/ProfileSettingsCard"

/**
 * Trang hồ sơ khách.
 *
 * `DriverPassportCard` đã được gỡ khỏi đây: nó lặp lại danh tính đã có ở thẻ
 * bên trái (ảnh, tên, @tên tay đua, danh hiệu), lặp lại các chỉ số đã có ở đó,
 * và mang theo nút lưu thứ hai. Phần thật sự CHỈNH SỬA ĐƯỢC của nó — tên hiển
 * thị, tên tay đua, hai công tắc riêng tư — nay nằm trong `ProfileSettingsCard`
 * dưới mục "Tay đua".
 */
export function CustomerProfilePage() {
  return (
    <CustomerPageShell>
      <CustomerSubNav activeTab="profile" />
      <ProfileSettingsCard />
    </CustomerPageShell>
  )
}
