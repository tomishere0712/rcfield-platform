import { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, Upload, X } from "lucide-react"
import { toast } from "sonner"

import {
  contestFinanceApi,
  contestFinanceQueryKeys,
} from "@/features/contests/api/contest-finance.api"
import type {
  ContestLedgerDirection,
  ContestLedgerEntry,
} from "@/features/contests/types"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Textarea } from "@/shared/ui/textarea"

export const INCOME_CATEGORIES = [
  { value: "SPONSORSHIP", label: "Tài trợ" },
  { value: "TICKET", label: "Bán vé" },
  { value: "FNB", label: "Đồ ăn thức uống" },
  { value: "ENTRY_FEE_ADJUSTMENT", label: "Điều chỉnh lệ phí" },
  { value: "OTHER", label: "Khác" },
] as const

export const EXPENSE_CATEGORIES = [
  { value: "PRIZE_CASH", label: "Tiền thưởng" },
  { value: "PRIZE_ITEM", label: "Giải thưởng hiện vật" },
  { value: "VENUE", label: "Địa điểm" },
  { value: "STAFF", label: "Nhân sự" },
  { value: "MARKETING", label: "Truyền thông" },
  { value: "FNB", label: "Đồ ăn thức uống" },
  { value: "OTHER", label: "Khác" },
] as const

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024
const ACCEPTED_RECEIPT_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]

/** `datetime-local` cần dạng `YYYY-MM-DDTHH:mm` theo giờ địa phương. */
function toLocalInputValue(iso: string) {
  const date = new Date(iso)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function LedgerEntryFormModal({
  contestId,
  direction,
  entry,
  onClose,
}: {
  contestId: string
  /** Chiều tiền cố định khi tạo mới. Khi sửa thì lấy từ chính bút toán. */
  direction: ContestLedgerDirection
  entry?: ContestLedgerEntry | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const isEditing = Boolean(entry)
  const effectiveDirection = entry?.direction ?? direction
  const categories =
    effectiveDirection === "IN" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  const [category, setCategory] = useState<string>(
    entry?.category ?? categories[0].value,
  )
  const [title, setTitle] = useState(entry?.title ?? "")
  const [amount, setAmount] = useState(entry ? String(entry.amount) : "")
  const [occurredAt, setOccurredAt] = useState(
    toLocalInputValue(entry?.occurred_at ?? new Date().toISOString()),
  )
  const [note, setNote] = useState(entry?.note ?? "")
  const [receiptUrl, setReceiptUrl] = useState<string | null>(
    entry?.receipt_url ?? null,
  )
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: contestFinanceQueryKeys.report(contestId),
    })
    void queryClient.invalidateQueries({
      queryKey: contestFinanceQueryKeys.ledger(contestId),
    })
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        category,
        title: title.trim(),
        amount: Number(amount),
        occurred_at: new Date(occurredAt).toISOString(),
        note: note.trim() || undefined,
        receipt_url: receiptUrl,
      }
      if (entry) return contestFinanceApi.updateEntry(entry.id, payload)
      return contestFinanceApi.createEntry(contestId, {
        ...payload,
        direction: effectiveDirection,
      })
    },
    onSuccess: () => {
      invalidate()
      toast.success(isEditing ? "Đã cập nhật khoản" : "Đã thêm khoản")
      onClose()
    },
    onError: () => {
      toast.error(
        isEditing ? "Không cập nhật được khoản" : "Không thêm được khoản",
      )
    },
  })

  const handleReceiptChange = async (file?: File) => {
    if (!file) return
    if (file.size > MAX_RECEIPT_BYTES) {
      toast.error("Ảnh tối đa 5MB")
      return
    }
    if (!ACCEPTED_RECEIPT_TYPES.includes(file.type)) {
      toast.error("Chỉ hỗ trợ JPG, PNG, WEBP")
      return
    }
    setUploading(true)
    try {
      setReceiptUrl(await contestFinanceApi.uploadReceipt(contestId, file))
      toast.success("Đã tải chứng từ")
    } catch {
      toast.error("Không tải được chứng từ")
    } finally {
      setUploading(false)
    }
  }

  const numericAmount = Number(amount)
  const amountInvalid =
    amount.trim() === "" || Number.isNaN(numericAmount) || numericAmount <= 0
  const canSave =
    !amountInvalid && title.trim().length > 0 && !saveMutation.isPending

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? "Sửa khoản" : "Thêm khoản"}
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-[#1c1b1b]">
              {isEditing
                ? "Sửa khoản"
                : effectiveDirection === "IN"
                  ? "Thêm khoản thu"
                  : "Thêm khoản chi"}
            </h2>
            {isEditing ? (
              <p className="mt-1 text-xs text-[#747878]">
                Chiều tiền không đổi được. Muốn đổi thì xoá rồi tạo lại.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-lg p-1.5 text-[#747878] transition hover:bg-[#f6f3f2]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <Field label="Loại khoản">
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-11 w-full rounded-lg border border-[#e5e2e1] bg-white px-3 text-sm font-semibold text-[#1c1b1b]"
            >
              {categories.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Tiêu đề">
            <Input
              className="h-11"
              value={title}
              maxLength={255}
              placeholder={
                effectiveDirection === "IN"
                  ? "Ví dụ: Tài trợ từ RC Shop"
                  : "Ví dụ: Tiền thưởng hạng nhất"
              }
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>

          <Field
            label="Số tiền (VND)"
            hint={
              amountInvalid && amount.trim() !== ""
                ? "Số tiền phải lớn hơn 0. Muốn ghi giảm thì tạo khoản ở chiều ngược lại."
                : undefined
            }
          >
            <Input
              className="h-11"
              type="number"
              min={1}
              step={1}
              value={amount}
              placeholder="1500000"
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>

          <Field
            label="Ngày phát sinh"
            hint="Ngày tiền thực sự chi ra hoặc thu vào, không phải hôm nay."
          >
            <Input
              className="h-11"
              type="datetime-local"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
            />
          </Field>

          <Field label="Ghi chú">
            <Textarea
              rows={3}
              maxLength={1000}
              value={note}
              placeholder="Không bắt buộc"
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>

          <Field label="Chứng từ">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-10 gap-2 rounded-lg"
                disabled={uploading}
                onClick={() =>
                  document.getElementById("ledger-receipt-file")?.click()
                }
              >
                {uploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                {uploading ? "Đang tải..." : "Tải ảnh"}
              </Button>
              <input
                id="ledger-receipt-file"
                type="file"
                accept={ACCEPTED_RECEIPT_TYPES.join(",")}
                className="hidden"
                onChange={(event) =>
                  void handleReceiptChange(event.target.files?.[0])
                }
              />
              {receiptUrl ? (
                <div className="flex items-center gap-2">
                  <img
                    src={receiptUrl}
                    alt="Chứng từ"
                    className="size-10 rounded-lg border border-[#e5e2e1] object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setReceiptUrl(null)}
                    className="text-xs font-bold text-red-600 hover:underline"
                  >
                    Gỡ
                  </button>
                </div>
              ) : (
                <span className="text-xs text-[#747878]">
                  JPG, PNG, WEBP · tối đa 5MB
                </span>
              )}
            </div>
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            type="button"
            disabled={!canSave}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            {isEditing ? "Lưu thay đổi" : "Thêm khoản"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-black uppercase tracking-[0.14em] text-[#adaaaa]">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-[#747878]">{hint}</p> : null}
    </div>
  )
}
