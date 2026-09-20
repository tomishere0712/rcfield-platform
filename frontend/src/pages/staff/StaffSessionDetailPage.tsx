import React, { useState, useEffect, useMemo, useCallback } from "react"
import { useParams, useNavigate, Link } from "react-router"
import { useQuery } from "@tanstack/react-query"
import {
  Clock,
  Car,
  Coffee,
  Plus,
  ChevronLeft,
  AlertTriangle,
  ClipboardCheck,
  FileText,
  HelpCircle,
  Banknote,
  CheckCircle2,
  Trophy,
  X,
  Info,
  Zap,
  Smartphone,
  QrCode,
  Loader2,
  FileCheck,
} from "lucide-react"
import { routePaths } from "@/app/router/route-paths"
import { useStaffOperations } from "./context/StaffOperationContext"
import { staffApi } from "@/features/staff/api/staff.api"
import { menuApi } from "@/features/menu/api/menu.api"
import type { MenuItem } from "@/features/menu/types"
import type {
  BookingFinancialSummary,
  BankTransferCheckout,
} from "@/features/booking/types/booking.types"
import { UNCATEGORIZED_LABEL } from "@/features/menu/types"
import { getApiErrorInfo, cn } from "@/shared/lib/utils"
import { getSessionOperationalTiming } from "@/features/booking/lib/session-operational-timing"
import {
  useWebSocket,
  type WsMessage,
} from "@/features/notifications/hooks/useWebSocket"
import { ZoomableInspectionImage } from "@/shared/components/ZoomableInspectionImage"
import { ExtensionAuditCard } from "@/features/customer-session/components/ExtensionAuditCard"
import { WalkInBankTransferModal } from "./components/WalkInBankTransferModal"
import { toast } from "sonner"
import { StaffCard, StaffBadge, StaffButton } from "./components/StaffUI"
import { formatPaymentGatewayInline } from "@/shared/lib/format"
import type {
  CustomerBookingDetail,
  MockDamageClaim,
  MockSessionDetail,
} from "@/shared/data/customer-operational-mock-data"

const DIRECTION_LABEL: Record<string, string> = {
  FRONT: "Phía trước",
  BACK: "Phía sau",
  LEFT: "Bên trái",
  RIGHT: "Bên phải",
  TOP: "Từ trên xuống",
  BOTTOM: "Gầm xe",
  DETAIL: "Cận cảnh chi tiết",
  OTHER: "Ảnh xe",
}

type SessionView = Omit<MockSessionDetail, "damageClaim"> & {
  damageClaim?: MockDamageClaim & {
    finalCharge?: number
  }
}

type ApiBooking = Partial<CustomerBookingDetail> & {
  id?: string
  cafe?: { id?: string; name?: string; address?: string; phone?: string }
  track?: { name?: string; type?: string }
  mode?: CustomerBookingDetail["playMode"]
  paymentComponents?: CustomerBookingDetail["payment_components"]
  financial_summary?: BookingFinancialSummary
}

type SessionApiData = Partial<SessionView> & {
  sessionId?: string
  id?: string
  bookingId?: string
  actualStartAt?: string
  actualEndAt?: string
  slotEnd?: string
  booking?: ApiBooking
  financialSummary?: BookingFinancialSummary
}

export default function StaffSessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const {
    bookings,
    sessions,
    proposeExtension,
    addFnbOrder,
    updateFnbOrderStatus,
    refreshData,
  } = useStaffOperations()

  // Find corresponding session and booking from context (may be missing for COMPLETED sessions)
  const contextSession = sessions.find((s) => s.sessionId === sessionId)
  const contextBooking = contextSession
    ? bookings.find((b) => b.bookingId === contextSession.bookingId)
    : null

  // The API is authoritative for this screen. Context only renders the first
  // frame while the detail request is in flight; it can otherwise be stale
  // after an inspection, checkout, or counter-payment operation.
  const {
    data: apiData,
    isLoading: apiLoading,
    refetch: refetchSessionDetail,
  } = useQuery<SessionApiData>({
    queryKey: ["staff", "session-detail", sessionId],
    queryFn: () =>
      staffApi.getSessionDetail(sessionId!) as Promise<SessionApiData>,
    enabled: Boolean(sessionId),
    retry: false,
    refetchInterval: 15_000,
  })

  // Merge: always prefer the live API response once available.
  const session = useMemo<SessionView | null>(
    () =>
      apiData
        ? {
            sessionId: apiData.sessionId ?? apiData.id ?? sessionId ?? "",
            bookingId: apiData.bookingId ?? apiData.booking?.bookingId ?? "",
            status: apiData.status ?? "COMPLETED",
            staffName: apiData.staffName ?? "",
            actualStart: apiData.actualStartAt ?? apiData.actualStart,
            actualEnd: apiData.actualEndAt ?? apiData.actualEnd,
            plannedEnd: apiData.plannedEnd ?? apiData.slotEnd ?? "",
            participants: apiData.participants ?? [],
            vehicles: apiData.vehicles ?? [],
            inspections: apiData.inspections ?? [],
            extensionProposal: apiData.extensionProposal,
            approvedExtensionFee: apiData.approvedExtensionFee,
            approvedExtensionMinutes: apiData.approvedExtensionMinutes,
            approvedExtensions: apiData.approvedExtensions ?? [],
            extensionPricingOptions: apiData.extensionPricingOptions ?? [],
            damageClaim: apiData.damageClaim,
            fnbOrders: apiData.fnbOrders ?? [],
          }
        : (contextSession ?? null),
    [apiData, contextSession, sessionId],
  )

  const apiBooking = apiData?.booking
  const booking = useMemo<CustomerBookingDetail | null>(
    () =>
      apiBooking
        ? {
            bookingId: apiBooking.bookingId ?? apiBooking.id ?? "",
            customerCanSelfServe: apiBooking.customerCanSelfServe,
            shortCode: apiBooking.shortCode ?? "",
            cafeId: apiBooking.cafeId ?? apiBooking.cafe?.id ?? "",
            cafeName: apiBooking.cafeName ?? apiBooking.cafe?.name ?? "",
            cafeAddress:
              apiBooking.cafeAddress ?? apiBooking.cafe?.address ?? "",
            cafePhone: apiBooking.cafePhone ?? apiBooking.cafe?.phone ?? "",
            trackName: apiBooking.trackName ?? apiBooking.track?.name ?? "",
            trackType: apiBooking.trackType ?? apiBooking.track?.type ?? "",
            bookingMode: apiBooking.bookingMode ?? "SINGLE",
            playMode: apiBooking.playMode ?? apiBooking.mode ?? "RENTAL",
            status: apiBooking.status ?? "COMPLETED",
            slotStart: apiBooking.slotStart ?? "",
            slotEnd: apiBooking.slotEnd ?? "",
            slotCount: apiBooking.slotCount ?? 1,
            depositAmount: Number(apiBooking.depositAmount ?? 0),
            slotFee: Number(apiBooking.slotFee ?? 0),
            rentalFee: Number(apiBooking.rentalFee ?? 0),
            fnbPreorderFee: Number(apiBooking.fnbPreorderFee ?? 0),
            discountAmount: Number(apiBooking.discountAmount ?? 0),
            totalAmount: Number(apiBooking.totalAmount ?? 0),
            paymentStatus: apiBooking.paymentStatus ?? "UNPAID",
            source: apiBooking.source ?? "",
            payment_components:
              apiBooking.payment_components ??
              apiBooking.paymentComponents ??
              [],
            plannedParticipants: apiBooking.plannedParticipants ?? [],
            plannedVehicles: apiBooking.plannedVehicles ?? [],
            sessions: [],
          }
        : (contextBooking ?? null),
    [apiBooking, contextBooking],
  )

  // Keep the extension card responsive while the authoritative session query
  // is being refreshed. The broader "today bookings" refresh is much slower.
  const [submittedExtension, setSubmittedExtension] = useState<{
    extraMinutes: number
  } | null>(null)
  const [submittingExtension, setSubmittingExtension] = useState(false)
  const [simulatingExtension, setSimulatingExtension] = useState(false)
  const [confirmingInspection, setConfirmingInspection] = useState(false)

  /**
   * Bấm hộ khách khi họ trả lời trực tiếp tại quầy.
   *
   * Gọi đúng endpoint mà ứng dụng của khách gọi, nên đề nghị đi qua đủ mọi kiểm
   * tra nghiệp vụ — không phải sửa trạng thái tắt.
   */
  /*
    Khách xác nhận biên bản NGAY TẠI QUẦY.

    Biên bản bàn giao bắt buộc khách xác nhận ở cả hai đầu — đó là bằng chứng
    duy nhất khi có tranh chấp hư hỏng. Khách đặt qua Messenger là tài khoản
    mềm, không đăng nhập được, nên nếu không có đường này thì phiên của họ đứng
    lại vĩnh viễn ở bước chờ xác nhận: không trả xe được, không quyết toán được.

    Backend chỉ chấp nhận khi chủ đơn thật sự không có mật khẩu, và ghi nhật ký
    rõ nhân viên nào xác nhận hộ khách nào.
  */
  const handleConfirmInspectionForCustomer = async (
    inspectionId: string,
    agreed: boolean,
  ) => {
    if (!session) return
    setConfirmingInspection(true)
    try {
      await staffApi.confirmInspectionForCustomer(session.sessionId, inspectionId, {
        agreed,
      })
      toast.success(
        agreed
          ? "Đã ghi nhận khách xác nhận biên bản"
          : "Đã ghi nhận khách không đồng ý",
      )
      await refreshData()
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message
      toast.error(msg ?? "Không ghi nhận được xác nhận của khách")
    } finally {
      setConfirmingInspection(false)
    }
  }

  const handleSimulateExtension = async (approved: boolean) => {
    if (!session) return
    setSimulatingExtension(true)
    try {
      /*
        Khách tài khoản mềm đi đường THAO TÁC HỘ, khách có tài khoản đi đường mô
        phỏng như cũ.

        Hai đường cho ra cùng kết quả nhưng ghi nhật ký khác nhau: đường thao
        tác hộ ghi rõ nhân viên nào bấm thay khách nào, còn `simulate` ghi như
        thể chính khách đã bấm. Với khách Facebook — người KHÔNG BAO GIỜ tự bấm
        được vì không đăng nhập được — ghi như thế là ghi sai sự thật, và nhật ký
        đó chính là thứ đem ra đối chiếu khi có tranh chấp.
      */
      if (booking?.customerCanSelfServe === false) {
        await staffApi.respondExtensionForCustomer(session.sessionId, {
          approved,
        })
      } else {
        await staffApi.simulateClientExtension(session.sessionId, { approved })
      }
      toast.success(
        approved
          ? "Đã ghi nhận khách đồng ý gia hạn"
          : "Đã ghi nhận khách từ chối",
      )
      await refreshData()
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message
      toast.error(msg ?? "Không ghi nhận được phản hồi của khách")
    } finally {
      setSimulatingExtension(false)
    }
  }

  const handleSessionRealtime = useCallback(
    (message: WsMessage) => {
      const payload = message.data as
        | { sessionId?: string; bookingId?: string }
        | undefined
      if (payload?.sessionId && payload.sessionId !== sessionId) return

      if (
        [
          "CUSTOMER_CHECKOUT_CONFIRMED",
          "SESSION_CHECKOUT_COMPLETED",
          "CUSTOMER_PAYMENT_CONFIRMED",
          "BOOKING_PAYMENT_UPDATED",
          "SESSION_UPDATED",
          "SESSION_FNB_ORDER_ADDED",
          "FNB_ORDER_UPDATED",
          "CUSTOMER_INSPECTION_DISPUTED",
          "CUSTOMER_EXTENSION_APPROVED",
          "CUSTOMER_EXTENSION_REJECTED",
        ].includes(message.event)
      ) {
        if (
          [
            "CUSTOMER_EXTENSION_APPROVED",
            "CUSTOMER_EXTENSION_REJECTED",
          ].includes(message.event)
        ) {
          setSubmittedExtension(null)
        }
        void refetchSessionDetail()
      }
    },
    [refetchSessionDetail, sessionId],
  )

  useWebSocket(handleSessionRealtime, Boolean(sessionId))

  const isWalkInBooking = booking?.source === "STAFF_MANUAL"
  const canDirectExtend = isWalkInBooking

  // Contest linkage — booking source CONTEST (WF-A/WF-B), contestId exposed by staff API
  const contestId =
    (contextBooking as { contestId?: string | null } | null)?.contestId ??
    (apiData as { contestId?: string | null } | undefined)?.contestId ??
    null
  const isContestBooking =
    booking?.source === "CONTEST" ||
    (apiData as { bookingSource?: string } | undefined)?.bookingSource ===
      "CONTEST" ||
    Boolean(contestId)

  // Local state controls
  const [timeLeft, setTimeLeft] = useState("")
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [loadingMenu, setLoadingMenu] = useState(false)

  // Gom món theo danh mục do Provider đặt, giữ nguyên thứ tự API trả về.
  // Nhóm "Chưa phân loại" tự nằm cuối vì backend đã sắp món chưa phân loại xuống cuối.
  const menuItemGroups = useMemo(() => {
    const groups: Array<{ label: string; items: MenuItem[] }> = []
    const indexByLabel = new Map<string, number>()
    for (const item of menuItems) {
      const label = item.categoryName ?? UNCATEGORIZED_LABEL
      const existing = indexByLabel.get(label)
      if (existing === undefined) {
        indexByLabel.set(label, groups.length)
        groups.push({ label, items: [item] })
      } else {
        groups[existing].items.push(item)
      }
    }
    return groups
  }, [menuItems])
  const [settlingPayment, setSettlingPayment] = useState(false)
  const [confirmSettleOpen, setConfirmSettleOpen] = useState(false)
  const [confirmCompleteByocOpen, setConfirmCompleteByocOpen] = useState(false)
  const [completingByoc, setCompletingByoc] = useState(false)
  const [settledBookingId, setSettledBookingId] = useState<string | null>(null)
  const [qrModalOpen, setQrModalOpen] = useState(false)
  const [settleBankTransferData, setSettleBankTransferData] =
    useState<BankTransferCheckout | null>(null)
  const [generatingQr, setGeneratingQr] = useState(false)

  // F&B local form state
  const [selectedItemId, setSelectedItemId] = useState("")
  const [selectedVariantId, setSelectedVariantId] = useState("")
  const [selectedQty, setSelectedQty] = useState(1)
  const [selectedFnbNote, setSelectedFnbNote] = useState("")

  // Extension mode: false = propose to customer, true = direct (staff confirms in-person)
  const [directExtensionMode, setDirectExtensionMode] = useState(false)
  const [pendingDirectExtension, setPendingDirectExtension] = useState<{
    mins: number
    fee: number
    newPlannedEnd: string
  } | null>(null)
  const effectiveDirectExtensionMode = canDirectExtend && directExtensionMode

  // Real-time countdown timer
  useEffect(() => {
    if (
      !session ||
      (session.status !== "ACTIVE" && session.status !== "EXTENDING")
    ) {
      queueMicrotask(() => setTimeLeft(""))
      return
    }

    const updateTimer = () => {
      setCurrentTime(Date.now())
      const planned = new Date(session.plannedEnd).getTime()
      const diff = planned - Date.now()
      if (diff <= 0) {
        setTimeLeft("")
      } else {
        const minutes = Math.floor(diff / 60000)
        const seconds = Math.floor((diff % 60000) / 1000)
        setTimeLeft(
          `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
        )
      }
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [session])

  useEffect(() => {
    queueMicrotask(() => {
      setDirectExtensionMode(isWalkInBooking)
      setPendingDirectExtension(null)
    })
  }, [isWalkInBooking])

  // Fetch branch catalog data (Menu & Fleet)
  useEffect(() => {
    if (booking?.cafeId) {
      // Menu Items
      queueMicrotask(() => setLoadingMenu(true))
      menuApi
        .listMenuItems(booking.cafeId)
        .then((res) => {
          setMenuItems(res.data)
          if (res.data.length > 0) {
            setSelectedItemId(res.data[0].id)
          }
        })
        .catch((err) => console.error("Error loading menu:", err))
        .finally(() => setLoadingMenu(false))
    }
  }, [booking?.cafeId])

  if (!session || !booking) {
    if (apiLoading) {
      return (
        <div className="flex min-h-[50vh] items-center justify-center">
          <p className="text-sm text-[#6b7280] font-semibold animate-pulse">
            Đang tải thông tin ca chơi...
          </p>
        </div>
      )
    }
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-4">
        <AlertTriangle className="size-12 text-[#6b7280] mb-3 animate-bounce" />
        <h3 className="text-lg font-bold text-[#1c1b1b]">
          Không tìm thấy thông tin ca chơi
        </h3>
        <p className="text-xs text-[#6b7280] mt-1 font-semibold">
          Vui lòng kiểm tra lại mã phiên hoặc danh sách hôm nay.
        </p>
        <StaffButton
          onClick={() => navigate("/staff/today-bookings")}
          variant="primary"
          className="mt-4"
        >
          Trở lại danh sách
        </StaffButton>
      </div>
    )
  }

  // Handle adding custom F&B order
  const handleAddFnb = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedItemId) return

    const created = await addFnbOrder(session.sessionId, [
      {
        menu_item_id: selectedItemId,
        variant_id: selectedVariantId || undefined,
        quantity: selectedQty,
        notes: selectedFnbNote.trim() || undefined,
      },
    ])
    if (created) {
      setSelectedQty(1)
      setSelectedFnbNote("")
      void refetchSessionDetail()
    }
  }

  const handleCancelFnbOrder = async (orderId: string) => {
    try {
      await staffApi.updateFnbOrder(orderId, "CANCELLED")
      updateFnbOrderStatus(orderId, "CANCELLED")
      void refreshData()
      await refetchSessionDetail()
      toast.success("Đã huỷ món")
    } catch {
      toast.error("Không thể huỷ món — vui lòng thử lại")
    }
  }

  const handleSettlePayment = async () => {
    if (!booking) return
    try {
      setSettlingPayment(true)
      await staffApi.settlePendingPayments(booking.bookingId)
      toast.success("Xác nhận thanh toán thành công!")
      setSettledBookingId(booking.bookingId)
      await refreshData()
      await refetchSessionDetail()
    } catch (err: unknown) {
      const message =
        getApiErrorInfo(err).message ||
        (err instanceof Error ? err.message : String(err))
      toast.error("Không thể quyết toán thanh toán: " + message)
    } finally {
      setSettlingPayment(false)
    }
  }

  const handleOpenSettleQr = async () => {
    if (!booking) return
    try {
      setGeneratingQr(true)
      const result = await staffApi.initiateWalkInSettleBankTransfer(
        booking.bookingId,
      )
      if (result?.bankTransfer) {
        setSettleBankTransferData(result.bankTransfer)
        setQrModalOpen(true)
      }
    } catch (err: unknown) {
      const message =
        getApiErrorInfo(err).message ||
        (err instanceof Error ? err.message : String(err))
      toast.error("Không thể tạo mã QR chuyển khoản: " + message)
    } finally {
      setGeneratingQr(false)
    }
  }

  const handleCompleteByocSession = async () => {
    if (!session) return
    try {
      setCompletingByoc(true)
      await staffApi.completeByocSession(session.sessionId)
      toast.success(
        "Đã kết thúc và hoàn tất ca chơi xe cá nhân (BYOC) thành công!",
      )
      setConfirmCompleteByocOpen(false)
      await refreshData()
      await refetchSessionDetail()
    } catch (err: unknown) {
      const message =
        getApiErrorInfo(err).message ||
        (err instanceof Error ? err.message : String(err))
      toast.error("Không thể kết thúc phiên: " + message)
    } finally {
      setCompletingByoc(false)
    }
  }

  // Compute Badge variant dynamically
  const sessionBadgeVariant =
    session.status === "ACTIVE"
      ? "success"
      : session.status === "CHECKED_IN"
        ? "info"
        : session.status === "EXTENDING"
          ? "orange"
          : session.status === "CHECKING_OUT"
            ? "warning"
            : "neutral"

  const checkInInspection = session.inspections.find(
    (inspection) => inspection.type === "CHECK_IN",
  )
  const checkOutInspection = session.inspections.find(
    (inspection) => inspection.type === "CHECK_OUT",
  )
  const checkOutDisputed = Boolean(
    checkOutInspection &&
    !checkOutInspection.customerConfirmed &&
    checkOutInspection.customerConfirmedAt,
  )
  const extensionPending =
    session.extensionProposal?.status === "PENDING" ||
    (Boolean(submittedExtension) &&
      (!apiData?.extensionProposal ||
        apiData.extensionProposal.status === "PENDING"))
  const pendingExtensionMinutes =
    session.extensionProposal?.extraMinutes ?? submittedExtension?.extraMinutes
  const approvedExtensions =
    session.approvedExtensions ??
    (session.extensionProposal?.status === "APPROVED"
      ? [session.extensionProposal]
      : [])
  const approvedExtensionFee = Number(
    session.approvedExtensionFee ??
      approvedExtensions.reduce(
        (sum, ext) => sum + Number(ext.additionalFee),
        0,
      ),
  )

  const currentPlannedEndMs = new Date(
    session.plannedEnd ?? booking.slotEnd,
  ).getTime()
  const operationalTiming = getSessionOperationalTiming(
    session.plannedEnd ?? booking.slotEnd,
    session.status,
    currentTime,
  )
  const extensionWindowClosed = operationalTiming.state === "OVERDUE"
  const approvedExtensionMinutes = Number(
    session.approvedExtensionMinutes ??
      (session.extensionProposal?.status === "APPROVED"
        ? session.extensionProposal.extraMinutes
        : 0),
  )
  const currentDurationMinutes =
    (currentPlannedEndMs - new Date(booking.slotStart).getTime()) / 60000
  const baseDurationMinutes = Math.max(
    currentDurationMinutes - approvedExtensionMinutes,
    1,
  )
  const slotRatePerMinute = booking.slotFee / baseDurationMinutes
  const calcExtensionFee = (mins: number) =>
    Math.round((slotRatePerMinute * mins) / 1000) * 1000
  const maxExtensionFee = Infinity
  const remainingCap = Math.max(0, maxExtensionFee - approvedExtensionFee)
  const quotedExtensionOptions = session.extensionPricingOptions ?? []
  const extensionOptions = ([15, 30, 60] as const).map((mins) => {
    const quoted = quotedExtensionOptions.find(
      (option) => option.extraMinutes === mins,
    )
    const fee = Number(quoted?.additionalFee ?? calcExtensionFee(mins))
    const newPlannedEnd =
      quoted?.newPlannedEnd ??
      new Date(currentPlannedEndMs + mins * 60000).toISOString()
    const blockedReason =
      quoted?.available === false
        ? (quoted.blockedReason ?? "Không khả dụng")
        : undefined
    return {
      mins,
      fee,
      newPlannedEnd,
      blockedReason,
      blocked: Boolean(blockedReason) || fee > remainingCap,
    }
  })
  const handleExtension = async (
    mins: number,
    fee: number,
    newPlannedEnd: string,
  ) => {
    if (effectiveDirectExtensionMode) {
      setPendingDirectExtension({ mins, fee, newPlannedEnd })
    } else {
      setSubmittingExtension(true)
      const created = await proposeExtension(session.sessionId, mins, fee)
      if (created) {
        setSubmittedExtension({ extraMinutes: mins })
        void refetchSessionDetail()
      }
      setSubmittingExtension(false)
    }
  }
  const formatPlannedEnd = (value: string | number) =>
    new Date(value).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    })
  const onsiteFnbOrders = (session.fnbOrders || []).filter(
    (order) => order.orderType !== "PRE_ORDER" && order.status !== "CANCELLED",
  )
  const preorderFnbOrders = (session.fnbOrders || []).filter(
    (order) => order.orderType === "PRE_ORDER" && order.status !== "CANCELLED",
  )

  // The API summary, not the operational F&B/order lists, is the financial
  // source of truth. This keeps staff and customer totals identical after a
  // checkout or payment changes state.
  const financialSummary =
    apiData?.financialSummary ?? apiBooking?.financial_summary
  const fallbackPrepaidLines = [
    {
      componentId: "slot-fee",
      label: "Phí lịch chơi",
      amount: Number(booking.slotFee ?? 0),
    },
    {
      componentId: "rental-fee",
      label: "Phí thuê xe",
      amount: Number(booking.rentalFee ?? 0),
    },
    {
      componentId: "fnb-preorder",
      label: "Đồ ăn & thức uống đặt trước",
      amount: Number(booking.fnbPreorderFee ?? 0),
    },
  ].filter((line) => line.amount > 0)
  const fallbackAdditionalLines = (booking.payment_components ?? [])
    .filter(
      (component) =>
        !["SLOT_FEE", "RENTAL_FEE"].includes(component.type) &&
        !(
          (component.type === "FNB_PREORDER" ||
            component.type === "FB_PREORDER") &&
          component.status === "HELD"
        ),
    )
    .map((component) => ({
      componentId: component.id,
      type: component.type,
      label:
        component.type === "FNB_ON_SITE" ||
        component.type === "FNB_PREORDER" ||
        component.type === "FB_PREORDER"
          ? "Đồ ăn & thức uống gọi tại quầy"
          : component.type === "EXTENSION_FEE"
            ? "Phí gia hạn ca chơi"
            : component.type === "DAMAGE_CHARGE"
              ? "Phí bồi thường hư hỏng"
              : "Khoản phát sinh khác",
      amount: Number(component.amount),
      status: component.status,
      payment: undefined,
    }))
  const rawPrepaidLines = financialSummary?.prepaidLines ?? fallbackPrepaidLines
  const seenPrepaidLines = new Set<string>()
  const prepaidLines = rawPrepaidLines.filter((line) => {
    const key = `${line.componentId || ''}_${line.label}_${line.amount}`
    if (seenPrepaidLines.has(key)) return false
    seenPrepaidLines.add(key)
    return true
  })
  const additionalLines =
    financialSummary?.additionalLines ?? fallbackAdditionalLines

  const onsiteFnbComponents = additionalLines.filter(
    (l) => l.type === "FNB_ON_SITE" || l.label.includes("Đồ ăn & thức uống"),
  )
  const pendingOnsiteFnbAmount = onsiteFnbComponents
    .filter((l) => l.status === "PENDING")
    .reduce((sum, l) => sum + Number(l.amount), 0)
  const paidOnsiteFnbAmount = onsiteFnbComponents
    .filter((l) => l.status === "DISBURSED" || l.status === "CAPTURED")
    .reduce((sum, l) => sum + Number(l.amount), 0)

  const onsiteOrderPaidMap = (() => {
    const map = new Map<string, boolean>()
    if (onsiteFnbOrders.length === 0) return map

    if (pendingOnsiteFnbAmount === 0) {
      onsiteFnbOrders.forEach((o) => map.set(o.orderId, true))
      return map
    }
    if (paidOnsiteFnbAmount === 0) {
      onsiteFnbOrders.forEach((o) => map.set(o.orderId, false))
      return map
    }

    const exactPendingMatch = onsiteFnbOrders.find(
      (o) => Number(o.total) === pendingOnsiteFnbAmount,
    )
    if (exactPendingMatch) {
      onsiteFnbOrders.forEach((o) => {
        map.set(o.orderId, o.orderId !== exactPendingMatch.orderId)
      })
      return map
    }

    let remainingPending = pendingOnsiteFnbAmount
    const reversed = [...onsiteFnbOrders].reverse()
    for (const order of reversed) {
      const orderTotal = Number(order.total)
      if (remainingPending >= orderTotal && orderTotal > 0) {
        map.set(order.orderId, false)
        remainingPending -= orderTotal
      } else {
        map.set(order.orderId, true)
      }
    }
    return map
  })()

  const groupedAdditionalLines = (() => {
    const fnbLines = additionalLines.filter(
      (l) => l.type === "FNB_ON_SITE" || l.label.includes("Đồ ăn & thức uống"),
    )
    const otherLines = additionalLines.filter(
      (l) => l.type !== "FNB_ON_SITE" && !l.label.includes("Đồ ăn & thức uống"),
    )

    const paidFnb = fnbLines.filter(
      (l) => l.status === "DISBURSED" || l.status === "CAPTURED",
    )
    const pendingFnb = fnbLines.filter(
      (l) => l.status !== "DISBURSED" && l.status !== "CAPTURED",
    )

    const paidFnbTotal = paidFnb.reduce((sum, l) => sum + Number(l.amount), 0)
    const pendingFnbTotal = pendingFnb.reduce((sum, l) => sum + Number(l.amount), 0)

    const paidGateway = paidFnb.find((l) => l.payment?.gateway)?.payment?.gateway
    const gatewayFormatted = paidGateway ? formatPaymentGatewayInline(paidGateway) : undefined

    const result: Array<{
      id: string
      label: string
      amount: number
      paid: boolean
      gateway?: string
    }> = []

    if (paidFnbTotal > 0 && pendingFnbTotal > 0) {
      result.push({
        id: "fnb-paid-aggregate",
        label: "Đồ ăn & thức uống gọi tại quầy",
        amount: paidFnbTotal,
        paid: true,
        gateway: gatewayFormatted,
      })
      result.push({
        id: "fnb-pending-aggregate",
        label: "Đồ ăn & thức uống gọi tại quầy",
        amount: pendingFnbTotal,
        paid: false,
      })
    } else if (paidFnbTotal > 0) {
      result.push({
        id: "fnb-paid-aggregate",
        label: "Đồ ăn & thức uống gọi tại quầy",
        amount: paidFnbTotal,
        paid: true,
        gateway: gatewayFormatted,
      })
    } else if (pendingFnbTotal > 0) {
      result.push({
        id: "fnb-pending-aggregate",
        label: "Đồ ăn & thức uống gọi tại quầy",
        amount: pendingFnbTotal,
        paid: false,
      })
    }

    for (const line of otherLines) {
      const isPaid = line.status === "DISBURSED" || line.status === "CAPTURED"
      result.push({
        id: line.componentId,
        label: line.label,
        amount: Number(line.amount),
        paid: isPaid,
        gateway: line.payment?.gateway ? formatPaymentGatewayInline(line.payment.gateway) : undefined,
      })
    }

    return result
  })()

  const prepaidDiscountAmount =
    financialSummary?.prepaidDiscountAmount ??
    Number(booking.discountAmount ?? 0)
  const prepaidPaidAmount =
    financialSummary?.prepaidPaidAmount ??
    Math.max(
      0,
      fallbackPrepaidLines.reduce((sum, line) => sum + line.amount, 0) -
        prepaidDiscountAmount,
    )
  const additionalTotal =
    financialSummary?.additionalTotal ??
    additionalLines.reduce((sum, line) => sum + Number(line.amount), 0)
  const additionalOutstandingAmount =
    financialSummary?.additionalOutstandingAmount ??
    additionalLines
      .filter((line) => line.status === "PENDING")
      .reduce((sum, line) => sum + Number(line.amount), 0)
  const totalPaidAmount = financialSummary?.totalPaidAmount ?? prepaidPaidAmount
  const counterSettled = settledBookingId === booking.bookingId
  const hasPendingCounterPayment =
    !counterSettled && additionalOutstandingAmount > 0
  const isFullySettled =
    session.status === "COMPLETED" && !hasPendingCounterPayment
  const isCheckoutPending =
    booking.playMode !== "BYOC" &&
    ["ACTIVE", "EXTENDING"].includes(session.status)

  return (
    <div className="space-y-6">
      {/* 1. Header Navigation Bar */}
      <div className="flex items-center gap-3">
        <StaffButton
          onClick={() => navigate("/staff/today-bookings")}
          variant="outline"
          size="sm"
          className="p-2 min-w-0 rounded-lg"
        >
          <ChevronLeft className="size-5 text-[#6b7280]" />
        </StaffButton>
        <h2 className="text-xl font-extrabold text-[#1c1b1b] tracking-tight">
          Chi Tiết Ca Chạy Xe
        </h2>
      </div>

      {/* 2. SESSION INFO CARD */}
      <StaffCard className="relative overflow-hidden">
        <div className="absolute right-0 top-0 h-full w-1/5 bg-gradient-to-l from-[#fff3eb]/15 to-transparent pointer-events-none" />

        {/* Top row: status badge + track name + timer */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <StaffBadge variant={sessionBadgeVariant}>
              {session.status === "ACTIVE" && "ĐANG CHƠI"}
              {session.status === "CHECKED_IN" &&
                (booking.playMode === "BYOC"
                  ? "ĐANG CHECK-IN VÀO SÂN"
                  : "ĐANG BÀN GIAO XE")}
              {session.status === "EXTENDING" && "YÊU CẦU GIA HẠN"}
              {session.status === "CHECKING_OUT" &&
                (booking.playMode === "BYOC"
                  ? "ĐANG KẾT THÚC PHIÊN"
                  : "ĐANG TRẢ XE")}
              {session.status === "COMPLETED" && "ĐÃ ĐÓNG"}
            </StaffBadge>
            {isWalkInBooking ? (
              <span className="flex items-center gap-1 rounded-full border border-orange-300 bg-[#fff7ed] px-2.5 py-0.5 text-[10px] font-black text-[#ea580c] shadow-2xs">
                <Zap className="size-3 fill-current" />
                Khách Vãng Lai (Tại Quầy)
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[10px] font-bold text-sky-700">
                <Smartphone className="size-3" />
                Khách Đặt Qua Web/App
              </span>
            )}
            {isContestBooking &&
              (contestId ? (
                <Link
                  to={routePaths.staffContestCheckIn.replace(
                    ":contestId",
                    contestId,
                  )}
                  className="flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[10px] font-bold text-violet-700 transition-colors hover:bg-violet-100"
                >
                  <Trophy className="size-3" />
                  Giải đấu
                </Link>
              ) : (
                <span className="flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[10px] font-bold text-violet-700">
                  <Trophy className="size-3" />
                  Giải đấu
                </span>
              ))}
            <div>
              <h3 className="text-xl font-black text-[#1c1b1b] tracking-tight leading-tight">
                {booking.trackName}
              </h3>
            </div>
          </div>

          {(session.status === "ACTIVE" || session.status === "EXTENDING") && (
            <div className="bg-[#fff3eb] border border-[#ffdbca] rounded-xl px-5 py-2 text-center min-w-32 shrink-0 shadow-sm">
              <span className="text-[10px] font-extrabold text-[#ea580c] uppercase tracking-wider block">
                {operationalTiming.state === "ON_TIME"
                  ? "Còn lại"
                  : operationalTiming.state === "DUE_FOR_CHECKOUT"
                    ? booking.playMode === "BYOC"
                      ? "Hết giờ chơi"
                      : "Đến giờ trả xe"
                    : operationalTiming.state === "OVERDUE"
                      ? "Quá giờ"
                      : "Phiên chạy"}
              </span>
              <span className="text-2xl font-mono font-black text-[#ea580c] tracking-tight">
                {operationalTiming.state === "ON_TIME"
                  ? timeLeft
                  : operationalTiming.state === "OVERDUE"
                    ? `+${operationalTiming.minutesPastPlannedEnd}p`
                    : booking.playMode === "BYOC"
                      ? "Hết ca"
                      : "Xử lý trả xe"}
              </span>
            </div>
          )}
        </div>

        {/* Bottom metadata strip */}
        <div className="mt-4 pt-3 border-t border-[#e5e2e1] grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-xs font-semibold">
          <div className="col-span-2 sm:col-span-2">
            <span className="text-[#6b7280] block mb-1">
              Người chơi (
              {booking.participantDetails?.length ??
                booking.plannedParticipants.length}
              )
            </span>
            <div className="space-y-0.5">
              {(booking.participantDetails
                ? booking.participantDetails
                : booking.plannedParticipants.map((name) => ({
                    name,
                    phone: undefined,
                    isBooker: false,
                  }))
              ).map((p, i) => (
                <div key={i} className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[#1c1b1b] font-bold">{p.name}</span>
                  {p.isBooker && (
                    <span className="text-[9px] font-extrabold uppercase tracking-wide bg-[#fff3eb] text-[#ea580c] border border-[#ffdbca] rounded px-1 py-0.5 leading-none">
                      Người đặt
                    </span>
                  )}
                  {p.phone && (
                    <span className="text-[#9b8fa8] font-normal">
                      {p.phone}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div>
            <span className="text-[#6b7280] block mb-0.5">Giờ chơi</span>
            <span className="text-[#1c1b1b] font-bold">
              {new Date(booking.slotStart).toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
              {" – "}
              {new Date(booking.slotEnd).toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <div>
            <span className="text-[#6b7280] block mb-0.5">Nhân viên trực</span>
            <span className="text-[#1c1b1b] font-bold">
              {session.staffName}
            </span>
          </div>
        </div>
      </StaffCard>

      {/* 3. PRE-SESSION INFO STRIP — show before session goes ACTIVE */}
      {session.status === "CHECKED_IN" && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Play mode */}
          <div className="rounded-xl border border-[#e5e2e1] bg-white px-4 py-3">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-[#6b7280] mb-1">
              Chế độ chơi
            </p>
            <p className="text-sm font-extrabold text-[#1c1b1b]">
              {booking.playMode === "RENTAL"
                ? "Thuê xe tại quán"
                : booking.playMode === "BYOC"
                  ? "Mang xe cá nhân"
                  : booking.playMode}
            </p>
            {booking.playMode === "RENTAL" && (
              <p className="text-[11px] text-[#ea580c] font-semibold mt-1">
                Cần bàn giao xe cho khách
              </p>
            )}
            {booking.playMode === "BYOC" && (
              <p className="text-[11px] text-[#6b7280] font-semibold mt-1">
                Khách tự mang xe
              </p>
            )}
          </div>

          {/* Track type */}
          <div className="rounded-xl border border-[#e5e2e1] bg-white px-4 py-3 min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-[#6b7280] mb-1">
              Loại đường đua
            </p>
            <p className="text-sm font-extrabold text-[#1c1b1b] truncate">
              {booking.trackName}
            </p>
          </div>

          {/* Vehicles with image */}
          <div className="rounded-xl border border-[#e5e2e1] bg-white px-4 py-3 min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-[#6b7280] mb-2">
              {booking.playMode === "BYOC"
                ? "Xe tự mang (BYOC)"
                : `Xe bàn giao (${session.vehicles.length || booking.plannedVehicles.length})`}
            </p>
            {session.vehicles.length > 0 ? (
              <div className="space-y-2">
                {session.vehicles.map((v) => (
                  <div key={v.vehicleId} className="flex items-center gap-2">
                    {v.imageUrl ? (
                      <ZoomableInspectionImage
                        src={v.imageUrl}
                        alt={v.name}
                        className="size-10 rounded-lg border border-[#e5e2e1] object-cover shrink-0"
                        buttonClassName="size-10 shrink-0 rounded-lg"
                      />
                    ) : (
                      <div className="flex size-10 items-center justify-center rounded-lg bg-[#f5f3f2] border border-[#e5e2e1] shrink-0">
                        <Car className="size-4 text-[#9b8fa8]" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#1c1b1b] truncate">
                        {v.name}
                      </p>
                      <p className="text-[10px] text-[#9b8fa8] font-semibold truncate">
                        #{v.vehicleId.slice(0, 8).toUpperCase()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : booking.plannedVehicles.length > 0 ? (
              <div className="space-y-0.5">
                {booking.plannedVehicles.map((v, i) => (
                  <p
                    key={i}
                    className="text-xs font-bold text-[#1c1b1b] truncate"
                  >
                    {v}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#9b8fa8] font-semibold">
                Chưa chỉ định xe
              </p>
            )}
          </div>

          {/* Pre-ordered F&B */}
          <div className="rounded-xl border border-[#e5e2e1] bg-white px-4 py-3">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-[#6b7280] mb-1">
              Đồ ăn & thức uống đặt trước
            </p>
            {booking.fnbPreorderFee > 0 ? (
              <>
                <p className="text-sm font-extrabold text-amber-700">
                  {booking.fnbPreorderFee.toLocaleString("vi-VN")} đ
                </p>
                <p className="text-[11px] text-amber-600 font-semibold mt-1">
                  Chuẩn bị trước khi bắt đầu ca
                </p>
                <div className="mt-2 space-y-1 border-t border-amber-100 pt-2 text-[11px] text-[#4c4a49]">
                  {preorderFnbOrders
                    .flatMap((order) => order.items)
                    .map((item, index) => (
                      <div key={`${item.name}-${index}`}>
                        <span className="font-bold">
                          {item.name}
                          {item.variantName ? ` · ${item.variantName}` : ""}
                        </span>
                        <span className="text-[#6b7280]"> ×{item.qty}</span>
                        {item.notes && (
                          <p className="mt-0.5 text-amber-700">
                            Ghi chú: {item.notes}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              </>
            ) : (
              <p className="text-xs text-[#9b8fa8] font-semibold">
                Khách không đặt món trước
              </p>
            )}
          </div>
        </div>
      )}

      {/* 4. CORE ACTION MODULES (F&B / Extensions / Fleet controls) */}
      {(session.status === "ACTIVE" || session.status === "EXTENDING") && (
        <>
          {/* Active Vehicles — position 2, right below session info */}
          <StaffCard className="space-y-4">
            {(() => {
              const participantNames =
                booking.participantDetails?.map((p) => p.name) ??
                booking.plannedParticipants
              const isByocMode = booking.playMode === "BYOC"
              const displayVehicles =
                isByocMode && session.vehicles.length < participantNames.length
                  ? [
                      ...session.vehicles,
                      ...participantNames
                        .slice(session.vehicles.length)
                        .map((name, i) => ({
                          vehicleId: `byoc-placeholder-${i}`,
                          name: `Xe tự mang của ${name}`,
                          type: "BYOC" as const,
                          imageUrl: undefined,
                        })),
                    ]
                  : session.vehicles

              const checkInPhotos =
                session.inspections.find((i) => i.type === "CHECK_IN")
                  ?.photos ?? []
              const byocDirections = ["FRONT", "BACK", "LEFT", "RIGHT"] as const

              return (
                <>
                  <h4 className="text-sm font-bold text-[#1c1b1b] uppercase tracking-wider flex items-center gap-2">
                    <Car className="size-4.5 text-[#ea580c]" />
                    Xe đang chạy trên làn đua ({displayVehicles.length})
                  </h4>

                  <div className="space-y-2">
                    {displayVehicles.map((v, idx) => {
                      const photoUrl =
                        v.type === "RENT"
                          ? v.imageUrl
                          : checkInPhotos.find(
                              (p) => p.direction === byocDirections[idx],
                            )?.url
                      return (
                        <div
                          key={v.vehicleId}
                          className="flex items-center justify-between rounded-lg bg-[#fcf8f8] p-3 border border-[#e5e2e1]"
                        >
                          <div className="flex items-center gap-3">
                            {photoUrl ? (
                              <ZoomableInspectionImage
                                src={photoUrl}
                                alt={v.name}
                                className="size-9 rounded-lg border border-[#e5e2e1] object-cover"
                                buttonClassName="size-9 shrink-0 rounded-lg"
                              />
                            ) : (
                              <div className="flex size-9 items-center justify-center rounded-lg bg-white border border-[#e5e2e1] shrink-0">
                                <Car className="size-4.5 text-[#6b7280]" />
                              </div>
                            )}
                            <div>
                              <p className="text-xs font-bold text-[#1c1b1b]">
                                {v.name}
                              </p>
                              <p className="text-[10px] text-[#6b7280] font-semibold">
                                Mã xe: {v.vehicleId}
                              </p>
                            </div>
                          </div>
                          {/* Ẩn nút đổi xe trên UI, giữ nguyên code logic:
                          {v.type === "RENT" && (
                            <StaffButton
                              onClick={() => {
                                setSwappingVehicleId(v.vehicleId)
                                setSwapModalOpen(true)
                              }}
                              variant="secondary"
                              size="sm"
                              className="py-1 px-2.5 text-[10px] font-bold rounded-lg"
                            >
                              <ArrowLeftRight className="size-3" />
                              Đổi Xe Khác
                            </StaffButton>
                          )}
                          */}
                        </div>
                      )
                    })}
                  </div>
                </>
              )
            })()}
          </StaffCard>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Module 1: Extension Controls / overdue return handling */}
            <StaffCard
              className={
                extensionWindowClosed ? "space-y-3 md:col-span-2" : "space-y-3"
              }
            >
              {extensionWindowClosed ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-bold text-[#991b1b] uppercase tracking-wider flex items-center gap-2">
                      <AlertTriangle className="size-4 text-red-600" />
                      {booking.playMode === "BYOC" ? "Phiên BYOC quá giờ" : "Phiên quá giờ"}
                    </h4>
                    <span className="text-[11px] font-semibold text-red-700">
                      +{operationalTiming.minutesPastPlannedEnd} phút
                    </span>
                  </div>
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-900">
                    <p className="font-bold">
                      Gia hạn đã được khóa để tránh tính phí hồi tố.
                    </p>
                    <p className="mt-1 text-red-800">
                      {booking.playMode === "BYOC"
                        ? "Khách tham gia ca chơi xe cá nhân (BYOC). Vui lòng chốt thanh toán các chi phí phát sinh (nếu có) và kết thúc phiên chơi cho khách."
                        : "Nếu khách đã trả xe đúng giờ nhưng nhân viên xử lý muộn, khách không bị thu thêm. Hãy kiểm tra và xử lý trả xe; chỉ khoản phụ phí đã được thỏa thuận riêng mới được thu sau đó."}
                    </p>
                  </div>
                  {booking.playMode === "BYOC" ? (
                    additionalOutstandingAmount === 0 ? (
                      <StaffButton
                        onClick={() => setConfirmCompleteByocOpen(true)}
                        variant="primary"
                        className="w-fit px-5 bg-emerald-600 hover:bg-emerald-700 text-xs uppercase tracking-wider font-bold"
                      >
                        <CheckCircle2 className="size-4" />
                        Kết thúc phiên chơi (BYOC)
                      </StaffButton>
                    ) : (
                      <StaffButton
                        onClick={() => {
                          const settleElem = document.getElementById("settlement-card")
                          settleElem?.scrollIntoView({ behavior: "smooth" })
                        }}
                        variant="secondary"
                        className="w-fit px-5 text-xs uppercase tracking-wider font-bold border-amber-300 text-amber-900 bg-amber-100 hover:bg-amber-200"
                      >
                        <Banknote className="size-4" />
                        Cần thu {additionalOutstandingAmount.toLocaleString("vi-VN")} đ phát sinh trước
                      </StaffButton>
                    )
                  ) : (
                    <StaffButton
                      onClick={() =>
                        navigate(
                          `/staff/inspections/${session.sessionId}?type=CHECK_OUT`,
                        )
                      }
                      variant="primary"
                      className="w-fit px-5 bg-amber-600 hover:bg-amber-700 text-xs uppercase tracking-wider"
                    >
                      <ClipboardCheck className="size-4" />
                      Xử lý trả xe
                    </StaffButton>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-[#1c1b1b] uppercase tracking-wider flex items-center gap-2">
                      {isWalkInBooking ? (
                        <>
                          <Zap className="size-4 text-[#ea580c] fill-current" />
                          Gia hạn trực tiếp tại quầy
                        </>
                      ) : (
                        <>
                          <Clock className="size-4 text-[#ea580c]" />
                          Gia hạn ca chạy (App)
                        </>
                      )}
                    </h4>
                    <span className="text-[11px] font-semibold text-[#6b7280]">
                      Kết thúc lúc{" "}
                      <span className="text-[#1c1b1b] font-extrabold">
                        {formatPlannedEnd(currentPlannedEndMs)}
                      </span>
                    </span>
                  </div>

                  {!isWalkInBooking && extensionPending ? (
                    <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs font-semibold text-orange-800 flex items-center gap-2">
                      <Clock className="size-3.5 shrink-0" />
                      Đang chờ khách phản hồi đề xuất gia hạn{" "}
                      {pendingExtensionMinutes} phút trên App…
                    </div>
                  ) : isWalkInBooking && pendingDirectExtension ? (
                    <div className="rounded-xl border border-[#ea580c] bg-[#fff7ed] p-3.5 space-y-3 shadow-2xs">
                      <div className="flex items-center justify-between border-b border-[#ffdbca] pb-2">
                        <span className="text-xs font-bold text-slate-700">Gia hạn thêm:</span>
                        <span className="text-sm font-black text-[#ea580c]">
                          +
                          {pendingDirectExtension.mins < 60
                            ? `${pendingDirectExtension.mins} phút`
                            : "1 giờ"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                        <span>Thời gian kết thúc mới:</span>
                        <span className="font-bold text-slate-900">{formatPlannedEnd(pendingDirectExtension.newPlannedEnd)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                        <span>Phí gia hạn:</span>
                        <span className="font-black text-slate-900 text-sm">{pendingDirectExtension.fee.toLocaleString("vi-VN")} đ</span>
                      </div>
                      <div className="rounded-lg bg-orange-100/70 p-2 text-[11px] font-semibold text-orange-950">
                        ⚡ Khách đã yêu cầu tại quầy — Xác nhận gia hạn ngay và thu tiền hoặc cộng vào hóa đơn quyết toán khi trả xe.
                      </div>
                      <div className="flex gap-2 pt-1">
                        <StaffButton
                          variant="primary"
                          size="sm"
                          className="flex-1 text-xs font-bold"
                          disabled={submittingExtension}
                          onClick={async () => {
                            setSubmittingExtension(true)
                            const created = await proposeExtension(
                              session.sessionId,
                              pendingDirectExtension.mins,
                              pendingDirectExtension.fee,
                              true,
                            )
                            if (created) {
                              setPendingDirectExtension(null)
                              await refetchSessionDetail()
                            }
                            setSubmittingExtension(false)
                          }}
                        >
                          <Zap className="size-3.5 fill-current" />
                          Xác nhận gia hạn ngay
                        </StaffButton>
                        <StaffButton
                          variant="outline"
                          size="sm"
                          className="w-20 text-xs font-semibold"
                          onClick={() => setPendingDirectExtension(null)}
                        >
                          Huỷ
                        </StaffButton>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {extensionOptions.map(
                        ({
                          mins,
                          fee,
                          newPlannedEnd,
                          blockedReason,
                          blocked,
                        }) => (
                          <button
                            key={mins}
                            type="button"
                            disabled={blocked || submittingExtension}
                            onClick={() =>
                              !blocked &&
                              !submittingExtension &&
                              void handleExtension(mins, fee, newPlannedEnd)
                            }
                            title={
                              blocked
                                ? (blockedReason ??
                                  `Vượt giới hạn gia hạn (tối đa ${maxExtensionFee === Infinity ? "—" : maxExtensionFee.toLocaleString("vi-VN") + " đ"})`)
                                : undefined
                            }
                            className={`rounded-xl border transition-all p-2.5 text-center group ${
                              blocked || submittingExtension
                                ? "border-[#e5e2e1] bg-[#f5f3f2] opacity-50 cursor-not-allowed"
                                : "border-[#e5e2e1] bg-white hover:border-[#ea580c] hover:bg-[#fff3eb] cursor-pointer"
                            }`}
                          >
                            <span
                              className={`block text-sm font-extrabold ${blocked || submittingExtension ? "text-[#9b8fa8]" : "text-[#ea580c]"}`}
                            >
                              +{mins < 60 ? `${mins} phút` : "1 giờ"}
                            </span>
                            <span className="block text-[10px] text-[#6b7280] font-semibold mt-0.5">
                              → {formatPlannedEnd(newPlannedEnd)}
                            </span>
                            <span
                              className={`block text-[10px] font-bold mt-1 ${blocked || submittingExtension ? "text-[#9b8fa8]" : "text-[#1c1b1b]"}`}
                            >
                              {blockedReason ??
                                `${fee.toLocaleString("vi-VN")} đ`}
                            </span>
                          </button>
                        ),
                      )}
                    </div>
                  )}

                  <p className="text-[10px] text-[#9b8fa8] leading-relaxed">
                    {isWalkInBooking
                      ? "⚡ Khách vãng lai: Nhân viên xác nhận trực tiếp tại quầy (không gửi thông báo qua App)."
                      : "📱 Đơn đặt trước: Hệ thống gửi thông báo và chờ khách xác nhận qua ứng dụng di động."}
                  </p>
                </>
              )}
            </StaffCard>

            {/* Do not add a new service while an overdue session is being reconciled. */}
            {!extensionWindowClosed && (
              <StaffCard className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-[#1c1b1b] uppercase tracking-wider flex items-center gap-2">
                    <Coffee className="size-4.5 text-[#ea580c]" />
                    {isWalkInBooking ? "Thêm món tại quầy" : "Gọi đồ ăn & thức uống"}
                  </h4>
                  {isWalkInBooking && (
                    <span className="text-[10px] text-orange-700 font-bold bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
                      Ghi nợ vào bill ca chơi
                    </span>
                  )}
                </div>

                {loadingMenu ? (
                  <div className="h-44 animate-pulse bg-[#fcf8f8] border border-[#e5e2e1] rounded-xl" />
                ) : (
                  <form onSubmit={handleAddFnb} className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-[#4c4a49] mb-1.5">
                        Chọn món ăn/nước uống
                      </label>
                      <select
                        value={selectedItemId}
                        onChange={(e) => {
                          setSelectedItemId(e.target.value)
                          setSelectedVariantId("")
                        }}
                        className="w-full rounded-lg border border-[#e5e2e1] bg-white px-3.5 py-2.5 text-sm font-semibold text-[#1c1b1b] focus:border-[#ea580c] focus:outline-none focus:ring-1 focus:ring-[#ea580c]"
                      >
                        {menuItemGroups.map((group) => (
                          <optgroup key={group.label} label={group.label}>
                            {group.items.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name} -{" "}
                                {item.variants?.length
                                  ? `từ ${Math.min(...item.variants.map((variant) => Number(variant.price))).toLocaleString("vi-VN")}`
                                  : Number(item.price).toLocaleString(
                                      "vi-VN",
                                    )}{" "}
                                đ
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    {(() => {
                      const selectedItem = menuItems.find(
                        (item) => item.id === selectedItemId,
                      )
                      const variants =
                        selectedItem?.variants?.filter(
                          (variant) => variant.isAvailable,
                        ) ?? []
                      if (!variants.length) return null
                      return (
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-[#4c4a49] mb-1.5">
                            Size / lựa chọn
                          </label>
                          <select
                            value={selectedVariantId}
                            onChange={(e) =>
                              setSelectedVariantId(e.target.value)
                            }
                            className="w-full rounded-lg border border-[#e5e2e1] bg-white px-3.5 py-2.5 text-sm font-semibold text-[#1c1b1b] focus:border-[#ea580c] focus:outline-none focus:ring-1 focus:ring-[#ea580c]"
                            required
                          >
                            <option value="">Chọn lựa chọn</option>
                            {variants.map((variant) => (
                              <option key={variant.id} value={variant.id}>
                                {variant.name} -{" "}
                                {Number(variant.price).toLocaleString("vi-VN")}{" "}
                                đ
                              </option>
                            ))}
                          </select>
                        </div>
                      )
                    })()}

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-[#4c4a49] mb-1.5">
                        Số lượng
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={selectedQty}
                        onChange={(e) => setSelectedQty(Number(e.target.value))}
                        className="w-full rounded-lg border border-[#e5e2e1] bg-white px-3.5 py-2.5 text-sm font-semibold text-[#1c1b1b] focus:border-[#ea580c] focus:outline-none focus:ring-1 focus:ring-[#ea580c]"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-[#4c4a49] mb-1.5">
                        Ghi chú bếp (tuỳ chọn)
                      </label>
                      <input
                        value={selectedFnbNote}
                        maxLength={500}
                        onChange={(e) => setSelectedFnbNote(e.target.value)}
                        placeholder="Ví dụ: ít đá, giao bàn số 2"
                        className="w-full rounded-lg border border-[#e5e2e1] bg-white px-3.5 py-2.5 text-sm font-semibold text-[#1c1b1b] focus:border-[#ea580c] focus:outline-none focus:ring-1 focus:ring-[#ea580c]"
                      />
                    </div>

                    <StaffButton
                      type="submit"
                      variant="primary"
                      className="w-full text-xs uppercase tracking-wider"
                    >
                      <Plus className="size-4" />
                      Thêm món & Báo chế biến
                    </StaffButton>
                  </form>
                )}
              </StaffCard>
            )}
          </div>
        </>
      )}

      {/* 4. RENDER INSPECTION BANNER */}
      {session.status === "CHECKED_IN" && !checkInInspection && (
        <StaffCard
          variant="warning"
          className="flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-amber-900">
              {booking.playMode === "BYOC"
                ? "Yêu cầu chụp ảnh xe cá nhân khi vào sân"
                : "Yêu cầu chụp ảnh kiểm xe bàn giao"}
            </h4>
            <p className="text-xs text-amber-800 leading-relaxed">
              {booking.playMode === "BYOC"
                ? "Nhân viên cần chụp ảnh xe cá nhân của từng người chơi để xác thực xe vào sân và kiểm tra an toàn trước khi mở phiên chạy."
                : "Nhân viên cần chụp ảnh thực tế 4 góc của xe để đối chiếu trước khi cho khách khởi động lượt chạy."}
            </p>
          </div>
          <StaffButton
            onClick={() =>
              navigate(`/staff/inspections/${session.sessionId}?type=CHECK_IN`)
            }
            variant="primary"
            className="bg-amber-600 hover:bg-amber-700 font-bold uppercase tracking-wider text-xs shadow-sm shrink-0"
          >
            <ClipboardCheck className="size-4" />
            {booking.playMode === "BYOC" ? "Chụp ảnh xe cá nhân" : "Lập biên bản bàn giao xe"}
          </StaffButton>
        </StaffCard>
      )}

      {(session.status === "ACTIVE" || session.status === "EXTENDING") &&
        !checkOutDisputed &&
        !extensionWindowClosed &&
        booking?.playMode !== "BYOC" && (
          <StaffCard
            variant="warning"
            className="flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-amber-900">
                {operationalTiming.state === "OVERDUE"
                  ? `Phiên đã quá giờ ${operationalTiming.minutesPastPlannedEnd} phút`
                  : operationalTiming.state === "DUE_FOR_CHECKOUT"
                    ? "Đã đến giờ trả xe"
                    : "Yêu cầu lập biên bản trả xe"}
              </h4>
              <p className="text-xs text-amber-800 leading-relaxed">
                {operationalTiming.state === "OVERDUE"
                  ? "Xe vẫn đang được giữ ở phiên này. Hãy lập biên bản trả xe để kiểm tra, chốt phí và đưa xe về trạng thái phù hợp."
                  : "Thực hiện chụp ảnh đối chiếu tình trạng xe sau khi hoàn thành lượt chạy để phát hiện hư hại (nếu có)."}
              </p>
            </div>
            <StaffButton
              onClick={() =>
                navigate(
                  `/staff/inspections/${session.sessionId}?type=CHECK_OUT`,
                )
              }
              variant="primary"
              className="bg-amber-600 hover:bg-amber-700 font-bold uppercase tracking-wider text-xs shadow-sm shrink-0"
            >
              <ClipboardCheck className="size-4" />
              {operationalTiming.state === "ON_TIME"
                ? "Kiểm tra trả xe"
                : "Xử lý trả xe"}
            </StaffButton>
          </StaffCard>
        )}

      {(session.status === "ACTIVE" || session.status === "EXTENDING") &&
        checkOutDisputed &&
        booking?.playMode !== "BYOC" && (
          <StaffCard
            variant="warning"
            className="flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-amber-900">
                Khách phản hồi sai lệch biên bản trả xe
              </h4>
              <p className="text-xs text-amber-800 leading-relaxed">
                Cần đối chiếu lại ảnh, tình trạng xe và lập biên bản trả xe mới
                trước khi đóng phiên.
              </p>
            </div>
            <StaffButton
              onClick={() =>
                navigate(
                  `/staff/inspections/${session.sessionId}?type=CHECK_OUT`,
                )
              }
              variant="primary"
              className="bg-amber-600 hover:bg-amber-700 font-bold uppercase tracking-wider text-xs shadow-sm shrink-0"
            >
              <ClipboardCheck className="size-4" />
              Lập lại biên bản trả xe
            </StaffButton>
          </StaffCard>
        )}

      {(session.status === "ACTIVE" || session.status === "EXTENDING") &&
        booking?.playMode === "BYOC" &&
        !extensionWindowClosed && (
          <StaffCard
            variant={additionalOutstandingAmount > 0 ? "warning" : "default"}
            className={cn(
              "flex flex-col md:flex-row md:items-center justify-between gap-4",
              additionalOutstandingAmount === 0 &&
                "bg-emerald-50/70 border-emerald-300 shadow-2xs",
            )}
          >
            <div className="space-y-1">
              <h4
                className={cn(
                  "text-sm font-black flex items-center gap-2",
                  additionalOutstandingAmount > 0
                    ? "text-amber-900"
                    : "text-emerald-950",
                )}
              >
                {operationalTiming.state === "OVERDUE" ? (
                  <>
                    <AlertTriangle className="size-4 text-amber-600" />
                    Phiên BYOC đã quá giờ{" "}
                    {operationalTiming.minutesPastPlannedEnd} phút
                  </>
                ) : additionalOutstandingAmount > 0 ? (
                  <>
                    <AlertTriangle className="size-4 text-amber-600" />
                    Còn chi phí phát sinh cần thanh toán
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-4 text-emerald-600" />
                    Phiên chơi xe cá nhân (BYOC) — Đủ điều kiện kết thúc
                  </>
                )}
              </h4>
              <p
                className={cn(
                  "text-xs leading-relaxed font-semibold",
                  additionalOutstandingAmount > 0
                    ? "text-amber-800"
                    : "text-emerald-800",
                )}
              >
                {additionalOutstandingAmount > 0
                  ? `Khách còn ${additionalOutstandingAmount.toLocaleString("vi-VN")} đ phí phát sinh. Vui lòng quyết toán thu tiền ở thẻ phía dưới trước khi kết thúc phiên.`
                  : "Toàn bộ chi phí phát sinh đã được thanh toán đầy đủ. Nhân viên có thể bấm nút bên phải để kết thúc phiên chơi cho khách mà không cần đợi hết giờ."}
              </p>
            </div>
            {additionalOutstandingAmount === 0 ? (
              <StaffButton
                onClick={() => setConfirmCompleteByocOpen(true)}
                variant="primary"
                disabled={completingByoc}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-wider text-xs shadow-sm shrink-0 flex items-center gap-1.5"
              >
                <CheckCircle2 className="size-4" />
                {completingByoc
                  ? "Đang xử lý..."
                  : "Kết thúc phiên chơi (BYOC)"}
              </StaffButton>
            ) : (
              <span className="text-[11px] font-extrabold text-amber-800 bg-amber-100/90 px-3 py-1.5 rounded-xl border border-amber-300 shrink-0">
                🔒 Cần thu tiền phát sinh trước
              </span>
            )}
          </StaffCard>
        )}

      {session.status === "CHECKING_OUT" && !checkOutInspection && (
        <StaffCard className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-orange-200 bg-orange-50">
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-orange-900">
              Cần kiểm tra xe trước khi trả
            </h4>
            <p className="text-xs text-orange-800 leading-relaxed">
              Thực hiện kiểm tra xe và lập biên bản trả xe cho khách.
            </p>
          </div>
          <StaffButton
            size="sm"
            variant="primary"
            onClick={() =>
              navigate(`/staff/sessions/${session.sessionId}/checkout-summary`)
            }
          >
            Xem biên bản & xác nhận
          </StaffButton>
        </StaffCard>
      )}

      {session.status === "CHECKING_OUT" && checkOutInspection && (
        <StaffCard className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-amber-200 bg-amber-50">
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-amber-900">
              Chờ khách thanh toán tại quầy
            </h4>
            <p className="text-xs text-amber-800 leading-relaxed">
              Biên bản đã xác nhận. Thu phí dịch vụ tại quầy rồi xác nhận thanh
              toán bên dưới.
            </p>
          </div>
          <StaffButton
            size="sm"
            variant="outline"
            onClick={() =>
              navigate(`/staff/sessions/${session.sessionId}/checkout-summary`)
            }
          >
            Xem lại biên bản
          </StaffButton>
        </StaffCard>
      )}

      {/* 5. RENDER BILLING AND ORDER HISTORY — only after session starts */}
      {(session.status === "ACTIVE" ||
        session.status === "EXTENDING" ||
        session.status === "CHECKING_OUT" ||
        session.status === "COMPLETED") && (
        <ExtensionAuditCard
          extensions={approvedExtensions}
          initialPlannedEnd={booking.slotEnd}
          currentProposal={session.extensionProposal}
          className="border-[#e5e2e1]"
        />
      )}

      {/*
        Xác nhận biên bản hộ khách — CHỈ với khách không đăng nhập được.

        Khách có tài khoản riêng phải tự bấm trên máy họ; backend cũng từ chối
        (`CUSTOMER_CAN_SELF_SERVE`) nên bày nút ở đó chỉ tạo ra một cú bấm hỏng.
      */}
      {booking?.customerCanSelfServe === false &&
        session.inspections
          .filter((inspection) => !inspection.customerConfirmedAt)
          .map((inspection) => (
            <StaffCard
              key={inspection.inspectionId ?? inspection.type}
              className="space-y-3 border-sky-200 bg-sky-50/60"
            >
              <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-sky-900">
                <Info className="size-4" />
                Khách xác nhận biên bản tại quầy
              </h4>
              <p className="text-xs font-semibold text-sky-800">
                Khách đặt qua Messenger không có tài khoản để tự bấm. Cho khách
                xem biên bản{" "}
                {inspection.type === "CHECK_IN" ? "nhận xe" : "trả xe"} trên máy
                bạn, rồi bấm giúp họ — nhật ký sẽ ghi rõ bạn xác nhận hộ ai.
              </p>
              <div className="flex flex-wrap gap-2">
                <StaffButton
                  type="button"
                  disabled={confirmingInspection}
                  onClick={() =>
                    handleConfirmInspectionForCustomer(
                      inspection.inspectionId,
                      true,
                    )
                  }
                >
                  Khách đồng ý biên bản
                </StaffButton>
                <StaffButton
                  type="button"
                  variant="outline"
                  disabled={confirmingInspection}
                  onClick={() =>
                    handleConfirmInspectionForCustomer(
                      inspection.inspectionId,
                      false,
                    )
                  }
                >
                  Khách không đồng ý
                </StaffButton>
              </div>
            </StaffCard>
          ))}

      {/* Trả lời thay khách — chỉ hiện khi đang có đề nghị gia hạn chờ phản hồi.
          Đề nghị gửi đi rồi thì phiên đứng ở EXTENDING cho tới khi khách bấm trên
          máy họ; lúc demo hoặc lúc khách để quên điện thoại thì không có đường nào
          đẩy tiếp, và cả luồng gia hạn tắc ở đó. */}
      {session.extensionProposal?.status === "PENDING" && (
        <StaffCard className="space-y-3 border-amber-200 bg-amber-50/60">
          <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-900">
            <Info className="size-4" />
            Trả lời thay khách
          </h4>
          <p className="text-xs font-semibold text-amber-800">
            Đang chờ khách phản hồi đề nghị gia hạn
            {session.extensionProposal.extraMinutes
              ? ` ${session.extensionProposal.extraMinutes} phút`
              : ""}
            . Khách trả lời trực tiếp tại quầy thì bấm giúp họ ở đây — hệ thống
            ghi nhận y như khách tự bấm trên máy.
          </p>
          <div className="flex flex-wrap gap-2">
            <StaffButton
              type="button"
              disabled={simulatingExtension}
              onClick={() => handleSimulateExtension(true)}
            >
              Khách đồng ý gia hạn
            </StaffButton>
            <StaffButton
              type="button"
              variant="outline"
              disabled={simulatingExtension}
              onClick={() => handleSimulateExtension(false)}
            >
              Khách từ chối
            </StaffButton>
          </div>
        </StaffCard>
      )}

      {(session.status === "ACTIVE" ||
        session.status === "EXTENDING" ||
        session.status === "CHECKING_OUT" ||
        session.status === "COMPLETED") && (
        <div className="grid md:grid-cols-5 gap-4 items-start">
          {/* F&B Section — narrow column */}
          <div className="md:col-span-2 space-y-4">
            {/* 1. Đồ ăn & thức uống đặt trước */}
            {(booking.fnbPreorderFee > 0 || preorderFnbOrders.length > 0) && (
              <StaffCard className="space-y-3 border-orange-200 bg-orange-50/20">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-[#1c1b1b] uppercase tracking-wider flex items-center gap-2">
                    <Coffee className="size-4 text-orange-600" />
                    Đồ ăn & thức uống đặt trước
                  </h4>
                  <span className="text-[10px] font-bold text-orange-800 bg-orange-100 px-2 py-0.5 rounded-full">
                    Đã thanh toán trước
                  </span>
                </div>

                <div className="space-y-1.5">
                  {preorderFnbOrders.length > 0 ? (
                    preorderFnbOrders.map((order) => (
                      <div
                        key={order.orderId}
                        className="rounded-lg bg-white px-3 py-2 border border-orange-200/80 text-xs flex justify-between items-start gap-2 font-semibold shadow-2xs"
                      >
                        <div className="space-y-0.5 flex-1 min-w-0">
                          {order.items.map((i, idx) => (
                            <span key={idx} className="block text-[#1c1b1b]">
                              {i.name}
                              {i.variantName ? ` · ${i.variantName}` : ""}{" "}
                              <span className="text-[#6b7280] font-normal">
                                ×{i.qty}
                              </span>
                              {i.notes && (
                                <span className="block mt-0.5 text-[10px] text-[#b45309] font-medium">
                                  Ghi chú: {i.notes}
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-extrabold text-orange-600">
                            {order.total.toLocaleString("vi-VN")} đ
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg bg-white px-3 py-2 border border-orange-200/80 text-xs flex justify-between items-center font-semibold shadow-2xs">
                      <span className="text-slate-800">
                        Đồ ăn & thức uống đặt trước theo gói
                      </span>
                      <span className="font-extrabold text-orange-600">
                        {booking.fnbPreorderFee.toLocaleString("vi-VN")} đ
                      </span>
                    </div>
                  )}
                </div>
              </StaffCard>
            )}

            {/* 2. Đồ ăn & thức uống gọi tại ca */}
            <StaffCard className="space-y-3">
              <h4 className="text-sm font-bold text-[#1c1b1b] uppercase tracking-wider flex items-center gap-2">
                <Coffee className="size-4 text-[#ea580c]" />
                Đồ ăn & thức uống gọi trong phiên chơi
              </h4>

              <div className="space-y-1.5">
                {onsiteFnbOrders.map((order) => {
                  const isOrderPaid =
                    onsiteOrderPaidMap.get(order.orderId) ?? true
                  return (
                    <div
                      key={order.orderId}
                      className={`rounded-lg px-3 py-2 border text-xs flex justify-between items-start gap-2 font-semibold transition-colors ${
                        isOrderPaid
                          ? "bg-[#fcf8f8] border-[#e5e2e1]"
                          : "bg-amber-50/70 border-amber-300 shadow-sm"
                      }`}
                    >
                      <div className="space-y-0.5 flex-1 min-w-0">
                        {order.items.map((i, idx) => (
                          <span key={idx} className="block text-[#1c1b1b]">
                            {i.name}
                            {i.variantName ? ` · ${i.variantName}` : ""}{" "}
                            <span className="text-[#6b7280] font-normal">
                              ×{i.qty}
                            </span>
                            {i.notes && (
                              <span className="block mt-0.5 text-[10px] text-[#b45309] font-medium">
                                Ghi chú: {i.notes}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                        <span className="font-extrabold text-[#ea580c]">
                          {order.total.toLocaleString("vi-VN")} đ
                        </span>
                        {order.status === "CONFIRMED" && (
                          <span className="text-[10px] text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            Đang làm
                          </span>
                        )}
                        {order.status === "DELIVERED" && (
                          <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            Đã phục vụ
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                            isOrderPaid
                              ? "text-emerald-700 bg-emerald-100/70 border-emerald-200"
                              : "text-amber-900 bg-amber-200/80 border-amber-400 font-extrabold"
                          }`}
                        >
                          {isOrderPaid ? "Đã thanh toán" : "Chờ thanh toán"}
                        </span>
                        {(session.status === "ACTIVE" ||
                          session.status === "EXTENDING") &&
                          order.status === "PENDING" && (
                          <button
                            type="button"
                            onClick={() => void handleCancelFnbOrder(order.orderId)}
                            title="Huỷ món này (chưa chế biến)"
                            className="flex size-5 items-center justify-center rounded-full bg-[#f5f3f2] hover:bg-rose-100 hover:text-rose-600 text-[#9b8fa8] transition-colors"
                          >
                            <X className="size-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}

                {onsiteFnbOrders.length > 0 &&
                  pendingOnsiteFnbAmount > 0 &&
                  paidOnsiteFnbAmount > 0 && (
                    <div className="mt-2 flex flex-wrap justify-between items-center text-[11px] rounded-md bg-amber-50/90 border border-amber-200 px-2.5 py-1.5 font-medium">
                      <span className="text-emerald-700">
                        Đã thanh toán:{" "}
                        <strong className="font-bold">
                          {paidOnsiteFnbAmount.toLocaleString("vi-VN")} đ
                        </strong>
                      </span>
                      <span className="text-amber-800 font-bold">
                        Còn chờ thanh toán:{" "}
                        <strong className="font-extrabold text-amber-900">
                          {pendingOnsiteFnbAmount.toLocaleString("vi-VN")} đ
                        </strong>
                      </span>
                    </div>
                  )}

                {onsiteFnbOrders.length === 0 && (
                  <p className="text-xs text-[#6b7280] italic py-3 text-center">
                    Chưa có món gọi thêm tại ca.
                  </p>
                )}
              </div>
            </StaffCard>
          </div>

          {/* Financial summary is shared with the customer booking detail. */}
          <StaffCard id="settlement-card" className="md:col-span-3 space-y-4">
            <h4 className="text-sm font-bold text-[#1c1b1b] uppercase tracking-wider flex items-center gap-2">
              <FileText className="size-4.5 text-[#ea580c]" />
              Quyết toán phiên chơi
            </h4>

            {hasPendingCounterPayment && (
              <div
                className={`flex items-start gap-2.5 rounded-xl px-3.5 py-3 border ${
                  isCheckoutPending
                    ? "bg-amber-50 border-amber-300 text-amber-900"
                    : "bg-orange-50 border-orange-200 text-orange-900"
                }`}
              >
                {isCheckoutPending ? (
                  <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                ) : (
                  <Banknote className="size-4 text-orange-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="text-xs font-extrabold">
                    {isCheckoutPending
                      ? "BƯỚC 1: Cần kiểm tra trả xe trước"
                      : "Còn khoản phát sinh cần thanh toán"}
                  </p>
                  <p
                    className={`text-[11px] mt-0.5 leading-relaxed ${
                      isCheckoutPending ? "text-amber-800" : "text-orange-700"
                    }`}
                  >
                    {isCheckoutPending
                      ? `Khách còn ${additionalOutstandingAmount.toLocaleString(
                          "vi-VN"
                        )} đ phí phát sinh. Vui lòng thực hiện BƯỚC 1: KIỂM TRA TRẢ XE ở thẻ phía trên trước khi thu tiền mặt.`
                      : `Khách cần thanh toán ${additionalOutstandingAmount.toLocaleString(
                          "vi-VN"
                        )} đ cho các khoản dưới đây.`}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-4 text-xs font-semibold">
              <section className="space-y-1.5 pb-3 border-b border-[#e5e2e1]/60">
                <span className="text-[10px] font-extrabold text-[#6b7280] uppercase tracking-wider block">
                  Đã thanh toán khi đặt lịch
                </span>
                {prepaidLines.map((line) => (
                  <div
                    key={line.componentId}
                    className="flex justify-between gap-4 text-[#4c4a49]"
                  >
                    <span>{line.label}</span>
                    <span className="text-[#1c1b1b] font-bold shrink-0">
                      {Number(line.amount).toLocaleString("vi-VN")} đ
                    </span>
                  </div>
                ))}
                {prepaidDiscountAmount > 0 && (
                  <div className="flex justify-between gap-4 text-emerald-700">
                    <span>Ưu đãi áp dụng</span>
                    <span className="font-bold shrink-0">
                      −{prepaidDiscountAmount.toLocaleString("vi-VN")} đ
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-4 border-t border-[#e5e2e1]/60 pt-2 mt-2 text-[#1c1b1b]">
                  <span className="font-bold">Đã thanh toán trước</span>
                  <span className="font-extrabold shrink-0">
                    {prepaidPaidAmount.toLocaleString("vi-VN")} đ
                  </span>
                </div>
              </section>

              <section className="space-y-2 pb-3 border-b border-[#e5e2e1]/60">
                <span className="text-[10px] font-extrabold text-[#ea580c] uppercase tracking-wider block">
                  Chi phí phát sinh tại quầy
                </span>
                {groupedAdditionalLines.length > 0 ? (
                  groupedAdditionalLines.map((line) => (
                    <div
                      key={line.id}
                      className="rounded-lg bg-[#fcf8f8] px-2.5 py-2"
                    >
                      <div className="flex justify-between gap-4 text-[#4c4a49]">
                        <span>{line.label}</span>
                        <span className="text-[#ea580c] font-extrabold shrink-0">
                          +{line.amount.toLocaleString("vi-VN")} đ
                        </span>
                      </div>
                      <p
                        className={`mt-1 text-[10px] ${line.paid ? "text-emerald-700 font-medium" : "text-orange-700 font-bold"}`}
                      >
                        {line.paid
                          ? `Đã thanh toán${line.gateway ? ` · ${line.gateway}` : ""}`
                          : "Chờ thanh toán"}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-[#6b7280] italic">
                    Không phát sinh chi phí tại quầy.
                  </p>
                )}
                <div className="flex justify-between gap-4 border-t border-[#e5e2e1]/60 pt-2 text-[#1c1b1b]">
                  <span className="font-bold">Tổng phí phát sinh</span>
                  <span className="text-[#ea580c] font-extrabold shrink-0">
                    {additionalTotal.toLocaleString("vi-VN")} đ
                  </span>
                </div>
              </section>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-3">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
                    Tổng khách đã thanh toán
                  </p>
                  <p className="mt-0.5 text-base font-extrabold text-slate-900">
                    {totalPaidAmount.toLocaleString("vi-VN")} đ
                  </p>
                </div>
                {hasPendingCounterPayment ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <StaffButton
                      onClick={() => setConfirmSettleOpen(true)}
                      disabled={
                        settlingPayment || isCheckoutPending || generatingQr
                      }
                      variant={isCheckoutPending ? "outline" : "primary"}
                      className={`px-3.5 py-2.5 rounded-xl font-bold shadow-sm ${
                        isCheckoutPending
                          ? "bg-amber-100/90 text-amber-950 border-amber-300 cursor-not-allowed disabled:opacity-100 disabled:bg-amber-100 disabled:text-amber-950 disabled:border-amber-300"
                          : "bg-emerald-600 hover:bg-emerald-700 text-white"
                      }`}
                    >
                      <Banknote
                        className={`size-4 ${isCheckoutPending ? "text-amber-700" : "text-white"}`}
                      />
                      {settlingPayment
                        ? "Đang xử lý..."
                        : isCheckoutPending
                          ? "🔒 Cần kiểm tra trả xe trước"
                          : "Thu tiền mặt"}
                    </StaffButton>

                    {!isCheckoutPending && (
                      <StaffButton
                        onClick={() => void handleOpenSettleQr()}
                        disabled={
                          settlingPayment || isCheckoutPending || generatingQr
                        }
                        variant="outline"
                        className="px-3.5 py-2.5 rounded-xl font-bold border-[#ea580c] text-[#ea580c] hover:bg-[#fff3eb] shadow-sm flex items-center gap-1.5 cursor-pointer"
                      >
                        {generatingQr ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <QrCode className="size-4 text-[#ea580c]" />
                        )}
                        Chuyển khoản QR
                      </StaffButton>
                    )}
                  </div>
                ) : isFullySettled ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-700 text-xs font-bold">
                    <CheckCircle2 className="size-4" /> Đã quyết toán hoàn tất
                  </span>
                ) : null}
              </div>
            </div>
          </StaffCard>
        </div>
      )}

      {/* 6. INSPECTION RECORDS (CHECK-IN & CHECK-OUT) */}
      {(checkInInspection || checkOutInspection) && (
        <StaffCard className="space-y-5 border-[#e5e2e1]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e5e2e1] pb-3">
            <div>
              <h4 className="text-sm font-black text-[#1c1b1b] uppercase tracking-wider flex items-center gap-2">
                <FileCheck className="size-4.5 text-[#ea580c]" />
                {booking.playMode === "BYOC"
                  ? "Hồ sơ xác nhận xe khách (Check-in)"
                  : "Hồ sơ biên bản bàn giao & nghiệm thu trả xe"}
              </h4>
              <p className="text-[11px] text-[#6b7280] font-semibold mt-0.5">
                {booking.playMode === "BYOC"
                  ? "Ảnh chụp xác nhận xe cá nhân và checklist an toàn khi vào sân"
                  : "Bằng chứng ảnh chụp, checklist linh kiện và ghi chú đối chiếu tình trạng xe"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {checkInInspection && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-800 bg-sky-50 border border-sky-200 px-2.5 py-1 rounded-full">
                  <CheckCircle2 className="size-3 text-sky-600" />{" "}
                  {booking.playMode === "BYOC"
                    ? "Xác nhận xe khách"
                    : "Biên bản nhận xe"}{" "}
                  ({checkInInspection.photos.length} ảnh)
                </span>
              )}
              {booking.playMode !== "BYOC" && checkOutInspection && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                  <CheckCircle2 className="size-3 text-emerald-600" /> Biên bản
                  trả xe ({checkOutInspection.photos.length} ảnh)
                </span>
              )}
            </div>
          </div>

          <div
            className={
              booking.playMode === "BYOC"
                ? "space-y-4"
                : "grid lg:grid-cols-2 gap-6 items-start"
            }
          >
            {/* 1. BIÊN BẢN BÀN GIAO (CHECK-IN) */}
            {checkInInspection ? (
              <div className="rounded-2xl border border-sky-200 bg-sky-50/30 p-4 space-y-4 shadow-2xs">
                <div className="flex items-center justify-between border-b border-sky-200/70 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-lg bg-sky-600 text-white text-[11px] font-black">
                      {booking.playMode === "BYOC" ? "✓" : "1"}
                    </span>
                    <span className="text-xs font-black uppercase tracking-wide text-sky-950">
                      {booking.playMode === "BYOC"
                        ? "Biên bản xác nhận xe khách (Check-in)"
                        : "Biên bản nhận xe (Check-in)"}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-sky-700 bg-sky-100 px-2 py-0.5 rounded-full">
                    {checkInInspection.photos.length} ảnh chụp
                  </span>
                </div>

                {/* Ghi chú */}
                <div className="rounded-xl border border-sky-200/80 bg-white p-3 space-y-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-wide text-sky-800 flex items-center gap-1">
                    <Info className="size-3.5 text-sky-600" />
                    {booking.playMode === "BYOC"
                      ? "Ghi chú của nhân viên trực ca:"
                      : "Ghi chú khi bàn giao:"}
                  </span>
                  <p className="text-xs font-semibold text-slate-800 leading-relaxed pl-4">
                    {checkInInspection.staffNotes ||
                      (checkInInspection as { notes?: string }).notes ||
                      checkInInspection.damageDescription ||
                      (booking.playMode === "BYOC"
                        ? "Không có ghi chú khi nhận xe."
                        : "Không có ghi chú bất thường khi bàn giao xe.")}
                  </p>
                </div>

                {/* Checklist linh kiện */}
                {checkInInspection.checklist &&
                  checkInInspection.checklist.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-extrabold uppercase tracking-wide text-sky-900 block">
                        {booking.playMode === "BYOC"
                          ? "Checklist an toàn xe tự mang:"
                          : "Tình trạng linh kiện bàn giao:"}
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {checkInInspection.checklist.map((item, idx) => {
                          const isOk =
                            item.checked ??
                            (item as { status?: string }).status === "OK"
                          const itemLabel =
                            item.label ||
                            (item as { itemLabel?: string }).itemLabel ||
                            item.id
                          const itemNote =
                            item.notes || (item as { note?: string }).note
                          return (
                            <div
                              key={idx}
                              className={cn(
                                "flex items-center justify-between p-2 rounded-lg border bg-white text-xs",
                                isOk
                                  ? "border-slate-200"
                                  : "border-amber-300 bg-amber-50/50",
                              )}
                            >
                              <span className="font-semibold text-slate-800 truncate mr-2 text-[11px]">
                                {itemLabel}
                              </span>
                              {isOk ? (
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">
                                  ✓ Đạt
                                </span>
                              ) : (
                                <span
                                  className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 shrink-0"
                                  title={itemNote}
                                >
                                  ⚠️ {itemNote || "Lỗi"}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                {/* Ảnh bàn giao */}
                <div className="space-y-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wide text-sky-900 block">
                    {booking.playMode === "BYOC"
                      ? `Hình ảnh xác nhận xe khách (${checkInInspection.photos.length} ảnh):`
                      : `Hình ảnh bàn giao xe (${checkInInspection.photos.length} ảnh):`}
                  </span>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {checkInInspection.photos.map((photo, index) => {
                      const dir =
                        photo.direction ||
                        (photo as { angle?: string }).angle ||
                        "OTHER"
                      return (
                        <div
                          key={`${photo.url}-${index}`}
                          className="group relative overflow-hidden rounded-xl border border-sky-200 bg-white shadow-2xs"
                        >
                          <ZoomableInspectionImage
                            src={photo.url}
                            alt={`Ảnh nhận xe ${index + 1}`}
                            className="aspect-video w-full object-cover"
                          />
                          <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-xs">
                            {DIRECTION_LABEL[dir] ?? dir}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-slate-400 text-xs">
                Chưa có dữ liệu biên bản nhận xe.
              </div>
            )}

            {/* 2. BIÊN BẢN TRẢ XE (CHECK-OUT) - ONLY FOR RENTAL */}
            {booking.playMode !== "BYOC" &&
              (checkOutInspection ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/30 p-4 space-y-4 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-emerald-200/70 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex size-6 items-center justify-center rounded-lg bg-emerald-600 text-white text-[11px] font-black">
                        2
                      </span>
                      <span className="text-xs font-black uppercase tracking-wide text-emerald-950">
                        Biên bản trả xe (Check-out)
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {checkOutInspection.damageFlagged ? (
                        <span className="text-[10px] font-black text-rose-700 bg-rose-100 border border-rose-200 px-2 py-0.5 rounded-full">
                          ⚠️ Phát hiện hư hại
                        </span>
                      ) : (
                        <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">
                          ✓ Nguyên vẹn
                        </span>
                      )}
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                        {checkOutInspection.photos.length} ảnh
                      </span>
                    </div>
                  </div>

                  {/* Ghi chú */}
                  <div className="rounded-xl border border-emerald-200/80 bg-white p-3 space-y-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-800 flex items-center gap-1">
                      <Info className="size-3.5 text-emerald-600" />
                      Ghi chú khi trả xe:
                    </span>
                    <p className="text-xs font-semibold text-slate-800 leading-relaxed pl-4">
                      {checkOutInspection.staffNotes ||
                        (checkOutInspection as { notes?: string }).notes ||
                        checkOutInspection.damageDescription ||
                        "Xe được trả nguyên vẹn, không phát sinh hư hỏng."}
                    </p>
                  </div>

                  {/* Checklist nghiệm thu */}
                  {checkOutInspection.checklist &&
                    checkOutInspection.checklist.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-900 block">
                          Tình trạng linh kiện khi trả:
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {checkOutInspection.checklist.map((item, idx) => {
                            const isOk =
                              item.checked ??
                              (item as { status?: string }).status === "OK"
                            const itemLabel =
                              item.label ||
                              (item as { itemLabel?: string }).itemLabel ||
                              item.id
                            const itemNote =
                              item.notes || (item as { note?: string }).note
                            return (
                              <div
                                key={idx}
                                className={cn(
                                  "flex items-center justify-between p-2 rounded-lg border bg-white text-xs",
                                  isOk
                                    ? "border-slate-200"
                                    : "border-rose-300 bg-rose-50/50",
                                )}
                              >
                                <span className="font-semibold text-slate-800 truncate mr-2 text-[11px]">
                                  {itemLabel}
                                </span>
                                {isOk ? (
                                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">
                                    ✓ Đạt
                                  </span>
                                ) : (
                                  <span
                                    className="text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 shrink-0"
                                    title={itemNote}
                                  >
                                    ✕ {itemNote || "Hư hại"}
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                  {/* Đền bù hư hỏng nếu có */}
                  {(
                    checkOutInspection as {
                      damageLineItems?: Array<{
                        customPartName?: string
                        partType?: string
                        lineTotal?: number
                        partsPrice?: number
                        laborPrice?: number
                      }>
                    }
                  ).damageLineItems &&
                    (
                      checkOutInspection as {
                        damageLineItems?: Array<{
                          customPartName?: string
                          partType?: string
                          lineTotal?: number
                          partsPrice?: number
                          laborPrice?: number
                        }>
                      }
                    ).damageLineItems!.length > 0 && (
                      <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 space-y-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-rose-900 flex items-center gap-1">
                          <AlertTriangle className="size-3.5 text-rose-600" />
                          Chi tiết đền bù hư hỏng:
                        </span>
                        <div className="space-y-1.5 text-xs">
                          {(
                            checkOutInspection as {
                              damageLineItems?: Array<{
                                customPartName?: string
                                partType?: string
                                lineTotal?: number
                                partsPrice?: number
                                laborPrice?: number
                              }>
                            }
                          ).damageLineItems!.map((d, idx) => (
                            <div
                              key={idx}
                              className="flex justify-between items-center bg-white p-2 rounded-lg border border-rose-100"
                            >
                              <span className="font-bold text-slate-800">
                                {d.customPartName || d.partType}
                              </span>
                              <span className="font-black text-rose-600">
                                {(
                                  Number(
                                    d.lineTotal ??
                                      (d.partsPrice ?? 0) + (d.laborPrice ?? 0),
                                  )
                                ).toLocaleString("vi-VN")}{" "}
                                đ
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Ảnh trả xe */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-900 block">
                      Hình ảnh trả xe ({checkOutInspection.photos.length} ảnh):
                    </span>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {checkOutInspection.photos.map((photo, index) => {
                        const dir =
                          photo.direction ||
                          (photo as { angle?: string }).angle ||
                          "OTHER"
                        return (
                          <div
                            key={`${photo.url}-${index}`}
                            className="group relative overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-2xs"
                          >
                            <ZoomableInspectionImage
                              src={photo.url}
                              alt={`Ảnh trả xe ${index + 1}`}
                              className="aspect-video w-full object-cover"
                            />
                            <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-xs">
                              {DIRECTION_LABEL[dir] ?? dir}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-slate-400 text-xs">
                  Chưa có dữ liệu biên bản trả xe (phiên chưa kết thúc trả xe).
                </div>
              ))}
          </div>
        </StaffCard>
      )}

      {/* Helpful Operational tips */}
      <div className="rounded-lg border border-[#e5e2e1] bg-[#f5f3f2]/30 p-4 space-y-1">
        <div className="flex items-center gap-2 text-xs font-bold text-[#4c4a49]">
          <HelpCircle className="size-4 text-[#6b7280]" />
          Lưu ý vận hành ca chơi
        </div>
        <p className="text-[11px] text-[#6b7280] leading-relaxed">
          {booking.playMode === "BYOC"
            ? "Đơn mang xe cá nhân (BYOC): Nhân viên chụp ảnh xe cá nhân của từng người chơi lúc vào sân để kiểm tra an toàn và xác nhận lượt chạy. Khách tự quản lý xe cá nhân khi chơi trên sân."
            : "Đảm bảo kiểm tra và đối chiếu kỹ tình trạng xe với biên bản bàn giao trước khi hoàn tất nghiệm thu và quyết toán phiên chơi."}
        </p>
      </div>

      {/* SETTLE PAYMENT CONFIRMATION MODAL */}
      {confirmSettleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="flex size-10 items-center justify-center rounded-full bg-emerald-100">
                <Banknote className="size-5 text-emerald-700" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  Xác nhận quyết toán
                </h3>
                <p className="text-[11px] text-slate-500">
                  Đảm bảo đã thực hiện xong với khách tại quầy
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2.5 text-xs font-semibold">
              {additionalLines
                .filter((line) => line.status === "PENDING")
                .map((line) => (
                  <div
                    key={line.componentId}
                    className="flex items-center justify-between gap-4"
                  >
                    <span className="text-slate-600">{line.label}</span>
                    <span className="text-orange-700 font-extrabold shrink-0">
                      {Number(line.amount).toLocaleString("vi-VN")} đ
                    </span>
                  </div>
                ))}
              <div className="border-t border-slate-200 pt-2.5 flex justify-between items-center">
                <span className="text-slate-800 font-extrabold text-sm">
                  Khách trả thêm tại quầy
                </span>
                <span className="font-extrabold text-base text-orange-700">
                  {additionalOutstandingAmount.toLocaleString("vi-VN")} đ
                </span>
              </div>
            </div>

            <div className="flex gap-2.5">
              <StaffButton
                onClick={() => setConfirmSettleOpen(false)}
                variant="outline"
                className="flex-1"
              >
                Huỷ bỏ
              </StaffButton>
              <StaffButton
                onClick={() => {
                  setConfirmSettleOpen(false)
                  void handleSettlePayment()
                }}
                variant="primary"
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              >
                <CheckCircle2 className="size-4" />
                Đã thu xong
              </StaffButton>
            </div>
          </div>
        </div>
      )}

      {/* COMPLETE BYOC CONFIRMATION MODAL */}
      {confirmCompleteByocOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="flex size-10 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="size-5 text-emerald-700" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  Xác nhận kết thúc phiên
                </h3>
                <p className="text-[11px] text-slate-500">
                  Phiên chơi xe cá nhân (BYOC)
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 space-y-2 text-xs font-semibold text-emerald-950">
              <p>
                Khách mang xe riêng đã hoàn thành ca chơi và thanh toán đủ các
                khoản phát sinh.
              </p>
              <p className="text-[11px] text-emerald-800 font-normal leading-relaxed">
                Hệ thống sẽ chuyển trạng thái phiên chơi và đơn đặt sang{" "}
                <strong>HOÀN TẤT</strong> ngay lập tức.
              </p>
            </div>

            <div className="flex gap-2.5">
              <StaffButton
                onClick={() => setConfirmCompleteByocOpen(false)}
                variant="outline"
                disabled={completingByoc}
                className="flex-1"
              >
                Hủy bỏ
              </StaffButton>
              <StaffButton
                onClick={() => void handleCompleteByocSession()}
                variant="primary"
                disabled={completingByoc}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              >
                <CheckCircle2 className="size-4" />
                {completingByoc ? "Đang xử lý..." : "Kết thúc ngay"}
              </StaffButton>
            </div>
          </div>
        </div>
      )}

      {/* VEHICLE SWAP MODAL (Hidden on UI)
      {swapModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[#e5e2e1] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-[#ea580c] mb-2">
              <ArrowLeftRight className="size-5" />
              <h3 className="font-bold text-base text-[#1c1b1b]">
                Đổi xe đang chơi
              </h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4c4a49] mb-1.5">
                  Tình trạng xe cũ (Mã ID: {swappingVehicleId})
                </label>
                <select
                  value={oldVehicleNewStatus}
                  onChange={(e) =>
                    setOldVehicleNewStatus(
                      e.target.value as "AVAILABLE" | "MAINTENANCE",
                    )
                  }
                  className="w-full rounded-lg border border-[#e5e2e1] bg-white px-3.5 py-2.5 text-sm font-semibold text-[#1c1b1b] focus:border-[#ea580c] focus:outline-none focus:ring-1 focus:ring-[#ea580c]"
                >
                  <option value="MAINTENANCE">
                    Xe bị hỏng hóc (Chuyển vào bảo trì)
                  </option>
                  <option value="AVAILABLE">
                    Xe bình thường (Đưa lại kho trống)
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#4c4a49] mb-1.5">
                  Chọn xe thay thế khả dụng
                </label>
                <select
                  value={selectedSwapNewUnitId}
                  onChange={(e) => setSelectedSwapNewUnitId(e.target.value)}
                  className="w-full rounded-lg border border-[#e5e2e1] bg-white px-3.5 py-2.5 text-sm font-semibold text-[#1c1b1b] focus:border-[#ea580c] focus:outline-none focus:ring-1 focus:ring-[#ea580c]"
                >
                  <option value="">-- Chọn xe trống khả dụng --</option>
                  {availableFleet
                    .filter((u) => {
                      const st = fleetStates[u.id] || u.status
                      return st === "AVAILABLE" && u.id !== swappingVehicleId
                    })
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.catalog?.name || u.identifier} (Mã: {u.identifier} |{" "}
                        {u.color})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <StaffButton
                onClick={() => {
                  setSwapModalOpen(false)
                  setSelectedSwapNewUnitId("")
                }}
                variant="outline"
                className="flex-1"
              >
                Hủy bỏ
              </StaffButton>
              <StaffButton
                onClick={handleConfirmSwap}
                variant="primary"
                className="flex-1"
              >
                Xác nhận đổi
              </StaffButton>
            </div>
          </div>
        </div>
      )}
      */}

      {/* WALK-IN SETTLEMENT BANK TRANSFER QR MODAL */}
      {qrModalOpen && settleBankTransferData && booking && (
        <WalkInBankTransferModal
          isOpen={qrModalOpen}
          bookingId={booking.bookingId}
          bookingCode={booking.bookingId.slice(0, 8).toUpperCase()}
          bankTransfer={settleBankTransferData}
          autoCheckIn={false}
          onClose={() => {
            setQrModalOpen(false)
            setSettleBankTransferData(null)
          }}
          onSuccess={async () => {
            setQrModalOpen(false)
            setSettleBankTransferData(null)
            toast.success("Khách vãng lai đã thanh toán chuyển khoản thành công!")
            await refreshData()
            await refetchSessionDetail()
          }}
        />
      )}
    </div>
  )
}
