import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, CheckCircle2, Loader2, Receipt, XCircle } from "lucide-react"
import { toast } from "sonner"

import type { BankTransactionItem } from "@/features/booking/types/booking.types"
import {
  bankPaymentApi,
  bankPaymentQueryKeys,
} from "@/features/payments/api/bank-payment.api"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Textarea } from "@/shared/ui/textarea"
import { cn } from "@/shared/lib/utils"

/**
 * Sổ đối soát với sao kê ngân hàng.
 *
 * Hiển thị MỌI khoản tiền hệ thống nhận được báo về, kể cả khoản không khớp
 * đơn nào — đó là toàn bộ lý do sổ này tồn tại. Không có nó, mọi giao dịch lệch
 * biến mất không dấu vết và con số trong hệ thống không bao giờ khớp ngân hàng.
 */

const REASON_LABELS: Record<string, string> = {
  OVERPAID: "Khách chuyển thừa",
  NO_REF_CODE: "Sai nội dung chuyển khoản",
  REF_NOT_FOUND: "Mã tham chiếu không khớp đơn nào",
  SHORT_PAID: "Khách chuyển thiếu",
  ALREADY_PAID: "Đơn đã thanh toán rồi",
  SESSION_REPLACED: "Khách đã đổi cách thanh toán",
  BOOKING_EXPIRED: "Tiền về sau khi hết hạn giữ chỗ",
  UNKNOWN_ACCOUNT: "Tài khoản nhận không nhận ra",
}

const FILTERS = [
  { value: undefined, label: "Tất cả" },
  { value: "NEEDS_REVIEW", label: "Cần xử lý" },
  { value: "MATCHED", label: "Đã khớp" },
  { value: "IGNORED", label: "Bỏ qua" },
] as const

function formatVnd(value: number) {
  return `${value.toLocaleString("vi-VN")}đ`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function BankTransactionsPanel({ cafeId }: { cafeId: string }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<string | undefined>("NEEDS_REVIEW")
  const [assigning, setAssigning] = useState<BankTransactionItem | null>(null)
  const [ignoring, setIgnoring] = useState<BankTransactionItem | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: bankPaymentQueryKeys.transactions(cafeId, status),
    queryFn: () => bankPaymentApi.listTransactions(cafeId, { status }),
    enabled: Boolean(cafeId),
  })

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ["bank-transactions", cafeId] })

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-white p-6">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const items = data?.items ?? []

  return (
    <div className="rounded-xl border border-border bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-base font-black">
            <Receipt className="size-4 text-muted-foreground" />
            Đối soát chuyển khoản
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Mọi khoản tiền về tài khoản chi nhánh, kể cả khoản chưa ghép được đơn.
          </p>
        </div>

        {data?.summary && (
          <div className="flex gap-5 text-right">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">
                Đã khớp
              </p>
              <p className="text-lg font-black">
                {formatVnd(data.summary.matched_total)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">
                Cần xử lý
              </p>
              <p
                className={cn(
                  "text-lg font-black",
                  data.summary.needs_review_count > 0 && "text-orange-600",
                )}
              >
                {data.summary.needs_review_count}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter.label}
            type="button"
            onClick={() => setStatus(filter.value)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-bold transition",
              status === filter.value
                ? "bg-[#1c1b1b] text-white"
                : "bg-[#f6f4f4] text-[#5d5f5f] hover:bg-[#eeecec]",
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="mt-6 rounded-lg bg-[#fcf8f8] px-4 py-6 text-center text-sm text-muted-foreground">
          Chưa có giao dịch nào trong nhóm này.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
              <StatusIcon status={item.match_status} />

              <div className="min-w-0 flex-1">
                <p className="font-black">{formatVnd(item.amount)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {formatDate(item.transaction_date)} · {item.content}
                </p>
                {item.match_reason && (
                  <p className="mt-0.5 text-xs font-semibold text-orange-600">
                    {REASON_LABELS[item.match_reason] ?? item.match_reason}
                  </p>
                )}
              </div>

              {item.match_status === "NEEDS_REVIEW" && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setAssigning(item)}
                  >
                    Gán vào đơn
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground"
                    onClick={() => setIgnoring(item)}
                  >
                    Bỏ qua
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {assigning && (
        <AssignDialog
          transaction={assigning}
          onClose={() => setAssigning(null)}
          onDone={() => {
            setAssigning(null)
            refresh()
          }}
        />
      )}

      {ignoring && (
        <IgnoreDialog
          transaction={ignoring}
          onClose={() => setIgnoring(null)}
          onDone={() => {
            setIgnoring(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function StatusIcon({ status }: { status: BankTransactionItem["match_status"] }) {
  if (status === "MATCHED")
    return <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
  if (status === "IGNORED") return <XCircle className="size-5 shrink-0 text-[#adaaaa]" />
  return <AlertTriangle className="size-5 shrink-0 text-orange-500" />
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">{children}</div>
    </div>
  )
}

function AssignDialog({
  transaction,
  onClose,
  onDone,
}: {
  transaction: BankTransactionItem
  onClose: () => void
  onDone: () => void
}) {
  const [bookingId, setBookingId] = useState("")
  const [note, setNote] = useState("")

  const mutation = useMutation({
    mutationFn: () =>
      bankPaymentApi.assignTransaction(transaction.id, {
        booking_id: bookingId.trim(),
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("Đã gán giao dịch vào đơn hàng")
      onDone()
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message ?? "Không gán được"),
  })

  return (
    <Overlay>
      <h4 className="text-base font-black">Gán vào đơn hàng</h4>
      <p className="mt-1 text-sm text-muted-foreground">
        Khoản {formatVnd(transaction.amount)} — số tiền phải khớp đúng với đơn.
      </p>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-xs font-bold text-muted-foreground">
          Mã đơn hàng
        </span>
        <Input
          className="h-10"
          value={bookingId}
          placeholder="Dán mã đơn hàng"
          onChange={(event) => setBookingId(event.target.value)}
        />
      </label>

      <label className="mt-3 block">
        <span className="mb-1.5 block text-xs font-bold text-muted-foreground">
          Ghi chú
        </span>
        <Textarea
          rows={2}
          value={note}
          placeholder="Ví dụ: khách chuyển sai nội dung, đã đối chiếu sao kê"
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      <div className="mt-4 flex gap-2">
        <Button
          type="button"
          className="flex-1"
          disabled={bookingId.trim().length < 8 || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
          Gán
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Huỷ
        </Button>
      </div>
    </Overlay>
  )
}

function IgnoreDialog({
  transaction,
  onClose,
  onDone,
}: {
  transaction: BankTransactionItem
  onClose: () => void
  onDone: () => void
}) {
  const [note, setNote] = useState("")

  const mutation = useMutation({
    mutationFn: () =>
      bankPaymentApi.ignoreTransaction(transaction.id, { note: note.trim() }),
    onSuccess: () => {
      toast.success("Đã đánh dấu không liên quan")
      onDone()
    },
    onError: () => toast.error("Không thực hiện được"),
  })

  return (
    <Overlay>
      <h4 className="text-base font-black">Đánh dấu không liên quan</h4>
      <p className="mt-1 text-sm text-muted-foreground">
        Khoản {formatVnd(transaction.amount)} sẽ không tính vào doanh thu nào.
      </p>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-xs font-bold text-muted-foreground">
          Lý do <span className="text-red-600">*</span>
        </span>
        <Textarea
          rows={3}
          value={note}
          placeholder="Bắt buộc — sau này không ai nhớ vì sao khoản này bị bỏ qua"
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      <div className="mt-4 flex gap-2">
        <Button
          type="button"
          className="flex-1"
          disabled={note.trim().length === 0 || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
          Xác nhận bỏ qua
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Huỷ
        </Button>
      </div>
    </Overlay>
  )
}
