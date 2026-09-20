import { QrCode } from "lucide-react"
import { StaffCard, StaffButton } from "@/pages/staff/components/StaffUI"

export function ContestCheckInLookupCard({
  code,
  onChangeCode,
  onLookup,
  isLoading,
}: {
  code: string
  onChangeCode: (value: string) => void
  onLookup: () => void
  isLoading?: boolean
}) {
  return (
    <StaffCard className="space-y-4">
      <div className="flex items-center gap-2 text-[#ea580c]">
        <QrCode className="size-5" />
        <h3 className="text-base font-extrabold text-[#1c1b1b]">
          Tra cứu người đăng ký
        </h3>
      </div>
      <div className="flex flex-col gap-3 md:flex-row">
        <input
          value={code}
          onChange={(event) => onChangeCode(event.target.value)}
          placeholder="Nhập mã điểm danh"
          className="h-11 flex-1 rounded-lg border border-[#e5e2e1] bg-white px-4 text-sm font-semibold text-[#1c1b1b] focus:border-[#ea580c] focus:outline-none focus:ring-1 focus:ring-[#ea580c]"
        />
        <StaffButton onClick={onLookup} disabled={isLoading}>
          {isLoading ? "Đang tra cứu..." : "Tra cứu"}
        </StaffButton>
      </div>
    </StaffCard>
  )
}
