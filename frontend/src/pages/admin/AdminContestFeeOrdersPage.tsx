import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle, Megaphone, Sparkles, XCircle } from "lucide-react"
import { toast } from "sonner"

import { contestApi } from "@/features/contests/api/contest.api"
import type {
  AdminContestFeeOrder,
  ContestFeeOrderStatus,
  PendingFeaturedPopup,
} from "@/features/contests/types"
import {
  AdminHeader,
  AdminPanel,
  AdminPanelTitle,
} from "@/pages/admin/components/AdminPrimitives"
import { AdminShell } from "@/pages/admin/components/AdminShell"
import { Badge } from "@/shared/ui/badge"
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

const STATUS_LABEL: Record<ContestFeeOrderStatus, string> = {
  PENDING_PAYMENT: "Chờ provider chuyển khoản",
  PENDING_REVIEW: "Chờ đối soát",
  PAID: "Đã xác nhận",
  REJECTED: "Đã từ chối",
  CANCELLED: "Đã huỷ",
}

const STATUS_CLASS: Record<ContestFeeOrderStatus, string> = {
  PENDING_PAYMENT: "bg-slate-100 text-slate-700",
  PENDING_REVIEW: "bg-amber-100 text-amber-800",
  PAID: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-800",
  CANCELLED: "bg-slate-100 text-slate-500",
}

function formatVnd(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * Hai hàng đợi của admin cho mảng giải đấu.
 *
 * Đối soát tiền và duyệt nội dung quảng bá là hai việc tách rời: tiền vào rồi
 * nội dung vẫn có thể bị từ chối. Gộp chung một trang vì cùng một người làm và
 * việc thứ hai luôn sinh ra từ việc thứ nhất.
 */
export function AdminContestFeeOrdersPage() {
  const queryClient = useQueryClient()
  const [rejectTarget, setRejectTarget] = useState<AdminContestFeeOrder | null>(
    null,
  )
  const [rejectReason, setRejectReason] = useState("")

  const ordersQuery = useQuery({
    queryKey: ["admin", "contest-fee-orders"],
    queryFn: () => contestApi.listContestFeeOrdersForAdmin({ limit: 50 }),
  })
  const pendingPopupsQuery = useQuery({
    queryKey: ["admin", "featured-popups", "pending"],
    queryFn: contestApi.listPendingFeaturedPopups,
  })

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["admin", "contest-fee-orders"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["admin", "featured-popups", "pending"],
      }),
    ])
  }

  const confirmMutation = useMutation({
    mutationFn: (orderId: string) => contestApi.confirmContestFeeOrder(orderId),
    onSuccess: invalidate,
  })
  const rejectMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      contestApi.rejectContestFeeOrder(orderId, reason),
    onSuccess: invalidate,
  })
  const reviewMutation = useMutation({
    mutationFn: ({
      popupId,
      approve,
      notes,
    }: {
      popupId: string
      approve: boolean
      notes?: string
    }) => contestApi.reviewFeaturedPopup(popupId, { approve, notes }),
    onSuccess: invalidate,
  })

  const orders = ordersQuery.data?.data ?? []
  const waitingOrders = orders.filter(
    (order) => order.status === "PENDING_REVIEW",
  )
  const pendingPopups = pendingPopupsQuery.data ?? []

  return (
    <AdminShell>
      <AdminHeader
        title="Phí tổ chức giải"
        description="Đối soát chuyển khoản của provider và duyệt nội dung quảng bá trước khi lên trang chủ."
      />

      <AdminPanel className="mb-4">
        <AdminPanelTitle
          title={`Chờ đối soát (${waitingOrders.length})`}
          subtitle="Đối chiếu mã giao dịch với sao kê ngân hàng rồi xác nhận. Xác nhận xong provider mở đăng ký được ngay."
        />
        {ordersQuery.isLoading ? (
          <p className="text-sm text-slate-500">Đang tải...</p>
        ) : waitingOrders.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
            Không có đơn nào chờ đối soát.
          </p>
        ) : (
          <div className="space-y-3">
            {waitingOrders.map((order) => (
              <div
                key={order.id}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {/*
                    Ảnh quảng bá hiện NGAY Ở ĐÂY, không tách ra một bước duyệt
                    riêng. Đây là lúc duy nhất có người nhìn vào đơn chuyển
                    khoản — xác nhận tiền cũng chính là chấp nhận nội dung sẽ
                    lên trang chủ, nên hai thứ đó phải nằm trước cùng một cặp
                    mắt, cùng một lúc.
                  */}
                  {order.contest_banner_url ? (
                    <img
                      src={order.contest_banner_url}
                      alt=""
                      className="h-20 w-32 shrink-0 rounded-lg border border-slate-200 object-cover"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900">
                      {order.contest_name ?? "Giải đấu"}
                    </p>
                    {order.contest_description ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">
                        {order.contest_description}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-500">
                      {order.plan?.name} · {formatVnd(order.amount)}
                      {order.featured_days > 0
                        ? ` · ${order.featured_days} ngày quảng bá`
                        : ""}
                    </p>
                    <p className="mt-2 text-xs font-semibold text-slate-700">
                      Mã giao dịch: {order.transfer_reference} · Ngày{" "}
                      {order.transfer_date}
                    </p>
                    <Badge className={`mt-2 ${STATUS_CLASS[order.status]}`}>
                      {STATUS_LABEL[order.status]}
                    </Badge>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      className="h-9 gap-1.5 bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700"
                      disabled={confirmMutation.isPending}
                      onClick={async () => {
                        try {
                          await confirmMutation.mutateAsync(order.id)
                          toast.success(
                            order.featured_days > 0
                              ? "Đã xác nhận và đưa lên trang chủ"
                              : "Đã xác nhận đơn phí",
                          )
                        } catch {
                          toast.error("Không xác nhận được đơn")
                        }
                      }}
                    >
                      <CheckCircle className="size-3.5" />
                      {order.featured_days > 0 ? "Xác nhận & đăng" : "Xác nhận"}
                    </Button>
                    <Button
                      variant="outline"
                      className="h-9 gap-1.5 border-red-200 text-xs font-bold text-red-700 hover:bg-red-50"
                      onClick={() => {
                        setRejectTarget(order)
                        setRejectReason("")
                      }}
                    >
                      <XCircle className="size-3.5" />
                      Từ chối
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminPanel>

      {/*
        Ô này chỉ còn cho đơn thanh toán qua PayOS.

        Đơn chuyển khoản được duyệt nội dung ngay lúc đối soát tiền — admin đã
        nhìn thấy ảnh và tiêu đề trên thẻ ở ô trên, nên hỏi lại lần nữa ở đây là
        hỏi cùng một người cùng một câu hỏi hai lần.
        
        PayOS thì tiền về tự động, không ai nhìn, nên vẫn phải qua đây. Không có
        đơn nào chờ thì ẩn hẳn ô, đừng bày một khung rỗng.
      */}
      {pendingPopups.length > 0 ? (
      <AdminPanel>
        <AdminPanelTitle
          title={`Duyệt nội dung quảng bá (${pendingPopups.length})`}
          subtitle="Đơn thanh toán qua PayOS — tiền về tự động nên chưa ai xem nội dung. Duyệt xong mới lên trang chủ."
        />
        {pendingPopupsQuery.isLoading ? (
          <p className="text-sm text-slate-500">Đang tải...</p>
        ) : (
          <div className="space-y-3">
            {pendingPopups.map((popup) => (
              <PendingPopupRow
                key={popup.id}
                popup={popup}
                pending={reviewMutation.isPending}
                onReview={async (approve, notes) => {
                  try {
                    await reviewMutation.mutateAsync({
                      popupId: popup.id,
                      approve,
                      notes,
                    })
                    toast.success(
                      approve
                        ? "Đã cho lên trang chủ"
                        : "Đã từ chối nội dung này",
                    )
                  } catch {
                    toast.error("Không xử lý được")
                  }
                }}
              />
            ))}
          </div>
        )}
      </AdminPanel>
      ) : null}

      <Dialog
        open={Boolean(rejectTarget)}
        onOpenChange={() => setRejectTarget(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Từ chối đơn phí</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Provider sẽ nhận được lý do này và khai báo lại chuyển khoản.
          </p>
          <div className="space-y-2">
            <Label>
              Lý do <span className="text-red-600">*</span>
            </Label>
            <Textarea
              rows={3}
              value={rejectReason}
              placeholder="Ví dụ: không tìm thấy giao dịch trong sao kê ngày 04/08"
              onChange={(event) => setRejectReason(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Quay lại
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              disabled={rejectReason.trim().length < 5}
              onClick={async () => {
                if (!rejectTarget) return
                try {
                  await rejectMutation.mutateAsync({
                    orderId: rejectTarget.id,
                    reason: rejectReason.trim(),
                  })
                  toast.success("Đã từ chối đơn phí")
                  setRejectTarget(null)
                } catch {
                  toast.error("Không từ chối được đơn")
                }
              }}
            >
              Từ chối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}

function PendingPopupRow({
  popup,
  pending,
  onReview,
}: {
  popup: PendingFeaturedPopup
  pending: boolean
  onReview: (approve: boolean, notes?: string) => void
}) {
  const [notes, setNotes] = useState("")

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap gap-4">
        {popup.image_url ? (
          <img
            src={popup.image_url}
            alt="Ảnh bìa giải"
            className="h-24 w-40 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-24 w-40 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs font-semibold text-amber-700">
            Chưa có ảnh bìa
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <Megaphone className="size-4 text-orange-500" />
            {popup.title}
          </p>
          {popup.subtitle ? (
            <p className="mt-1 line-clamp-2 text-xs text-slate-600">
              {popup.subtitle}
            </p>
          ) : null}
          {/*
            Suất chờ duyệt thì KHÔNG in ngày cụ thể.

            Đồng hồ hiển thị được neo lại vào lúc duyệt, nên hai ngày đang lưu
            chỉ là chỗ giữ chân — in ra sẽ thành lời hứa sai với chính người
            đang bấm nút, và tệ hơn là làm họ tưởng duyệt muộn thì chủ sân mất
            ngày.
          */}
          <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-slate-500">
            <Sparkles className="size-3" />
            {(() => {
              const soNgay = Math.max(
                1,
                Math.round(
                  (new Date(popup.ends_at).getTime() -
                    new Date(popup.starts_at).getTime()) /
                    86_400_000,
                ),
              )
              return `Hiển thị ${soNgay} ngày, tính từ lúc bạn duyệt`
            })()}
          </p>

          {/*
            Bỏ nút "Từ chối" khỏi giao diện.

            Từ chối hiện là ngõ cụt về tiền: `reviewFeaturedPopup` đóng suất
            vĩnh viễn (`REJECTED`, và trạng thái đó không quay lại `PENDING`
            được), trong khi chủ sân đã trả đủ gói tổ chức. Không có đường nộp
            lại ảnh khác, nên một cú bấm là mất trắng.

            Chừng nào chưa có luồng "sửa nội dung rồi gửi duyệt lại" thì không
            nên bày một cái nút mà hậu quả của nó không gỡ được.

            Điểm cuối ở backend VẪN nhận `approve: false` — chốt chặn không nằm
            ở đây. Đây chỉ là gỡ cái nút.
          */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Textarea
              rows={1}
              value={notes}
              placeholder="Ghi chú cho provider (không bắt buộc)"
              className="min-w-[16rem] flex-1"
              onChange={(event) => setNotes(event.target.value)}
            />
            <Button
              className="h-9 bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700"
              disabled={pending}
              onClick={() => onReview(true, notes.trim() || undefined)}
            >
              Cho lên trang chủ
            </Button>
          </div>
        </div>
      </div>

      <Badge className="mt-3 bg-amber-100 text-amber-800">
        Đã thu tiền · chờ duyệt nội dung
      </Badge>
    </div>
  )
}
