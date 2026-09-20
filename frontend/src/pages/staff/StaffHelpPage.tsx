import { GuideCenter } from "@/pages/guides/GuideCenter"
import { StaffHeader } from "./components/StaffUI"

export default function StaffHelpPage() {
  return (
    <>
      <StaffHeader
        title="Trợ giúp"
        subtitle="Hướng dẫn ngắn cho các công việc vận hành trong ca."
      />
      <GuideCenter role="staff" />
    </>
  )
}
