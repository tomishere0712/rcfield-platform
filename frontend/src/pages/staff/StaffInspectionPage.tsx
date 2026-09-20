import React, { useState, useEffect, useMemo } from "react"
import { useParams, useSearchParams, useNavigate } from "react-router"
import { useQuery } from "@tanstack/react-query"
import {
  Camera,
  ClipboardList,
  AlertTriangle,
  AlertCircle,
  ChevronLeft,
  Info,
  FileCheck,
  CheckCircle2,
  Check,
  Plus,
  Trash2,
  ImagePlus,
  Loader2,
  Wrench,
} from "lucide-react"
import { useStaffOperations } from "./context/StaffOperationContext"
import { staffApi, type DamageLineItemInput } from "@/features/staff/api/staff.api"
import { uploadImage } from "@/features/uploads/api/upload.api"
import { toast } from "sonner"
import { cn } from "@/shared/lib/utils"
import { ZoomableInspectionImage } from "@/shared/components/ZoomableInspectionImage"
import {
  StaffCard,
  StaffButton,
} from "./components/StaffUI"

const MIN_RENTAL_INSPECTION_PHOTOS = 4
const MAX_RENTAL_INSPECTION_PHOTOS = 6

type InspectionPhotoData = {
  url: string
  angle?: string
  direction?: string
  notes?: string
}

type InspectionChecklistItem = {
  itemKey?: string
  itemLabel?: string
  status?: string
  checked?: boolean
  notes?: string
  note?: string
  id?: string
  label?: string
}

type InspectionRecord = {
  type: "CHECK_IN" | "CHECK_OUT"
  photos: InspectionPhotoData[]
  staffNotes?: string
  notes?: string
  checklist?: InspectionChecklistItem[]
  damageFlagged?: boolean
  damageDescription?: string
}

type InspectionSession = {
  sessionId: string
  bookingId: string
  status?: string
  inspections: InspectionRecord[]
}

type InspectionBooking = {
  bookingId: string
  playMode: "RENTAL" | "BYOC" | "MIXED"
  participantDetails?: { name: string }[]
  plannedParticipants?: string[]
}

type InspectionSessionApiData = {
  id?: string
  sessionId?: string
  bookingId?: string
  status?: string
  inspections?: InspectionRecord[]
  booking?: {
    id?: string
    bookingId?: string
    playMode?: "RENTAL" | "BYOC" | "MIXED"
    mode?: "RENTAL" | "BYOC" | "MIXED"
    participantDetails?: { name: string }[]
    plannedParticipants?: string[]
  }
}

function parseCurrencyInput(value: string | number): number {
  if (typeof value === "number") return isNaN(value) ? 0 : Math.max(0, value)
  if (!value) return 0
  const clean = value.toString().replace(/\D/g, "")
  const parsed = parseInt(clean, 10)
  return isNaN(parsed) ? 0 : Math.max(0, parsed)
}

export default function StaffInspectionPage() {
  const [searchParams] = useSearchParams()
  const { sessionId: routeSessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { sessions, bookings, submitInspection, refreshData } = useStaffOperations()

  const sessionId = routeSessionId ?? searchParams.get("sessionId")
  const requestedType = searchParams.get("type") as "CHECK_IN" | "CHECK_OUT" | null

  const contextSession = sessions.find((item) => item.sessionId === sessionId)
  const contextBooking = contextSession
    ? bookings.find((item) => item.bookingId === contextSession.bookingId)
    : null
  // A session may be opened from history or from a real-time notification,
  // neither of which is guaranteed to exist in the "today bookings" context.
  // Fetch the authoritative detail by route ID so a valid action never depends
  // on that transient list being populated.
  const { data: apiSession, isLoading: isLoadingSession } = useQuery<InspectionSessionApiData>({
    queryKey: ["staff", "inspection-session", sessionId],
    queryFn: () => staffApi.getSessionDetail(sessionId!) as Promise<InspectionSessionApiData>,
    enabled: Boolean(sessionId),
    retry: false,
  })
  const session = useMemo<InspectionSession | null>(() => {
    if (apiSession) {
      return {
        sessionId: apiSession.sessionId ?? apiSession.id ?? sessionId ?? "",
        bookingId: apiSession.bookingId ?? apiSession.booking?.bookingId ?? apiSession.booking?.id ?? "",
        status: apiSession.status,
        inspections: apiSession.inspections ?? [],
      }
    }
    return contextSession ?? null
  }, [apiSession, contextSession, sessionId])
  const booking = useMemo<InspectionBooking | null>(() => {
    if (apiSession?.booking) {
      return {
        bookingId: apiSession.booking.bookingId ?? apiSession.booking.id ?? session?.bookingId ?? "",
        playMode: apiSession.booking.playMode ?? apiSession.booking.mode ?? contextBooking?.playMode ?? "RENTAL",
        participantDetails: apiSession.booking.participantDetails,
        plannedParticipants: apiSession.booking.plannedParticipants,
      }
    }
    return contextBooking ?? null
  }, [apiSession, contextBooking, session?.bookingId])
  const type = requestedType ?? (
    session?.status === "CHECKED_IN" ? "CHECK_IN" : session ? "CHECK_OUT" : null
  )
  const isByoc = booking?.playMode === "BYOC"

  // Rental evidence is flexible: staff can add the useful angles for this car.
  type RentalPhoto = { id: string; url: string; notes: string }
  const [rentalPhotos, setRentalPhotos] = useState<RentalPhoto[]>([])
  const [isUploadingRentalPhotos, setIsUploadingRentalPhotos] = useState(false)

  // ── BYOC: per-participant photo state ────────────────────────────────────────
  type ByocPhoto = { participantName: string; url: string; notes: string }
  const [byocPhotos, setByocPhotos] = useState<ByocPhoto[]>([])

  // Sync slots when booking data arrives (handles direct URL load where booking may be null on first render)
  useEffect(() => {
    if (!isByoc || !booking) return
    const names = booking.participantDetails?.map((p) => p.name) ??
      booking.plannedParticipants ??
      ["Người chơi"]
    queueMicrotask(() => {
      setByocPhotos((prev) =>
        names.map((name) => prev.find((p) => p.participantName === name) ?? { participantName: name, url: "", notes: "" })
      )
    })
  }, [booking, isByoc])

  const [checklist, setChecklist] = useState<
    { id: string; label: string; checked: boolean; notes?: string; partType?: string }[]
  >([])
  const [staffNotes, setStaffNotes] = useState("")

  // RENTAL check-out only
  const [damageFlagged, setDamageFlagged] = useState(false)
  const [damageLineItems, setDamageLineItems] = useState<DamageLineItemInput[]>([])
  const [showCheckInBaselines, setShowCheckInBaselines] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (isByoc) {
      queueMicrotask(() => {
        setChecklist([
          { id: "byoc-1", label: "Khách đến đúng giờ và xuất trình xe cá nhân", checked: true },
          { id: "byoc-2", label: "Xe của khách đã được kiểm tra an toàn cơ bản (pin, remote)", checked: true },
          { id: "byoc-3", label: "Khách đã xác nhận tự chịu trách nhiệm về xe cá nhân", checked: true },
        ])
      })
      return
    }

    if (type === "CHECK_IN") {
      queueMicrotask(() => {
        setChecklist([
          { id: "ck-in-battery", label: "Pin đủ điện, đã sạc trước ca", checked: true },
          { id: "ck-in-servo", label: "Tay lái servo phản hồi tốt, bẻ cua bình thường", checked: true },
          { id: "ck-in-tire", label: "Lốp và bánh xe gắn chắc chắn, không lung lay", checked: true },
          { id: "ck-in-remote", label: "Remote bắt sóng nhạy, xe phản hồi lệnh ổn định", checked: true },
          { id: "ck-in-chassis", label: "Khung gầm và vỏ xe nguyên vẹn trước khi giao", checked: true },
        ])
      })
    } else if (type === "CHECK_OUT") {
      queueMicrotask(() => {
        setChecklist([
          { id: "ck-chassis", partType: "CHASSIS", label: "Khung gầm xe (nứt, gãy, cong vênh, biến dạng)", checked: true },
          { id: "ck-shell", partType: "SHELL", label: "Vỏ nhựa xe / Shell (móp méo, rách vỡ, xước sâu)", checked: true },
          { id: "ck-spoiler", partType: "SPOILER", label: "Cánh gió (gãy, biến dạng, rơi rụng)", checked: true },
          { id: "ck-tire", partType: "TIRE_WHEEL", label: "Bánh xe & Lốp (văng ốc hex, mòn rách, kẹt trục)", checked: true },
          { id: "ck-motor", partType: "MOTOR", label: "Motor / Động cơ (kẹt quay, quá nhiệt, mùi khét)", checked: true },
          { id: "ck-servo", partType: "SERVO", label: "Hệ thống lái / Servo (kẹt góc, trượt bánh răng)", checked: true },
          { id: "ck-remote", partType: "REMOTE", label: "Remote điều khiển (đủ tay cầm, cần lái nguyên vẹn)", checked: true },
        ])
      })
    }
  }, [type, isByoc])


  if (!sessionId) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-4">
        <AlertTriangle className="size-12 text-[#6b7280] mb-3" />
        <h3 className="text-lg font-bold text-[#1c1b1b]">Không tìm thấy thông tin ca kiểm xe</h3>
        <p className="text-xs text-[#6b7280] mt-1 font-semibold">Thiếu mã phiên chơi.</p>
      </div>
    )
  }

  if (isLoadingSession && (!session || !booking || !type)) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-4 text-[#6b7280]">
        <Loader2 className="size-7 animate-spin text-[#ea580c]" />
        <p className="text-sm font-semibold">Đang tải thông tin ca kiểm xe...</p>
      </div>
    )
  }

  if (!session || !booking || !type) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-4">
        <AlertTriangle className="size-12 text-[#6b7280] mb-3" />
        <h3 className="text-lg font-bold text-[#1c1b1b]">Không tìm thấy ca kiểm xe</h3>
        <p className="text-xs text-[#6b7280] mt-1 font-semibold">Phiên chơi không tồn tại hoặc bạn không có quyền thao tác.</p>
      </div>
    )
  }

  // BYOC không có checkout inspection — staff đóng phiên trực tiếp
  if (isByoc && type === "CHECK_OUT") {
    const handleCloseByocSession = async () => {
      setIsClosing(true)
      try {
        await staffApi.simulateClientCheckOut(session.sessionId)
        toast.success("Đã đóng phiên chơi thành công!", {
          description: "Đơn đặt lịch đã được cập nhật trạng thái hoàn thành.",
        })
        await refreshData()
        navigate(`/staff/sessions/${session.sessionId}`)
      } catch (err) {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        toast.error(msg ?? "Không thể đóng phiên chơi. Vui lòng thử lại.")
      } finally {
        setIsClosing(false)
      }
    }

    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-4">
        <Info className="size-12 text-blue-400" />
        <h3 className="text-lg font-bold text-[#1c1b1b]">Không cần kiểm tra trả xe</h3>
        <p className="text-sm text-[#6b7280] text-center max-w-xs font-semibold">
          Chế độ mang xe riêng — khách tự chịu trách nhiệm với xe của họ, không cần biên bản trả xe.
        </p>
        <div className="flex flex-col gap-2 w-full max-w-xs">
          <StaffButton
            type="button"
            onClick={handleCloseByocSession}
            disabled={isClosing}
            className="w-full"
          >
            <CheckCircle2 className="size-4" />
            {isClosing ? "Đang đóng phiên..." : "Đóng phiên chơi"}
          </StaffButton>
          <StaffButton
            type="button"
            variant="outline"
            onClick={() => navigate(`/staff/sessions/${session.sessionId}`)}
            className="w-full"
          >
            <ChevronLeft className="size-4" />
            Quay lại phiên chạy
          </StaffButton>
        </div>
      </div>
    )
  }

  const handleRentalPhotoFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ""
    if (files.length === 0) return

    const remaining = MAX_RENTAL_INSPECTION_PHOTOS - rentalPhotos.length
    if (remaining <= 0) {
      toast.error(`Mỗi biên bản chỉ nhận tối đa ${MAX_RENTAL_INSPECTION_PHOTOS} ảnh.`)
      return
    }

    const limitedFiles = files.slice(0, remaining)
    const validFiles = limitedFiles.filter(
      (file) => file.type.startsWith("image/") && file.size <= 5 * 1024 * 1024,
    )
    if (validFiles.length !== limitedFiles.length) {
      toast.error("Chỉ nhận ảnh tối đa 5MB mỗi tệp. Các tệp không hợp lệ đã được bỏ qua.")
    }
    if (files.length > remaining) {
      toast.info(`Chỉ thêm ${remaining} ảnh để đủ giới hạn ${MAX_RENTAL_INSPECTION_PHOTOS} ảnh.`)
    }
    if (validFiles.length === 0) return

    setIsUploadingRentalPhotos(true)
    try {
      const uploaded = await Promise.all(validFiles.map((file) => uploadImage(file, "inspections")))
      setRentalPhotos((previous) => [
        ...previous,
        ...uploaded.map((item) => ({ id: item.publicId, url: item.url, notes: "" })),
      ])
      toast.success(`Đã tải lên ${uploaded.length} ảnh bàn giao.`)
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(message ?? "Không thể tải ảnh. Vui lòng thử lại.")
    } finally {
      setIsUploadingRentalPhotos(false)
    }
  }

  const handleByocPhotoChange = (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) { toast.error("Vui lòng chọn đúng định dạng ảnh."); return }
    if (file.size > 5 * 1024 * 1024) { toast.error("Ảnh không nên vượt quá 5MB."); return }

    const reader = new FileReader()
    reader.onload = () => {
      setByocPhotos((prev) =>
        prev.map((p, i) => i === index ? { ...p, url: String(reader.result) } : p)
      )
      toast.success(`Đã thêm ảnh xác nhận xe của ${byocPhotos[index]?.participantName ?? "khách"}.`)
    }
    reader.readAsDataURL(file)
  }

  const PART_TYPE_LABELS: Record<string, string> = {
    CHASSIS: "Khung gầm",
    SHELL: "Vỏ nhựa (Shell)",
    SPOILER: "Cánh gió",
    TIRE_WHEEL: "Bánh xe / Lốp",
    MOTOR: "Motor / Động cơ",
    SERVO: "Servo / Tay lái",
    REMOTE: "Remote / Điều khiển",
    OTHER: "Khác",
  }

  const setChecklistItemStatus = (id: string, isOk: boolean) => {
    const targetItem = checklist.find((item) => item.id === id)
    if (!targetItem) return

    const newChecklist = checklist.map((item) =>
      item.id === id ? { ...item, checked: isOk } : item,
    )
    setChecklist(newChecklist)

    if (type === "CHECK_OUT" && targetItem.partType) {
      const partType = targetItem.partType as DamageLineItemInput["partType"]
      if (!isOk) {
        // Có hư hại: Tự động bật damageFlagged và thêm dòng linh kiện nếu chưa có
        setDamageFlagged(true)
        setDamageLineItems((prev) => {
          if (prev.some((d) => d.partType === partType)) {
            return prev
          }
          return [
            ...prev,
            { partType, partsPrice: 0, laborPrice: 0 },
          ]
        })
      } else {
        // Bình thường: Xóa dòng linh kiện khỏi bảng bồi thường
        setDamageLineItems((prev) => {
          const next = prev.filter((d) => d.partType !== targetItem.partType)
          const allOk = newChecklist.every((item) => item.checked)
          if (next.length === 0 && allOk) {
            setDamageFlagged(false)
          }
          return next
        })
      }
    }
  }

  const toggleChecklistItem = (id: string) => {
    const item = checklist.find((i) => i.id === id)
    if (item) {
      setChecklistItemStatus(id, !item.checked)
    }
  }

  const handleChecklistNotes = (id: string, notes: string) => {
    setChecklist(checklist.map((item) => (item.id === id ? { ...item, notes } : item)))
  }

  const totalDamageCharge = damageLineItems.reduce(
    (sum, item) => sum + (item.partsPrice || 0) + (item.laborPrice || 0), 0
  )

  const addDamageItem = () => {
    setDamageFlagged(true)
    setDamageLineItems((prev) => [
      ...prev,
      { partType: "OTHER", customPartName: "", partsPrice: 0, laborPrice: 0 },
    ])
  }

  const removeDamageItem = (index: number) => {
    const itemToRemove = damageLineItems[index]
    const nextDamageItems = damageLineItems.filter((_, i) => i !== index)
    setDamageLineItems(nextDamageItems)

    if (itemToRemove?.partType) {
      const hasOtherSamePart = nextDamageItems.some(
        (d) => d.partType === itemToRemove.partType,
      )
      if (!hasOtherSamePart) {
        setChecklist((prev) =>
          prev.map((item) =>
            item.partType === itemToRemove.partType
              ? { ...item, checked: true, notes: "" }
              : item,
          ),
        )
      }
    }

    const allOk = checklist.every((item) => item.checked)
    if (nextDamageItems.length === 0 && allOk) {
      setDamageFlagged(false)
    }
  }

  const updateDamageItem = (index: number, field: keyof DamageLineItemInput, value: string | number) => {
    setDamageLineItems((prev) => {
      const updated = prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
      return updated
    })
  }

  const handleToggleDamageFlagged = (checked: boolean) => {
    setDamageFlagged(checked)
    if (!checked) {
      setDamageLineItems([])
      setChecklist((prev) => prev.map((item) => ({ ...item, checked: true, notes: "" })))
    } else {
      if (damageLineItems.length === 0) {
        // Tự động thêm dòng đầu tiên
        setDamageLineItems([
          { partType: "OTHER", customPartName: "", partsPrice: 0, laborPrice: 0 },
        ])
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)

    try {
      let submitted: boolean

      if (isByoc) {
        const missing = byocPhotos.filter((p) => !p.url)
        if (missing.length > 0) {
          toast.error(`Vui lòng chụp ảnh xác nhận xe cho: ${missing.map((p) => p.participantName).join(", ")}`)
          return
        }
        const directions = ["FRONT", "BACK", "LEFT", "RIGHT"] as const
        submitted = await submitInspection(
          session.sessionId,
          type,
          byocPhotos.map((p, i) => ({
            direction: directions[i % directions.length],
            url: p.url,
            notes: p.notes || `Xe của ${p.participantName}`,
          })),
          checklist,
          staffNotes,
          false,
          undefined,
        )
      } else {
        if (rentalPhotos.length < MIN_RENTAL_INSPECTION_PHOTOS) {
          toast.error(`Vui lòng thêm tối thiểu ${MIN_RENTAL_INSPECTION_PHOTOS} ảnh thực tế của xe để lập biên bản.`)
          return
        }
        if (damageFlagged && damageLineItems.length === 0) {
          toast.error("Vui lòng thêm ít nhất một hạng mục hư hỏng.")
          return
        }
        if (damageFlagged && damageLineItems.some((item) => item.partType === "OTHER" && !item.customPartName?.trim())) {
          toast.error('Vui lòng nhập tên hư hỏng cho mục "Khác".')
          return
        }

        const photosArray = rentalPhotos.map((photo) => ({
          direction: "OTHER" as const,
          url: photo.url,
          notes: photo.notes || undefined,
        }))

        submitted = await submitInspection(
          session.sessionId,
          type,
          photosArray,
          checklist,
          staffNotes,
          damageFlagged,
          damageFlagged ? damageLineItems : undefined,
        )
      }

      if (!submitted) return

      navigate(`/staff/sessions/${session.sessionId}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const checkInInspection = session.inspections.find((i) => i.type === "CHECK_IN")
  const remainingRentalPhotos = Math.max(0, MIN_RENTAL_INSPECTION_PHOTOS - rentalPhotos.length)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <StaffButton
          onClick={() => navigate(`/staff/sessions/${session.sessionId}`)}
          variant="outline"
          size="sm"
          className="p-2 min-w-0 rounded-lg"
          type="button"
        >
          <ChevronLeft className="size-5 text-[#6b7280]" />
        </StaffButton>
        <div>
          <span className="text-xs text-[#6b7280] font-bold font-mono">Phiên chạy: {session.sessionId}</span>
          <h2 className="text-xl font-extrabold text-[#1c1b1b] tracking-tight">
            {type === "CHECK_IN"
              ? isByoc ? "Xác nhận xe tự mang" : "Lập biên bản bàn giao"
              : "Lập biên bản trả xe"}
          </h2>
          {isByoc && (
            <span className="inline-block mt-0.5 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 uppercase tracking-wide">
              Chế độ mang xe riêng
            </span>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Photo Section */}
        <StaffCard className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#1c1b1b] flex items-center gap-2">
              <Camera className="size-4.5 text-[#ea580c]" />
              {isByoc
                ? `Chụp ảnh xác nhận xe khách (${byocPhotos.length} người — bắt buộc mỗi xe 1 ảnh)`
                : `Ảnh bàn giao xe (${rentalPhotos.length}/${MAX_RENTAL_INSPECTION_PHOTOS})`}
            </h3>
            {!isByoc && type === "CHECK_OUT" && checkInInspection && (
              <StaffButton
                type="button"
                onClick={() => setShowCheckInBaselines(!showCheckInBaselines)}
                variant={showCheckInBaselines ? "primary" : "outline"}
                size="sm"
                className="flex items-center gap-1.5 font-bold"
              >
                <FileCheck className="size-4" />
                {showCheckInBaselines ? "Ẩn biên bản bàn giao gốc" : "So sánh biên bản bàn giao gốc (Ảnh & Checklist)"}
              </StaffButton>
            )}
          </div>

          {isByoc ? (
            /* BYOC: one photo slot per participant */
            <div className={cn(
              "grid gap-4",
              byocPhotos.length === 1 ? "grid-cols-1 max-w-xs mx-auto" :
              byocPhotos.length === 2 ? "grid-cols-2" :
              "grid-cols-2 md:grid-cols-3"
            )}>
              {byocPhotos.map((slot, index) => (
                <div key={index} className="space-y-2">
                  {/* Participant label */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-extrabold text-[#4c4a49] uppercase tracking-wider truncate">
                      {slot.participantName}
                    </span>
                    {slot.url && (
                      <span className="shrink-0 text-[9px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1 py-0.5 leading-none uppercase">
                        ✓ Đã chụp
                      </span>
                    )}
                    {!slot.url && (
                      <span className="shrink-0 text-[9px] font-extrabold text-rose-600 bg-rose-50 border border-rose-200 rounded px-1 py-0.5 leading-none uppercase">
                        Bắt buộc
                      </span>
                    )}
                  </div>

                  {/* Photo upload zone */}
                  <div
                    className={cn(
                      "aspect-video rounded-xl border-2 border-dashed border-[#e5e2e1] bg-[#fcf8f8] overflow-hidden relative group transition-all",
                      slot.url && "border-solid border-[#e5e2e1]",
                      !slot.url && "border-rose-200"
                    )}
                  >
                    {slot.url ? (
                      <>
                        <div
                          className="h-full w-full"
                          onClickCapture={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                          }}
                        >
                          <ZoomableInspectionImage
                            src={slot.url}
                            alt={`Xe tự mang của ${slot.participantName}`}
                            className="h-full w-full object-cover"
                            buttonClassName="h-full w-full"
                          />
                        </div>
                        <label
                          htmlFor={`byoc-photo-${index}`}
                          className="absolute bottom-2 right-2 cursor-pointer rounded-lg bg-black/70 px-2 py-1 text-[10px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          Đổi ảnh
                        </label>
                      </>
                    ) : (
                      <label
                        htmlFor={`byoc-photo-${index}`}
                        className="flex h-full w-full cursor-pointer flex-col items-center justify-center hover:bg-[#fff3eb]/30"
                      >
                        <Camera className="size-6 text-[#6b7280] mb-1.5" />
                        <span className="text-xs font-bold text-[#ea580c]">+ Chụp ảnh xe</span>
                        <span className="text-[10px] text-[#a09e9d] mt-0.5 font-semibold px-2 text-center">Toàn cảnh xe để xác nhận</span>
                      </label>
                    )}
                    <input
                      id={`byoc-photo-${index}`}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      onChange={(e) => handleByocPhotoChange(index, e)}
                    />
                  </div>

                  {/* Notes field */}
                  {slot.url && (
                    <input
                      type="text"
                      placeholder="Màu, đặc điểm xe..."
                      value={slot.notes}
                      onChange={(e) => setByocPhotos((prev) =>
                        prev.map((p, i) => i === index ? { ...p, notes: e.target.value } : p)
                      )}
                      className="w-full rounded-lg border border-[#e5e2e1] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#1c1b1b] placeholder-[#a09e9d] focus:outline-none focus:border-[#ea580c]"
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-relaxed text-amber-900">
                Cần tối thiểu {MIN_RENTAL_INSPECTION_PHOTOS} và tối đa {MAX_RENTAL_INSPECTION_PHOTOS} ảnh. Hãy chụp tổng thể xe, phía trước, phía sau, hai bên và cận cảnh mọi vết xước hoặc hư hỏng hiện có để đối chiếu khi trả xe.
              </div>

              {rentalPhotos.length < MAX_RENTAL_INSPECTION_PHOTOS && (
                <label
                  htmlFor="rental-inspection-photos"
                  className={cn(
                    "flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#f4b08c] bg-[#fff7f2] px-4 text-center transition-colors hover:border-[#ea580c] hover:bg-[#fff1e8]",
                    isUploadingRentalPhotos && "pointer-events-none opacity-60",
                  )}
                >
                  {isUploadingRentalPhotos ? (
                    <Loader2 className="mb-2 size-6 animate-spin text-[#ea580c]" />
                  ) : (
                    <ImagePlus className="mb-2 size-6 text-[#ea580c]" />
                  )}
                  <span className="text-sm font-extrabold text-[#1c1b1b]">
                    {isUploadingRentalPhotos ? "Đang tải ảnh..." : "Chọn nhiều ảnh cùng lúc"}
                  </span>
                  <span className="mt-1 text-xs font-medium text-[#6b7280]">
                    Tối thiểu {MIN_RENTAL_INSPECTION_PHOTOS}, tối đa {MAX_RENTAL_INSPECTION_PHOTOS} ảnh · JPG/PNG/WEBP · mỗi ảnh không quá 5MB
                  </span>
                  <input
                    id="rental-inspection-photos"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="sr-only"
                    onChange={handleRentalPhotoFiles}
                  />
                </label>
              )}

              {rentalPhotos.length > 0 && (
                <div className="space-y-2">
                  {remainingRentalPhotos > 0 && (
                    <p className="text-xs font-bold text-amber-700">
                      Cần thêm {remainingRentalPhotos} ảnh để đủ điều kiện lưu biên bản.
                    </p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {rentalPhotos.map((photo, index) => (
                      <div key={photo.id} className="overflow-hidden rounded-xl border border-[#e5e2e1] bg-white">
                      <div className="relative aspect-video bg-[#f5f3f2]">
                        <ZoomableInspectionImage
                          src={photo.url}
                          alt={`Ảnh bàn giao xe ${index + 1}`}
                          className="h-full w-full object-cover"
                          buttonClassName="h-full w-full"
                        />
                        <button
                          type="button"
                          onClick={() => setRentalPhotos((previous) => previous.filter((item) => item.id !== photo.id))}
                          className="absolute right-2 top-2 rounded-lg bg-white/95 p-1.5 text-rose-600 shadow-sm transition-colors hover:bg-rose-50"
                          aria-label={`Xóa ảnh ${index + 1}`}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      <div className="space-y-1.5 p-2.5">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#6b7280]">Ảnh {index + 1}</span>
                        <input
                          type="text"
                          placeholder="Ghi chú tùy chọn, ví dụ: vết xước cản trước"
                          value={photo.notes}
                          onChange={(event) => setRentalPhotos((previous) => previous.map((item) => item.id === photo.id ? { ...item, notes: event.target.value } : item))}
                          className="w-full rounded-lg border border-[#e5e2e1] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#1c1b1b] placeholder-[#a09e9d] focus:border-[#ea580c] focus:outline-none"
                        />
                      </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {showCheckInBaselines && checkInInspection && (
                <div className="border-t border-blue-100 bg-blue-50/40 -mx-6 -mb-6 p-6 rounded-b-2xl space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between border-b border-blue-200/60 pb-3">
                    <div className="flex items-center gap-2">
                      <FileCheck className="size-4.5 text-blue-700" />
                      <span className="text-xs font-black uppercase tracking-wider text-blue-900">
                        Biên bản đối chiếu lúc bàn giao xe (Check-In gốc)
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full border border-blue-200">
                      Dữ liệu đối chứng
                    </span>
                  </div>

                  {/* 1. Ghi chú của nhân viên lúc bàn giao */}
                  <div className="rounded-xl border border-blue-200 bg-white p-3.5 space-y-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wide text-blue-800 flex items-center gap-1">
                      <Info className="size-3.5 text-blue-600" />
                      Ghi chú của nhân viên lúc giao xe:
                    </span>
                    <p className="text-xs font-semibold text-slate-800 leading-relaxed pl-4.5">
                      {checkInInspection.staffNotes ||
                        checkInInspection.notes ||
                        checkInInspection.damageDescription ||
                        "Không có ghi chú bất thường khi bàn giao xe (Xe ở tình trạng bình thường)."}
                    </p>
                  </div>

                  {/* 2. Checklist linh kiện lúc bàn giao */}
                  {checkInInspection.checklist && checkInInspection.checklist.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wide text-blue-800 block">
                        Tình trạng linh kiện khi bàn giao xe:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {checkInInspection.checklist.map((item, idx) => {
                          const isOk = item.checked ?? (item.status === "OK")
                          return (
                            <div
                              key={idx}
                              className={cn(
                                "flex items-center justify-between p-2.5 rounded-lg border bg-white text-xs",
                                isOk ? "border-slate-200" : "border-amber-300 bg-amber-50/50",
                              )}
                            >
                              <span className="font-semibold text-slate-900 truncate mr-2">
                                {item.itemLabel || item.label || item.itemKey}
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {isOk ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                    <CheckCircle2 className="size-3" />
                                    Đạt
                                  </span>
                                ) : (
                                  <span
                                    className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200"
                                    title={item.notes || item.note}
                                  >
                                    <AlertTriangle className="size-3" />
                                    {item.notes || item.note || "Có lỗi"}
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* 3. Ảnh chụp lúc nhận xe */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-800 block">
                      Ảnh chụp lúc bàn giao ({checkInInspection.photos.length} ảnh):
                    </span>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                      {checkInInspection.photos.map((photo, index) => (
                        <div
                          key={`${photo.url}-${index}`}
                          className="group relative overflow-hidden rounded-xl border border-blue-200 bg-white shadow-2xs"
                        >
                          <ZoomableInspectionImage
                            src={photo.url}
                            alt={`Ảnh nhận xe ${index + 1}`}
                            className="aspect-video w-full object-cover"
                          />
                          <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-xs">
                            Ảnh gốc #{index + 1}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </StaffCard>

        {/* Checklist & Notes */}
        <div className="grid md:grid-cols-2 gap-6">
          <StaffCard className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#1c1b1b] flex items-center gap-2">
                <ClipboardList className="size-4.5 text-[#ea580c]" />
                {isByoc
                  ? "Xác nhận điều kiện tham gia"
                  : type === "CHECK_OUT"
                    ? "Nghiệm thu linh kiện xe khi trả"
                    : "Danh mục kiểm tra an toàn linh kiện"}
              </h3>
              {type === "CHECK_OUT" && !isByoc && (
                <span
                  className={cn(
                    "text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border",
                    checklist.every((i) => i.checked)
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-rose-50 text-rose-700 border-rose-200",
                  )}
                >
                  {checklist.every((i) => i.checked)
                    ? `🟢 Đạt chuẩn (${checklist.length}/${checklist.length})`
                    : `🔴 Phát hiện ${checklist.filter((i) => !i.checked).length} lỗi`}
                </span>
              )}
            </div>

            {type === "CHECK_OUT" && !isByoc ? (
              <div className="space-y-2.5">
                {checklist.map((item) => {
                  const isOk = item.checked
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "p-3 rounded-xl border transition-all duration-200 space-y-2",
                        isOk
                          ? "bg-white border-[#e5e2e1]"
                          : "bg-rose-50/40 border-rose-200 shadow-2xs",
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          {isOk ? (
                            <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                          ) : (
                            <AlertCircle className="size-4 text-rose-600 shrink-0 mt-0.5" />
                          )}
                          <span className="text-xs font-bold text-[#1c1b1b] leading-tight">
                            {item.label}
                          </span>
                        </div>

                        {/* 2-state toggle buttons */}
                        <div className="flex items-center rounded-lg bg-[#f5f3f2] p-0.5 border border-[#e5e2e1] shrink-0">
                          <button
                            type="button"
                            onClick={() => setChecklistItemStatus(item.id, true)}
                            className={cn(
                              "px-2.5 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1",
                              isOk
                                ? "bg-emerald-600 text-white shadow-2xs"
                                : "text-[#6b7280] hover:text-[#1c1b1b]",
                            )}
                          >
                            <Check className="size-3" />
                            Đạt
                          </button>
                          <button
                            type="button"
                            onClick={() => setChecklistItemStatus(item.id, false)}
                            className={cn(
                              "px-2.5 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1",
                              !isOk
                                ? "bg-rose-600 text-white shadow-2xs"
                                : "text-[#6b7280] hover:text-rose-600",
                            )}
                          >
                            <AlertTriangle className="size-3" />
                            Hư hại
                          </button>
                        </div>
                      </div>

                      {!isOk && (
                        <div className="space-y-1.5 pt-1">
                          <input
                            type="text"
                            placeholder={`Mô tả chi tiết vết hư hại cho ${item.label.split("(")[0].trim()}...`}
                            value={item.notes || ""}
                            onChange={(e) => handleChecklistNotes(item.id, e.target.value)}
                            className="w-full rounded-lg border border-rose-300 bg-white px-2.5 py-1.5 text-[11px] text-rose-900 font-semibold focus:outline-none focus:ring-1 focus:ring-rose-500 placeholder-rose-300"
                          />
                          <div className="flex items-center gap-1 text-[10px] text-amber-700 font-bold">
                            <Wrench className="size-3" />
                            <span>Đã tự động thêm vào Bảng bồi thường hư hỏng bên dưới</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="space-y-3.5">
                {checklist.map((item) => (
                  <div key={item.id} className="space-y-1">
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => toggleChecklistItem(item.id)}
                        className="mt-0.5 rounded border-[#e5e2e1] text-[#ea580c] focus:ring-[#ea580c] bg-white"
                      />
                      <span className="text-xs font-semibold text-[#4c4a49] leading-tight">
                        {item.label}
                      </span>
                    </label>
                    {!item.checked && (
                      <input
                        type="text"
                        placeholder="Ghi chú thêm..."
                        value={item.notes || ""}
                        onChange={(e) => handleChecklistNotes(item.id, e.target.value)}
                        className="ml-6 w-[calc(100%-1.5rem)] rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] text-rose-800 font-bold focus:outline-none"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </StaffCard>

          <StaffCard className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#1c1b1b]">
              Ghi chú tổng quan biên bản
            </h3>
            <textarea
              rows={4}
              placeholder={
                isByoc
                  ? "Ghi chú về xe khách hoặc điều kiện đặc biệt..."
                  : "Nhập nhận xét chung của kiểm định viên..."
              }
              value={staffNotes}
              onChange={(e) => setStaffNotes(e.target.value)}
              className="w-full rounded-xl border border-[#e5e2e1] bg-white p-4 text-xs font-semibold text-[#1c1b1b] focus:border-[#ea580c] focus:outline-none placeholder-[#a09e9d] resize-none"
            />
          </StaffCard>
        </div>

        {/* Damage section — RENTAL check-out only */}
        {!isByoc && type === "CHECK_OUT" && (
          <StaffCard className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={damageFlagged}
                  onChange={(e) => handleToggleDamageFlagged(e.target.checked)}
                  className="rounded border-[#e5e2e1] bg-white text-[#ea580c] focus:ring-[#ea580c]"
                />
                <span className="text-sm font-bold text-[#1c1b1b]">
                  Phát hiện hư hỏng do va chạm (Yêu cầu bồi thường sửa chữa)
                </span>
              </label>

              {damageFlagged && (
                <StaffButton type="button" size="sm" variant="outline" onClick={addDamageItem}>
                  <Plus className="size-3.5" />
                  Thêm hạng mục khác
                </StaffButton>
              )}
            </div>

            {damageFlagged && (
              <div className="border-t border-[#e5e2e1] pt-4 space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-[#4c4a49]">
                    Danh sách hạng mục linh kiện hư hỏng & bảng giá bồi thường
                  </h5>
                </div>

                {damageLineItems.length === 0 && (
                  <div className="rounded-lg border border-dashed border-[#e5e2e1] p-4 text-center">
                    <p className="text-xs text-[#6b7280] font-semibold">
                      Chưa có hạng mục nào. Chọn linh kiện bị hư hỏng ở checklist bên trên hoặc nhấn "Thêm hạng mục khác".
                    </p>
                  </div>
                )}

                {damageLineItems.map((item, index) => (
                  <div key={index} className="rounded-lg border border-[#e5e2e1] bg-[#fafaf9] p-3 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <select
                        value={item.partType}
                        onChange={(e) => updateDamageItem(index, "partType", e.target.value)}
                        className="flex-1 rounded-lg border border-[#e5e2e1] bg-white px-3 py-2 text-xs font-semibold text-[#1c1b1b] focus:outline-none focus:ring-1 focus:ring-[#ea580c]"
                      >
                        {Object.entries(PART_TYPE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeDamageItem(index)}
                        className="p-1.5 rounded text-[#6b7280] hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Xóa hạng mục này"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>

                    {item.partType === "OTHER" && (
                      <input
                        type="text"
                        placeholder="Nhập tên linh kiện / hư hỏng cụ thể..."
                        value={item.customPartName ?? ""}
                        onChange={(e) => updateDamageItem(index, "customPartName", e.target.value)}
                        className="w-full rounded-lg border border-[#e5e2e1] bg-white px-3 py-2 text-xs font-semibold text-[#1c1b1b] placeholder-[#a09e9d] focus:outline-none focus:ring-1 focus:ring-[#ea580c]"
                      />
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-[#6b7280] mb-1">
                          Giá linh kiện (đ)
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="0"
                          value={
                            item.partsPrice
                              ? Number(item.partsPrice).toLocaleString("vi-VN")
                              : ""
                          }
                          onChange={(e) =>
                            updateDamageItem(
                              index,
                              "partsPrice",
                              parseCurrencyInput(e.target.value),
                            )
                          }
                          className="w-full rounded-lg border border-[#e5e2e1] bg-white px-3 py-2 text-xs font-semibold text-[#1c1b1b] focus:outline-none focus:ring-1 focus:ring-[#ea580c]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-[#6b7280] mb-1">
                          Phí công sửa (đ)
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="0"
                          value={
                            item.laborPrice
                              ? Number(item.laborPrice).toLocaleString("vi-VN")
                              : ""
                          }
                          onChange={(e) =>
                            updateDamageItem(
                              index,
                              "laborPrice",
                              parseCurrencyInput(e.target.value),
                            )
                          }
                          className="w-full rounded-lg border border-[#e5e2e1] bg-white px-3 py-2 text-xs font-semibold text-[#1c1b1b] focus:outline-none focus:ring-1 focus:ring-[#ea580c]"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end text-xs font-bold text-[#4c4a49]">
                      Dòng này: {((item.partsPrice || 0) + (item.laborPrice || 0)).toLocaleString("vi-VN")} đ
                    </div>
                  </div>
                ))}

                {damageLineItems.length > 0 && (
                  <div className="rounded-xl bg-[#fcf8f8] border border-[#e5e2e1] p-4 space-y-3">
                    <div className="flex justify-between items-center text-sm font-extrabold text-[#1c1b1b]">
                      <span>Tổng phí bồi thường:</span>
                      <span className="text-rose-600 text-base">{totalDamageCharge.toLocaleString("vi-VN")} đ</span>
                    </div>
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-[10px] text-amber-800 flex gap-1.5 font-semibold">
                      <Info className="size-4 shrink-0 text-amber-600" />
                      Khách hàng sẽ xem bảng kê chi tiết và xác nhận trước khi thanh toán.
                    </div>
                  </div>
                )}
              </div>
            )}
          </StaffCard>
        )}

        {/* Actions */}
        <div className="flex gap-4 pt-2">
          <StaffButton
            type="button"
            onClick={() => navigate(`/staff/sessions/${session.sessionId}`)}
            variant="outline"
            className="flex-1"
          >
            Hủy bỏ
          </StaffButton>
          <StaffButton
            type="submit"
            variant="primary"
            className="flex-1 uppercase tracking-wider gap-1.5 font-bold"
            disabled={isSubmitting || (!isByoc && remainingRentalPhotos > 0)}
          >
            <FileCheck className="size-4.5" />
            {isSubmitting
              ? "Đang lưu..."
              : isByoc
                ? "Xác nhận xe khách"
                : remainingRentalPhotos > 0
                  ? `Cần thêm ${remainingRentalPhotos} ảnh`
                  : "Lưu biên bản kiểm định"}
          </StaffButton>
        </div>
      </form>
    </div>
  )
}
