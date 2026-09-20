import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/lib/utils"
import { Clock3 } from "lucide-react"
import { useState } from "react"

export type DailySlotStatus =
  | "available"
  | "limited"
  | "booked"
  /** Ngoài giờ mở cửa. */
  | "closed"
  /**
   * Sân bị một giải đấu giữ riêng trong khung giờ này.
   *
   * Tách khỏi `booked` vì hai thứ này khác hẳn nhau với khách: "hết chỗ" nghĩa
   * là thử giờ khác trong cùng ngày, còn "có giải đấu" thường khoá cả ngày và
   * việc cần làm là đổi sang ngày khác — hoặc đăng ký thi đấu.
   */
  | "contest"
export type DailySlotCapacityKind = "rental_vehicle" | "byoc_spot"

export type DailySlot = {
  id: string
  startTime: string
  endTime: string
  status: DailySlotStatus
  remaining: number
  rentalCount: number
  byocRemaining: number
  capacityKind: DailySlotCapacityKind
  /** Tên giải đang giữ sân — chỉ có khi `status === "contest"`. */
  contestName?: string
}

type DailySlotGridProps = {
  slots: DailySlot[]
  selectedSlotId: string
  selectedSlotEndId?: string
  onSelectSlot: (slotId: string) => void
  slotDurationMinutes: number
  openHour: number
  closeHour: number
  date?: string
  onSelectRange?: (slotStart: string, slotEnd: string) => void
  minBookingNoticeMinutes?: number
  noticeMessage?: string
  maxSelectableSlots?: number
  allowCurrentSlot?: boolean
}

function capacityLabel(kind: DailySlotCapacityKind): string {
  return kind === "rental_vehicle" ? "xe thuê" : "chỗ mang xe riêng"
}

function slotAvailabilityLabel(slot: DailySlot, isCurrent?: boolean): string {
  if (slot.status === "contest") return "Có giải đấu"
  if (slot.status === "booked") return "Hết"
  if (slot.status === "closed") return "Đóng"
  if (slot.remaining > 0) {
    if (isCurrent) return `Chơi ngay (${slot.remaining})`
    return `Còn ${slot.remaining} ${capacityLabel(slot.capacityKind)}`
  }
  return "Hết"
}

function addMinutesToTime(time: string, minutes: number): string {
  const [hh, mm] = time.split(":").map(Number)
  const total = hh * 60 + mm + minutes
  const endHH = String(Math.floor(total / 60)).padStart(2, "0")
  const endMM = String(total % 60).padStart(2, "0")
  return `${endHH}:${endMM}`
}

/**
 * Giờ vận hành sau nửa đêm được biểu diễn bằng số vượt 24 ("24:00" = 0 giờ sáng
 * hôm sau) để so sánh và sắp xếp không bị đứt đoạn. Nhưng người dùng phải thấy
 * "00:00", không phải "24:00".
 */
function formatSlotLabel(time: string): string {
  const [hh, mm] = time.split(":")
  const hour = Number(hh)
  if (!Number.isInteger(hour)) return time
  return `${String(hour % 24).padStart(2, "0")}:${mm ?? "00"}`
}

export function DailySlotGrid({
  slots,
  selectedSlotId,
  selectedSlotEndId,
  onSelectSlot,
  slotDurationMinutes,
  openHour,
  closeHour,
  date,
  onSelectRange,
  minBookingNoticeMinutes = 0,
  noticeMessage,
  maxSelectableSlots = 8,
  allowCurrentSlot = false,
}: DailySlotGridProps) {
  const [selectionLimitMessage, setSelectionLimitMessage] = useState(false)
  const today = new Date().toLocaleDateString("sv-SE")
  const isToday = date === today
  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const availabilityLabel = capacityLabel(
    slots[0]?.capacityKind ?? "rental_vehicle",
  )

  // Slot sau nửa đêm được đánh số vượt 24 (24:00, 25:00...) nên so trực tiếp là
  // đúng. Nếu nguồn dữ liệu nào đó trả về 00:00 cho ca đêm, cộng bù 24 để nó
  // không bị loại oan khỏi khung 09:00–01:00.
  const visibleSlots = slots.filter((s) => {
    const raw = parseInt(s.startTime.split(":")[0], 10)
    if (!Number.isInteger(raw)) return false
    const hour = raw < openHour && closeHour > 24 ? raw + 24 : raw
    return hour >= openHour && hour < closeHour
  })

  const operationalSlots = Math.floor(
    ((closeHour - openHour) * 60) / slotDurationMinutes,
  )

  const getSlotTiming = (slot: DailySlot) => {
    const [hh, mm] = slot.startTime.split(":").map(Number)
    const slotStartMinutes = hh * 60 + mm
    const slotEndMinutes = slotStartMinutes + slotDurationMinutes

    const isPast =
      isToday &&
      (allowCurrentSlot
        ? slotEndMinutes <= nowMinutes
        : slotStartMinutes < nowMinutes)
    const isCurrent =
      isToday &&
      allowCurrentSlot &&
      slotStartMinutes <= nowMinutes &&
      slotEndMinutes > nowMinutes

    const isTooSoon =
      isToday &&
      !isPast &&
      !allowCurrentSlot &&
      minBookingNoticeMinutes > 0 &&
      slotStartMinutes - nowMinutes < minBookingNoticeMinutes

    return { isPast, isTooSoon, isCurrent }
  }

  // Slot is within the confirmed selection range
  const isInSelectedRange = (slotId: string): boolean => {
    if (!selectedSlotId) return false
    const endTime =
      selectedSlotEndId && selectedSlotEndId !== ""
        ? selectedSlotEndId
        : addMinutesToTime(selectedSlotId, slotDurationMinutes)
    return slotId >= selectedSlotId && slotId < endTime
  }

  // Check if all slots between anchor and targetId are available/limited (no booked/closed)
  const canExtendTo = (targetSlotId: string): boolean => {
    const startIdx = visibleSlots.findIndex((s) => s.id === selectedSlotId)
    const endIdx = visibleSlots.findIndex((s) => s.id === targetSlotId)
    if (startIdx === -1 || endIdx === -1) return false
    if (endIdx - startIdx + 1 > maxSelectableSlots) return false
    for (let i = startIdx; i <= endIdx; i++) {
      const s = visibleSlots[i]
      const { isPast, isTooSoon } = s
        ? getSlotTiming(s)
        : { isPast: true, isTooSoon: false }
      if (
        !s ||
        s.status === "booked" ||
        s.status === "contest" ||
        s.status === "closed" ||
        isPast ||
        isTooSoon
      )
        return false
    }
    return true
  }

  const startNew = (slot: DailySlot) => {
    setSelectionLimitMessage(false)
    if (onSelectRange) onSelectRange(slot.startTime, slot.endTime)
    else onSelectSlot(slot.id)
  }

  const deselect = () => {
    if (onSelectRange) onSelectRange("", "")
    else onSelectSlot("")
  }

  const handleSlotClick = (slot: DailySlot) => {
    if (
      slot.status === "booked" ||
      slot.status === "closed" ||
      slot.status === "contest"
    )
      return

    if (!selectedSlotId) {
      startNew(slot)
      return
    }

    // Click anchor → deselect all
    if (slot.id === selectedSlotId) {
      setSelectionLimitMessage(false)
      deselect()
      return
    }

    // Click a slot inside range → shrink: remove this slot and all after it
    if (isInSelectedRange(slot.id)) {
      setSelectionLimitMessage(false)
      onSelectRange?.(selectedSlotId, slot.startTime)
      return
    }

    // Click after range end → extend if no blocked slots in between
    if (slot.id > selectedSlotId && canExtendTo(slot.id)) {
      setSelectionLimitMessage(false)
      onSelectRange?.(selectedSlotId, slot.endTime)
      return
    }

    const startIdx = visibleSlots.findIndex((s) => s.id === selectedSlotId)
    const targetIdx = visibleSlots.findIndex((s) => s.id === slot.id)
    if (
      slot.id > selectedSlotId &&
      startIdx !== -1 &&
      targetIdx - startIdx + 1 > maxSelectableSlots
    ) {
      setSelectionLimitMessage(true)
      return
    }

    // Click before anchor or blocked range → start fresh
    startNew(slot)
  }

  const numSelected = (() => {
    if (!selectedSlotId) return 0
    const endTime =
      selectedSlotEndId && selectedSlotEndId !== ""
        ? selectedSlotEndId
        : addMinutesToTime(selectedSlotId, slotDurationMinutes)
    const diffMinutes = (() => {
      const [eh, em] = endTime.split(":").map(Number)
      const [sh, sm] = selectedSlotId.split(":").map(Number)
      return eh * 60 + em - (sh * 60 + sm)
    })()
    return Math.max(1, Math.round(diffMinutes / slotDurationMinutes))
  })()

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Slot trong ngày</p>
        <div className="flex flex-wrap items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span>Có thể đặt</span>
          <span className="ml-1 h-2 w-2 rounded-full bg-amber-500" />
          <span title={`Còn tối đa 2 ${availabilityLabel}`}>Sắp hết</span>
          <span className="ml-1 h-2 w-2 rounded-full bg-orange-500" />
          <span>Đang chọn</span>
        </div>
      </div>

      {isToday && minBookingNoticeMinutes > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
          <Clock3 className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Cần đặt trước tối thiểu{" "}
            <strong>{minBookingNoticeMinutes} phút</strong>. Các slot quá sát
            giờ bắt đầu sẽ bị khóa.
          </span>
        </div>
      )}

      {noticeMessage && (
        <div className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2 text-[11px] text-sky-900">
          {noticeMessage}
        </div>
      )}

      {/*
        Nói thẳng vì sao cả ngày không đặt được.

        Không có dòng này thì khách chỉ thấy một lưới toàn chữ "Có giải đấu" và
        vẫn phải tự suy ra rằng nên đổi ngày. Nêu tên giải cũng biến một ngày
        hỏng thành một lời mời — thông tin công khai, vì giải vốn được đăng lên
        trang chủ để gọi người tham gia.
      */}
      {(() => {
        const slotGiai = visibleSlots.filter((s) => s.status === "contest")
        if (slotGiai.length === 0) return null
        const tenGiai = slotGiai.find((s) => s.contestName)?.contestName
        const caNgay = slotGiai.length === visibleSlots.length
        return (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
            <span className="font-bold">
              {caNgay ? "Cả ngày này" : `${slotGiai.length} khung giờ`} sân được
              giữ riêng cho giải đấu
              {tenGiai ? ` “${tenGiai}”` : ""}.
            </span>{" "}
            Bạn chọn ngày khác giúp mình nhé — hoặc đăng ký thi đấu nếu muốn
            tham gia.
          </div>
        )
      })()}

      <div className="grid grid-cols-4 gap-1.5">
        {visibleSlots.map((slot) => {
          const { isPast, isTooSoon, isCurrent } = getSlotTiming(slot)

          const isBooked =
            slot.status === "booked" ||
            slot.status === "contest" ||
            slot.status === "closed" ||
            isPast ||
            isTooSoon
          const isSelected = isInSelectedRange(slot.id)
          const isAnchor = slot.id === selectedSlotId && isSelected
          const tooSoonMessage = `Không thể đặt slot ${formatSlotLabel(slot.startTime)}: cần đặt trước tối thiểu ${minBookingNoticeMinutes} phút.`

          return (
            <span
              key={slot.id}
              className="block"
              title={isTooSoon ? tooSoonMessage : undefined}
            >
              <Button
                type="button"
                disabled={isBooked}
                onClick={() => handleSlotClick(slot)}
                className={cn(
                  "h-10 w-full flex-col gap-0 rounded-md px-1 text-[11px] font-semibold border",
                  isBooked &&
                    "bg-muted text-muted-foreground opacity-70 border-muted",
                  !isSelected &&
                    !isBooked &&
                    isCurrent &&
                    "border-emerald-500 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-500 font-bold hover:bg-emerald-100",
                  !isSelected &&
                    !isBooked &&
                    !isCurrent &&
                    slot.status === "available" &&
                    "border-emerald-200 bg-emerald-50/70 text-emerald-900 hover:bg-emerald-100",
                  !isSelected &&
                    !isBooked &&
                    !isCurrent &&
                    slot.status === "limited" &&
                    "border-amber-200 bg-amber-50/80 text-amber-900 hover:bg-amber-100",
                  isSelected &&
                    !isAnchor &&
                    "bg-orange-300 text-white border-orange-300 hover:bg-orange-200",
                  isAnchor &&
                    "bg-orange-500 text-white border-orange-500 hover:bg-orange-600",
                )}
              >
                <span>{formatSlotLabel(slot.startTime)}</span>
                <span className="text-[10px] font-medium opacity-80">
                  {isPast
                    ? "Đã qua"
                    : isTooSoon
                      ? "Quá sát"
                      : slotAvailabilityLabel(slot, isCurrent)}
                </span>
              </Button>
            </span>
          )
        })}
      </div>

      {selectedSlotId && (
        <div className="space-y-1">
          <p className="text-[11px] text-orange-600 font-medium">
            {numSelected > 1
              ? `Đã chọn ${numSelected} slot: ${selectedSlotId} → ${selectedSlotEndId || addMinutesToTime(selectedSlotId, slotDurationMinutes)}`
              : `Đã chọn: ${selectedSlotId}`}
          </p>
          {selectionLimitMessage && (
            <p className="text-[11px] text-amber-700">
              Mỗi đơn hiện chỉ có thể đặt tối đa {maxSelectableSlots} slot liên
              tiếp.
            </p>
          )}
        </div>
      )}

      <Badge
        variant="secondary"
        className="rounded-md px-2 py-1 text-[11px] font-medium"
      >
        {operationalSlots} slot/ngày · {String(openHour % 24).padStart(2, "0")}:00–
        {String(closeHour % 24).padStart(2, "0")}:00
      </Badge>
    </div>
  )
}
