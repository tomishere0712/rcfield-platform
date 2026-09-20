import { useState } from "react"
import { toast } from "sonner"
import type { ContestRegistration } from "@/features/contests/types"
import { getErrorMessage } from "@/features/contests/lib/contest-runtime"
import type { useContestWorkspace } from "@/features/contests/hooks/useContestWorkspace"
import type { RegistrationActionKind } from "../RegistrationRowActions"
import type { BanScope } from "./RegistrationActionDialog"

type WorkspaceHook = ReturnType<typeof useContestWorkspace>

type DialogState =
  | { kind: null; registration: null }
  | { kind: RegistrationActionKind; registration: ContestRegistration }

// "Đã cập nhật đăng ký" nói đúng cho việc thu tiền, nhưng sai hẳn khi vừa cấm
// một người khỏi mọi giải — thông báo phải khớp với việc vừa làm.
const SUCCESS_MESSAGE: Record<RegistrationActionKind, string> = {
  markPaid: "Đã ghi nhận thu tiền",
  waive: "Đã miễn lệ phí",
  approve: "Đã duyệt xe vào giải",
  reject: "Đã từ chối đăng ký",
  cancel: "Đã huỷ đăng ký",
  disqualify: "Đã loại khỏi giải",
  ban: "Đã cấm tham gia",
}

const FAILURE_MESSAGE: Record<RegistrationActionKind, string> = {
  markPaid: "Không ghi nhận được khoản thu",
  waive: "Không miễn được lệ phí",
  approve: "Không duyệt được xe",
  reject: "Không từ chối được đăng ký",
  cancel: "Không huỷ được đăng ký",
  disqualify: "Không loại được người chơi",
  ban: "Không tạo được lệnh cấm",
}

export function useRegistrationActionDialog(workspace: WorkspaceHook) {
  const [dialogState, setDialogState] = useState<DialogState>({
    kind: null,
    registration: null,
  })
  const [reason, setReason] = useState("")
  const [banScope, setBanScope] = useState<BanScope>("CONTEST")
  const [banExpiresAt, setBanExpiresAt] = useState("")

  const closeDialog = () => {
    setDialogState({ kind: null, registration: null })
    setReason("")
    setBanScope("CONTEST")
    setBanExpiresAt("")
  }

  const openDialog = (
    kind: RegistrationActionKind,
    registration: ContestRegistration,
  ) => {
    setDialogState({ kind, registration })
  }

  const handleDialogAction = async () => {
    const registration = dialogState.registration
    if (!registration || !dialogState.kind) return

    try {
      if (dialogState.kind === "markPaid") {
        await workspace.eventDay.markPaidMutation.mutateAsync({
          registrationId: registration.id,
          note: reason || undefined,
        })
      } else if (dialogState.kind === "waive") {
        await workspace.eventDay.waiveFeeMutation.mutateAsync({
          registrationId: registration.id,
          note: reason || undefined,
        })
      } else if (dialogState.kind === "approve") {
        await workspace.eventDay.approveMutation.mutateAsync({
          registrationId: registration.id,
          reason: reason || undefined,
        })
      } else if (dialogState.kind === "reject") {
        // Backend bắt buộc lý do vì nó được gửi thẳng cho VĐV bị loại.
        await workspace.eventDay.rejectMutation.mutateAsync({
          registrationId: registration.id,
          reason: reason.trim(),
        })
      } else if (dialogState.kind === "disqualify") {
        await workspace.disqualifyRegistrationMutation.mutateAsync({
          registrationId: registration.id,
          reason: reason.trim(),
        })
      } else if (dialogState.kind === "ban") {
        // `userId` lấy thẳng từ hàng đang thao tác — trước đây màn kỷ luật bắt
        // provider tự gõ UUID này vào một ô trống.
        await workspace.createBanMutation.mutateAsync({
          user_id: registration.userId,
          scope_type: banScope,
          reason: reason.trim(),
          notes: null,
          expires_at: banExpiresAt || null,
        })
      } else {
        await workspace.eventDay.cancelRegistrationMutation.mutateAsync(
          registration.id,
        )
      }
      toast.success(SUCCESS_MESSAGE[dialogState.kind])
      closeDialog()
    } catch (error) {
      toast.error(FAILURE_MESSAGE[dialogState.kind], {
        description: getErrorMessage(error).message,
      })
    }
  }

  return {
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
  }
}
