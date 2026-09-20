import { useState } from "react"
import { QrCode } from "lucide-react"
import { toast } from "sonner"
import type {
  ContestItem,
  ContestRegistration,
} from "@/features/contests/types"
import {
  getErrorMessage,
  getRegistrationDisplayName,
} from "@/features/contests/lib/contest-runtime"
import { getContestCheckInAvailability } from "@/features/contests/lib/contest-status"
import {
  Panel,
  PanelTitle,
} from "@/pages/provider/components/ProviderPrimitives"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import type { useContestWorkspace } from "@/features/contests/hooks/useContestWorkspace"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { ContestRegistrationTable } from "./ContestRegistrationTable"
import { ContestBanList } from "./registration/ContestBanList"
import { RegistrationActionDialog } from "./registration/RegistrationActionDialog"
import {
  RegistrationFilters,
  RegistrationSummary,
} from "./registration/RegistrationFilters"
import { useRegistrationActionDialog } from "./registration/useRegistrationActionDialog"
import { useRegistrationFilters } from "./registration/useRegistrationFilters"

type WorkspaceHook = ReturnType<typeof useContestWorkspace>

/**
 * Vì sao có đăng ký không điểm danh được từ màn này.
 *
 * Xe cá nhân phải chụp tối thiểu 2 ảnh và kiểm ba hạng mục; thuê xe của quán
 * phải chọn đúng chiếc để lập phiếu mượn. Cả hai đều là việc tại quầy nên chỉ
 * màn nhân viên mới thu đủ dữ liệu — bấm ở đây chắc chắn nhận lỗi 400.
 */
function getRowCheckInBlock(
  registration: ContestRegistration,
): string | undefined {
  if (registration.vehicleSource === "BYOC") {
    return "Xe cá nhân phải kiểm tra kèm ảnh — điểm danh ở màn nhân viên"
  }
  if (registration.rentalCatalogId) {
    return "Phải chọn xe để giao — điểm danh ở màn nhân viên"
  }
  return undefined
}

export function ContestRegistrationPanel({
  contest,
  registrations,
  workspace,
  selectedCafeId,
  onChangeSelectedCafeId,
}: {
  contest: ContestItem
  registrations: ContestRegistration[]
  workspace: WorkspaceHook
  selectedCafeId: string
  onChangeSelectedCafeId: (cafeId: string) => void
}) {
  const [lookupCode, setLookupCode] = useState("")
  // Điểm danh là việc của nhân viên đứng quầy. Provider quản lý tổng thể
  // nhiều chi nhánh, admin xem để hỗ trợ/giám sát — cả hai đều không đứng
  // quầy nên không cần nút thao tác trực tiếp này.
  const role = useAuthStore((state) => state.role)
  const canCheckInFromHere = role === "staff"

  const {
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    paymentFilter,
    setPaymentFilter,
    filteredRegistrations,
    summary,
  } = useRegistrationFilters(registrations)

  const {
    dialogState,
    reason,
    setReason,
    banScope,
    setBanScope,
    banExpiresAt,
    setBanExpiresAt,
    openDialog,
    closeDialog,
    handleDialogAction,
  } = useRegistrationActionDialog(workspace)

  const eventDay = workspace.eventDay
  const checkInAvailability = getContestCheckInAvailability(contest)
  const contestCheckInBlock = checkInAvailability.canCheckIn
    ? undefined
    : checkInAvailability.reason

  const handleLookup = async () => {
    const code = lookupCode.trim()
    if (!code) {
      toast.error("Nhập mã điểm danh trước đã.")
      return
    }
    try {
      const found = await eventDay.lookupMutation.mutateAsync(code)
      setSearch(found.checkInCode ?? code)
      toast.success(`Đã tìm thấy ${found.checkInCode ?? code}`)
    } catch (error) {
      toast.error("Không tìm thấy mã này", {
        description: getErrorMessage(error).message,
      })
    }
  }

  const handleCheckIn = async (registration: ContestRegistration) => {
    if (!selectedCafeId) {
      toast.error("Chọn chi nhánh điểm danh trước đã.")
      return
    }
    try {
      await eventDay.checkInMutation.mutateAsync({
        registrationId: registration.id,
        checkedInCafeId: selectedCafeId,
      })
      toast.success("Đã điểm danh")
    } catch (error) {
      toast.error("Không thể điểm danh", {
        description: getErrorMessage(error).message,
      })
    }
  }

  return (
    <div className="space-y-4">
      <RegistrationSummary summary={summary} />

      <Panel>
        <PanelTitle
          title="Tra mã điểm danh"
          subtitle="Nhập mã trên vé của người chơi để lọc nhanh tới đúng người trong danh sách bên dưới."
        />
        <div className="grid gap-3 lg:grid-cols-[minmax(0,18rem)_1fr_auto] lg:items-end">
          <div className="space-y-1.5">
            <Label className="text-xs font-extrabold uppercase tracking-wider text-[#747878]">
              Chi nhánh điểm danh
            </Label>
            <select
              className="h-10 w-full rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm"
              value={selectedCafeId}
              onChange={(event) => onChangeSelectedCafeId(event.target.value)}
            >
              {contest.participating_branches.map((branch) => (
                <option key={branch.id} value={branch.cafe_id}>
                  {branch.cafe?.name ?? branch.cafe_id}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-extrabold uppercase tracking-wider text-[#747878]">
              Mã điểm danh
            </Label>
            <Input
              value={lookupCode}
              onChange={(event) => setLookupCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleLookup()
              }}
              placeholder="Ví dụ: AAF24F7B"
            />
          </div>
          <Button
            className="h-10 gap-2 rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030]"
            disabled={eventDay.lookupMutation.isPending}
            onClick={() => void handleLookup()}
          >
            <QrCode className="size-4" />
            Tra cứu
          </Button>
        </div>
      </Panel>

      <Panel>
        <PanelTitle
          title="Danh sách người chơi"
          subtitle="Duyệt xe, điểm danh và xử lý lệ phí trên cùng một danh sách. Thao tác ít dùng nằm trong nút ⋯ ở cuối mỗi hàng."
        />
        {contestCheckInBlock ? (
          <p className="mb-3 text-xs font-semibold text-amber-700">
            Chưa điểm danh được: {contestCheckInBlock}.
          </p>
        ) : null}

        <RegistrationFilters
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          paymentFilter={paymentFilter}
          onPaymentFilterChange={setPaymentFilter}
        />

        <ContestRegistrationTable
          registrations={filteredRegistrations}
          onAction={openDialog}
          onCheckIn={
            canCheckInFromHere
              ? (registration) => void handleCheckIn(registration)
              : undefined
          }
          resolveCheckInBlock={(registration) =>
            contestCheckInBlock ?? getRowCheckInBlock(registration)
          }
        />
      </Panel>

      <ContestBanList
        bans={workspace.bansQuery.data ?? []}
        onLift={async (banId) => {
          try {
            await workspace.liftBanMutation.mutateAsync({ banId })
            toast.success("Đã gỡ lệnh cấm")
          } catch (error) {
            toast.error("Không gỡ được lệnh cấm", {
              description: getErrorMessage(error).message,
            })
          }
        }}
      />

      <RegistrationActionDialog
        kind={dialogState.kind}
        targetName={
          dialogState.registration
            ? getRegistrationDisplayName(dialogState.registration)
            : null
        }
        open={Boolean(dialogState.kind)}
        onOpenChange={closeDialog}
        reason={reason}
        onReasonChange={setReason}
        banScope={banScope}
        onBanScopeChange={setBanScope}
        banExpiresAt={banExpiresAt}
        onBanExpiresAtChange={setBanExpiresAt}
        onConfirm={handleDialogAction}
      />
    </div>
  )
}
