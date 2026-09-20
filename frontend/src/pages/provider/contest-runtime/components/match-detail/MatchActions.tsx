import { Button } from "@/shared/ui/button"
import { ConfirmDialog } from "@/shared/ui/confirm-dialog"
import { Textarea } from "@/shared/ui/textarea"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { MatchDetailField } from "./MatchDetailField"

export function MatchActions({
  reason,
  onReasonChange,
  forceCascade,
  onForceCascadeChange,
  readyForResultEntry,
  hasPendingBracketChanges,
  onSubmitResults,
  onCorrectResults,
  onAdvance,
}: {
  reason: string
  onReasonChange: (value: string) => void
  forceCascade: boolean
  onForceCascadeChange: (value: boolean) => void
  readyForResultEntry: boolean
  hasPendingBracketChanges: boolean
  onSubmitResults: () => Promise<void>
  onCorrectResults: () => Promise<void>
  onAdvance: () => Promise<void>
}) {
  const actionsDisabled = !readyForResultEntry || hasPendingBracketChanges
  // BE chỉ cho provider force_cascade (staff bị 403) — ẩn khỏi UI staff.
  const role = useAuthStore((state) => state.role)
  const canForceCascade = role === "provider"

  return (
    <section className="space-y-3 rounded-lg border border-[#e5e2e1] bg-[#fcf8f8] p-4">
      <MatchDetailField label="Lý do cập nhật">
        <Textarea
          rows={3}
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
        />
      </MatchDetailField>
      {canForceCascade ? (
        <label className="flex items-center gap-2 text-sm font-semibold text-[#1c1b1b]">
          <input
            type="checkbox"
            checked={forceCascade}
            onChange={(event) => onForceCascadeChange(event.target.checked)}
          />
          Cho phép làm mới nhánh kế tiếp khi sửa kết quả
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          className="rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030]"
          disabled={actionsDisabled}
          onClick={() => void onSubmitResults()}
        >
          Lưu kết quả
        </Button>
        <ConfirmDialog
          trigger={
            <Button
              variant="outline"
              className="rounded-lg border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
              disabled={actionsDisabled}
            >
              Sửa kết quả
            </Button>
          }
          title="Xác nhận sửa kết quả"
          description="Kết quả đã lưu sẽ bị ghi đè. Nếu bật làm mới nhánh kế tiếp, các trận vòng sau sẽ được cập nhật lại theo kết quả mới."
          confirmLabel="Sửa kết quả"
          destructive
          onConfirm={onCorrectResults}
        />
        {/* Người thắng tự sang vòng sau ngay khi lưu kết quả. Nút này chỉ còn
            để chữa cháy khi dữ liệu lệch, nên đặt nhẹ và nói rõ công dụng. */}
        <Button
          variant="ghost"
          className="rounded-lg text-xs font-semibold text-[#747878] hover:bg-[#f6f3f2]"
          disabled={actionsDisabled}
          title="Chỉ dùng khi vòng sau thiếu người dù trận này đã có kết quả"
          onClick={() => void onAdvance()}
        >
          Đồng bộ lại vòng sau
        </Button>
      </div>
    </section>
  )
}
