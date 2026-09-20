/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
import React, { useState, useEffect, useMemo } from "react"
import { useSearchParams, Link, useNavigate } from "react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { WalkInCashConfirmationModal } from "./components/WalkInCashConfirmationModal"
import {
  Search as SearchIcon,
  Car,
  Plus,
  ArrowRight,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  Tag,
  Loader2,
  Clock,
  Phone,
  Users,
  MapPin,
  QrCode,
  X,
  Trophy,
  Play,
  Coffee,
  Minus,
  Check,
  CheckCircle2,
  User,
  Banknote,
  CreditCard,
  Zap,
  Smartphone,
  MessageCircle,
  AlertCircle,
  Camera,
} from "lucide-react"
import { formatCurrency } from "@/shared/lib/format"
import { useStaffOperations } from "./context/StaffOperationContext"
import { cafeApi, cafeQueryKeys } from "@/features/cafes/api/cafe.api"
import { useVehicleUnits } from "@/features/vehicles/hooks/useVehicleUnits"
import { staffApi, staffQueryKeys } from "@/features/staff/api/staff.api"
import { menuApi, menuQueryKeys } from "@/features/menu/api/menu.api"
import type { MenuItem } from "@/features/menu/types"
import {
  bookingApi,
  bookingQueryKeys,
} from "@/features/booking/api/booking.api"
import { VehicleStatus, type VehicleUnit, type VehicleCatalog } from "@/features/vehicles/types"
import { cn, getCatalogImageUrl, sanitizeImageUrl } from "@/shared/lib/utils"
import { VehicleImage } from "@/shared/ui/vehicle-image"
import { routePaths } from "@/app/router/route-paths"
import { isCheckInDeadlineExpired } from "@/features/booking/lib/check-in-window"
import { getSessionOperationalTiming } from "@/features/booking/lib/session-operational-timing"
import { toast } from "sonner"
import {
  StaffHeader,
  StaffCard,
  StaffBadge,
  StaffButton,
} from "./components/StaffUI"
import { StaffCameraQrScannerModal } from "@/features/staff/components/StaffCameraQrScannerModal"
import type { CustomerBookingDetail } from "@/shared/data/customer-operational-mock-data"
import {
  useAvailability,
  useDailyAvailability,
  toVietnamSlotISOString,
} from "@/features/booking/hooks/use-booking"
import { useTrackConfigs } from "@/features/cafes/hooks/useTrackConfigs"
import {
  DailySlotGrid,
  type DailySlot,
  type DailySlotStatus,
} from "@/pages/customer/cafe-detail/components/DailySlotGrid"
import type { HourlySlotAvailability } from "@/features/booking/hooks/use-booking"
import type { BankTransferCheckout } from "@/features/booking/types/booking.types"
import { WalkInBankTransferModal } from "./components/WalkInBankTransferModal"

type TabType = "LIST" | "WALKIN"

const MAX_CONSECUTIVE_SLOTS = 8

const walkInFormSchema = z
  .object({
    customerName: z
      .string()
      .trim()
      .min(1, "Vui lòng nhập tên khách hàng")
      .max(255, "Tên khách hàng không được quá 255 ký tự"),
    customerPhone: z
      .string()
      .trim()
      .regex(
        /^(84|0[35789])\d{8}$/,
        "Số điện thoại cần có 10 số và bắt đầu bằng 03, 05, 07, 08 hoặc 09",
      ),
    playMode: z.enum(["RENTAL", "BYOC"]),
    paymentMethod: z.enum(["CASH", "BANK_TRANSFER"]),
    trackTypeId: z.string().uuid("Vui lòng chọn đường đua đang hoạt động"),
    slotStart: z.string().datetime({ offset: true }),
    slotEnd: z.string().datetime({ offset: true }),
    slotDurationMinutes: z
      .number()
      .int()
      .positive("Thời lượng slot của cơ sở chưa hợp lệ")
      .max(1440),
    scheduleConfigured: z.boolean(),
    vehicleIds: z.array(z.string().uuid()),
  })
  .superRefine((data, ctx) => {
    if (!data.scheduleConfigured) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduleConfigured"],
        message:
          "Cơ sở chưa cấu hình giờ hoạt động hoặc thời lượng slot hợp lệ",
      })
    }

    const start = new Date(data.slotStart)
    const end = new Date(data.slotEnd)
    const durationMinutes = (end.getTime() - start.getTime()) / 60_000
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["slotEnd"],
        message: "Khoảng thời gian chơi không hợp lệ",
      })
    } else if (
      durationMinutes % data.slotDurationMinutes !== 0 ||
      durationMinutes > data.slotDurationMinutes * MAX_CONSECUTIVE_SLOTS
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["slotEnd"],
        message: `Chỉ được chọn tối đa ${MAX_CONSECUTIVE_SLOTS} slot liên tiếp`,
      })
    }

    if (data.playMode === "RENTAL" && data.vehicleIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vehicleIds"],
        message: "Vui lòng chọn ít nhất 1 xe thuê",
      })
    }
    if (data.playMode === "BYOC" && data.vehicleIds.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vehicleIds"],
        message: "Chế độ tự mang xe không được chọn xe của cửa hàng",
      })
    }
  })

type WalkInFieldErrors = Partial<
  Record<
    | "customerName"
    | "customerPhone"
    | "playMode"
    | "paymentMethod"
    | "trackTypeId"
    | "slotStart"
    | "slotEnd"
    | "slotDurationMinutes"
    | "scheduleConfigured"
    | "vehicleIds",
    string
  >
>

function getSlotCountdown(
  startTime: string,
  now = Date.now(),
): { label: string; urgent: boolean } | null {
  const startAt = new Date(startTime).getTime()
  if (!Number.isFinite(startAt)) return null

  const diffMs = startAt - now
  if (diffMs <= 0) return null // already started or past

  const totalMinutes = Math.ceil(diffMs / 60000)
  if (totalMinutes >= 24 * 60) return null // more than 24h away, skip

  if (totalMinutes < 60) {
    return {
      label: `Bắt đầu sau ${totalMinutes} phút`,
      urgent: totalMinutes <= 30,
    }
  }
  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  const label =
    mins > 0
      ? `Bắt đầu sau ${hours} giờ ${mins} phút`
      : `Bắt đầu sau ${hours} giờ`
  return { label, urgent: false }
}

function getBookingId(booking: any): string {
  return booking.bookingId ?? booking.id
}

function getCustomerName(booking: any): string {
  return (
    booking.customerName ?? booking.plannedParticipants?.[0] ?? "Khách hàng"
  )
}

function getCustomerPhone(booking: any): string | null {
  return booking.customerPhone ?? null
}

function getSlotStart(booking: any): string {
  return booking.startTime ?? booking.slotStart
}

function addMinutesToTime(time: string, minutes: number): string {
  const [hour, minute] = time.split(":").map(Number)
  const total = hour * 60 + minute + minutes
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}

function getSlotEnd(booking: any): string {
  return booking.endTime ?? booking.slotEnd
}

function getPlayMode(booking: any): string {
  return booking.mode ?? booking.playMode
}

function isContestBooking(booking: any): boolean {
  return booking.source === "CONTEST" || Boolean(booking.contestId)
}

function getTrackLabel(booking: any): string | null {
  return booking.trackTypeName ?? booking.trackName ?? booking.trackType ?? null
}

function getParticipantCount(booking: any): number {
  return booking.participantCount ?? booking.plannedParticipants?.length ?? 0
}

function getVehicleCount(booking: any): number {
  return booking.vehicleCount ?? booking.plannedVehicles?.length ?? 0
}

function getBookingStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING: "Chờ thanh toán",
    CONFIRMED: "Đã xác nhận",
    NO_SHOW: "Không đến",
    COMPLETED: "Hoàn thành",
    CANCELLED: "Đã hủy",
  }
  return labels[status] ?? "Không xác định"
}



export default function StaffTodayBookingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { assignedCafeId, createWalkInBooking, startCheckIn } =
    useStaffOperations()
  const [nowTime, setNowTime] = useState(() => Date.now())

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowTime(Date.now()), 30_000)

    return () => window.clearInterval(intervalId)
  }, [])

  // Primary navigation tab
  const [activeTab, setActiveTab] = useState<TabType>("LIST")

  // QR check-in panel state
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false)
  const [qrBookingId, setQrBookingId] = useState("")
  const [qrInputValue, setQrInputValue] = useState("")

  // Walk-in Bank Transfer QR Modal state
  const [bankTransferModalData, setBankTransferModalData] = useState<{
    bookingId: string
    bookingCode?: string
    bankTransfer: BankTransferCheckout
    autoCheckIn: boolean
  } | null>(null)

  // Walk-in Cash Confirmation Modal state
  const [cashModalData, setCashModalData] = useState<{
    customerName: string
    customerPhone: string
    playMode: "RENTAL" | "BYOC"
    trackName: string
    slotCount: number
    slotFeeTotal: number
    vehicleCount: number
    rentalFeeTotal: number
    fnbTotalAmount: number
    totalAmount: number
    autoCheckIn: boolean
    payload: any
  } | null>(null)

  const {
    data: qrBookingData,
    isLoading: qrBookingLoading,
    isError: qrBookingError,
  } = useQuery({
    queryKey: bookingQueryKeys.detail(qrBookingId),
    queryFn: () => bookingApi.getBooking(qrBookingId),
    enabled: !!qrBookingId,
    retry: false,
  })

  // List states
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("ALL")
  const [playModeFilter, setPlayModeFilter] = useState<"ALL" | "RENTAL" | "BYOC">("ALL")

  const getTodayString = () => {
    const d = new Date()
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, "0")
    const date = String(d.getDate()).padStart(2, "0")
    return `${year}-${month}-${date}`
  }

  const todayDate = getTodayString()
  const [listDate, setListDate] = useState(todayDate)

  const shiftListDate = (offset: number) => {
    const [year, month, day] = listDate.split("-").map(Number)
    const next = new Date(Date.UTC(year, month - 1, day + offset))
    setListDate(next.toISOString().slice(0, 10))
  }

  const listDateLabel = new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${listDate}T00:00:00`))

  const { data: displayBookings = [], isLoading: loadingBookings } = useQuery({
    queryKey: staffQueryKeys.bookings(listDate),
    queryFn: () => staffApi.getBookings(listDate),
    refetchInterval: listDate === todayDate ? 30_000 : false,
    refetchOnWindowFocus: true,
  })

  // Walk-in form states
  const [walkinStep, setWalkinStep] = useState<1 | 2 | 3 | 4>(1)
  const [isWalkinSubmitting, setIsWalkinSubmitting] = useState(false)
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [fieldErrors, setFieldErrors] = useState<WalkInFieldErrors>({})
  const [playMode, setPlayMode] = useState<"RENTAL" | "BYOC">("RENTAL")
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "BANK_TRANSFER">(
    "CASH",
  )
  const [selectedTrackCode, setSelectedTrackCode] = useState("")
  const [selectedTrackName, setSelectedTrackName] = useState("")
  const [selectedSlot, setSelectedSlot] = useState("")
  const [selectedSlotEnd, setSelectedSlotEnd] = useState<string | null>(null)
  const [selectedVehicles, setSelectedVehicles] = useState<VehicleUnit[]>([])
  const [selectedFnbCart, setSelectedFnbCart] = useState<
    Record<
      string,
      {
        menuItem: MenuItem
        variantId?: string
        variantName?: string
        unitPrice: number
        quantity: number
      }
    >
  >({})
  const [fnbSearchTerm, setFnbSearchTerm] = useState("")
  const [fnbSelectedCategory, setFnbSelectedCategory] = useState<string>("ALL")
  const bookingDate = todayDate

  // Cafe details — dùng useQuery thay vì useEffect+setState
  const { data: cafeDetails, isLoading: isLoadingCafe } = useQuery({
    queryKey: cafeQueryKeys.detail(assignedCafeId ?? ""),
    queryFn: () => cafeApi.getCafe(assignedCafeId!),
    enabled: !!assignedCafeId,
    staleTime: 5 * 60 * 1000, // 5 phút
  })

  // Only load physical units that are currently in AVAILABLE state.
  const { data: availableVehicles = [] } =
    useVehicleUnits(assignedCafeId ?? "", { status: VehicleStatus.AVAILABLE })

  // Track configs (must be before useEffects that reference it)
  const { data: trackConfigs = [] } = useTrackConfigs(assignedCafeId ?? "")

  // F&B Menu Query for Walk-in pre-orders
  const { data: fnbMenuData, isLoading: isLoadingFnbMenu } = useQuery({
    queryKey: menuQueryKeys.list(assignedCafeId ?? "", { available: true }),
    queryFn: () => menuApi.listMenuItems(assignedCafeId!, { available: true }),
    enabled: !!assignedCafeId,
    staleTime: 5 * 60 * 1000,
  })

  const fnbMenuItems = useMemo(() => fnbMenuData?.data || [], [fnbMenuData])

  const fnbCategories = useMemo(() => {
    const list: string[] = []
    fnbMenuItems.forEach((item) => {
      if (item.categoryName && !list.includes(item.categoryName)) {
        list.push(item.categoryName)
      }
    })
    return list
  }, [fnbMenuItems])

  const filteredFnbMenuItems = useMemo(() => {
    return fnbMenuItems.filter((item) => {
      const matchCat =
        fnbSelectedCategory === "ALL" ||
        item.categoryName === fnbSelectedCategory
      const term = fnbSearchTerm.trim().toLowerCase()
      const matchTerm =
        !term ||
        item.name.toLowerCase().includes(term) ||
        (item.categoryName && item.categoryName.toLowerCase().includes(term))
      return matchCat && matchTerm
    })
  }, [fnbMenuItems, fnbSearchTerm, fnbSelectedCategory])

  const handleUpdateFnbQuantity = (
    menuItem: MenuItem,
    variantId?: string,
    variantName?: string,
    unitPrice?: number,
    delta: number = 1,
  ) => {
    const key = variantId ? `${menuItem.id}::${variantId}` : menuItem.id
    const price = unitPrice ?? Number(menuItem.price)

    setSelectedFnbCart((prev) => {
      const existing = prev[key]
      const currentQty = existing ? existing.quantity : 0
      const newQty = currentQty + delta

      if (newQty <= 0) {
        const copy = { ...prev }
        delete copy[key]
        return copy
      }

      return {
        ...prev,
        [key]: {
          menuItem,
          variantId,
          variantName,
          unitPrice: price,
          quantity: newQty,
        },
      }
    })
  }

  // Sync tab with URL query parameter
  useEffect(() => {
    const tabParam = searchParams.get("tab")
    if (tabParam === "walkin") {
      setActiveTab("WALKIN")
    } else {
      setActiveTab("LIST")
    }
  }, [searchParams])

  // Get URL pre-selection data for track from dashboard
  useEffect(() => {
    if (activeTab === "WALKIN") {
      const trackNameUrl = searchParams.get("track")
      const trackTypeUrl = searchParams.get("type")
      if (trackNameUrl && trackTypeUrl) {
        setSelectedTrackName(trackNameUrl)
        setSelectedTrackCode(trackTypeUrl)
      } else {
        const activeConfigs = trackConfigs.filter((c) => c.is_active)
        if (activeConfigs.length > 0 && !selectedTrackCode) {
          setSelectedTrackName(activeConfigs[0].track_type?.name ?? "")
          setSelectedTrackCode(activeConfigs[0].track_type?.code ?? "")
        }
      }
    }
  }, [activeTab, selectedTrackCode, trackConfigs, searchParams])

  // Reset Walk-in form
  const resetWalkinForm = () => {
    setCustomerName("")
    setCustomerPhone("")
    setFieldErrors({})
    setPlayMode("RENTAL")
    setPaymentMethod("CASH")
    setSelectedVehicles([])
    setSelectedSlot("")
    setSelectedSlotEnd(null)
    setSelectedFnbCart({})
    setFnbSearchTerm("")
    setFnbSelectedCategory("ALL")
    setSearchParams({})
  }

  const selectedTrackConfig = useMemo(() => {
    return (
      trackConfigs.find((c) => c.track_type?.code === selectedTrackCode) || null
    )
  }, [trackConfigs, selectedTrackCode])

  const { openHour, closeHour, isClosedToday, isScheduleConfigured } =
    useMemo(() => {
      const DAY_KEYS = [
        "sun",
        "mon",
        "tue",
        "wed",
        "thu",
        "fri",
        "sat",
      ] as const
      const dayKey = DAY_KEYS[new Date().getDay()]
      const hours = (
        cafeDetails?.operatingHours as
          | Record<
              string,
              { open?: string; close?: string; is_closed?: boolean }
            >
          | undefined
      )?.[dayKey]
      const parseHour = (t?: string) => {
        if (!t) return null
        const parsed = parseInt(t.split(":")[0], 10)
        return Number.isInteger(parsed) && parsed >= 0 && parsed <= 24
          ? parsed
          : null
      }
      const configuredOpenHour = parseHour(hours?.open)
      let configuredCloseHour = parseHour(hours?.close)
      // midnight (00:00) or any close ≤ open means next-day close → add 24
      if (configuredOpenHour !== null && configuredCloseHour !== null && configuredCloseHour <= configuredOpenHour) {
        configuredCloseHour = configuredCloseHour + 24
      }
      const slotDurationMinutes = Number(cafeDetails?.slotDurationMinutes)
      return {
        openHour: configuredOpenHour ?? 0,
        closeHour: configuredCloseHour ?? 0,
        isClosedToday: !!hours?.is_closed,
        isScheduleConfigured:
          configuredOpenHour !== null &&
          configuredCloseHour !== null &&
          configuredCloseHour > configuredOpenHour &&
          Number.isInteger(slotDurationMinutes) &&
          slotDurationMinutes > 0,
      }
    }, [cafeDetails])

  const slotDuration = Number(cafeDetails?.slotDurationMinutes) || 0
  const selectedSlotEndTime = selectedSlot
    ? (selectedSlotEnd ?? addMinutesToTime(selectedSlot, slotDuration))
    : ""
  const selectedSlotStartForAvailability = selectedSlot
    ? toVietnamSlotISOString(bookingDate, selectedSlot)
    : ""
  const selectedSlotEndForAvailability = selectedSlotEndTime
    ? toVietnamSlotISOString(bookingDate, selectedSlotEndTime)
    : ""

  const { data: dailyAvailability, isLoading: isLoadingAvailability } =
    useDailyAvailability(
      assignedCafeId ?? "",
      bookingDate,
      openHour,
      closeHour,
      selectedTrackConfig?.id || undefined,
    )

  const {
    data: selectedSlotAvailability,
    isLoading: isLoadingSelectedSlotAvailability,
  } = useAvailability(
    assignedCafeId ?? "",
    {
      slot_start: selectedSlotStartForAvailability,
      slot_end: selectedSlotEndForAvailability,
      play_mode: "RENTAL",
      ...(selectedTrackConfig
        ? { track_config_id: selectedTrackConfig.id }
        : {}),
    },
    !!selectedSlot && !!selectedTrackConfig,
  )

  const selectableVehicleIds = useMemo(
    () =>
      new Set(
        selectedSlotAvailability?.vehicles.map(
          (vehicle) => vehicle.vehicle_id,
        ) ?? [],
      ),
    [selectedSlotAvailability],
  )
  const selectableVehicles = useMemo(
    () =>
      availableVehicles.filter(
        (vehicle) =>
          selectableVehicleIds.has(vehicle.id) &&
          vehicle.status === VehicleStatus.AVAILABLE,
      ),
    [availableVehicles, selectableVehicleIds],
  )
  const selectedSelectableVehicles = useMemo(
    () =>
      selectedVehicles.filter((vehicle) =>
        selectableVehicleIds.has(vehicle.id),
      ),
    [selectedVehicles, selectableVehicleIds],
  )

  const groupedVehiclesByCatalog = useMemo(() => {
    const map = new Map<
      string,
      {
        catalog: VehicleCatalog
        units: VehicleUnit[]
      }
    >()

    selectableVehicles.forEach((unit) => {
      const catId = unit.catalog?.id || unit.catalogId || "unknown"
      if (!map.has(catId)) {
        map.set(catId, {
            catalog: unit.catalog || {
              id: catId,
              name: "Mẫu xe chưa phân loại",
              hourlyRate: 0,
              securityDeposit: 0,
              tier: "STANDARD",
              compatibleTrackTypes: [],
              images: [],
              createdAt: "",
              updatedAt: "",
              cafeId: "",
            },
          units: [],
        })
      }
      map.get(catId)!.units.push(unit)
    })

    return Array.from(map.values())
  }, [selectableVehicles])

  useEffect(() => {
    if (!selectedSlotAvailability) return
    setSelectedVehicles((current) => {
      const next = current.filter((vehicle) =>
        selectableVehicleIds.has(vehicle.id),
      )
      return next.length === current.length ? current : next
    })
  }, [selectedSlotAvailability, selectableVehicleIds])

  const slots = useMemo<DailySlot[]>(() => {
    if (!dailyAvailability) return []
    return buildSlotsFromAvailability(dailyAvailability, playMode)
  }, [dailyAvailability, playMode])

  const calculateDurationFromSlots = (
    start: string,
    end: string | null,
  ): number => {
    if (!start) return 0
    const [startH, startM] = start.split(":").map(Number)
    if (!slotDuration) return 0
    if (!end) return slotDuration
    const [endH, endM] = end.split(":").map(Number)
    const startTotal = startH * 60 + startM
    const endTotal = endH * 60 + endM
    return Math.max(slotDuration, endTotal - startTotal)
  }

  // Calculate pricing values
  // Không dùng fallback giá giả — nếu chưa load cafe thì hiện 0
  const slotFeeRate = cafeDetails ? Number(cafeDetails.slotFeeRate) || 0 : 0
  const computedDuration = calculateDurationFromSlots(
    selectedSlot,
    selectedSlotEnd,
  )
  const slotCount =
    slotDuration > 0 ? Math.ceil(computedDuration / slotDuration) : 0
  const slotFeeTotal = slotCount * slotFeeRate

  // Không dùng fallback giá giả — nếu catalog chưa có hourlyRate thì tính 0
  const rentalFeeTotal = selectedSelectableVehicles.reduce((total, unit) => {
    const hourly = unit.catalog?.hourlyRate ?? 0
    return total + hourly * (computedDuration / 60)
  }, 0)

  const fnbTotalAmount = useMemo(() => {
    return Object.values(selectedFnbCart).reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    )
  }, [selectedFnbCart])

  const totalAmount = slotFeeTotal + rentalFeeTotal + fnbTotalAmount

  // Submit Walk-in Form
  const handleWalkinSubmit = async (e: React.FormEvent, autoCheckIn: boolean = true) => {
    e.preventDefault()
    if (isWalkinSubmitting) return

    const slotStart = selectedSlot
      ? toVietnamSlotISOString(bookingDate, selectedSlot)
      : ""
    const slotEnd = selectedSlotEndTime
      ? toVietnamSlotISOString(bookingDate, selectedSlotEndTime)
      : ""
    const parsed = walkInFormSchema.safeParse({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      playMode,
      paymentMethod,
      trackTypeId: selectedTrackConfig?.track_type_id ?? "",
      slotStart,
      slotEnd,
      slotDurationMinutes: slotDuration,
      scheduleConfigured: isScheduleConfigured,
      vehicleIds: selectedSelectableVehicles.map((vehicle) => vehicle.id),
    })

    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors
      const fieldErrorMap: WalkInFieldErrors = {
        customerName: errors.customerName?.[0],
        customerPhone: errors.customerPhone?.[0],
        playMode: errors.playMode?.[0],
        paymentMethod: errors.paymentMethod?.[0],
        trackTypeId: errors.trackTypeId?.[0],
        slotStart: errors.slotStart?.[0],
        slotEnd: errors.slotEnd?.[0],
        slotDurationMinutes: errors.slotDurationMinutes?.[0],
        scheduleConfigured: errors.scheduleConfigured?.[0],
        vehicleIds: errors.vehicleIds?.[0],
      }
      setFieldErrors(fieldErrorMap)

      const firstErrMsg = Object.values(errors).flat()[0]
      if (firstErrMsg) {
        toast.error(firstErrMsg)
      }

      if (
        errors.customerName ||
        errors.customerPhone ||
        errors.slotStart ||
        errors.slotEnd ||
        errors.trackTypeId ||
        errors.scheduleConfigured
      ) {
        setWalkinStep(1)
      } else if (errors.vehicleIds) {
        setWalkinStep(2)
      }
      return
    }

    if (
      parsed.data.playMode === "RENTAL" &&
      (isLoadingSelectedSlotAvailability || !selectedSlotAvailability)
    ) {
      const msg =
        "Đang kiểm tra xe trống cho khung giờ đã chọn. Vui lòng thử lại ngay sau đó."
      setFieldErrors({ vehicleIds: msg })
      toast.error(msg)
      setWalkinStep(2)
      return
    }
    if (
      parsed.data.playMode === "RENTAL" &&
      parsed.data.vehicleIds.some(
        (vehicleId) => !selectableVehicleIds.has(vehicleId),
      )
    ) {
      const msg = "Một hoặc nhiều xe vừa không còn trống. Vui lòng chọn lại."
      setFieldErrors({ vehicleIds: msg })
      toast.error(msg)
      setWalkinStep(2)
      return
    }

    setFieldErrors({})

    const fnbItems = Object.values(selectedFnbCart).map((item) => ({
      menu_item_id: item.menuItem.id,
      variant_id: item.variantId,
      quantity: item.quantity,
    }))

    const payload = {
      playMode: parsed.data.playMode,
      trackTypeId: parsed.data.trackTypeId,
      slotStart: parsed.data.slotStart,
      slotEnd: parsed.data.slotEnd,
      paymentMethod: parsed.data.paymentMethod,
      vehicleIds: parsed.data.vehicleIds,
      participants: [
        {
          guest_name: parsed.data.customerName,
          guest_phone: parsed.data.customerPhone,
          participant_type: "WALK_IN_GUEST",
        },
      ],
      fnbItems: fnbItems.length > 0 ? fnbItems : undefined,
    }

    // Nếu chọn TIỀN MẶT: Bật Modal xác nhận đã nhận đủ tiền mặt từ khách trước khi tạo đơn
    if (parsed.data.paymentMethod === "CASH") {
      setCashModalData({
        customerName: parsed.data.customerName,
        customerPhone: parsed.data.customerPhone,
        playMode: parsed.data.playMode,
        trackName: selectedTrackName || "Đường đua đã chọn",
        slotCount,
        slotFeeTotal,
        vehicleCount: selectedSelectableVehicles.length,
        rentalFeeTotal,
        fnbTotalAmount,
        totalAmount,
        autoCheckIn,
        payload,
      })
      return
    }

    // Nếu chọn CHUYỂN KHOẢN: Gọi API tạo đơn giữ chỗ PENDING và mở Modal QR
    setIsWalkinSubmitting(true)

    try {
      const res = await createWalkInBooking(payload)

      if (res?.bookingId) {
        if (res.bankTransfer && parsed.data.paymentMethod === "BANK_TRANSFER") {
          setBankTransferModalData({
            bookingId: res.bookingId,
            bookingCode: res.bookingCode,
            bankTransfer: res.bankTransfer,
            autoCheckIn,
          })
          return
        }

        if (autoCheckIn) {
          toast.info("Đang khởi tạo ca chơi cho khách...")
          const checkInRes = await startCheckIn(res.bookingId)
          const sessionId = checkInRes?.sessionId ?? checkInRes?.id
          if (sessionId) {
            resetWalkinForm()
            navigate(`/staff/sessions/${sessionId}`)
            return
          }
        }
        resetWalkinForm()
        setActiveTab("LIST")
        setSearchParams({})
      }
    } catch (err: any) {
      toast.error(err?.message || "Không thể tạo đơn đặt lịch")
    } finally {
      setIsWalkinSubmitting(false)
    }
  }

  // Xác nhận đã thu đủ tiền mặt từ WalkInCashConfirmationModal
  const handleConfirmCashPayment = async () => {
    if (!cashModalData || isWalkinSubmitting) return
    try {
      setIsWalkinSubmitting(true)
      const res = await createWalkInBooking(cashModalData.payload)
      if (res?.bookingId) {
        toast.success("Tạo đơn vãng lai và thu tiền mặt thành công!")
        const autoCheckIn = cashModalData.autoCheckIn
        setCashModalData(null)
        if (autoCheckIn) {
          toast.info("Đang khởi tạo ca chơi cho khách...")
          const checkInRes = await startCheckIn(res.bookingId)
          const sessionId = checkInRes?.sessionId ?? checkInRes?.id
          if (sessionId) {
            resetWalkinForm()
            navigate(`/staff/sessions/${sessionId}`)
            return
          }
        }
        resetWalkinForm()
        setActiveTab("LIST")
        setSearchParams({})
      }
    } catch (err: any) {
      toast.error(err?.message || "Không thể tạo đơn đặt lịch")
    } finally {
      setIsWalkinSubmitting(false)
    }
  }

  // Hủy đơn PENDING để giải phóng giữ chỗ xe và slot
  const handleCancelPendingBooking = async (bookingId: string) => {
    try {
      await bookingApi.cancelBooking(bookingId, "Nhân viên hủy đơn để nhả giữ chỗ")
      toast.success("Đã hủy đơn và giải phóng giữ chỗ xe/sân!")
      setBankTransferModalData(null)
      queryClient.invalidateQueries({ queryKey: staffQueryKeys.todayBookings() })
      queryClient.invalidateQueries({ queryKey: ["cafe-slot-availability"] })
      queryClient.invalidateQueries({ queryKey: ["cafe-day-slots"] })
    } catch (err: any) {
      toast.error(err?.message || "Không thể hủy đơn đặt lịch")
    }
  }

  // Mở lại Modal QR từ danh sách đơn hôm nay
  const handleOpenPendingQrModal = async (targetBookingId: string) => {
    if (!targetBookingId) {
      toast.error("Không tìm thấy mã đơn đặt lịch")
      return
    }
    try {
      toast.info("Đang tải mã QR chuyển khoản...")
      const checkoutRes = await bookingApi.createCheckout(targetBookingId, "bank_transfer")
      if (checkoutRes.bank_transfer) {
        setBankTransferModalData({
          bookingId: targetBookingId,
          bookingCode: `RCF-${targetBookingId.substring(0, 4).toUpperCase()}`,
          bankTransfer: checkoutRes.bank_transfer,
          autoCheckIn: true,
        })
      } else {
        toast.error("Không tìm thấy thông tin chuyển khoản cho đơn này")
      }
    } catch (err: any) {
      toast.error(err?.message || "Không thể mở mã QR chuyển khoản")
    }
  }

  const handleBankTransferSuccess = async (
    bookingId: string,
    autoCheckIn: boolean,
  ) => {
    setBankTransferModalData(null)
    if (autoCheckIn) {
      toast.info("Đang khởi tạo ca chơi cho khách...")
      const checkInRes = await startCheckIn(bookingId)
      const sessionId = checkInRes?.sessionId ?? checkInRes?.id
      if (sessionId) {
        resetWalkinForm()
        navigate(`/staff/sessions/${sessionId}`)
        return
      }
    }
    resetWalkinForm()
    setActiveTab("LIST")
    setSearchParams({})
  }

  const handleQrScanDecoded = (rawCode: string) => {
    let cleanCode = rawCode.trim()
    if (cleanCode.includes("/")) {
      const parts = cleanCode.split("/")
      cleanCode = parts[parts.length - 1] || cleanCode
    }
    const lookupCode = cleanCode.replace(/^#/, "")

    const match = displayBookings.find(
      (b: any) =>
        b.id?.toLowerCase() === cleanCode.toLowerCase() ||
        b.bookingId?.toLowerCase() === cleanCode.toLowerCase() ||
        b.id?.slice(0, 8).toLowerCase() === lookupCode.toLowerCase() ||
        (b as any).shortCode?.toLowerCase() === cleanCode.toLowerCase(),
    )

    const resolvedId = match ? (match.id || (match as any).bookingId) : cleanCode

    setQrBookingId(resolvedId)
    setQrInputValue(cleanCode)
  }

  const handleQRSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!qrInputValue.trim()) return
    handleQrScanDecoded(qrInputValue)
  }

  const handleStartCheckIn = async (booking: CustomerBookingDetail | any) => {
    const isExpired = isCheckInDeadlineExpired(getSlotStart(booking), nowTime, {
      source: booking.source,
      slotEnd: booking.slotEnd ?? booking.slot_end,
      createdAt: booking.createdAt ?? booking.created_at,
    })

    if (isExpired) {
      toast.error("Đơn đã quá thời hạn nhận xe")
      return
    }

    const startedSession = await startCheckIn(getBookingId(booking))
    const sessionId = startedSession?.sessionId ?? startedSession?.id
    if (sessionId) {
      navigate(`/staff/inspections/${sessionId}?type=CHECK_IN`)
    }
  }

  const getStatusSortPriority = (booking: any): number => {
    const session = booking.sessions?.find((s: any) =>
      ["ACTIVE", "EXTENDING", "CHECKING_OUT", "CHECKED_IN"].includes(s.status),
    )
    if (session?.status === "ACTIVE" || session?.status === "EXTENDING")
      return 0
    if (session?.status === "CHECKING_OUT" || session?.status === "CHECKED_IN")
      return 1
    if (booking.status === "CONFIRMED") return 2
    if (booking.status === "PENDING") return 3
    const hasPending = booking.payment_components?.some(
      (c: any) => c.status === "PENDING",
    )
    if (booking.status === "COMPLETED" && hasPending) return 4
    if (booking.status === "COMPLETED") return 5
    return 6 // CANCELLED, NO_SHOW
  }

  const visibleBookings = displayBookings
    .filter((booking: any) => {
      const matchSearch =
        searchTerm === "" ||
        getCustomerName(booking)
          .toLowerCase()
          .includes(searchTerm.toLowerCase())
      const matchStatus =
        statusFilter === "ALL" || booking.status === statusFilter
      const matchPlayMode =
        playModeFilter === "ALL" || getPlayMode(booking) === playModeFilter
      return matchSearch && matchStatus && matchPlayMode
    })
    .sort((a: any, b: any) => {
      const priorityDiff = getStatusSortPriority(a) - getStatusSortPriority(b)
      if (priorityDiff !== 0) return priorityDiff
      return (
        new Date(getSlotStart(a)).getTime() -
        new Date(getSlotStart(b)).getTime()
      )
    })

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <StaffHeader
        title={
          activeTab === "LIST"
            ? "Quản Lý Đặt Lịch"
            : "Đăng Ký Khách Vãng Lai"
        }
        subtitle={
          activeTab === "LIST"
            ? "Tra cứu lịch đã qua, hôm nay và các lượt đặt sắp tới của cơ sở"
            : "Thiết lập nhanh ca đua trực tiếp cho khách hàng vãng lai thanh toán tại quầy"
        }
      />

      {/* 2. Custom Styled Tabs */}
      <div className="flex border-b border-[#e5e2e1] gap-2">
        <button
          onClick={() => {
            setActiveTab("LIST")
            setSearchParams({})
          }}
          className={cn(
            "pb-3 text-sm font-bold px-4 transition-all border-b-2",
            activeTab === "LIST"
              ? "border-[#ea580c] text-[#ea580c]"
              : "border-transparent text-[#6b7280] hover:text-[#1c1b1b]",
          )}
        >
          Lịch đặt
        </button>
        <button
          onClick={() => {
            setActiveTab("WALKIN")
            setSearchParams({ tab: "walkin" })
          }}
          className={cn(
            "pb-3 text-sm font-bold px-4 transition-all border-b-2 flex items-center gap-1.5",
            activeTab === "WALKIN"
              ? "border-[#ea580c] text-[#ea580c]"
              : "border-transparent text-[#6b7280] hover:text-[#1c1b1b]",
          )}
        >
          <Plus className="size-4" />
          Tạo đơn trực tiếp tại quầy
        </button>
      </div>

      {/* 3. TODAY BOOKINGS LIST VIEW */}
      {activeTab === "LIST" && (
        <div className="space-y-4">
          <StaffCard className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#a09e9d]">Ngày xem lịch</p>
              <p className="mt-1 text-base font-extrabold capitalize text-[#1c1b1b]">{listDateLabel}</p>
              {listDate === todayDate && (
                <p className="mt-0.5 text-xs font-semibold text-emerald-700">Đang hiển thị lịch hôm nay</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StaffButton type="button" size="sm" variant="outline" onClick={() => shiftListDate(-1)}>
                Hôm trước
              </StaffButton>
              <input
                type="date"
                value={listDate}
                onChange={(event) => setListDate(event.target.value)}
                className="h-9 rounded-lg border border-[#e5e2e1] bg-white px-2 text-xs font-bold text-[#1c1b1b] focus:border-[#ea580c] focus:outline-none"
              />
              <StaffButton type="button" size="sm" variant="outline" onClick={() => shiftListDate(1)}>
                Hôm sau
              </StaffButton>
              {listDate !== todayDate && (
                <StaffButton type="button" size="sm" onClick={() => setListDate(todayDate)}>
                  Hôm nay
                </StaffButton>
              )}
            </div>
          </StaffCard>

          {/* SEARCH & FILTERS BAR */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3.5 top-3.5 size-4 text-[#a09e9d]" />
              <input
                type="text"
                placeholder="Tìm tên khách hàng..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-[#e5e2e1] bg-white pl-10 pr-4 py-2.5 text-sm font-semibold placeholder-[#a09e9d] text-[#1c1b1b] focus:outline-none focus:ring-1 focus:ring-[#ea580c] focus:border-[#ea580c]"
              />
            </div>

            {/* Filter tags list */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              {[
                { code: "ALL", label: "Tất cả" },
                { code: "PENDING", label: "Chờ thanh toán" },
                { code: "CONFIRMED", label: "Đã xác nhận" },
                { code: "NO_SHOW", label: "Không đến" },
                { code: "COMPLETED", label: "Hoàn thành" },
                { code: "CANCELLED", label: "Đã hủy" },
              ].map((filter) => (
                <button
                  key={filter.code}
                  onClick={() => setStatusFilter(filter.code)}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-xs font-bold transition-all border shrink-0",
                    statusFilter === filter.code
                      ? "bg-[#ea580c] text-white border-[#ea580c] shadow-sm"
                      : "bg-white text-[#6b7280] border-[#e5e2e1] hover:bg-[#fcf8f8] hover:text-[#1c1b1b]",
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[#e5e2e1] bg-white p-2">
            <span className="px-1.5 text-xs font-bold text-[#6b7280]">Hình thức chơi</span>
            {[
              { code: "ALL", label: "Tất cả loại đơn" },
              { code: "RENTAL", label: "Thuê xe của quán" },
              { code: "BYOC", label: "Mang xe cá nhân" },
            ].map((filter) => (
              <button
                key={filter.code}
                onClick={() => setPlayModeFilter(filter.code as "ALL" | "RENTAL" | "BYOC")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-bold transition-all",
                  playModeFilter === filter.code
                    ? "bg-[#ea580c] text-white shadow-sm"
                    : "text-[#6b7280] hover:bg-[#fcf8f8] hover:text-[#1c1b1b]",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* QR CHECK-IN PANEL */}
          <StaffCard className="space-y-4 p-5" glow>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#ea580c]">
                <QrCode className="size-5" />
                <h3 className="font-bold text-[#1c1b1b] text-base">Quét mã QR nhận xe</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCameraScannerOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#ea580c] bg-[#fff3eb] hover:bg-[#ffe5d4] rounded-lg transition-colors border border-[#ffdbca] shadow-xs cursor-pointer"
              >
                <Camera className="size-4" />
                <span>Mở Camera quét</span>
              </button>
            </div>

            <form onSubmit={handleQRSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Nhập mã đơn đặt lịch (ví dụ: RCF-8829 hoặc #2E382080)"
                  value={qrInputValue}
                  onChange={(e) => setQrInputValue(e.target.value)}
                  className="w-full rounded-lg border border-[#e5e2e1] bg-white px-4 py-2.5 pr-11 text-sm font-semibold text-[#1c1b1b] focus:border-[#ea580c] focus:outline-none focus:ring-1 focus:ring-[#ea580c] placeholder-[#a09e9d] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setIsCameraScannerOpen(true)}
                  title="Mở camera quét mã QR"
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex size-7 items-center justify-center rounded-md text-[#747878] hover:bg-[#fff3eb] hover:text-[#ea580c] transition-colors cursor-pointer"
                >
                  <Camera className="size-4" />
                </button>
              </div>
              <StaffButton type="submit" variant="primary">
                Tìm
              </StaffButton>
              {qrBookingId && (
                <button
                  type="button"
                  onClick={() => {
                    setQrBookingId("")
                    setQrInputValue("")
                  }}
                  className="rounded-lg border border-[#e5e2e1] text-[#6b7280] px-3 py-2 hover:bg-[#fcf8f8] transition-colors cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              )}
            </form>
            <p className="text-xs text-[#6b7280] leading-relaxed">
              Nhập mã đơn, dùng máy quét hoặc bấm <strong>Mở Camera quét</strong> để nhận diện nhanh mã QR của khách và mở giao diện bàn giao xe.
            </p>

            {qrBookingId && (
              <div className="rounded-xl border border-[#e5e2e1] overflow-hidden">
                {qrBookingLoading && (
                  <div className="flex items-center justify-center py-6 gap-2 text-sm text-[#6b7280]">
                    <Loader2 className="size-4 animate-spin" />
                    Đang tải thông tin đơn đặt lịch...
                  </div>
                )}
                {qrBookingError && (
                  <div className="py-4 px-4 text-sm text-red-600 font-semibold">
                    Không tìm thấy đơn đặt lịch. Kiểm tra lại mã QR hoặc mã đơn.
                  </div>
                )}
                {qrBookingData && (
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-[#a09e9d]">
                        #{qrBookingData.id.slice(0, 8).toUpperCase()}
                      </span>
                      <StaffBadge
                        variant={
                          qrBookingData.status === "CONFIRMED"
                            ? "info"
                            : qrBookingData.status === "COMPLETED"
                              ? "success"
                              : "neutral"
                        }
                      >
                        {getBookingStatusLabel(qrBookingData.status)}
                      </StaffBadge>
                    </div>
                    <div className="text-xs space-y-1 text-[#4c4a49] font-semibold">
                      <p>
                        <span className="text-[#a09e9d]">Khách:</span>{" "}
                        {qrBookingData.participants?.[0]?.resolvedName ?? "—"}
                      </p>
                      <p>
                        <span className="text-[#a09e9d]">Giờ:</span>{" "}
                        {new Date(qrBookingData.slotStart).toLocaleTimeString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        –{" "}
                        {new Date(qrBookingData.slotEnd).toLocaleTimeString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      <p>
                        <span className="text-[#a09e9d]">Chế độ:</span>{" "}
                        {qrBookingData.playMode === "RENTAL" ? "Thuê xe" : "Xe tự mang"}
                      </p>
                    </div>
                    {qrBookingData.status === "CONFIRMED" &&
                      isCheckInDeadlineExpired(qrBookingData.slotStart, nowTime, {
                        source: (qrBookingData as any).source,
                        slotEnd: qrBookingData.slotEnd,
                        createdAt: qrBookingData.createdAt,
                      }) && (
                        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">
                          Đơn đã quá thời hạn nhận xe 30 phút kể từ giờ bắt đầu.
                        </div>
                      )}
                    {qrBookingData.status !== "CONFIRMED" && (
                      <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">
                        {qrBookingData.status === "COMPLETED"
                          ? "Đơn đặt lịch này đã hoàn thành."
                          : qrBookingData.status === "CANCELLED"
                            ? "Đơn đặt lịch này đã bị hủy."
                            : qrBookingData.status === "NO_SHOW"
                              ? "Đơn đặt lịch này đã quá hạn nhận xe."
                              : qrBookingData.status === "PENDING"
                                ? "Đơn đặt lịch chưa thanh toán, không thể nhận xe."
                                : "Không thể nhận xe với trạng thái hiện tại."}
                      </div>
                    )}
                    {qrBookingData.status === "CONFIRMED" &&
                      !isCheckInDeadlineExpired(qrBookingData.slotStart, nowTime, {
                        source: (qrBookingData as any).source,
                        slotEnd: qrBookingData.slotEnd,
                        createdAt: qrBookingData.createdAt,
                      }) &&
                      qrBookingData.session && (
                        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-700">
                          Đã nhận xe lúc{" "}
                          {qrBookingData.session.actualStartAt
                            ? new Date(qrBookingData.session.actualStartAt).toLocaleTimeString("vi-VN")
                            : "—"}
                          .
                        </div>
                      )}
                    {qrBookingData.status === "CONFIRMED" &&
                      !isCheckInDeadlineExpired(qrBookingData.slotStart, nowTime, {
                        source: (qrBookingData as any).source,
                        slotEnd: qrBookingData.slotEnd,
                        createdAt: qrBookingData.createdAt,
                      }) &&
                      !qrBookingData.session && (
                        <StaffButton
                          onClick={() => handleStartCheckIn(qrBookingData)}
                          variant="primary"
                          className="w-full"
                        >
                          Xác nhận nhận xe
                          <ArrowRight className="size-3.5" />
                        </StaffButton>
                      )}
                  </div>
                )}
              </div>
            )}
          </StaffCard>

          {/* BOOKINGS CARDS GRID */}
          {loadingBookings ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-[#a09e9d]" />
            </div>
          ) : (
            <div className="grid gap-4">
              {visibleBookings.map((b: any) => {
                const bookingId = getBookingId(b)
                const customerName = getCustomerName(b)
                const customerPhone = getCustomerPhone(b)
                const slotStart = getSlotStart(b)
                const slotEnd = getSlotEnd(b)
                const playMode = getPlayMode(b)
                const trackLabel = getTrackLabel(b)
                const participantCount = getParticipantCount(b)
                const vehicleCount = getVehicleCount(b)
                const activeSession = ![
                  "COMPLETED",
                  "CANCELLED",
                  "NO_SHOW",
                ].includes(b.status)
                  ? b.sessions?.find((session: any) =>
                      [
                        "ACTIVE",
                        "CHECKED_IN",
                        "EXTENDING",
                        "CHECKING_OUT",
                      ].includes(session.status),
                    )
                  : undefined
                const isWalkIn = b.source === "STAFF_MANUAL"
                const checkInWindowExpired =
                  b.status === "CONFIRMED" &&
                  isCheckInDeadlineExpired(slotStart, nowTime, {
                    source: b.source,
                    slotEnd: b.slotEnd ?? (b as any).slot_end,
                    createdAt: b.createdAt ?? (b as any).created_at,
                  }) &&
                  (!activeSession || activeSession.status === "CHECKED_IN")
                const completedSession =
                  b.status === "COMPLETED"
                    ? b.sessions?.find(
                        (session: any) => session.status === "COMPLETED",
                      )
                    : undefined
                const isByoc = b.playMode === "BYOC" || (b as any).play_mode === "BYOC"
                const sessionStatusLabel: Record<string, string> = {
                  CHECKED_IN: isByoc ? "ĐANG VÀO SÂN" : "ĐANG NHẬN XE",
                  ACTIVE: "ĐANG CHƠI",
                  EXTENDING: "GIA HẠN",
                  CHECKING_OUT: isByoc ? "ĐANG KẾT THÚC PHIÊN" : "ĐANG TRẢ XE",
                }
                const hasPendingSettlement =
                  b.status === "COMPLETED" &&
                  (b as any).payment_components?.some(
                    (c: any) => c.status === "PENDING",
                  )
                const bookingStatusLabel: Record<string, string> = {
                  PENDING: "CHỜ THANH TOÁN",
                  CONFIRMED: "ĐÃ XÁC NHẬN",
                  NO_SHOW: "KHÔNG ĐẾN",
                  COMPLETED: hasPendingSettlement
                    ? "CHỜ QUYẾT TOÁN"
                    : "HOÀN THÀNH",
                  CANCELLED: "ĐÃ HỦY",
                }
                const displayLabel = checkInWindowExpired
                  ? isByoc
                    ? "QUÁ GIỜ CHECK-IN"
                    : "QUÁ GIỜ NHẬN XE"
                  : activeSession
                  ? (sessionStatusLabel[activeSession.status] ??
                    activeSession.status)
                  : (bookingStatusLabel[b.status] ?? b.status)
                const badgeVariant =
                  checkInWindowExpired
                    ? "neutral"
                    : activeSession?.status === "ACTIVE" || activeSession?.status === "EXTENDING"
                      ? "success"
                      : activeSession?.status === "CHECKED_IN" || activeSession?.status === "CHECKING_OUT"
                        ? "warning"
                        : b.status === "CONFIRMED"
                          ? "info"
                          : b.status === "COMPLETED" && !hasPendingSettlement
                            ? "success"
                            : b.status === "CANCELLED" || b.status === "NO_SHOW"
                              ? "neutral"
                              : "warning"

                const countdown = activeSession
                  ? null
                  : getSlotCountdown(slotStart, nowTime)
                const operationalTiming = activeSession
                  ? getSessionOperationalTiming(
                      activeSession.plannedEnd ?? slotEnd,
                      activeSession.status,
                      nowTime,
                    )
                  : null
                const sessionActionLabel =
                  activeSession?.status === "CHECKING_OUT"
                    ? isByoc
                      ? "Hoàn tất phiên"
                      : "Tiếp tục trả xe"
                    : operationalTiming?.state === "DUE_FOR_CHECKOUT" ||
                        operationalTiming?.state === "OVERDUE"
                      ? isByoc
                        ? "Xử lý phiên"
                        : "Xử lý trả xe"
                      : "Mở phiên"

                return (
                  <StaffCard key={bookingId} className="space-y-3">
                    {/* Row 1 — ID + status + source badge + remaining + detail link */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-[#a09e9d] font-mono font-bold">
                          #{bookingId.slice(0, 8).toUpperCase()}
                        </span>
                        <StaffBadge variant={badgeVariant}>
                          {displayLabel}
                        </StaffBadge>
                        {/*
                          Nhãn kênh đặt phải kể ĐỦ các kênh, không phải "vãng
                          lai hay không".

                          Nhánh cũ chỉ có hai lựa chọn, nên mọi đơn không phải
                          khách vãng lai đều bị dán "Đặt qua Web/App" — kể cả đơn
                          đặt qua Facebook. Với nhân viên tại quầy đó là thông
                          tin sai có hậu quả: khách Facebook là tài khoản mềm,
                          KHÔNG đăng nhập được, nên những bước cần khách tự bấm
                          xác nhận (biên bản nhận xe, đồng ý gia hạn) phải đi qua
                          đường thao tác hộ. Tưởng họ có app là chờ mãi không
                          thấy ai bấm.
                        */}
                        {(() => {
                          if (isWalkIn) {
                            return (
                              <span className="flex items-center gap-1 rounded-full border border-orange-300 bg-[#fff7ed] px-2.5 py-0.5 text-[10px] font-black text-[#ea580c] shadow-2xs">
                                <Zap className="size-3 fill-current" />
                                Vãng lai (Tại quầy)
                              </span>
                            )
                          }
                          if (b.source === "FACEBOOK") {
                            return (
                              <span className="flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700">
                                <MessageCircle className="size-3" />
                                Đặt qua Messenger
                              </span>
                            )
                          }
                          // Đơn giải đấu đã có nhãn Contest riêng ngay bên cạnh,
                          // thêm nhãn kênh nữa là nói hai lần cùng một chuyện.
                          if (b.source === "CONTEST") return null
                          return (
                            <span className="flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[10px] font-bold text-sky-700">
                              <Smartphone className="size-3" />
                              Đặt qua Web/App
                            </span>
                          )
                        })()}
                        {b.status === "CANCELLED" && Boolean(b.hasPendingRefund) && (
                          <StaffBadge variant="warning">
                            Chờ xác nhận hoàn tiền
                          </StaffBadge>
                        )}
                        {isContestBooking(b) && (
                          <span className="flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[10px] font-bold text-violet-700">
                            <Trophy className="size-3" />
                            Contest
                          </span>
                        )}
                        {operationalTiming?.state === "ON_TIME" && (
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-0.5 text-[10px] font-bold border",
                              operationalTiming.minutesUntilPlannedEnd <= 10
                                ? "bg-red-50 text-red-600 border-red-200"
                                : operationalTiming.minutesUntilPlannedEnd <= 20
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200",
                            )}
                          >
                            Kết thúc sau {operationalTiming.minutesUntilPlannedEnd} phút
                          </span>
                        )}
                        {operationalTiming?.state === "DUE_FOR_CHECKOUT" && (
                          <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold border bg-amber-50 text-amber-800 border-amber-300">
                            Đến giờ trả xe
                          </span>
                        )}
                        {operationalTiming?.state === "OVERDUE" && (
                          <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold border bg-red-100 text-red-700 border-red-300">
                            Quá giờ {operationalTiming.minutesPastPlannedEnd} phút
                            {operationalTiming.shouldAlert ? " · Cần xử lý" : ""}
                          </span>
                        )}
                      </div>
                      <Link
                        to={routePaths.staffBookingDetail.replace(":bookingId", bookingId)}
                        className="flex items-center justify-center size-7 rounded-lg border border-[#e5e2e1] bg-white hover:bg-[#fcf8f8] text-[#6b7280] hover:text-[#1c1b1b] transition-colors shrink-0"
                      >
                        <ChevronRight className="size-3.5" />
                      </Link>
                    </div>

                    {/* Row 2 — Customer name + phone */}
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="text-base font-bold text-[#1c1b1b] leading-tight">
                        {customerName}
                      </h4>
                      {customerPhone && (
                        <a
                          href={`tel:${customerPhone}`}
                          className="flex items-center gap-1 text-xs font-semibold text-[#ea580c] shrink-0 hover:underline"
                        >
                          <Phone className="size-3" />
                          {customerPhone}
                        </a>
                      )}
                    </div>

                    {/* Row 3 — Time + track + mode */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[#4c4a49] font-medium">
                      <span className="flex items-center gap-1.5">
                        <Clock className="size-3.5 text-[#ea580c]/80 shrink-0" />
                        <span className="font-bold text-[#1c1b1b]">
                          {new Date(slotStart).toLocaleTimeString("vi-VN", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}
                          {" – "}
                          {new Date(slotEnd).toLocaleTimeString("vi-VN", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}
                        </span>
                        {countdown && (
                          <span
                            title="Thời gian còn lại trước giờ bắt đầu lượt đặt"
                            aria-live="polite"
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-bold",
                              countdown.urgent
                                ? "bg-red-50 text-red-600 border border-red-200"
                                : "bg-[#f5f3f2] text-[#6b7280]",
                            )}
                          >
                            {countdown.label}
                          </span>
                        )}
                      </span>
                      {trackLabel && (
                        <span className="flex items-center gap-1.5">
                          <MapPin className="size-3.5 text-[#ea580c]/80 shrink-0" />
                          {trackLabel}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <Tag className="size-3 text-[#ea580c]/70 shrink-0" />
                        {playMode === "BYOC" ? "Mang xe cá nhân" : "Thuê xe của quán"}
                      </span>
                    </div>

                    {/* Row 4 — Counts */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#f0eeee]">
                      <span className="flex items-center gap-1 rounded-md bg-[#f5f3f2] px-2 py-1 text-[11px] font-bold text-[#4c4a49]">
                        <Users className="size-3 text-[#6b7280]" />
                        {participantCount} người chơi
                      </span>
                      {playMode !== "BYOC" && vehicleCount > 0 && (
                        <span className="flex items-center gap-1 rounded-md bg-[#f5f3f2] px-2 py-1 text-[11px] font-bold text-[#4c4a49]">
                          <Car className="size-3 text-[#6b7280]" />
                          {vehicleCount} xe thuê
                        </span>
                      )}
                      <div className="ml-auto">
                        {checkInWindowExpired ? (
                          <StaffButton disabled variant="outline" size="sm">
                            {isByoc ? "Quá giờ check-in" : "Quá giờ nhận xe"}
                          </StaffButton>
                        ) : activeSession ? (
                          <StaffButton
                            onClick={() =>
                              navigate(
                                activeSession.status === "CHECKING_OUT"
                                  ? `/staff/sessions/${activeSession.sessionId}/checkout-summary`
                                  : activeSession.status === "CHECKED_IN"
                                    ? `/staff/inspections/${activeSession.sessionId}?type=CHECK_IN`
                                    : `/staff/sessions/${activeSession.sessionId}`,
                              )
                            }
                            variant="outline"
                            size="sm"
                          >
                            {sessionActionLabel}
                            <ArrowRight className="size-3.5" />
                          </StaffButton>
                        ) : b.status === "PENDING" ? (
                          <div className="flex items-center gap-2">
                            <StaffButton
                              onClick={() => handleCancelPendingBooking(bookingId)}
                              variant="outline"
                              size="sm"
                              className="border-red-200 text-red-600 hover:bg-red-50"
                              title="Hủy đơn để nhả giữ chỗ slot và xe"
                            >
                              <X className="size-3.5 mr-1" />
                              Hủy đơn
                            </StaffButton>
                            <StaffButton
                              onClick={() => handleOpenPendingQrModal(bookingId)}
                              variant="primary"
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
                            >
                              <Smartphone className="size-3.5 mr-1.5" />
                              Mở mã QR
                            </StaffButton>
                          </div>
                        ) : b.status === "CONFIRMED" ? (
                          <StaffButton
                            onClick={() => handleStartCheckIn(b)}
                            variant="primary"
                            size="sm"
                            className={cn(
                              isWalkIn &&
                                "bg-[#ea580c] hover:bg-[#c2410c] text-white shadow-2xs font-extrabold",
                            )}
                          >
                            {isWalkIn ? (
                              <>
                                <Play className="size-3.5 fill-current" />
                                {b.playMode === "BYOC"
                                  ? "Vào sân & Mở phiên"
                                  : "Bàn giao & Mở phiên"}
                              </>
                            ) : (
                              <>
                                {b.playMode === "BYOC"
                                  ? "Check-in vào sân"
                                  : "Nhận xe & bàn giao"}
                                <ArrowRight className="size-3.5" />
                              </>
                            )}
                          </StaffButton>
                        ) : completedSession ? (
                          <StaffButton
                            onClick={() =>
                              navigate(
                                `/staff/sessions/${completedSession.sessionId}`,
                              )
                            }
                            variant="outline"
                            size="sm"
                          >
                            Xem phiên
                            <ArrowRight className="size-3.5" />
                          </StaffButton>
                        ) : null}
                      </div>
                    </div>
                  </StaffCard>
                )
              })}

              {visibleBookings.length === 0 && (
                <StaffCard className="py-12 text-center text-[#6b7280] space-y-2 border-dashed">
                  <p className="text-sm font-bold">
                    Không có đơn đặt lịch nào hôm nay
                  </p>
                  <p className="text-xs">
                    Nhấn{" "}
                    <strong className="text-[#ea580c]">
                      Đăng ký khách vãng lai
                    </strong>{" "}
                    để lập nhanh lượt chơi mới tại quầy.
                  </p>
                </StaffCard>
              )}
            </div>
          )}
        </div>
      )}
{/* 4. DYNAMIC WALK-IN REGISTRATION FORM */}
      {activeTab === "WALKIN" && (
        <div className="mx-auto w-full max-w-[1440px]">
          <StaffCard className="p-5 md:p-7">
            <div className="mb-6 flex items-center gap-3 border-b border-[#e5e2e1] pb-5">
              <div className="flex size-11 items-center justify-center rounded-xl border border-[#ffdbca] bg-[#fff3eb] text-[#ea580c]">
                <Plus className="size-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#1c1b1b]">
                  Đăng ký ca trực tiếp tại quầy
                </h3>
                <p className="text-xs text-[#6b7280]">
                  Thiết lập nhanh ca chơi và thanh toán cho khách tại quầy
                </p>
              </div>
            </div>

            <form onSubmit={handleWalkinSubmit} className="space-y-6">
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                <section className="space-y-6 xl:col-span-8">
                {/* STEPPER PROGRESS NAVIGATION HEADER */}
                <div className="rounded-xl border border-[#e5e2e1] bg-white p-4 shadow-xs">
                  <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
                    {[
                      { id: 1, title: "1. Giờ chơi & Sân", icon: Clock },
                      ...(playMode !== "BYOC" ? [{ id: 2, title: "2. Chọn Xe thuê", icon: Car }] : []),
                      { id: 3, title: `${playMode !== "BYOC" ? "3" : "2"}. Đồ ăn & Nước`, icon: Coffee },
                      { id: 4, title: `${playMode !== "BYOC" ? "4" : "3"}. Thanh toán`, icon: ShieldCheck },
                    ].map((stepItem, idx, arr) => {
                      const Icon = stepItem.icon
                      const isActive = walkinStep === stepItem.id
                      const isCompleted = walkinStep > stepItem.id

                      return (
                        <React.Fragment key={stepItem.id}>
                          <button
                            type="button"
                            onClick={() => setWalkinStep(stepItem.id as 1 | 2 | 3 | 4)}
                            className={cn(
                              "flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all shrink-0 cursor-pointer",
                              isActive
                                ? "bg-[#fff7ed] text-[#ea580c] border border-[#ffdbca] shadow-xs"
                                : isCompleted
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-gray-50 text-gray-500 border border-transparent hover:bg-gray-100"
                            )}
                          >
                            <div
                              className={cn(
                                "flex size-6 items-center justify-center rounded-full text-xs font-extrabold shrink-0",
                                isActive
                                  ? "bg-[#ea580c] text-white"
                                  : isCompleted
                                    ? "bg-emerald-600 text-white"
                                    : "bg-gray-200 text-gray-600"
                              )}
                            >
                              {isCompleted ? <Check className="size-3.5 stroke-[3]" /> : <Icon className="size-3.5" />}
                            </div>
                            <span className="whitespace-nowrap font-extrabold">{stepItem.title}</span>
                          </button>
                          {idx < arr.length - 1 && (
                            <div className="mx-1 h-0.5 flex-1 bg-gray-200 min-w-4 rounded-full" />
                          )}
                        </React.Fragment>
                      )
                    })}
                  </div>
                </div>

                {/* STEP 1: CUSTOMER & SLOT SELECTION */}
                {walkinStep === 1 && (
                  <div className="space-y-6">
                    <div className="rounded-xl border border-[#e5e2e1] bg-white p-5 md:p-6 space-y-4 shadow-xs">
                      <div className="border-b border-[#e5e2e1] pb-3">
                        <h4 className="text-base font-bold text-[#1c1b1b]">
                          Bước 1: Thông tin khách hàng & Hình thức chơi
                        </h4>
                        <p className="text-xs text-[#6b7280]">
                          Nhập tên khách vãng lai, số điện thoại liên hệ và chọn đường đua
                        </p>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        {/* Customer Name */}
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-[#4c4a49] mb-1.5">
                            Tên Khách Hàng <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            placeholder="Nhập tên khách hàng"
                            value={customerName}
                            onChange={(e) => {
                              setCustomerName(e.target.value)
                              setFieldErrors((p) => ({
                                ...p,
                                customerName: undefined,
                              }))
                            }}
                            className={cn(
                              "w-full rounded-lg border bg-white px-4 py-2.5 text-sm font-semibold text-[#1c1b1b] focus:outline-none focus:ring-1",
                              fieldErrors.customerName
                                ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500"
                                : "border-[#e5e2e1] focus:border-[#ea580c] focus:ring-[#ea580c]",
                            )}
                          />
                          {fieldErrors.customerName && (
                            <p className="mt-1 text-xs text-rose-500">
                              {fieldErrors.customerName}
                            </p>
                          )}
                        </div>

                        {/* Customer Phone */}
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-[#4c4a49] mb-1.5">
                            Số điện thoại <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="tel"
                            placeholder="Nhập số điện thoại khách hàng"
                            value={customerPhone}
                            onChange={(e) => {
                              setCustomerPhone(e.target.value)
                              setFieldErrors((p) => ({
                                ...p,
                                customerPhone: undefined,
                              }))
                            }}
                            className={cn(
                              "w-full rounded-lg border bg-white px-4 py-2.5 text-sm font-semibold text-[#1c1b1b] focus:outline-none focus:ring-1",
                              fieldErrors.customerPhone
                                ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500"
                                : "border-[#e5e2e1] focus:border-[#ea580c] focus:ring-[#ea580c]",
                            )}
                          />
                          {fieldErrors.customerPhone && (
                            <p className="mt-1 text-xs text-rose-500">
                              {fieldErrors.customerPhone}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {/* Play Mode */}
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-[#4c4a49] mb-1.5">
                            Chế độ chơi <span className="text-rose-500">*</span>
                          </label>
                          <select
                            value={playMode}
                            onChange={(e) => {
                              setPlayMode(e.target.value as "RENTAL" | "BYOC")
                              setSelectedVehicles([])
                              setSelectedSlot("")
                              setSelectedSlotEnd(null)
                              setFieldErrors((current) => ({
                                ...current,
                                playMode: undefined,
                                vehicleIds: undefined,
                                slotStart: undefined,
                                slotEnd: undefined,
                              }))
                            }}
                            className={cn(
                              "w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm font-semibold text-[#1c1b1b] focus:outline-none focus:ring-1",
                              fieldErrors.playMode
                                ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500"
                                : "border-[#e5e2e1] focus:border-[#ea580c] focus:ring-[#ea580c]",
                            )}
                          >
                            <option value="RENTAL">Thuê xe của hàng</option>
                            <option value="BYOC">Tự mang xe</option>
                          </select>
                          {fieldErrors.playMode && (
                            <p className="mt-1 text-xs text-rose-500">
                              {fieldErrors.playMode}
                            </p>
                          )}
                        </div>

                        {/* Track selector */}
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-[#4c4a49] mb-1.5">
                            Đường đua hoạt động <span className="text-rose-500">*</span>
                          </label>
                          <select
                            value={selectedTrackCode}
                            onChange={(e) => {
                              const match = trackConfigs.find(
                                (c) => c.track_type?.code === e.target.value,
                              )
                              if (match) {
                                const targetTrackCode = match.track_type?.code ?? ""
                                setSelectedTrackCode(targetTrackCode)
                                setSelectedTrackName(match.track_type?.name ?? "")
                                setSelectedSlot("")
                                setSelectedSlotEnd(null)
                                setFieldErrors((current) => ({
                                  ...current,
                                  trackTypeId: undefined,
                                  slotStart: undefined,
                                  slotEnd: undefined,
                                  vehicleIds: undefined,
                                }))
                                setSelectedVehicles((prev) =>
                                  prev.filter((v) => {
                                    const compat = v.catalog?.compatibleTrackTypes
                                    return (
                                      !compat ||
                                      compat.length === 0 ||
                                      compat.some((t) =>
                                        typeof t === "string"
                                          ? t === targetTrackCode
                                          : t.code === targetTrackCode ||
                                            t.id === targetTrackCode,
                                      )
                                    )
                                  }),
                                )
                              }
                            }}
                            className={cn(
                              "w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm font-semibold text-[#1c1b1b] focus:outline-none focus:ring-1",
                              fieldErrors.trackTypeId
                                ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500"
                                : "border-[#e5e2e1] focus:border-[#ea580c] focus:ring-[#ea580c]",
                            )}
                          >
                            {trackConfigs
                              .filter((c) => c.is_active)
                              .map((c) => (
                                <option key={c.id} value={c.track_type?.code ?? ""}>
                                  {c.track_type?.name ?? c.id}
                                </option>
                              ))}
                          </select>
                          {fieldErrors.trackTypeId && (
                            <p className="mt-1 text-xs text-rose-500">
                              {fieldErrors.trackTypeId}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* DATE & DYNAMIC SLOT GRID */}
                    <div className="rounded-xl border border-orange-100 bg-orange-50/20 p-4 md:p-6 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-[#ea580c]" />
                          <span className="text-sm font-bold text-[#1c1b1b]">
                            Chọn Khung Giờ Chơi Hôm Nay
                          </span>
                          <span className="text-xs text-[#6b7280]">
                            ({bookingDate})
                          </span>
                        </div>
                        {slotDuration > 0 && (
                          <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-bold text-orange-800">
                            {slotDuration} phút/slot
                          </span>
                        )}
                      </div>

                      <div>
                        {isLoadingAvailability || isLoadingCafe ? (
                          <div className="flex items-center justify-center py-8 text-xs text-muted-foreground gap-2">
                            <Loader2 className="size-4 animate-spin text-[#ea580c]" />
                            Đang tải lịch slot...
                          </div>
                        ) : isClosedToday ? (
                          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-center text-xs text-rose-700">
                            Quán đóng cửa hôm nay theo lịch hoạt động.
                          </div>
                        ) : isScheduleConfigured ? (
                          <DailySlotGrid
                            slots={slots}
                            selectedSlotId={selectedSlot || ""}
                            selectedSlotEndId={selectedSlotEnd || undefined}
                            slotDurationMinutes={slotDuration}
                            openHour={openHour}
                            closeHour={closeHour}
                            date={todayDate}
                            allowCurrentSlot={true}
                            onSelectSlot={(slotId) => {
                              setSelectedSlot(slotId)
                              setSelectedSlotEnd(null)
                              setSelectedVehicles([])
                              setFieldErrors((current) => ({
                                ...current,
                                slotStart: undefined,
                                slotEnd: undefined,
                                vehicleIds: undefined,
                              }))
                            }}
                            onSelectRange={(start, end) => {
                              setSelectedSlot(start)
                              setSelectedSlotEnd(end)
                              setSelectedVehicles([])
                              setFieldErrors((current) => ({
                                ...current,
                                slotStart: undefined,
                                slotEnd: undefined,
                                vehicleIds: undefined,
                              }))
                            }}
                          />
                        ) : (
                          <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/50 px-4 py-6 text-center text-xs text-amber-800">
                            Chưa có lịch hoạt động hợp lệ để hiển thị slot.
                          </div>
                        )}
                      </div>
                      {(fieldErrors.slotStart ||
                        fieldErrors.slotEnd ||
                        fieldErrors.slotDurationMinutes ||
                        fieldErrors.scheduleConfigured) && (
                        <p className="text-xs font-medium text-rose-600">
                          {fieldErrors.slotStart ??
                            fieldErrors.slotEnd ??
                            fieldErrors.slotDurationMinutes ??
                            fieldErrors.scheduleConfigured}
                        </p>
                      )}
                    </div>

                    {/* Step 1 Next Action */}
                    <div className="flex justify-end pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          const errors: WalkInFieldErrors = {}
                          const phoneRegex = /^(84|0[35789])\d{8}$/
                          if (!customerName.trim()) {
                            errors.customerName = "Vui lòng nhập tên khách hàng"
                          }
                          if (!customerPhone.trim()) {
                            errors.customerPhone = "Vui lòng nhập số điện thoại"
                          } else if (!phoneRegex.test(customerPhone.trim())) {
                            errors.customerPhone =
                              "Số điện thoại cần có 10 số và bắt đầu bằng 03, 05, 07, 08 hoặc 09"
                          }
                          if (!selectedSlot) {
                            errors.slotStart = "Vui lòng chọn khung giờ chơi"
                          }

                          if (Object.keys(errors).length > 0) {
                            setFieldErrors(errors)
                            const firstErr = Object.values(errors)[0]
                            if (firstErr) toast.error(firstErr)
                            return
                          }
                          setFieldErrors({})
                          setWalkinStep(playMode === "BYOC" ? 3 : 2)
                        }}
                        className="flex items-center gap-2 rounded-xl bg-[#ea580c] px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-[#d94e07] transition-all cursor-pointer"
                      >
                        <span>Tiếp tục: {playMode === "BYOC" ? "Chọn Đồ ăn & Nước" : "Chọn Xe thuê"}</span>
                        <ArrowRight className="size-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 2: VEHICLE SELECTION (Only for RENTAL) */}
                {walkinStep === 2 && playMode !== "BYOC" && (
                  <div className="space-y-6">
                    <div className="rounded-xl border border-[#e5e2e1] bg-white p-5 md:p-6 space-y-5 shadow-xs">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e2e1] pb-4">
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 items-center justify-center rounded-xl bg-[#fff7ed] text-[#ea580c]">
                            <Car className="size-5" />
                          </div>
                          <div>
                            <h4 className="text-base font-bold text-[#1c1b1b]">
                              Bước 2: Chọn Xe Thuê Cho Khách
                            </h4>
                            <p className="text-xs text-[#6b7280]">
                              Chọn các xe sẵn sàng thuộc từng Mẫu xe / Danh mục cho khách chơi
                            </p>
                          </div>
                        </div>
                        {selectedSelectableVehicles.length > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-[#fff7ed] border border-[#ffdbca] px-3 py-1 text-xs font-bold text-[#ea580c]">
                              Đã chọn {selectedSelectableVehicles.length} xe
                            </span>
                            <button
                              type="button"
                              onClick={() => setSelectedVehicles([])}
                              className="text-xs font-bold text-rose-600 hover:underline cursor-pointer"
                            >
                              Bỏ chọn tất cả
                            </button>
                          </div>
                        )}
                      </div>

                      {/* List of Catalogs */}
                      {!selectedSlot ? (
                        <div className="rounded-lg border border-dashed border-[#e5e2e1] bg-[#fcf8f8] p-6 text-center text-xs text-[#6b7280]">
                          Vui lòng chọn khung giờ trước để tải danh sách xe sẵn sàng.
                        </div>
                      ) : groupedVehiclesByCatalog.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/50 p-6 text-center text-xs text-amber-800 font-semibold">
                          Không có xe nào khả dụng trong khung giờ này.
                        </div>
                      ) : (
                        <div className="space-y-5">
                          {groupedVehiclesByCatalog.map(({ catalog, units }) => {
                            const selectedUnitsInCatalog = units.filter((u) =>
                              selectedVehicles.some((sv) => sv.id === u.id)
                            )
                            const catalogCover = getCatalogImageUrl(catalog)

                            return (
                              <div
                                key={catalog.id}
                                className="rounded-xl border border-[#e5e2e1] bg-[#fcf8f8] p-4 space-y-3"
                              >
                                {/* Catalog Header */}
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e2e1] pb-3">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="relative size-12 shrink-0 overflow-hidden rounded-lg border border-[#e5e2e1] bg-white">
                                      <VehicleImage
                                        imageUrl={catalogCover}
                                        alt={catalog.name}
                                        className="h-full w-full object-cover"
                                        fallbackClassName="bg-white text-[#6b7280]"
                                        iconClassName="size-6"
                                      />
                                    </div>
                                    <div className="min-w-0">
                                      <h5 className="text-sm font-bold text-[#1c1b1b] leading-tight break-words">
                                        {catalog.name}
                                      </h5>
                                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                                        <span className="font-black text-[#ea580c]">
                                          {formatCurrency(catalog.hourlyRate)}/giờ
                                        </span>
                                        {catalog.tier && (
                                          <span className="rounded bg-slate-200/60 px-1.5 py-0.5 text-[10px] font-extrabold text-[#4c4a49]">
                                            {catalog.tier}
                                          </span>
                                        )}
                                        <span className="text-[11px] text-[#6b7280]">
                                          ({units.length} xe khả dụng)
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {selectedUnitsInCatalog.length > 0 && (
                                    <span className="rounded-full bg-[#ea580c] px-2.5 py-0.5 text-[11px] font-bold text-white shrink-0">
                                      Đã chọn {selectedUnitsInCatalog.length} xe
                                    </span>
                                  )}
                                </div>

                                {/* Units List - Horizontal Card Layout */}
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                  {units.map((unit) => {
                                    const isSelected = selectedVehicles.some((v) => v.id === unit.id)
                                    const unitImage = sanitizeImageUrl(unit.distinctive_image_url) || catalogCover

                                    return (
                                      <button
                                        key={unit.id}
                                        type="button"
                                        onClick={() => {
                                          setSelectedVehicles((prev) =>
                                            isSelected
                                              ? prev.filter((v) => v.id !== unit.id)
                                              : [...prev, unit]
                                          )
                                          setFieldErrors((current) => ({
                                            ...current,
                                            vehicleIds: undefined,
                                          }))
                                        }}
                                        className={cn(
                                          "flex items-center gap-3 rounded-xl border p-3 text-left transition-all cursor-pointer",
                                          isSelected
                                            ? "border-[#ea580c] bg-[#fff7ed] ring-1 ring-[#ea580c]/30 shadow-xs"
                                            : "border-[#e5e2e1] bg-white hover:border-[#f1a77d] hover:bg-[#fff7ed]/30"
                                        )}
                                      >
                                        {/* Physical Vehicle Thumbnail */}
                                        <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-[#e5e2e1] bg-[#f5f3f2]">
                                          <VehicleImage
                                            imageUrl={unitImage}
                                            alt={unit.identifier}
                                            className="h-full w-full object-cover"
                                            fallbackClassName="bg-[#f5f3f2] text-[#6b7280]"
                                            iconClassName="size-6"
                                          />
                                          {isSelected && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-[#ea580c]/35 backdrop-blur-[1px]">
                                              <Check className="size-5 text-white stroke-[3] drop-shadow-sm" />
                                            </div>
                                          )}
                                        </div>

                                        {/* Details */}
                                        <div className="min-w-0 flex-1">
                                          <p className="text-xs font-extrabold text-[#1c1b1b] leading-tight break-words">
                                            {unit.identifier}
                                          </p>
                                          {unit.color && (
                                            <p className="mt-1 text-[11px] text-[#6b7280] font-medium leading-tight break-words">
                                              Màu: {unit.color}
                                            </p>
                                          )}
                                        </div>

                                        {/* Check Indicator */}
                                        <div
                                          className={cn(
                                            "flex size-5 items-center justify-center rounded-md border shrink-0 transition-colors self-center",
                                            isSelected
                                              ? "border-[#ea580c] bg-[#ea580c] text-white"
                                              : "border-[#d1d5db] bg-white"
                                          )}
                                        >
                                          {isSelected && <Check className="size-3 stroke-[3]" />}
                                        </div>
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {fieldErrors.vehicleIds && (
                        <p className="text-xs font-medium text-rose-600">
                          {fieldErrors.vehicleIds}
                        </p>
                      )}
                    </div>

                    {/* Step 2 Actions */}
                    <div className="flex items-center justify-between pt-2">
                      <button
                        type="button"
                        onClick={() => setWalkinStep(1)}
                        className="flex items-center gap-2 rounded-xl border border-[#e5e2e1] bg-white px-5 py-2.5 text-sm font-bold text-[#1c1b1b] hover:bg-gray-50 cursor-pointer"
                      >
                        <ChevronLeft className="size-4" />
                        <span>Quay lại: Lịch & Giờ chơi</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedVehicles.length === 0) {
                            const msg = "Vui lòng chọn ít nhất 1 xe thuê cho khách"
                            setFieldErrors({ vehicleIds: msg })
                            toast.error(msg)
                            return
                          }
                          setFieldErrors({})
                          setWalkinStep(3)
                        }}
                        className="flex items-center gap-2 rounded-xl bg-[#ea580c] px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-[#d94e07] transition-all cursor-pointer"
                      >
                        <span>Tiếp tục: Thêm Đồ ăn & Nước</span>
                        <ArrowRight className="size-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 3: F&B SELECTION */}
                {walkinStep === 3 && (
                  <div className="space-y-6">
                    <div className="rounded-xl border border-[#e5e2e1] bg-white p-5 md:p-6 space-y-4 shadow-xs">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e2e1] pb-4">
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 items-center justify-center rounded-xl bg-[#fff7ed] text-[#ea580c]">
                            <Coffee className="size-5" />
                          </div>
                          <div>
                            <h4 className="text-base font-bold text-[#1c1b1b]">
                              Bước 3: Thêm Đồ ăn & Nước uống
                            </h4>
                            <p className="text-xs text-[#6b7280]">
                              Chọn các món giải khát, đồ ăn kèm cho khách vãng lai (không bắt buộc)
                            </p>
                          </div>
                        </div>
                        {Object.keys(selectedFnbCart).length > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-[#fff7ed] border border-[#ffdbca] px-3 py-1 text-xs font-bold text-[#ea580c]">
                              Đã chọn {Object.values(selectedFnbCart).reduce((a, b) => a + b.quantity, 0)} phần ({formatCurrency(fnbTotalAmount)})
                            </span>
                            <button
                              type="button"
                              onClick={() => setSelectedFnbCart({})}
                              className="text-xs font-bold text-rose-600 hover:underline cursor-pointer"
                            >
                              Xóa hết
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Search & Category Filter Row */}
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        {/* Search */}
                        <div className="relative flex-1 max-w-sm">
                          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#9ca3af]" />
                          <input
                            type="text"
                            value={fnbSearchTerm}
                            onChange={(e) => setFnbSearchTerm(e.target.value)}
                            placeholder="Tìm món, nước uống, combo..."
                            className="w-full rounded-lg border border-[#e5e2e1] bg-[#fcf8f8] pl-9 pr-8 py-2 text-xs text-[#1c1b1b] focus:border-[#ea580c] focus:bg-white focus:outline-none"
                          />
                          {fnbSearchTerm && (
                            <button
                              type="button"
                              onClick={() => setFnbSearchTerm("")}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#1c1b1b]"
                            >
                              <X className="size-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Category Filter Chips */}
                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
                          <button
                            type="button"
                            onClick={() => setFnbSelectedCategory("ALL")}
                            className={cn(
                              "rounded-full px-3 py-1 text-xs font-bold transition-all shrink-0 cursor-pointer",
                              fnbSelectedCategory === "ALL"
                                ? "bg-[#ea580c] text-white"
                                : "bg-[#f5f3f2] text-[#4c4a49] hover:bg-[#e5e2e1]",
                            )}
                          >
                            Tất cả
                          </button>
                          {fnbCategories.map((cat) => (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setFnbSelectedCategory(cat)}
                              className={cn(
                                "rounded-full px-3 py-1 text-xs font-bold transition-all shrink-0 cursor-pointer",
                                fnbSelectedCategory === cat
                                  ? "bg-[#ea580c] text-white"
                                  : "bg-[#f5f3f2] text-[#4c4a49] hover:bg-[#e5e2e1]",
                              )}
                            >
                              {cat}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Menu Items Grid */}
                      {isLoadingFnbMenu ? (
                        <div className="flex items-center justify-center py-8 text-xs text-muted-foreground gap-2">
                          <Loader2 className="size-4 animate-spin text-[#ea580c]" />
                          Đang tải thực đơn đồ ăn & nước uống...
                        </div>
                      ) : filteredFnbMenuItems.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-[#e5e2e1] bg-[#fcf8f8] p-6 text-center text-xs text-[#6b7280]">
                          Không tìm thấy món ăn nào phù hợp.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                          {filteredFnbMenuItems.map((item) => {
                            const hasVariants = item.variants && item.variants.length > 0
                            const basePrice = Number(item.price)

                            if (!hasVariants) {
                              const cartKey = item.id
                              const cartEntry = selectedFnbCart[cartKey]
                              const qty = cartEntry?.quantity || 0

                              return (
                                <div
                                  key={item.id}
                                  className={cn(
                                    "flex flex-col justify-between rounded-xl border p-3.5 space-y-3 transition-all",
                                    qty > 0
                                      ? "border-[#ea580c] bg-[#fff7ed]"
                                      : "border-[#e5e2e1] bg-white",
                                  )}
                                >
                                  <div>
                                    <h5 className="text-xs font-bold text-[#1c1b1b] leading-tight break-words">
                                      {item.name}
                                    </h5>
                                    {item.categoryName && (
                                      <p className="mt-0.5 text-[10px] text-[#6b7280] leading-tight break-words">
                                        {item.categoryName}
                                      </p>
                                    )}
                                  </div>

                                  <div className="flex items-center justify-between border-t border-[#f5f3f2] pt-2">
                                    <span className="font-extrabold text-[#ea580c] text-xs">
                                      {formatCurrency(basePrice)}
                                    </span>

                                    {qty > 0 ? (
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => handleUpdateFnbQuantity(item, undefined, undefined, basePrice, -1)}
                                          className="flex size-6 items-center justify-center rounded-lg border border-[#e5e2e1] bg-white text-[#1c1b1b] hover:bg-gray-50"
                                        >
                                          <Minus className="size-3" />
                                        </button>
                                        <span className="min-w-[18px] text-center text-xs font-extrabold text-[#1c1b1b]">
                                          {qty}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleUpdateFnbQuantity(item, undefined, undefined, basePrice, 1)}
                                          className="flex size-6 items-center justify-center rounded-lg bg-[#ea580c] text-white hover:bg-[#c2410c]"
                                        >
                                          <Plus className="size-3" />
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateFnbQuantity(item, undefined, undefined, basePrice, 1)}
                                        className="flex items-center gap-1 rounded-lg border border-[#e5e2e1] bg-[#fcf8f8] px-2.5 py-1 text-xs font-bold text-[#1c1b1b] hover:border-[#ea580c] hover:bg-[#fff7ed] hover:text-[#ea580c]"
                                      >
                                        <Plus className="size-3 text-[#ea580c]" /> Thêm
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )
                            }

                            return (
                              <div
                                key={item.id}
                                className="flex flex-col justify-between rounded-xl border border-[#e5e2e1] bg-white p-3.5 space-y-3"
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <h5 className="text-xs font-bold text-[#1c1b1b] leading-tight break-words">
                                      {item.name}
                                    </h5>
                                    {item.categoryName && (
                                      <p className="mt-0.5 text-[10px] text-[#6b7280] leading-tight break-words">
                                        {item.categoryName}
                                      </p>
                                    )}
                                  </div>
                                  <span className="rounded-full bg-[#f5f3f2] px-2 py-0.5 text-[10px] font-bold text-[#6b7280] shrink-0">
                                    {item.variants?.length} tùy chọn
                                  </span>
                                </div>

                                <div className="space-y-2 border-t border-[#f5f3f2] pt-2">
                                  {item.variants?.map((v) => {
                                    const vPrice = Number(v.price)
                                    const cartKey = `${item.id}::${v.id}`
                                    const cartEntry = selectedFnbCart[cartKey]
                                    const qty = cartEntry?.quantity || 0

                                    return (
                                      <div
                                        key={v.id}
                                        className={cn(
                                          "flex items-center justify-between rounded-lg p-1.5 transition-all text-xs",
                                          qty > 0
                                            ? "bg-[#fff7ed] border border-[#ffdbca]"
                                            : "bg-[#fcf8f8]"
                                        )}
                                      >
                                        <div className="min-w-0 flex-1 pr-2">
                                          <span className="font-bold text-[#1c1b1b] leading-tight break-words block">
                                            {v.name}
                                          </span>
                                          <span className="font-black text-[#ea580c] text-[11px]">
                                            {formatCurrency(vPrice)}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                          {qty > 0 ? (
                                            <>
                                              <button
                                                type="button"
                                                onClick={() => handleUpdateFnbQuantity(item, v.id, v.name, vPrice, -1)}
                                                className="flex size-5 items-center justify-center rounded border border-[#e5e2e1] bg-white text-[#1c1b1b]"
                                              >
                                                <Minus className="size-2.5" />
                                              </button>
                                              <span className="min-w-[14px] text-center text-xs font-extrabold text-[#1c1b1b]">
                                                {qty}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() => handleUpdateFnbQuantity(item, v.id, v.name, vPrice, 1)}
                                                className="flex size-5 items-center justify-center rounded bg-[#ea580c] text-white"
                                              >
                                                <Plus className="size-2.5" />
                                              </button>
                                            </>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={() => handleUpdateFnbQuantity(item, v.id, v.name, vPrice, 1)}
                                          >
                                            <Plus className="size-2.5 text-[#ea580c]" /> Thêm
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                    {/* Navigation Buttons for Step 3 */}
                    <div className="flex items-center justify-between border-t border-[#e5e2e1] pt-4">
                      <button
                        type="button"
                        onClick={() => setWalkinStep(playMode === "BYOC" ? 1 : 2)}
                        className="flex items-center gap-2 rounded-xl border border-[#e5e2e1] bg-white px-5 py-2.5 text-sm font-bold text-[#1c1b1b] shadow-xs hover:bg-[#fcf8f8] transition-all cursor-pointer"
                      >
                        <ChevronLeft className="size-4" />
                        <span>Quay lại {playMode === "BYOC" ? "Thông tin" : "Chọn xe"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFieldErrors({})
                          setWalkinStep(4)
                        }}
                        className="flex items-center gap-2 rounded-xl bg-[#ea580c] px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-[#d94e07] transition-all cursor-pointer"
                      >
                        <span>Tiếp tục: Xác nhận & Thanh toán</span>
                        <ArrowRight className="size-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 4: CONFIRMATION & PAYMENT */}
                {walkinStep === 4 && (
                  <div className="space-y-6">
                    <div className="rounded-xl border border-[#e5e2e1] bg-white p-5 md:p-6 space-y-5 shadow-xs">
                      <div className="flex items-center gap-3 border-b border-[#e5e2e1] pb-4">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-[#fff7ed] text-[#ea580c]">
                          <CheckCircle2 className="size-5" />
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-[#1c1b1b]">
                            Bước 4: Kiểm tra & Xác nhận Đặt chỗ
                          </h4>
                          <p className="text-xs text-[#6b7280]">
                            Rà soát lại toàn bộ thông tin đơn hàng trước khi tiến hành thanh toán
                          </p>
                        </div>
                      </div>

                      {/* Error Alert if validation fails */}
                      {Object.keys(fieldErrors).length > 0 && (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700 flex items-start gap-2.5">
                          <AlertCircle className="size-4 text-red-600 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <p className="font-bold">Thông tin đơn chưa hợp lệ:</p>
                            <ul className="list-disc list-inside space-y-0.5">
                              {Object.entries(fieldErrors).map(([key, err]) => (
                                <li key={key}>{err}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}

                      {/* Summary Cards */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Customer & Schedule Summary */}
                        <div className="rounded-xl border border-[#e5e2e1] bg-[#fcf8f8] p-4 space-y-3">
                          <h5 className="text-xs font-bold uppercase tracking-wider text-[#ea580c] flex items-center gap-1.5">
                            <User className="size-3.5" /> Thông tin khách & Lịch
                          </h5>
                          <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between"><span className="text-[#6b7280]">Họ tên:</span> <span className="font-bold text-[#1c1b1b]">{customerName || "—"}</span></div>
                            <div className="flex justify-between"><span className="text-[#6b7280]">Số điện thoại:</span> <span className="font-bold text-[#1c1b1b]">{customerPhone || "—"}</span></div>
                            <div className="flex justify-between"><span className="text-[#6b7280]">Đường đua:</span> <span className="font-bold text-[#1c1b1b]">{selectedTrackName}</span></div>
                            <div className="flex justify-between"><span className="text-[#6b7280]">Hình thức:</span> <span className="font-bold text-[#ea580c]">{playMode === "RENTAL" ? "Thuê xe tại sân" : "Tự mang xe (BYOC)"}</span></div>
                            <div className="flex justify-between"><span className="text-[#6b7280]">Khung giờ:</span> <span className="font-bold text-[#1c1b1b]">{selectedSlot ? (selectedSlotEnd ? `${selectedSlot} - ${selectedSlotEnd}` : selectedSlot) : "—"}</span></div>
                            <div className="flex justify-between"><span className="text-[#6b7280]">Số lượng slot:</span> <span className="font-bold text-[#1c1b1b]">{slotCount} slot ({slotCount * (slotDuration || 30)} phút)</span></div>
                          </div>
                        </div>

                        {/* Vehicle & F&B Summary */}
                        <div className="rounded-xl border border-[#e5e2e1] bg-[#fcf8f8] p-4 space-y-3">
                          <h5 className="text-xs font-bold uppercase tracking-wider text-[#ea580c] flex items-center gap-1.5">
                            <Car className="size-3.5" /> Dịch vụ kèm theo
                          </h5>
                          <div className="space-y-2 text-xs">
                            <div>
                              <span className="text-[#6b7280] block mb-1">Xe đã chọn:</span>
                              {playMode === "BYOC" ? (
                                <span className="italic text-[#6b7280]">Khách dùng xe cá nhân</span>
                              ) : selectedSelectableVehicles.length === 0 ? (
                                <span className="text-red-500 font-medium">Chưa chọn xe nào</span>
                              ) : (
                                <div className="space-y-1">
                                  {selectedSelectableVehicles.map(v => (
                                    <div key={v.id} className="flex justify-between bg-white px-2 py-1 rounded border border-[#e5e2e1] font-semibold">
                                      <span>{v.catalog?.name || v.identifier} ({v.identifier})</span>
                                      <span className="text-[#ea580c]">{formatCurrency(v.catalog?.hourlyRate || 0)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {Object.keys(selectedFnbCart).length > 0 && (
                              <div className="border-t border-[#e5e2e1] pt-2">
                                <span className="text-[#6b7280] block mb-1">Đồ ăn / Nước uống:</span>
                                <div className="space-y-1">
                                  {Object.entries(selectedFnbCart).map(([key, item]) => (
                                    <div key={key} className="flex justify-between bg-white px-2 py-1 rounded border border-[#e5e2e1]">
                                      <span>{item.menuItem.name} {item.variantName ? `(${item.variantName})` : ""} x{item.quantity}</span>
                                      <span className="font-semibold">{formatCurrency(item.unitPrice * item.quantity)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Payment Method Selection */}
                      <div className="border-t border-[#e5e2e1] pt-4 space-y-3">
                        <label className="text-xs font-bold uppercase tracking-wider text-[#1c1b1b] block">
                          Phương thức thanh toán
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => setPaymentMethod("CASH")}
                            className={cn(
                              "flex items-center justify-center gap-2 rounded-xl p-3 border font-bold text-xs transition-all cursor-pointer",
                              paymentMethod === "CASH"
                                ? "border-[#ea580c] bg-[#fff7ed] text-[#ea580c] shadow-xs"
                                : "border-[#e5e2e1] bg-white text-[#6b7280] hover:bg-[#fcf8f8]"
                            )}
                          >
                            <Banknote className="size-4" />
                            <span>Tiền mặt tại quầy</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setPaymentMethod("BANK_TRANSFER")}
                            className={cn(
                              "flex items-center justify-center gap-2 rounded-xl p-3 border font-bold text-xs transition-all cursor-pointer",
                              paymentMethod === "BANK_TRANSFER"
                                ? "border-[#ea580c] bg-[#fff7ed] text-[#ea580c] shadow-xs"
                                : "border-[#e5e2e1] bg-white text-[#6b7280] hover:bg-[#fcf8f8]"
                            )}
                          >
                            <CreditCard className="size-4" />
                            <span>Chuyển khoản QR</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Navigation Buttons for Step 4 */}
                    <div className="flex items-center justify-between pt-2">
                      <button
                        type="button"
                        onClick={() => setWalkinStep(3)}
                        className="flex items-center gap-2 rounded-xl border border-[#e5e2e1] bg-white px-5 py-2.5 text-sm font-bold text-[#1c1b1b] shadow-xs hover:bg-[#fcf8f8] transition-all cursor-pointer"
                      >
                        <ChevronLeft className="size-4" />
                        <span>Quay lại Đồ ăn & Nước</span>
                      </button>
                    </div>
                  </div>
                )}
              </section>

                <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start xl:col-span-4">
                  {/* DETAILED BOOKING SUMMARY CARD */}
                  <div className="rounded-xl border border-[#e5e2e1] bg-white p-5 space-y-4 shadow-xs">
                    <div className="flex items-center justify-between border-b border-[#e5e2e1] pb-3">
                      <div>
                        <h4 className="text-sm font-bold text-[#1c1b1b]">Tóm tắt đơn đặt chỗ</h4>
                        <p className="text-[11px] text-[#6b7280]">Cập nhật thời gian thực theo từng bước</p>
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-[11px] font-bold border",
                          playMode === "RENTAL"
                            ? "bg-orange-100 text-orange-800 border-orange-200"
                            : "bg-blue-100 text-blue-800 border-blue-200"
                        )}
                      >
                        {playMode === "RENTAL" ? "Thuê xe" : "Xe cá nhân"}
                      </span>
                    </div>

                    {/* Schedule & Track Details */}
                    <div className="space-y-2 text-xs border-b border-[#e5e2e1] pb-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[#6b7280]">Đường đua:</span>
                        <span className="font-bold text-[#1c1b1b]">{selectedTrackName || "Chưa chọn"}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#6b7280]">Ngày chơi:</span>
                        <span className="font-semibold text-[#1c1b1b]">{bookingDate}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[#6b7280]">Khung giờ:</span>
                        <span className="font-bold text-[#ea580c]">
                          {selectedSlot ? (selectedSlotEnd ? `${selectedSlot} - ${selectedSlotEnd}` : selectedSlot) : "Chưa chọn slot"}
                        </span>
                      </div>
                      {slotCount > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-[#6b7280]">Thời lượng:</span>
                          <span className="font-medium text-[#4c4a49]">{slotCount} slot ({slotCount * (slotDuration || 30)} phút)</span>
                        </div>
                      )}
                    </div>

                    {/* Vehicle Items Breakdown */}
                    <div className="space-y-2 text-xs border-b border-[#e5e2e1] pb-3">
                      <div className="flex justify-between items-center">
                        <span className="font-bold uppercase text-[10px] tracking-wider text-[#6b7280]">Xe đua sử dụng</span>
                        {playMode === "RENTAL" && (
                          <span className="text-[11px] font-semibold text-[#ea580c]">{selectedSelectableVehicles.length} xe đã chọn</span>
                        )}
                      </div>

                      {playMode === "BYOC" ? (
                        <div className="rounded-lg bg-[#f9fafb] p-2 text-center text-xs italic text-[#6b7280] border border-[#f3f4f6]">
                          Khách tự mang xe cá nhân (Miễn phí thuê xe)
                        </div>
                      ) : selectedSelectableVehicles.length === 0 ? (
                        <div className="rounded-lg bg-amber-50/60 p-2 text-center text-xs text-amber-700 border border-amber-200/60 font-medium">
                          Chưa chọn xe thuê nào
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                          {selectedSelectableVehicles.map((v) => (
                            <div key={v.id} className="flex justify-between items-center bg-[#fcf8f8] px-2.5 py-1.5 rounded-lg border border-[#e5e2e1]">
                              <span className="font-medium truncate max-w-[170px]" title={v.catalog?.name || v.identifier}>
                                {v.catalog?.name || v.identifier} <span className="text-[#6b7280] text-[10px]">({v.identifier})</span>
                              </span>
                              <span className="font-semibold text-[#1c1b1b] shrink-0">{formatCurrency(v.catalog?.hourlyRate || 0)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* F&B Items Breakdown */}
                    {Object.keys(selectedFnbCart).length > 0 && (
                      <div className="space-y-2 text-xs border-b border-[#e5e2e1] pb-3">
                        <div className="flex justify-between items-center">
                          <span className="font-bold uppercase text-[10px] tracking-wider text-[#6b7280]">Đồ ăn & Nước uống</span>
                          <span className="text-[11px] font-semibold text-[#ea580c]">
                            {Object.values(selectedFnbCart).reduce((a, b) => a + b.quantity, 0)} phần
                          </span>
                        </div>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {Object.entries(selectedFnbCart).map(([key, item]) => (
                            <div key={key} className="flex justify-between items-center bg-[#fcf8f8] px-2.5 py-1.5 rounded-lg border border-[#e5e2e1] gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-[#1c1b1b] truncate text-[11px]">
                                  {item.menuItem.name} {item.variantName ? <span className="text-[#6b7280] text-[10px]">({item.variantName})</span> : ""}
                                </p>
                                <p className="font-bold text-[#ea580c] text-[10px]">
                                  {formatCurrency(item.unitPrice * item.quantity)}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateFnbQuantity(item.menuItem, item.variantId, item.variantName, item.unitPrice, -1)}
                                  className="flex size-5 items-center justify-center rounded border border-[#e5e2e1] bg-white text-[#1c1b1b] hover:bg-gray-100 cursor-pointer"
                                  title="Giảm"
                                >
                                  <Minus className="size-2.5" />
                                </button>
                                <span className="min-w-[14px] text-center text-xs font-extrabold text-[#1c1b1b]">
                                  {item.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateFnbQuantity(item.menuItem, item.variantId, item.variantName, item.unitPrice, 1)}
                                  className="flex size-5 items-center justify-center rounded bg-[#ea580c] text-white hover:bg-[#d94e07] cursor-pointer"
                                  title="Tăng"
                                >
                                  <Plus className="size-2.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Financial Summary Breakdown */}
                    <div className="space-y-2 pt-1">
                      <h5 className="text-[10px] font-extrabold uppercase tracking-wider text-[#6b7280]">
                        Chi tiết hóa đơn dự kiến
                      </h5>

                      {isLoadingCafe ? (
                        <div className="flex items-center gap-2 text-xs text-[#6b7280] py-2 animate-pulse font-semibold">
                          <Loader2 className="size-3.5 animate-spin text-[#ea580c]" />
                          Đang tính toán giá...
                        </div>
                      ) : (
                        <div className="space-y-1.5 text-xs font-medium">
                          <div className="flex justify-between text-[#4c4a49]">
                            <span className="text-[#6b7280]">Phí sân chơi ({slotCount} slot):</span>
                            <span className="font-semibold text-[#1c1b1b]">{formatCurrency(slotFeeTotal)}</span>
                          </div>
                          {playMode !== "BYOC" && (
                            <div className="flex justify-between text-[#4c4a49]">
                              <span className="text-[#6b7280]">Phí thuê xe ({selectedSelectableVehicles.length} xe):</span>
                              <span className="font-semibold text-[#1c1b1b]">{formatCurrency(rentalFeeTotal)}</span>
                            </div>
                          )}
                          {fnbTotalAmount > 0 && (
                            <div className="flex justify-between text-[#4c4a49]">
                              <span className="text-[#6b7280]">Đồ ăn & Nước uống:</span>
                              <span className="font-semibold text-[#1c1b1b]">{formatCurrency(fnbTotalAmount)}</span>
                            </div>
                          )}

                          <div className="rounded-xl border border-[#ffdbca] bg-[#fff7ed] p-3 mt-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-[#1c1b1b]">Tổng thanh toán tại quầy:</span>
                              <span className="text-base font-black text-[#ea580c]">{formatCurrency(totalAmount)}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* CAPACITY WARNING BADGE */}
                  <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 space-y-1">
                    <div className="flex items-center gap-2 text-xs font-bold text-blue-700">
                      <ShieldCheck className="size-4 text-blue-600 shrink-0" />
                      Kiểm tra an toàn & Công suất
                    </div>
                    <p className="text-[11px] text-blue-900 leading-relaxed font-medium">
                      Hệ thống tự động kiểm tra tính sẵn sàng của đường đua <strong>{selectedTrackName || "đã chọn"}</strong>.
                    </p>
                  </div>
                </aside>
              </div>

              {/* Form Actions */}
              <div className="flex flex-col-reverse gap-3 border-t border-[#e5e2e1] pt-5 sm:flex-row sm:items-center sm:justify-end">
                <StaffButton
                  type="button"
                  onClick={() => {
                    resetWalkinForm()
                    setActiveTab("LIST")
                  }}
                  variant="outline"
                  disabled={isWalkinSubmitting}
                  className="sm:w-32"
                >
                  Hủy bỏ
                </StaffButton>
                <StaffButton
                  type="button"
                  onClick={(e) => handleWalkinSubmit(e, false)}
                  variant="outline"
                  disabled={
                    isWalkinSubmitting ||
                    isLoadingCafe ||
                    !cafeDetails ||
                    isClosedToday ||
                    !isScheduleConfigured
                  }
                  className="sm:w-48 font-bold"
                >
                  {isWalkinSubmitting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : paymentMethod === "BANK_TRANSFER" ? (
                    "Tạo mã QR & Lưu lịch"
                  ) : (
                    "Tạo đơn & Lưu lịch"
                  )}
                </StaffButton>
                <StaffButton
                  type="button"
                  onClick={(e) => handleWalkinSubmit(e, true)}
                  variant="primary"
                  disabled={
                    isWalkinSubmitting ||
                    isLoadingCafe ||
                    !cafeDetails ||
                    isClosedToday ||
                    !isScheduleConfigured
                  }
                  className="flex-1 uppercase tracking-wider font-extrabold sm:flex-initial"
                >
                  {isWalkinSubmitting ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Đang xử lý...
                    </>
                  ) : paymentMethod === "BANK_TRANSFER" ? (
                    <>
                      <QrCode className="size-4 mr-1.5" />
                      Quét mã QR & Nhận xe ngay
                    </>
                  ) : (
                    <>
                      <Play className="size-4 mr-1.5 fill-current" />
                      Tạo đơn & Nhận xe ngay
                    </>
                  )}
                </StaffButton>
              </div>
            </form>
          </StaffCard>
        </div>
      )}

      {/* Walk-in Cash Confirmation Modal */}
      {cashModalData && (
        <WalkInCashConfirmationModal
          isOpen={true}
          customerName={cashModalData.customerName}
          customerPhone={cashModalData.customerPhone}
          playMode={cashModalData.playMode}
          trackName={cashModalData.trackName}
          slotCount={cashModalData.slotCount}
          slotFeeTotal={cashModalData.slotFeeTotal}
          vehicleCount={cashModalData.vehicleCount}
          rentalFeeTotal={cashModalData.rentalFeeTotal}
          fnbTotalAmount={cashModalData.fnbTotalAmount}
          totalAmount={cashModalData.totalAmount}
          isSubmitting={isWalkinSubmitting}
          autoCheckIn={cashModalData.autoCheckIn}
          onConfirm={handleConfirmCashPayment}
          onClose={() => setCashModalData(null)}
        />
      )}

      {/* Walk-in Bank Transfer QR Modal */}
      {bankTransferModalData && (
        <WalkInBankTransferModal
          isOpen={true}
          bookingId={bankTransferModalData.bookingId}
          bookingCode={bankTransferModalData.bookingCode}
          bankTransfer={bankTransferModalData.bankTransfer}
          autoCheckIn={bankTransferModalData.autoCheckIn}
          onSuccess={handleBankTransferSuccess}
          onClose={() => setBankTransferModalData(null)}
          onCancelAndChangeMethod={handleCancelPendingBooking}
        />
      )}

      {/* Camera QR Scanner Modal */}
      <StaffCameraQrScannerModal
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        onScanSuccess={(code) => {
          handleQrScanDecoded(code)
          setIsCameraScannerOpen(false)
        }}
      />
    </div>
  )
}

function buildSlotsFromAvailability(
  hourlyData: HourlySlotAvailability[],
  playMode: "RENTAL" | "BYOC",
): DailySlot[] {
  return hourlyData.map(({ hour, data }) => {
    const startTime = `${String(hour).padStart(2, "0")}:00`
    const endTime = `${String(hour + 1).padStart(2, "0")}:00`
    if (!data) {
      return {
        id: startTime,
        startTime,
        endTime,
        status: "booked" as DailySlotStatus,
        remaining: 0,
        rentalCount: 0,
        byocRemaining: 0,
        capacityKind: playMode === "RENTAL" ? "rental_vehicle" : "byoc_spot",
      }
    }

    const rentalCount = data.vehicles?.length ?? 0
    const byocRemaining = data.byoc_remaining ?? 0

    let remaining: number
    let available: boolean
    if (playMode === "RENTAL") {
      remaining = rentalCount
      available = rentalCount > 0
    } else {
      remaining = byocRemaining
      available = byocRemaining > 0
    }

    let status: DailySlotStatus
    if (!available) status = "booked"
    else if (remaining <= 2) status = "limited"
    else status = "available"

    return {
      id: startTime,
      startTime,
      endTime,
      status,
      remaining,
      rentalCount: playMode === "BYOC" ? 0 : rentalCount,
      byocRemaining: playMode === "RENTAL" ? 0 : byocRemaining,
      capacityKind: playMode === "RENTAL" ? "rental_vehicle" : "byoc_spot",
    }
  })
}
