import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Loader2 } from "lucide-react"
import { toast } from "sonner"

import type { BankTransactionItem } from "@/features/booking/types/booking.types"
import {
  bankPaymentApi,
  bankPaymentQueryKeys,
} from "@/features/payments/api/bank-payment.api"
import { StaffCard } from "@/pages/staff/components/StaffUI"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"

/**
 * Khoản tiền khách đã chuyển nhưng hệ thống chưa ghép được vào đơn nào.
 *
 * Nhân viên cần thứ này vì họ là người đứng trước khách đang hỏi "tôi chuyển
 * rồi mà sao chưa thấy gì". Nhưng phạm vi bị siết chặt: **chỉ những khoản đang
 * treo của chi nhánh mình**, không có tổng tiền, không thấy khoản đã xử lý.
 * Số dư tài khoản ngân hàng vẫn là chuyện riêng của chủ quán — backend cũng
 * chặn, đây chỉ là lớp thứ hai.
 */

const REASON_LABELS: Record<string, string> = {
  NO_REF_CODE: "Khách chuyển sai nội dung",
  REF_NOT_FOUND: "Mã tham chiếu không khớp đơn nào",
  SHORT_PAID: "Khách chuyển thiếu tiền",
  ALREADY_PAID: "Đơn đã thanh toán rồi",
  SESSION_REPLACED: "Khách đã đổi cách thanh toán",
  BOOKING_EXPIRED: "Tiền về sau khi hết hạn giữ chỗ",
}

function formatVnd(value: number) {
  return `${value.toLocaleString("vi-VN")}đ`
}

export function StaffPendingTransfersCard({ cafeId }: { cafeId?: string }) {
  const queryClient = useQueryClient()
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [bookingId, setBookingId] = useState("")

  const { data: items = [], isLoading } = useQuery({
    queryKey: bankPaymentQueryKeys.pending(cafeId),
    queryFn: () => bankPaymentApi.listPendingTransactions(cafeId!),
    enabled: Boolean(cafeId),
    refetchInterval: 30_000,
  })

  const assignMutation = useMutation({
    mutationFn: (transactionId: string) =>
      bankPaymentApi.assignTransaction(transactionId, {
        booking_id: bookingId.trim(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: bankPaymentQueryKeys.pending(cafeId),
      })
      setAssigningId(null)
      setBookingId("")
      toast.success("Đã ghép khoản tiền vào đơn hàng")
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message ?? "Không ghép được"),
  })

  if (!cafeId) return null

  return (
    <StaffCard>
      <h3 className="mb-1 text-sm font-black uppercase tracking-[0.14em] text-[#adaaaa]">
        Tiền chuyển khoản chờ xử lý
      </h3>

      {isLoading ? (
        <Loader2 className="mt-3 size-5 animate-spin text-[#adaaaa]" />
      ) : items.length === 0 ? (
        <p className="mt-2 rounded-lg bg-[#fcf8f8] px-3 py-2.5 text-sm text-[#747878]">
          Không có khoản nào chờ. Khi có khách chuyển khoản mà hệ thống không tự
          ghép được vào đơn, khoản đó sẽ hiện ở đây để bạn xử lý tại quầy.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((item: BankTransactionItem) => (
            <li
              key={item.id}
              className="rounded-lg border border-[#e5e2e1] bg-white p-3"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-orange-500" />
                <div className="min-w-0 flex-1">
                  <p className="font-black text-[#1c1b1b]">
                    {formatVnd(item.amount)}
                  </p>
                  <p className="truncate text-xs text-[#747878]">{item.content}</p>
                  {item.match_reason && (
                    <p className="mt-0.5 text-xs font-semibold text-orange-600">
                      {REASON_LABELS[item.match_reason] ?? item.match_reason}
                    </p>
                  )}
                </div>
                {assigningId !== item.id && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setAssigningId(item.id)
                      setBookingId("")
                    }}
                  >
                    Ghép đơn
                  </Button>
                )}
              </div>

              {assigningId === item.id && (
                <div className="mt-3 flex gap-2">
                  <Input
                    className="h-9"
                    value={bookingId}
                    placeholder="Mã đơn hàng của khách"
                    onChange={(event) => setBookingId(event.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 shrink-0"
                    disabled={bookingId.trim().length < 8 || assignMutation.isPending}
                    onClick={() => assignMutation.mutate(item.id)}
                  >
                    {assignMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      "Xác nhận"
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-9 shrink-0"
                    onClick={() => setAssigningId(null)}
                  >
                    Huỷ
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </StaffCard>
  )
}
