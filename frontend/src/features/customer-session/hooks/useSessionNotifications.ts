import { useCallback } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { useWebSocket, type WsMessage } from "@/features/notifications/hooks/useWebSocket"

type SessionNotificationData = {
  sessionId?: string
  inspectionId?: string
  proposalId?: string
  extraMinutes?: number
  additionalFee?: number
}

export function useSessionNotifications(enabled = true): void {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const handleMessage = useCallback(
    (msg: WsMessage) => {
      const data = msg.data as (SessionNotificationData & { bookingId?: string }) | undefined
      const sessionId = data?.sessionId
      const bookingId = data?.bookingId

      // Payment confirmation events — handled before the sessionId/bookingId guard
      if (msg.event === "PAYMENT_REQUEST_CONFIRMED") {
        void qc.invalidateQueries({ queryKey: ["notifications"] })
        void qc.invalidateQueries({ queryKey: ["bookings"] })
        toast.success("Đặt lịch thành công!", {
          description: "Booking của bạn đã được xác nhận. Hẹn gặp bạn tại sân!",
        })
        if (bookingId) navigate(`/customer/bookings/${bookingId}`)
        return
      }

      if (msg.event === "PAYMENT_REQUEST_REJECTED") {
        void qc.invalidateQueries({ queryKey: ["notifications"] })
        void qc.invalidateQueries({ queryKey: ["bookings"] })
        toast.error("Thanh toán thất bại", {
          description: "Booking không được xác nhận. Vui lòng thử lại.",
        })
        return
      }

      if (!sessionId && !bookingId) return

      // Invalidate notifications and bookings queries immediately
      void qc.invalidateQueries({ queryKey: ["notifications"] })
      void qc.invalidateQueries({ queryKey: ["bookings"] })

      // Dispatch global event for active pages to refetch
      window.dispatchEvent(new CustomEvent("refresh-session-detail"))

      if (msg.event === "SESSION_EXTENSION_PROPOSED") {
        toast.info("Staff vừa gửi đề xuất gia hạn", {
          description: data?.extraMinutes ? `Gia hạn thêm ${data.extraMinutes} phút đang chờ phản hồi.` : undefined,
        })
        navigate(`/customer/extension-response/${sessionId}`)
        return
      }

      if (msg.event === "SESSION_FNB_ORDER_ADDED") {
        toast.info("Dịch vụ ăn uống được thêm", {
          description: "Nhân viên vừa thêm món mới vào phiên chơi của bạn.",
        })
        return
      }

      if (msg.event === "BOOKING_CHECKED_IN") {
        toast.info("Đã bắt đầu check-in", {
          description: "Nhân viên đang tiến hành kiểm tra xe và hỗ trợ bạn vào sân.",
        })
        return
      }

      if (msg.event === "SESSION_CHECKIN_INSPECTION") {
        toast.success("Phiên chơi đã bắt đầu", {
          description: "Biên bản bàn giao xe đã sẵn sàng để bạn xem lại.",
          action: bookingId
            ? {
                label: "Xem biên bản",
                onClick: () => navigate(`/customer/bookings/${bookingId}?section=handover`),
              }
            : undefined,
        })
        return
      }

      if (msg.event === "FNB_ORDER_SERVED") {
        toast.success("Món của bạn đã sẵn sàng", {
          description: "Nhân viên đã xác nhận phục vụ đơn đồ ăn & thức uống của bạn.",
        })
        return
      }

      if (msg.event === "SESSION_CHECKOUT_INSPECTION") {
        toast.info("Nhân viên vừa lập biên bản trả xe", {
          description: "Vui lòng kiểm tra biên bản và xác nhận tình trạng xe.",
          action: bookingId
            ? {
                label: "Xem chi tiết",
                onClick: () => navigate(`/customer/bookings/${bookingId}?section=handover`),
              }
            : undefined,
        })
        return
      }

      if (msg.event === "CUSTOMER_CHECKIN_CONFIRMED") {
        toast.success("Check-in thành công!", {
          description: "Nhân viên đã xác nhận check-in. Phiên chơi của bạn đã bắt đầu.",
        })
        return
      }

      if (msg.event === "CUSTOMER_CHECKOUT_CONFIRMED") {
        toast.success("Checkout hoàn tất!", {
          description: "Phiên chơi của bạn đã kết thúc. Cảm ơn bạn đã sử dụng dịch vụ.",
        })
        return
      }

      if (msg.event === "CUSTOMER_EXTENSION_APPROVED") {
        toast.success("Gia hạn được chấp nhận!", {
          description: data?.extraMinutes ? `Thêm ${data.extraMinutes} phút vào phiên chơi.` : undefined,
        })
        return
      }

      if (msg.event === "CUSTOMER_EXTENSION_REJECTED") {
        toast.error("Gia hạn bị từ chối", {
          description: "Nhân viên đã từ chối yêu cầu gia hạn.",
        })
        return
      }

      if (msg.event === "CUSTOMER_PAYMENT_CONFIRMED") {
        toast.success("Thanh toán thành công!", {
          description: "Phí phát sinh tại quầy đã được xác nhận thanh toán thành công.",
        })
        return
      }

      if (msg.event === "BOOKING_CANCELLED") {
        const payload = msg.data as { bookingId: string; title: string; message: string; route?: string }
        toast.error(payload.title || "Đơn đặt lịch bị hủy", {
          description: payload.message || "Đơn hàng của bạn đã bị hủy bởi nhà cung cấp.",
          action: {
            label: "Xem",
            onClick: () => navigate(payload.route || `/customer/bookings/${payload.bookingId}`),
          },
          duration: 10000,
        })
        void qc.invalidateQueries({ queryKey: ["notifications"] })
        void qc.invalidateQueries({ queryKey: ["bookings"] })
        return
      }
    },
    [navigate, qc],
  )

  useWebSocket(handleMessage, enabled)
}
