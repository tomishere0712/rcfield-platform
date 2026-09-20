import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Plus } from "lucide-react"
import { toast } from "sonner"

import {
  contestFinanceApi,
  contestFinanceQueryKeys,
} from "@/features/contests/api/contest-finance.api"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Textarea } from "@/shared/ui/textarea"
import { StaffCard } from "@/pages/staff/components/StaffUI"

const EXPENSE_CATEGORIES = [
  { value: "OTHER", label: "Khác" },
  { value: "FNB", label: "Đồ ăn thức uống" },
  { value: "VENUE", label: "Địa điểm" },
  { value: "STAFF", label: "Nhân sự" },
  { value: "MARKETING", label: "Truyền thông" },
  { value: "PRIZE_ITEM", label: "Giải thưởng hiện vật" },
] as const

function formatVnd(value: number) {
  return `${value.toLocaleString("vi-VN", { maximumFractionDigits: 0 })}đ`
}

/**
 * Ghi chi phí phát sinh trong lúc vận hành giải.
 *
 * Nhân viên chỉ ghi được chiều chi và chỉ khi giải đang chạy — backend chặn cả
 * hai. Component này cũng không hiển thị bất kỳ số tổng nào của giải: nhân viên
 * chỉ thấy đúng những khoản mình đã ghi.
 */
export function StaffExpenseFormCard({
  contestId,
  contestStatus,
}: {
  contestId?: string
  contestStatus?: string
}) {
  const queryClient = useQueryClient()
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0].value)
  const [title, setTitle] = useState("")
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")

  const isRunning = contestStatus === "RUNNING"

  const { data: myEntries = [] } = useQuery({
    queryKey: contestFinanceQueryKeys.myLedger(contestId),
    queryFn: () => contestFinanceApi.listMyEntries(contestId!),
    enabled: Boolean(contestId),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      contestFinanceApi.createEntry(contestId!, {
        direction: "OUT",
        category,
        title: title.trim(),
        amount: Number(amount),
        occurred_at: new Date().toISOString(),
        note: note.trim(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: contestFinanceQueryKeys.myLedger(contestId),
      })
      setTitle("")
      setAmount("")
      setNote("")
      toast.success("Đã ghi khoản chi")
    },
    onError: () => toast.error("Không ghi được khoản chi"),
  })

  if (!contestId) return null

  // Cố ý LUÔN hiện thẻ, kể cả khi chưa ghi được.
  //
  // Bản trước ẩn hẳn lúc giải chưa chạy để khỏi chiếm chỗ, nhưng hệ quả là nhân
  // viên không biết tính năng tồn tại và đi tìm khắp nơi. Thẻ đã nằm cuối trang
  // nên không còn cạnh tranh với sơ đồ đấu; giữ nó hiển thị kèm dòng giải thích
  // dạy được người dùng khi nào thì ghi được.

  const numericAmount = Number(amount)
  const canSubmit =
    isRunning &&
    title.trim().length > 0 &&
    note.trim().length > 0 &&
    amount.trim() !== "" &&
    !Number.isNaN(numericAmount) &&
    numericAmount > 0 &&
    !createMutation.isPending

  return (
    <StaffCard>
      <h3 className="mb-3 text-sm font-black uppercase tracking-[0.14em] text-[#adaaaa]">
        Chi phí phát sinh
      </h3>
      {!isRunning ? (
        <p className="rounded-lg bg-[#fcf8f8] px-3 py-2.5 text-sm text-[#747878]">
          Đây là chỗ ghi tiền bạn ứng ra trong lúc chạy giải — mua pin, taxi chở
          đồ, in lại bảng đấu. Ô nhập mở khi giải chuyển sang{" "}
          <span className="font-semibold text-[#5d5f5f]">đang diễn ra</span>.
          Khoản chuẩn bị trước hoặc thu dọn sau khi bế mạc thì báo chủ quán ghi.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-[#747878]">
                Loại khoản
              </span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="h-10 w-full rounded-lg border border-[#e5e2e1] bg-white px-3 text-sm font-semibold"
              >
                {EXPENSE_CATEGORIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-[#747878]">
                Số tiền (VND)
              </span>
              <Input
                className="h-10"
                type="number"
                min={1}
                value={amount}
                placeholder="150000"
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-bold text-[#747878]">
              Chi cho việc gì
            </span>
            <Input
              className="h-10"
              value={title}
              maxLength={255}
              placeholder="Ví dụ: Mua pin dự phòng"
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold text-[#747878]">
              Lý do <span className="text-red-600">*</span>
            </span>
            <Textarea
              rows={2}
              maxLength={1000}
              value={note}
              placeholder="Bắt buộc — chủ quán cần biết vì sao khoản này phát sinh"
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          <Button
            type="button"
            className="h-10 w-full gap-1.5 rounded-lg"
            disabled={!canSubmit}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Ghi khoản chi
          </Button>
        </div>
      )}

      {myEntries.length > 0 ? (
        <div className="mt-4 border-t border-[#f1eeee] pt-3">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#adaaaa]">
            Khoản bạn đã ghi
          </p>
          <ul className="mt-2 space-y-1.5">
            {myEntries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start justify-between gap-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="block truncate font-bold text-[#1c1b1b]">
                    {entry.title}
                  </span>
                  {entry.note ? (
                    <span className="block truncate text-xs text-[#adaaaa]">
                      {entry.note}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 font-black text-orange-600">
                  {formatVnd(entry.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </StaffCard>
  )
}
