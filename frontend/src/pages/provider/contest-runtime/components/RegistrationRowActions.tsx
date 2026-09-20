import { MoreHorizontal } from "lucide-react"
import type { ContestRegistration } from "@/features/contests/types"
import { Button } from "@/shared/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"

export type RegistrationActionKind =
  | "markPaid"
  | "waive"
  | "approve"
  | "reject"
  | "cancel"
  | "disqualify"
  | "ban"

function getRegistrationActions(registration: ContestRegistration) {
  const editablePaymentStatuses: ContestRegistration["paymentStatus"][] = [
    "PENDING_PAYMENT",
    "PENDING_REVIEW",
  ]
  const canEditBeforeCheckIn =
    registration.status === "PENDING" || registration.status === "CONFIRMED"

  // Duyệt chỉ có nghĩa với xe cá nhân — đó là lúc ban tổ chức xem bản khai và
  // ảnh xe để nói đạt hay không đạt chuẩn thi đấu. Thuê xe của quán thì xe là
  // của quán, chẳng có gì để xét, nên backend tự xác nhận ngay khi lệ phí ngã
  // ngũ (`autoConfirmRentalRegistration`) và nút này không được xuất hiện.
  const needsVehicleReview = registration.vehicleSource === "BYOC"

  return {
    canMarkPaid:
      canEditBeforeCheckIn &&
      editablePaymentStatuses.includes(registration.paymentStatus),
    canWaive:
      canEditBeforeCheckIn &&
      editablePaymentStatuses.includes(registration.paymentStatus),
    showApprove: needsVehicleReview,
    canApprove: needsVehicleReview && registration.status === "PENDING",
    canReject: registration.status === "PENDING",
    canCancel:
      registration.status === "PENDING" || registration.status === "CONFIRMED",
    // Loại khỏi giải chỉ có nghĩa với người đã chắc suất — người còn chờ duyệt
    // thì từ chối là đủ, chưa có gì để loại.
    canDisqualify:
      registration.status === "CONFIRMED" ||
      registration.status === "CHECKED_IN",
  }
}

/**
 * Việc thường làm nằm ngoài, việc hiếm nằm trong menu.
 *
 * Duyệt xe và điểm danh là hai việc lặp lại cho từng người nên phải bấm được
 * ngay; thu tiền tay, miễn phí, từ chối, huỷ đều là ngoại lệ — để cả sáu nút
 * ngoài thì mỗi hàng tràn hai dòng và mắt không biết bấu vào đâu.
 */
export function RegistrationRowActions({
  registration,
  onAction,
  onCheckIn,
  checkInBlockedReason,
}: {
  registration: ContestRegistration
  onAction: (
    kind: RegistrationActionKind,
    registration: ContestRegistration,
  ) => void
  onCheckIn?: (registration: ContestRegistration) => void
  /** Lý do giải chưa cho điểm danh; có giá trị nghĩa là khoá nút kèm giải thích. */
  checkInBlockedReason?: string
}) {
  const actions = getRegistrationActions(registration)
  const checkedIn = registration.status === "CHECKED_IN"

  return (
    <div className="flex shrink-0 items-center gap-2">
      {actions.showApprove && actions.canApprove ? (
        <Button
          className="h-8 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700"
          onClick={() => onAction("approve", registration)}
        >
          Duyệt xe
        </Button>
      ) : null}

      {onCheckIn && !checkedIn ? (
        <Button
          variant="outline"
          className="h-8 rounded-lg border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={
            registration.status !== "CONFIRMED" || Boolean(checkInBlockedReason)
          }
          title={checkInBlockedReason}
          onClick={() => onCheckIn(registration)}
        >
          Điểm danh
        </Button>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-lg border-[#c4c7c8] bg-white text-[#1c1b1b] hover:bg-[#f6f3f2]"
          >
            <MoreHorizontal className="size-4" />
            <span className="sr-only">Thao tác khác</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56 rounded-xl border border-[#c4c7c8] bg-white p-1.5 shadow-md"
        >
          <DropdownMenuItem
            disabled={!actions.canMarkPaid}
            className="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-semibold"
            onClick={() => onAction("markPaid", registration)}
          >
            Đánh dấu đã thu tiền mặt
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!actions.canWaive}
            className="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-semibold"
            onClick={() => onAction("waive", registration)}
          >
            Miễn lệ phí
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!actions.canReject}
            className="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-700"
            onClick={() => onAction("reject", registration)}
          >
            Từ chối
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!actions.canCancel}
            className="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-700"
            onClick={() => onAction("cancel", registration)}
          >
            Huỷ đăng ký
          </DropdownMenuItem>

          {/* Kỷ luật nằm cuối, sau một đường ngăn: đây là nhóm việc nặng nhất
              và không nên bấm nhầm khi đang định huỷ một đăng ký bình thường. */}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!actions.canDisqualify}
            className="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-700"
            onClick={() => onAction("disqualify", registration)}
          >
            Loại khỏi giải
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-700"
            onClick={() => onAction("ban", registration)}
          >
            Cấm tham gia
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
