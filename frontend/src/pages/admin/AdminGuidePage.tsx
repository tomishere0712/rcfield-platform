import { AdminHeader } from "@/pages/admin/components/AdminPrimitives"
import { AdminShell } from "@/pages/admin/components/AdminShell"
import { GuideCenter } from "@/pages/guides/GuideCenter"

export function AdminGuidePage() {
  return (
    <AdminShell>
      <AdminHeader
        title="Hướng dẫn quản trị"
        description="Quy trình dành cho các thao tác tác động đến Provider và toàn nền tảng."
      />
      <GuideCenter role="admin" />
    </AdminShell>
  )
}
