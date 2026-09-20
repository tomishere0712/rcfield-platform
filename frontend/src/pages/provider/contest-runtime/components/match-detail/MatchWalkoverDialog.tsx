import { useState } from "react"
import { UserX } from "lucide-react"
import { toast } from "sonner"
import type {
  ContestMatchParticipant,
  ContestWalkoverStatus,
} from "@/features/contests/types"
import {
  getErrorMessage,
  getMatchParticipantName,
} from "@/features/contests/lib/contest-runtime"
import { Button } from "@/shared/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Label } from "@/shared/ui/label"
import { Textarea } from "@/shared/ui/textarea"

const REASON_MIN = 5

const ABSENCE_REASONS: Array<{
  value: ContestWalkoverStatus
  label: string
  hint: string
}> = [
  { value: "DNS", label: "Không đến", hint: "Tới giờ thi mà không có mặt" },
  {
    value: "DNF",
    label: "Bỏ giữa chừng",
    hint: "Có mặt nhưng không hoàn thành",
  },
  { value: "DQ", label: "Bị loại", hint: "Vi phạm quy định của giải" },
]

/**
 * Xử thua vắng mặt.
 *
 * Ba lý do phải phân biệt rõ: không đến, bỏ giữa chừng, và bị loại vì vi phạm —
 * chúng khác nhau về trách nhiệm và về cách xử lý khiếu nại sau này.
 *
 * Cho phép đánh dấu cả hai người: có thật chuyện cả hai đội cùng không tới, và
 * nếu không có đường xử lý thì trận đó treo, kéo theo cả vòng sau.
 */
export function MatchWalkoverDialog({
  participants,
  onSubmit,
  disabled,
}: {
  participants: ContestMatchParticipant[]
  onSubmit: (body: {
    absent: Array<{ registration_id: string; status: ContestWalkoverStatus }>
    reason: string
  }) => Promise<unknown>
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [absent, setAbsent] = useState<Record<string, ContestWalkoverStatus>>(
    {},
  )
  const [reason, setReason] = useState("")
  const [pending, setPending] = useState(false)

  const absentEntries = Object.entries(absent)
  const everyoneAbsent = absentEntries.length === participants.length
  const reasonTooShort = reason.trim().length < REASON_MIN
  const canSubmit = absentEntries.length > 0 && !reasonTooShort && !pending

  const close = () => {
    setOpen(false)
    setAbsent({})
    setReason("")
  }

  const toggle = (registrationId: string, status: ContestWalkoverStatus) => {
    setAbsent((current) => {
      if (current[registrationId] === status) {
        const next = { ...current }
        delete next[registrationId]
        return next
      }
      return { ...current, [registrationId]: status }
    })
  }

  const handleConfirm = async () => {
    setPending(true)
    try {
      await onSubmit({
        absent: absentEntries.map(([registration_id, status]) => ({
          registration_id,
          status,
        })),
        reason: reason.trim(),
      })
      toast.success("Đã xử thua vắng mặt")
      close()
    } catch (error) {
      toast.error("Không thể xử thua", {
        description: getErrorMessage(error).message,
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        className="gap-1.5 rounded-lg border-amber-200 bg-amber-50 text-xs font-bold text-amber-800 hover:bg-amber-100"
        onClick={() => setOpen(true)}
      >
        <UserX className="size-3.5" />
        Xử thua vắng mặt
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Xử thua vắng mặt</DialogTitle>
          </DialogHeader>

          <p className="text-sm font-semibold text-[#5d5f5f]">
            Chọn người vắng và lý do. Người còn lại thắng và đi tiếp ngay.
          </p>

          <div className="space-y-3">
            {participants.map((participant) => {
              const registrationId = participant.registration_id
              const picked = absent[registrationId]
              return (
                <div
                  key={registrationId}
                  className={`rounded-xl border p-3 ${
                    picked ? "border-amber-300 bg-amber-50" : "border-[#e5e2e1]"
                  }`}
                >
                  <p className="text-sm font-extrabold text-[#1c1b1b]">
                    {getMatchParticipantName(participant)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ABSENCE_REASONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        title={option.hint}
                        onClick={() => toggle(registrationId, option.value)}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors ${
                          picked === option.value
                            ? "border-amber-500 bg-amber-500 text-white"
                            : "border-[#c4c7c8] bg-white text-[#5d5f5f] hover:border-[#747878]"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {everyoneAbsent ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
              Cả hai đều vắng nên trận này không có người thắng. Người thắng của
              nhánh còn lại sẽ được vào thẳng vòng sau.
            </p>
          ) : null}

          <div className="space-y-2">
            <Label className="text-sm font-bold text-[#1c1b1b]">
              Lý do <span className="text-red-600">*</span>
            </Label>
            <Textarea
              rows={3}
              value={reason}
              placeholder="Ví dụ: gọi tên 3 lần sau giờ thi 10 phút, không có mặt"
              onChange={(event) => setReason(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Quay lại
            </Button>
            <Button
              disabled={!canSubmit}
              className="bg-amber-700 text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void handleConfirm()}
            >
              {pending ? "Đang xử lý..." : "Xác nhận xử thua"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
