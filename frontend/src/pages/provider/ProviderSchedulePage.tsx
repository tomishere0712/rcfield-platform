import type { MouseEvent as ReactMouseEvent, ReactNode } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { addDays, format, startOfWeek } from "date-fns"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { DndProvider, useDrag, useDragLayer, useDrop } from "react-dnd"
import { HTML5Backend } from "react-dnd-html5-backend"
import { ChevronLeft, ChevronRight, Clock3, GripVertical, MoreHorizontal, Pencil, Plus, Search, Trash2, Users, X } from "lucide-react"
import { toast } from "sonner"

import { ProviderPageHeader } from "@/pages/provider/components/ProviderPrimitives"
import { ProviderShell } from "@/pages/provider/components/ProviderShell"
import { staffApi, staffQueryKeys, type StaffListItem } from "@/features/staff/api/staff.api"
import { cafeApi, cafeQueryKeys } from "@/features/cafes/api/cafe.api"
import {
  scheduleApi,
  scheduleQueryKeys,
  type StaffShift,
  type ShiftPosition,
  type ShiftTimePreset,
} from "@/features/schedule/api/schedule.api"
import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"

const employeeDragType = "SCHEDULE_EMPLOYEE"
const shiftDragType = "SCHEDULE_SHIFT"

type DragEmployee = {
  type: typeof employeeDragType
  staffId: string
  name: string
}

type DragShift = {
  type: typeof shiftDragType
  shiftId: string
}

type ScheduleCellRef = {
  positionId: string
  date: string
}

type DeleteConfirmation =
  | { type: "bulk"; shiftIds: string[]; title: string; description: string }
  | { type: "employeeWeek"; staffId: string; staffName: string; title: string; description: string }

const defaultShiftPresets = [
  { label: "Sáng (08-14)", start: "08:00", end: "14:00" },
  { label: "Chiều (14-20)", start: "14:00", end: "20:00" },
  { label: "Tối (18-24)", start: "18:00", end: "23:59" },
  { label: "Cả ngày (09-18)", start: "09:00", end: "18:00" },
]

type ShiftTimeOption = {
  label: string
  start: string
  end: string
}

function getWeekStart(date = new Date()) {
  return format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd")
}

function buildWeekDays(weekStart: string) {
  const start = new Date(`${weekStart}T00:00:00`)
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index)
    return {
      label: index === 6 ? "CN" : `T${index + 2}`,
      date: format(date, "yyyy-MM-dd"),
      dayNumber: format(date, "dd"),
      active: format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd"),
    }
  })
}

function initialsFromName(name: string) {
  const words = name.trim().split(/\s+/)
  return (words.at(-1)?.[0] ?? name[0] ?? "?").toUpperCase()
}

function formatVietnameseShiftTime(time: string) {
  const [hourValue, minuteValue] = time.split(":").map(Number)
  if (Number.isNaN(hourValue) || Number.isNaN(minuteValue)) return time

  const period = hourValue < 12 ? "sáng" : hourValue < 18 ? "trưa" : "tối"
  return `${hourValue.toString().padStart(2, "0")}:${minuteValue.toString().padStart(2, "0")} ${period}`
}

function formatShiftPresetLabel(preset: ShiftTimeOption) {
  return `${preset.label} (${formatVietnameseShiftTime(preset.start)} -> ${formatVietnameseShiftTime(preset.end)})`
}

function getScheduleErrorMessage(error: unknown, fallback: string) {
  if (typeof error !== "object" || error === null) return fallback
  const response = (error as { response?: { data?: { message?: unknown } } }).response
  return typeof response?.data?.message === "string" ? response.data.message : fallback
}

function cellKey(positionId: string, date: string) {
  return `${positionId}:${date}`
}

function parseCellKey(key: string): ScheduleCellRef | null {
  const [positionId, date] = key.split(":")
  if (!positionId || !date) return null
  return { positionId, date }
}

function buildFillTargetCells(
  source: ScheduleCellRef,
  target: ScheduleCellRef,
  positions: ShiftPosition[],
  weekDays: ReturnType<typeof buildWeekDays>,
) {
  const result = new Set<string>()
  const sourcePositionIndex = positions.findIndex((position) => position.id === source.positionId)
  const targetPositionIndex = positions.findIndex((position) => position.id === target.positionId)
  const sourceDayIndex = weekDays.findIndex((day) => day.date === source.date)
  const targetDayIndex = weekDays.findIndex((day) => day.date === target.date)

  if (sourcePositionIndex < 0 || targetPositionIndex < 0 || sourceDayIndex < 0 || targetDayIndex < 0) {
    return result
  }

  const rowDistance = Math.abs(targetPositionIndex - sourcePositionIndex)
  const columnDistance = Math.abs(targetDayIndex - sourceDayIndex)

  if (columnDistance >= rowDistance) {
    const [start, end] = [sourceDayIndex, targetDayIndex].sort((a, b) => a - b)
    for (let dayIndex = start; dayIndex <= end; dayIndex += 1) {
      const key = cellKey(source.positionId, weekDays[dayIndex].date)
      if (key !== cellKey(source.positionId, source.date)) result.add(key)
    }
  } else {
    const [start, end] = [sourcePositionIndex, targetPositionIndex].sort((a, b) => a - b)
    for (let positionIndex = start; positionIndex <= end; positionIndex += 1) {
      const key = cellKey(positions[positionIndex].id, source.date)
      if (key !== cellKey(source.positionId, source.date)) result.add(key)
    }
  }

  return result
}

export function ProviderSchedulePage() {
  return (
    <DndProvider backend={HTML5Backend}>
      <ProviderScheduleBoard />
    </DndProvider>
  )
}

function ProviderScheduleBoard() {
  const queryClient = useQueryClient()
  const [weekStart, setWeekStart] = useState(() => getWeekStart())
  const [selectedCafeId, setSelectedCafeId] = useState("")
  const [search, setSearch] = useState("")
  const [newPositionName, setNewPositionName] = useState("")
  const [addingPosition, setAddingPosition] = useState(false)
  const [editingPosition, setEditingPosition] = useState<ShiftPosition | null>(null)
  const [editingPositionName, setEditingPositionName] = useState("")
  const [deletingPosition, setDeletingPosition] = useState<ShiftPosition | null>(null)
  const [managingShiftTimes, setManagingShiftTimes] = useState(false)
  const [timeTarget, setTimeTarget] = useState<StaffShift | null>(null)
  const [timeForm, setTimeForm] = useState({ label: defaultShiftPresets[0].label, start: defaultShiftPresets[0].start, end: defaultShiftPresets[0].end })
  const [activeCell, setActiveCell] = useState<ScheduleCellRef | null>(null)
  const [copiedShiftIds, setCopiedShiftIds] = useState<string[]>([])
  const [selectedShiftIds, setSelectedShiftIds] = useState<string[]>([])
  const [openShiftMenuId, setOpenShiftMenuId] = useState<string | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation | null>(null)
  const [fillSource, setFillSource] = useState<ScheduleCellRef | null>(null)
  const [fillTarget, setFillTarget] = useState<ScheduleCellRef | null>(null)
  const addPositionPanelRef = useRef<HTMLDivElement | null>(null)

  const weekDays = useMemo(() => buildWeekDays(weekStart), [weekStart])
  const isDraggingScheduleItem = useIsDraggingScheduleItem()

  const { data: weekData, isLoading: scheduleLoading } = useQuery({
    queryKey: scheduleQueryKeys.week(weekStart, selectedCafeId),
    queryFn: () => scheduleApi.getWeek(weekStart, selectedCafeId),
    enabled: Boolean(selectedCafeId),
  })

  const { data: shiftTimePresets = [] } = useQuery({
    queryKey: scheduleQueryKeys.shiftTimePresets(),
    queryFn: scheduleApi.listShiftTimePresets,
  })

  const { data: cafesResp, isLoading: cafesLoading } = useQuery({
    queryKey: cafeQueryKeys.list({ page: 1, limit: 100, scope: "managed" }),
    queryFn: () => cafeApi.listCafes({ page: 1, limit: 100, scope: "managed" }),
  })
  const cafes = useMemo(() => cafesResp?.data ?? [], [cafesResp?.data])

  useEffect(() => {
    if (!selectedCafeId && cafes.length > 0) {
      queueMicrotask(() => setSelectedCafeId(cafes[0].id))
    }
  }, [cafes, selectedCafeId])

  useEffect(() => {
    if (!addingPosition) return

    const closeOnOutsideClick = (event: MouseEvent | TouchEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (addPositionPanelRef.current?.contains(target)) return

      setAddingPosition(false)
      setNewPositionName("")
    }

    document.addEventListener("mousedown", closeOnOutsideClick)
    document.addEventListener("touchstart", closeOnOutsideClick)

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick)
      document.removeEventListener("touchstart", closeOnOutsideClick)
    }
  }, [addingPosition])

  const { data: staffList = [] } = useQuery({
    queryKey: staffQueryKeys.list(selectedCafeId || undefined),
    queryFn: () => staffApi.listStaff(selectedCafeId || undefined),
    enabled: Boolean(selectedCafeId),
  })

  const createPositionMutation = useMutation({
    mutationFn: (name: string) => scheduleApi.createPosition(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.all })
      setNewPositionName("")
      setAddingPosition(false)
      toast.success("Đã thêm vị trí mới.")
    },
    onError: (error: unknown) => {
      toast.error(getScheduleErrorMessage(error, "Không thể thêm vị trí."))
    },
  })

  const updatePositionMutation = useMutation({
    mutationFn: ({ positionId, name }: { positionId: string; name: string }) =>
      scheduleApi.updatePosition(positionId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.all })
      setEditingPosition(null)
      setEditingPositionName("")
      toast.success("Đã đổi tên vị trí.")
    },
    onError: (error: unknown) => {
      toast.error(getScheduleErrorMessage(error, "Không thể đổi tên vị trí."))
    },
  })

  const deletePositionMutation = useMutation({
    mutationFn: (positionId: string) => scheduleApi.deletePosition(positionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.all })
      setDeletingPosition(null)
      toast.success("Đã xóa vị trí và các ca trong hàng.")
    },
    onError: (error: unknown) => {
      toast.error(getScheduleErrorMessage(error, "Không thể xóa vị trí."))
    },
  })

  const assignShiftMutation = useMutation({
    mutationFn: scheduleApi.assignShift,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.week(weekStart, selectedCafeId) })
      toast.success("Đã phân công nhân viên.")
    },
    onError: (error: unknown) => {
      toast.error(getScheduleErrorMessage(error, "Không thể phân công nhân viên."))
    },
  })

  const updateTimeMutation = useMutation({
    mutationFn: scheduleApi.updateShiftTime,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.week(weekStart, selectedCafeId) })
      setTimeTarget(null)
      toast.success("Đã cập nhật khung giờ.")
    },
    onError: (error: unknown) => {
      toast.error(getScheduleErrorMessage(error, "Không thể cập nhật khung giờ."))
    },
  })

  const createShiftTimePresetMutation = useMutation({
    mutationFn: scheduleApi.createShiftTimePreset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.shiftTimePresets() })
      toast.success("Đã thêm ca làm.")
    },
    onError: (error: unknown) => {
      toast.error(getScheduleErrorMessage(error, "Không thể thêm ca làm."))
    },
  })

  const updateShiftTimePresetMutation = useMutation({
    mutationFn: ({ presetId, label, start, end }: { presetId: string; label: string; start: string; end: string }) =>
      scheduleApi.updateShiftTimePreset(presetId, {
        label,
        start_time: start,
        end_time: end,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.shiftTimePresets() })
      toast.success("Đã cập nhật ca làm.")
    },
    onError: (error: unknown) => {
      toast.error(getScheduleErrorMessage(error, "Không thể cập nhật ca làm."))
    },
  })

  const deleteShiftTimePresetMutation = useMutation({
    mutationFn: scheduleApi.deleteShiftTimePreset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.shiftTimePresets() })
      toast.success("Đã xóa ca làm.")
    },
    onError: (error: unknown) => {
      toast.error(getScheduleErrorMessage(error, "Không thể xóa ca làm."))
    },
  })

  const moveShiftMutation = useMutation({
    mutationFn: scheduleApi.moveShift,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.week(weekStart, selectedCafeId) })
      toast.success("Đã di chuyển ca làm.")
    },
    onError: (error: unknown) => {
      toast.error(getScheduleErrorMessage(error, "Không thể di chuyển ca làm."))
    },
  })

  const cloneShiftMutation = useMutation({
    mutationFn: scheduleApi.cloneShift,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.week(weekStart, selectedCafeId) })
      toast.success("Đã dán ca làm.")
    },
    onError: (error: unknown) => {
      toast.error(getScheduleErrorMessage(error, "Không thể dán ca làm."))
    },
  })

  const bulkCloneShiftsMutation = useMutation({
    mutationFn: scheduleApi.bulkCloneShifts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.week(weekStart, selectedCafeId) })
      setFillSource(null)
      setFillTarget(null)
      toast.success("Đã sao chép ca làm.")
    },
    onError: (error: unknown) => {
      toast.error(getScheduleErrorMessage(error, "Không thể sao chép ca làm."))
    },
  })

  const bulkDeleteShiftsMutation = useMutation({
    mutationFn: scheduleApi.bulkDeleteShifts,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.week(weekStart, selectedCafeId) })
      setSelectedShiftIds([])
      setDeleteConfirmation(null)
      toast.success(`Đã xóa ${data.deletedCount} ca làm.`)
    },
    onError: (error: unknown) => {
      toast.error(getScheduleErrorMessage(error, "Không thể xóa ca làm."))
    },
  })

  const clearEmployeeWeekMutation = useMutation({
    mutationFn: scheduleApi.clearEmployeeWeek,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: scheduleQueryKeys.week(weekStart, selectedCafeId) })
      setSelectedShiftIds([])
      setDeleteConfirmation(null)
      toast.success(`Đã xóa ${data.deletedCount} ca trong tuần.`)
    },
    onError: (error: unknown) => {
      toast.error(getScheduleErrorMessage(error, "Không thể xóa ca trong tuần."))
    },
  })

  const positions = useMemo(() => weekData?.positions ?? [], [weekData?.positions])
  const shifts = useMemo(() => weekData?.shifts ?? [], [weekData?.shifts])
  const shiftTimeOptions = useMemo<ShiftTimeOption[]>(() => {
    if (shiftTimePresets.length === 0) return defaultShiftPresets
    return shiftTimePresets.map((preset) => ({
      label: preset.label,
      start: preset.startTime,
      end: preset.endTime,
    }))
  }, [shiftTimePresets])
  const firstShiftTimeOption = shiftTimeOptions[0] ?? defaultShiftPresets[0]
  const shiftsByCell = useMemo(() => {
    const map = new Map<string, StaffShift[]>()
    for (const shift of shifts) {
      const key = `${shift.positionId}:${shift.shiftDate}`
      map.set(key, [...(map.get(key) ?? []), shift])
    }
    return map
  }, [shifts])

  const fillCells = useMemo(() => {
    if (!fillSource || !fillTarget) return new Set<string>()
    return buildFillTargetCells(fillSource, fillTarget, positions, weekDays)
  }, [fillSource, fillTarget, positions, weekDays])

  function requestDeleteShifts(shiftIds: string[]) {
    const uniqueShiftIds = [...new Set(shiftIds)]
    if (uniqueShiftIds.length === 0) return
    setOpenShiftMenuId(null)
    setDeleteConfirmation({
      type: "bulk",
      shiftIds: uniqueShiftIds,
      title: uniqueShiftIds.length === 1 ? "Xóa ca làm" : "Xóa nhiều ca làm",
      description:
        uniqueShiftIds.length === 1
          ? "Bạn có chắc chắn muốn xóa ca làm này không?"
          : `Bạn có chắc chắn muốn xóa ${uniqueShiftIds.length} ca làm đang chọn không?`,
    })
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const target = event.target
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)

      if (!isTypingTarget && (key === "delete" || key === "backspace") && selectedShiftIds.length > 0) {
        event.preventDefault()
        requestDeleteShifts(selectedShiftIds)
        return
      }

      if (!activeCell || (!event.ctrlKey && !event.metaKey)) return

      const activeShifts = shiftsByCell.get(`${activeCell.positionId}:${activeCell.date}`) ?? []

      if (key === "c") {
        event.preventDefault()
        if (activeShifts.length === 0) {
          toast.error("Ô đang chọn chưa có ca để copy.")
          return
        }
        setCopiedShiftIds(activeShifts.map((shift) => shift.id))
        toast.success(`Đã copy ${activeShifts.length} ca.`)
      }

      if (key === "v") {
        event.preventDefault()
        if (copiedShiftIds.length === 0) {
          toast.error("Chưa có ca nào được copy.")
          return
        }
        for (const sourceShiftId of copiedShiftIds) {
          cloneShiftMutation.mutate({
            source_shift_id: sourceShiftId,
            position_id: activeCell.positionId,
            shift_date: activeCell.date,
          })
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [activeCell, copiedShiftIds, selectedShiftIds, shiftsByCell, cloneShiftMutation])

  useEffect(() => {
    if (!fillSource) return

    const handleMouseUp = () => {
      const sourceShifts = shiftsByCell.get(`${fillSource.positionId}:${fillSource.date}`) ?? []
      const targetCells = fillTarget
        ? [...buildFillTargetCells(fillSource, fillTarget, positions, weekDays)]
            .map(parseCellKey)
            .filter((cell): cell is ScheduleCellRef => Boolean(cell))
        : []

      if (sourceShifts.length > 0 && targetCells.length > 0) {
        bulkCloneShiftsMutation.mutate({
          source_shift_ids: sourceShifts.map((shift) => shift.id),
          target_cells: targetCells.map((cell) => ({
            position_id: cell.positionId,
            shift_date: cell.date,
          })),
        })
      } else {
        setFillSource(null)
        setFillTarget(null)
      }
    }

    window.addEventListener("mouseup", handleMouseUp)
    return () => window.removeEventListener("mouseup", handleMouseUp)
  }, [fillSource, fillTarget, positions, weekDays, shiftsByCell, bulkCloneShiftsMutation])

  const availableStaff = staffList.filter(
    (item) =>
      item.status !== "DISABLED" &&
      (item.fullName.toLowerCase().includes(search.toLowerCase()) ||
        item.email.toLowerCase().includes(search.toLowerCase()) ||
        item.cafeName.toLowerCase().includes(search.toLowerCase())),
  )

  const weekEnd = weekDays[6]?.date ?? weekStart
  const title = `${format(new Date(`${weekStart}T00:00:00`), "dd/MM")} - ${format(new Date(`${weekEnd}T00:00:00`), "dd/MM/yyyy")}`

  const updateSelectedShiftIds = (shiftIds: string[], multiSelect: boolean) => {
    setSelectedShiftIds((current) => {
      if (!multiSelect) return shiftIds
      const next = new Set(current)
      for (const shiftId of shiftIds) {
        if (next.has(shiftId)) next.delete(shiftId)
        else next.add(shiftId)
      }
      return [...next]
    })
  }

  const requestClearEmployeeWeek = (shift: StaffShift) => {
    setOpenShiftMenuId(null)
    setDeleteConfirmation({
      type: "employeeWeek",
      staffId: shift.staffId,
      staffName: shift.staffName,
      title: "Xóa ca của nhân viên trong tuần",
      description: `Bạn có chắc chắn muốn xóa tất cả ca của ${shift.staffName} trong tuần ${title} không?`,
    })
  }

  const confirmDelete = () => {
    if (!deleteConfirmation) return
    if (deleteConfirmation.type === "bulk") {
      bulkDeleteShiftsMutation.mutate(deleteConfirmation.shiftIds)
      return
    }
    clearEmployeeWeekMutation.mutate({
      employee_id: deleteConfirmation.staffId,
      week_start_date: weekStart,
    })
  }

  const submitNewPosition = () => {
    const name = newPositionName.trim()
    if (!name) {
      toast.error("Vui lòng nhập tên vị trí.")
      return
    }
    createPositionMutation.mutate(name)
  }

  return (
    <ProviderShell contentClassName="max-w-none">
      <ProviderPageHeader
        title="Quản lý ca làm việc"
        description="Phân công nhân sự theo tuần, theo vị trí vận hành và theo tình trạng thiếu người."
      />

      <section className="mb-4 rounded-xl border border-[#c4c7c8] bg-white p-4 shadow-sm">
        <div className="space-y-3">
          <label className="text-lg font-bold leading-tight tracking-tight text-[#1c1b1b]" htmlFor="schedule-cafe-select">
            Chi nhánh áp dụng
          </label>
          <select
            id="schedule-cafe-select"
            value={selectedCafeId}
            onChange={(event) => {
              setSelectedCafeId(event.target.value)
              setSearch("")
            }}
            disabled={cafesLoading || cafes.length === 0}
            className="h-11 w-full rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm font-bold text-[#1c1b1b] outline-none transition-colors focus:border-[#ef6c00] disabled:bg-[#f6f3f2] disabled:text-[#747878]"
          >
            {cafes.length === 0 ? <option>Chưa có chi nhánh</option> : null}
            {cafes.map((cafe) => (
              <option key={cafe.id} value={cafe.id}>
                {cafe.name} - {cafe.district}, {cafe.city}
              </option>
            ))}
          </select>
        </div>
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-4 text-xs font-bold uppercase tracking-wider text-[#747878]">
        <LegendDot className="border-[#c4c7c8] bg-[#e5e2e1]" label="Đủ nhân sự" />
        <LegendDot className="border-[#ba1a1a] bg-[#ffdad6]" label="Thiếu nhân sự" />
        <LegendDot className="border-[#ef6c00] bg-[#fff4e5]" label="Có thể thả khi đang kéo" />
      </div>

      <div className="grid min-h-[720px] grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#c4c7c8] bg-white shadow-sm">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#c4c7c8] bg-[#f6f3f2] p-4">
            <div className="flex items-center gap-3">
              <IconButton ariaLabel="Tuần trước" onClick={() => setWeekStart(format(addDays(new Date(`${weekStart}T00:00:00`), -7), "yyyy-MM-dd"))}>
                <ChevronLeft className="size-5" />
              </IconButton>
              <h3 className="text-lg font-bold text-[#1c1b1b]">{title}</h3>
              <IconButton ariaLabel="Tuần sau" onClick={() => setWeekStart(format(addDays(new Date(`${weekStart}T00:00:00`), 7), "yyyy-MM-dd"))}>
                <ChevronRight className="size-5" />
              </IconButton>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button type="button" variant="outline" className="h-10 gap-2 rounded-lg font-bold" onClick={() => setManagingShiftTimes(true)}>
                <Clock3 className="size-4" />
                Ca làm
              </Button>
              <Button className="h-10 gap-2 rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030] font-bold" onClick={() => setAddingPosition(true)}>
                <Plus className="size-4" />
                Vị trí
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <div className="min-w-[900px]">
              <div className="sticky top-0 z-10 grid grid-cols-[100px_repeat(7,minmax(120px,1fr))] border-b border-[#c4c7c8] bg-[#fcf8f8]">
                <div className="relative min-h-[70px] border-r border-[#c4c7c8] bg-[#fcf8f8] text-xs font-bold text-[#1c1b1b]">
                  <div className="absolute inset-0 bg-[linear-gradient(to_top_right,transparent_calc(50%-0.5px),#c4c7c8_calc(50%-0.5px),#c4c7c8_calc(50%+0.5px),transparent_calc(50%+0.5px))]" />
                  <span className="absolute right-3 top-3 font-extrabold">ngày</span>
                  <span className="absolute bottom-3 left-3 font-extrabold">vị trí</span>
                </div>
                {weekDays.map((day) => (
                  <div key={day.date} className="border-r border-[#c4c7c8] p-3 text-center last:border-r-0">
                    <div className="text-xs font-bold uppercase tracking-[0.05em] text-[#747878]">{day.label}</div>
                    <div className="mt-1 font-bold text-[#1c1b1b]">{day.dayNumber}</div>
                  </div>
                ))}
              </div>

              {scheduleLoading ? (
                <div className="p-8 text-center text-sm font-semibold text-[#747878]">Đang tải lịch làm việc...</div>
              ) : (
                <>
                  {positions.map((position) => (
                    <ScheduleRow
                      key={position.id}
                      position={position}
                      weekDays={weekDays}
                      shiftsByCell={shiftsByCell}
                      isDraggingScheduleItem={isDraggingScheduleItem}
                      activeCell={activeCell}
                      selectedShiftIds={selectedShiftIds}
                      openShiftMenuId={openShiftMenuId}
                      fillSource={fillSource}
                      fillCells={fillCells}
                      onSelectCell={(cell, shiftIds, event) => {
                        setActiveCell(cell)
                        updateSelectedShiftIds(shiftIds, event.ctrlKey || event.metaKey)
                      }}
                      onSelectShift={(shift, event) => {
                        setActiveCell({ positionId: shift.positionId, date: shift.shiftDate })
                        updateSelectedShiftIds([shift.id], event.ctrlKey || event.metaKey)
                      }}
                      onOpenShiftMenu={setOpenShiftMenuId}
                      onCopyShift={(shift) => {
                        setCopiedShiftIds([shift.id])
                        setOpenShiftMenuId(null)
                        toast.success("Đã sao chép ca.")
                      }}
                      onRequestDeleteShift={(shift) => requestDeleteShifts([shift.id])}
                      onRequestClearEmployeeWeek={requestClearEmployeeWeek}
                      onDropEmployee={(staffId, shiftDate) =>
                        assignShiftMutation.mutate({
                          cafe_id: selectedCafeId,
                          position_id: position.id,
                          staff_id: staffId,
                          shift_date: shiftDate,
                        })
                      }
                      onMoveShift={(shiftId, shiftDate) =>
                        moveShiftMutation.mutate({
                          shift_id: shiftId,
                          new_position_id: position.id,
                          new_date: shiftDate,
                        })
                      }
                      onStartFill={(cell) => {
                        setFillSource(cell)
                        setFillTarget(cell)
                      }}
                      onEnterFill={(cell) => {
                        if (fillSource) setFillTarget(cell)
                      }}
                      onOpenTime={(shift) => {
                        setTimeTarget(shift)
                        setTimeForm({
                          label: shift.shiftLabel ?? firstShiftTimeOption.label,
                          start: shift.startTime ?? firstShiftTimeOption.start,
                          end: shift.endTime ?? firstShiftTimeOption.end,
                        })
                      }}
                      onEditPosition={(target) => {
                        setEditingPosition(target)
                        setEditingPositionName(target.name)
                      }}
                      onDeletePosition={(target) => setDeletingPosition(target)}
                    />
                  ))}

                  <div className="grid min-h-[76px] grid-cols-[100px_repeat(7,minmax(120px,1fr))]">
                    <div className="flex items-center justify-center border-r border-[#c4c7c8] bg-[#f6f3f2] p-2">
                      {addingPosition ? (
                        <div ref={addPositionPanelRef} className="flex w-full flex-col gap-2">
                          <input
                            autoFocus
                            className="w-full rounded border border-[#c4c7c8] px-2 py-1 text-xs font-semibold outline-none focus:border-[#ef6c00]"
                            placeholder="Vị trí mới"
                            value={newPositionName}
                            onChange={(event) => setNewPositionName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") submitNewPosition()
                              if (event.key === "Escape") {
                                setAddingPosition(false)
                                setNewPositionName("")
                              }
                            }}
                          />
                          <Button size="sm" className="h-7 bg-[#1c1b1b] text-xs text-white" onClick={submitNewPosition} disabled={createPositionMutation.isPending}>
                            Thêm
                          </Button>
                        </div>
                      ) : (
                        <button
                          className="flex size-9 items-center justify-center rounded-full border border-dashed border-[#ef6c00] bg-[#fff4e5] text-[#ef6c00] transition-colors hover:bg-[#ffe8cc]"
                          aria-label="Thêm vị trí mới"
                          onClick={() => setAddingPosition(true)}
                        >
                          <Plus className="size-5" />
                        </button>
                      )}
                    </div>
                    <div className="col-span-7 border-t border-dashed border-[#c4c7c8] bg-[#fcf8f8]" />
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        <aside className="flex min-h-[520px] flex-col overflow-hidden rounded-xl border border-[#c4c7c8] bg-white shadow-sm">
          <div className="shrink-0 border-b border-[#c4c7c8] p-4">
            <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-[#1c1b1b]">
              <Users className="size-5 text-[#5d5f5f]" />
              Nhân sự khả dụng
            </h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[#747878]" />
              <input
                className="w-full rounded-lg border border-[#c4c7c8] bg-[#fcf8f8] py-2 pl-10 pr-3 text-sm font-semibold outline-none transition-shadow focus:border-[#5d5f5f] focus:ring-1 focus:ring-[#5d5f5f]"
                placeholder="Tìm kiếm..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
            {availableStaff.map((item) => (
              <DraggableEmployeeCard key={item.id} employee={item} />
            ))}
            {availableStaff.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[#c4c7c8] p-4 text-center text-sm font-semibold text-[#747878]">
                Không có nhân sự phù hợp.
              </p>
            ) : null}
          </div>
        </aside>
      </div>

      {timeTarget ? (
        <TimeModal
          shift={timeTarget}
          form={timeForm}
          setForm={setTimeForm}
          presets={shiftTimeOptions}
          isSaving={updateTimeMutation.isPending}
          onClose={() => setTimeTarget(null)}
          onSubmit={() =>
            updateTimeMutation.mutate({
              shift_id: timeTarget.id,
              shift_label: timeForm.label,
              start_time: timeForm.start,
              end_time: timeForm.end,
            })
          }
        />
      ) : null}

      {managingShiftTimes ? (
        <ShiftTimePresetModal
          presets={shiftTimePresets}
          isSaving={
            createShiftTimePresetMutation.isPending ||
            updateShiftTimePresetMutation.isPending ||
            deleteShiftTimePresetMutation.isPending
          }
          onClose={() => setManagingShiftTimes(false)}
          onCreate={(form) =>
            createShiftTimePresetMutation.mutate({
              label: form.label,
              start_time: form.start,
              end_time: form.end,
            })
          }
          onUpdate={(presetId, form) => updateShiftTimePresetMutation.mutate({ presetId, ...form })}
          onDelete={(presetId) => deleteShiftTimePresetMutation.mutate(presetId)}
        />
      ) : null}

      {editingPosition ? (
        <PositionEditModal
          position={editingPosition}
          nextName={editingPositionName}
          setNextName={setEditingPositionName}
          isSaving={updatePositionMutation.isPending}
          onClose={() => {
            setEditingPosition(null)
            setEditingPositionName("")
          }}
          onConfirm={() => {
            const name = editingPositionName.trim()
            if (!name) {
              toast.error("Vui lòng nhập tên vị trí mới.")
              return
            }
            updatePositionMutation.mutate({ positionId: editingPosition.id, name })
          }}
        />
      ) : null}

      {deletingPosition ? (
        <PositionDeleteModal
          position={deletingPosition}
          isDeleting={deletePositionMutation.isPending}
          onClose={() => setDeletingPosition(null)}
          onConfirm={() => deletePositionMutation.mutate(deletingPosition.id)}
        />
      ) : null}

      {deleteConfirmation ? (
        <DeleteShiftConfirmModal
          title={deleteConfirmation.title}
          description={deleteConfirmation.description}
          isDeleting={bulkDeleteShiftsMutation.isPending || clearEmployeeWeekMutation.isPending}
          onClose={() => setDeleteConfirmation(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </ProviderShell>
  )
}

function ScheduleRow({
  position,
  weekDays,
  shiftsByCell,
  isDraggingScheduleItem,
  activeCell,
  selectedShiftIds,
  openShiftMenuId,
  fillSource,
  fillCells,
  onSelectCell,
  onSelectShift,
  onOpenShiftMenu,
  onCopyShift,
  onRequestDeleteShift,
  onRequestClearEmployeeWeek,
  onDropEmployee,
  onMoveShift,
  onStartFill,
  onEnterFill,
  onOpenTime,
  onEditPosition,
  onDeletePosition,
}: {
  position: ShiftPosition
  weekDays: ReturnType<typeof buildWeekDays>
  shiftsByCell: Map<string, StaffShift[]>
  isDraggingScheduleItem: boolean
  activeCell: ScheduleCellRef | null
  selectedShiftIds: string[]
  openShiftMenuId: string | null
  fillSource: ScheduleCellRef | null
  fillCells: Set<string>
  onSelectCell: (cell: ScheduleCellRef, shiftIds: string[], event: ReactMouseEvent) => void
  onSelectShift: (shift: StaffShift, event: ReactMouseEvent) => void
  onOpenShiftMenu: (shiftId: string | null) => void
  onCopyShift: (shift: StaffShift) => void
  onRequestDeleteShift: (shift: StaffShift) => void
  onRequestClearEmployeeWeek: (shift: StaffShift) => void
  onDropEmployee: (staffId: string, shiftDate: string) => void
  onMoveShift: (shiftId: string, shiftDate: string) => void
  onStartFill: (cell: ScheduleCellRef) => void
  onEnterFill: (cell: ScheduleCellRef) => void
  onOpenTime: (shift: StaffShift) => void
  onEditPosition: (position: ShiftPosition) => void
  onDeletePosition: (position: ShiftPosition) => void
}) {
  return (
    <div className="grid min-h-[132px] grid-cols-[100px_repeat(7,minmax(120px,1fr))] border-b border-[#c4c7c8] last:border-b-0">
      <div className="group relative flex items-center justify-center border-r border-[#c4c7c8] bg-[#f6f3f2] p-3">
        <span className="whitespace-normal text-center text-xs font-bold uppercase tracking-[0.05em] text-[#747878]">{position.name}</span>
        <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded-full bg-white text-[#444748] shadow-sm transition-colors hover:bg-[#fff4e5] hover:text-[#ef6c00]"
            aria-label={`Đổi tên ${position.name}`}
            onClick={() => onEditPosition(position)}
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded-full bg-white text-[#ba1a1a] shadow-sm transition-colors hover:bg-[#ffdad6]"
            aria-label={`Xóa ${position.name}`}
            onClick={() => onDeletePosition(position)}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
      {weekDays.map((day) => {
        const cellShifts = shiftsByCell.get(`${position.id}:${day.date}`) ?? []
        return (
          <DropZoneCell
            key={`${position.id}-${day.date}`}
            positionId={position.id}
            date={day.date}
            shifts={cellShifts}
            isDraggingScheduleItem={isDraggingScheduleItem}
            isActive={activeCell?.positionId === position.id && activeCell.date === day.date}
            selectedShiftIds={selectedShiftIds}
            openShiftMenuId={openShiftMenuId}
            isFillSource={fillSource?.positionId === position.id && fillSource.date === day.date}
            isFillTarget={fillCells.has(cellKey(position.id, day.date))}
            onSelectCell={(event) => onSelectCell({ positionId: position.id, date: day.date }, cellShifts.map((shift) => shift.id), event)}
            onSelectShift={onSelectShift}
            onOpenShiftMenu={onOpenShiftMenu}
            onCopyShift={onCopyShift}
            onRequestDeleteShift={onRequestDeleteShift}
            onRequestClearEmployeeWeek={onRequestClearEmployeeWeek}
            onDropEmployee={(staffId) => onDropEmployee(staffId, day.date)}
            onMoveShift={(shiftId) => onMoveShift(shiftId, day.date)}
            onStartFill={() => onStartFill({ positionId: position.id, date: day.date })}
            onEnterFill={() => onEnterFill({ positionId: position.id, date: day.date })}
            onOpenTime={onOpenTime}
          />
        )
      })}
    </div>
  )
}

function DraggableEmployeeCard({ employee }: { employee: StaffListItem }) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: employeeDragType,
    item: { type: employeeDragType, staffId: employee.id, name: employee.fullName } satisfies DragEmployee,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }), [employee.id, employee.fullName])
  const setCardRef = useCallback((node: HTMLDivElement | null) => {
    drag(node)
  }, [drag])

  return (
    <div
      ref={setCardRef}
      className={cn(
        "group flex cursor-grab items-center gap-3 rounded-lg border border-[#c4c7c8] bg-[#fcf8f8] p-3 transition-all hover:border-[#5d5f5f] hover:shadow-sm active:cursor-grabbing",
        isDragging && "scale-[0.98] opacity-50 shadow-md",
      )}
    >
      <Avatar initials={initialsFromName(employee.fullName)} />
      <div className="min-w-0 flex-1">
        <h4 className="truncate text-sm font-bold text-[#1c1b1b]">{employee.fullName}</h4>
        <p className="truncate text-xs font-semibold text-[#444748]">
          {employee.cafeName} - {employee.status === "PENDING" ? "Chờ kích hoạt" : "Đang hoạt động"}
        </p>
      </div>
      <GripVertical className="size-5 text-[#747878] opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  )
}

function DropZoneCell({
  positionId,
  date,
  shifts,
  isDraggingScheduleItem,
  isActive,
  selectedShiftIds,
  openShiftMenuId,
  isFillSource,
  isFillTarget,
  onSelectCell,
  onSelectShift,
  onOpenShiftMenu,
  onCopyShift,
  onRequestDeleteShift,
  onRequestClearEmployeeWeek,
  onDropEmployee,
  onMoveShift,
  onStartFill,
  onEnterFill,
  onOpenTime,
}: {
  positionId: string
  date: string
  shifts: StaffShift[]
  isDraggingScheduleItem: boolean
  isActive: boolean
  selectedShiftIds: string[]
  openShiftMenuId: string | null
  isFillSource: boolean
  isFillTarget: boolean
  onSelectCell: (event: ReactMouseEvent) => void
  onSelectShift: (shift: StaffShift, event: ReactMouseEvent) => void
  onOpenShiftMenu: (shiftId: string | null) => void
  onCopyShift: (shift: StaffShift) => void
  onRequestDeleteShift: (shift: StaffShift) => void
  onRequestClearEmployeeWeek: (shift: StaffShift) => void
  onDropEmployee: (staffId: string) => void
  onMoveShift: (shiftId: string) => void
  onStartFill: () => void
  onEnterFill: () => void
  onOpenTime: (shift: StaffShift) => void
}) {
  const isEmpty = shifts.length === 0
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: [employeeDragType, shiftDragType],
    canDrop: () => true,
    drop: (item: DragEmployee | DragShift) => {
      if (item.type === employeeDragType) onDropEmployee(item.staffId)
      if (item.type === shiftDragType) onMoveShift(item.shiftId)
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
      canDrop: monitor.canDrop(),
    }),
  }), [onDropEmployee, onMoveShift])
  const setCellRef = useCallback((node: HTMLDivElement | null) => {
    drop(node)
  }, [drop])

  return (
    <div
      ref={setCellRef}
      onClick={onSelectCell}
      onMouseEnter={onEnterFill}
      className={cn(
        "group relative flex min-h-[132px] flex-col gap-2 border-r border-[#c4c7c8] p-2 last:border-r-0",
        isActive && "ring-2 ring-inset ring-[#2563eb]",
        isFillTarget && "bg-[#eff6ff] ring-2 ring-inset ring-[#60a5fa]",
        isFillSource && "ring-2 ring-inset ring-[#1d4ed8]",
        isDraggingScheduleItem && "bg-[#fffaf2]",
        isDraggingScheduleItem && "after:pointer-events-none after:absolute after:inset-2 after:rounded-lg after:border after:border-dashed after:border-[#ef6c00]/50 after:content-['']",
        isOver && canDrop && "bg-[#fff4e5] ring-2 ring-inset ring-[#ef6c00]",
      )}
      data-position-id={positionId}
      data-date={date}
    >
      {shifts.map((shift) => (
        <ShiftCard
          key={shift.id}
          shift={shift}
          isSelected={selectedShiftIds.includes(shift.id)}
          isMenuOpen={openShiftMenuId === shift.id}
          onSelect={(event) => onSelectShift(shift, event)}
          onOpenMenu={() => onOpenShiftMenu(openShiftMenuId === shift.id ? null : shift.id)}
          onCloseMenu={() => onOpenShiftMenu(null)}
          onOpenTime={() => onOpenTime(shift)}
          onCopy={() => onCopyShift(shift)}
          onDelete={() => onRequestDeleteShift(shift)}
          onClearEmployeeWeek={() => onRequestClearEmployeeWeek(shift)}
        />
      ))}
      {shifts.length > 0 ? (
        <button
          type="button"
          className="absolute bottom-1 right-1 z-20 hidden size-3 cursor-crosshair rounded-[2px] border border-[#2563eb] bg-[#2563eb] group-hover:block"
          aria-label="Sao chép nhanh ô lịch"
          onMouseDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onSelectCell(event)
            onStartFill()
          }}
        />
      ) : null}
      {isDraggingScheduleItem ? (
        <div className={cn("pointer-events-none absolute flex", isEmpty ? "inset-0 items-center justify-center" : "right-3 top-3")}>
          <span className={cn("flex size-9 items-center justify-center rounded-full border border-dashed text-lg font-bold", isOver && canDrop ? "border-[#ef6c00] bg-white text-[#ef6c00]" : "border-[#ef6c00]/40 text-[#ef6c00]/50")}>
            +
          </span>
        </div>
      ) : null}
    </div>
  )
}

function ShiftCard({
  shift,
  isSelected,
  isMenuOpen,
  onSelect,
  onOpenMenu,
  onCloseMenu,
  onOpenTime,
  onCopy,
  onDelete,
  onClearEmployeeWeek,
}: {
  shift: StaffShift
  isSelected: boolean
  isMenuOpen: boolean
  onSelect: (event: ReactMouseEvent) => void
  onOpenMenu: () => void
  onCloseMenu: () => void
  onOpenTime: () => void
  onCopy: () => void
  onDelete: () => void
  onClearEmployeeWeek: () => void
}) {
  const label = shift.shiftLabel ?? "Chưa set giờ"
  const [{ isDragging }, drag] = useDrag(() => ({
    type: shiftDragType,
    item: { type: shiftDragType, shiftId: shift.id } satisfies DragShift,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }), [shift.id])
  const setCardRef = useCallback((node: HTMLDivElement | null) => {
    drag(node)
  }, [drag])

  return (
    <div
      ref={setCardRef}
      onDoubleClick={(event) => {
        event.stopPropagation()
        onSelect(event)
      }}
      className={cn(
        "group/card relative cursor-grab rounded border border-[#c4c7c8] bg-[#e5e2e1] p-2 text-xs transition-colors hover:border-[#5d5f5f] active:cursor-grabbing",
        isSelected && "border-[#2563eb] bg-[#eff6ff] ring-2 ring-[#2563eb]",
        isDragging && "opacity-50",
      )}
    >
      <button
        type="button"
        className="absolute right-1 top-1 z-20 hidden size-6 items-center justify-center rounded-full bg-white/90 text-[#5d5f5f] shadow-sm transition-colors hover:bg-[#fff4e5] hover:text-[#ef6c00] group-hover/card:flex"
        aria-label="Tùy chọn ca"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onOpenMenu()
        }}
      >
        <MoreHorizontal className="size-4" />
      </button>
      {isMenuOpen ? (
        <ShiftContextMenu
          onClose={onCloseMenu}
          onEdit={onOpenTime}
          onCopy={onCopy}
          onDelete={onDelete}
          onClearEmployeeWeek={onClearEmployeeWeek}
        />
      ) : null}
      <div className="font-semibold text-[#1c1b1b]">{label}</div>
      <div className="mt-1 flex items-center gap-1 text-[#444748]">
        <Avatar initials={initialsFromName(shift.staffName)} size="sm" />
        <span className="truncate">{shift.staffName}</span>
        <button
          className="ml-auto flex size-5 items-center justify-center rounded-full bg-white text-[#ef6c00] shadow-sm transition-colors hover:bg-[#fff4e5]"
          aria-label="Cập nhật giờ ca"
          onClick={(event) => {
            event.stopPropagation()
            onOpenTime()
          }}
        >
          <Plus className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
function ShiftContextMenu({
  onClose,
  onEdit,
  onCopy,
  onDelete,
  onClearEmployeeWeek,
}: {
  onClose: () => void
  onEdit: () => void
  onCopy: () => void
  onDelete: () => void
  onClearEmployeeWeek: () => void
}) {
  const itemClass = "w-full px-3 py-2 text-left text-xs font-semibold text-[#1c1b1b] transition-colors hover:bg-[#fff4e5]"

  return (
    <div
      className="absolute right-1 top-8 z-40 w-56 overflow-hidden rounded-lg border border-[#c4c7c8] bg-white py-1 shadow-xl"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className={itemClass}
        onClick={() => {
          onClose()
          onEdit()
        }}
      >
        Chỉnh sửa ca
      </button>
      <button type="button" className={itemClass} onClick={onCopy}>
        Sao chép ca
      </button>
      <button type="button" className={cn(itemClass, "text-[#ba1a1a]")} onClick={onDelete}>
        Xóa ca này
      </button>
      <button type="button" className={cn(itemClass, "text-[#ba1a1a]")} onClick={onClearEmployeeWeek}>
        Xóa tất cả ca của nhân viên này trong tuần
      </button>
      <button type="button" className="w-full border-t border-[#e5e2e1] px-3 py-2 text-left text-xs font-semibold text-[#747878] hover:bg-[#f6f3f2]" onClick={onClose}>
        Đóng
      </button>
    </div>
  )
}
function TimeModal({
  shift,
  form,
  setForm,
  presets,
  isSaving,
  onClose,
  onSubmit,
}: {
  shift: StaffShift
  form: { label: string; start: string; end: string }
  setForm: (form: { label: string; start: string; end: string }) => void
  presets: ShiftTimeOption[]
  isSaving: boolean
  onClose: () => void
  onSubmit: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl border border-[#c4c7c8] bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#1c1b1b]">Chọn thời gian ca</h2>
            <p className="mt-1 text-sm font-semibold text-[#747878]">{shift.staffName}</p>
          </div>
          <button className="rounded p-1 text-[#747878] hover:bg-[#f6f3f2]" onClick={onClose} aria-label="Đóng">
            <X className="size-5" />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-2">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={cn(
                "rounded-lg border border-[#c4c7c8] p-3 text-left text-xs font-bold transition-colors hover:bg-[#fff4e5]",
                form.label === preset.label && "border-[#ef6c00] bg-[#fff4e5] text-[#ef6c00]",
              )}
              onClick={() => setForm({ label: preset.label, start: preset.start, end: preset.end })}
            >
              {formatShiftPresetLabel(preset)}
            </button>
          ))}
        </div>

        <div className="mt-5 flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            Hủy
          </Button>
          <Button type="button" className="flex-1 bg-[#1c1b1b] text-white hover:bg-[#313030]" disabled={isSaving} onClick={onSubmit}>
            Lưu giờ
          </Button>
        </div>
      </div>
    </div>
  )
}

function ShiftTimePresetModal({
  presets,
  isSaving,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: {
  presets: ShiftTimePreset[]
  isSaving: boolean
  onClose: () => void
  onCreate: (form: ShiftTimeOption) => void
  onUpdate: (presetId: string, form: ShiftTimeOption) => void
  onDelete: (presetId: string) => void
}) {
  const [drafts, setDrafts] = useState<Record<string, ShiftTimeOption>>({})
  const [newPreset, setNewPreset] = useState<ShiftTimeOption>({ label: "", start: "08:00", end: "14:00" })

  useEffect(() => {
    queueMicrotask(() => {
      setDrafts(
        Object.fromEntries(
          presets.map((preset) => [
            preset.id,
            {
              label: preset.label,
              start: preset.startTime,
              end: preset.endTime,
            },
          ]),
        ),
      )
    })
  }, [presets])

  const updateDraft = (presetId: string, next: Partial<ShiftTimeOption>) => {
    setDrafts((current) => ({
      ...current,
      [presetId]: {
        ...(current[presetId] ?? { label: "", start: "08:00", end: "14:00" }),
        ...next,
      },
    }))
  }

  const submitCreate = () => {
    const label = newPreset.label.trim()
    if (!label) {
      toast.error("Vui lòng nhập tên ca làm.")
      return
    }

    onCreate({ ...newPreset, label })
    setNewPreset({ label: "", start: "08:00", end: "14:00" })
  }

  const submitUpdate = (preset: ShiftTimePreset) => {
    const draft = drafts[preset.id]
    const label = draft?.label.trim()
    if (!draft || !label) {
      toast.error("Vui lòng nhập tên ca làm.")
      return
    }

    onUpdate(preset.id, { ...draft, label })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-[#c4c7c8] bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#1c1b1b]">Quản lý ca làm</h2>
            <p className="mt-1 text-sm font-semibold text-[#747878]">
              Các ca này sẽ hiển thị trong phần chọn thời gian ca cho nhân viên.
            </p>
          </div>
          <button className="rounded p-1 text-[#747878] hover:bg-[#f6f3f2]" onClick={onClose} aria-label="Đóng">
            <X className="size-5" />
          </button>
        </div>

        <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
          {presets.map((preset) => {
            const draft = drafts[preset.id] ?? {
              label: preset.label,
              start: preset.startTime,
              end: preset.endTime,
            }

            return (
              <div key={preset.id} className="grid gap-2 rounded-lg border border-[#c4c7c8] bg-[#fcf8f8] p-3 md:grid-cols-[minmax(0,1fr)_120px_120px_auto]">
                <input
                  className="h-10 rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm font-semibold outline-none focus:border-[#ef6c00]"
                  value={draft.label}
                  onChange={(event) => updateDraft(preset.id, { label: event.target.value })}
                  placeholder="Tên ca"
                />
                <input
                  type="time"
                  className="h-10 rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm font-semibold outline-none focus:border-[#ef6c00]"
                  value={draft.start}
                  onChange={(event) => updateDraft(preset.id, { start: event.target.value })}
                />
                <input
                  type="time"
                  className="h-10 rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm font-semibold outline-none focus:border-[#ef6c00]"
                  value={draft.end}
                  onChange={(event) => updateDraft(preset.id, { end: event.target.value })}
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" className="h-10 bg-[#1c1b1b] text-white hover:bg-[#313030]" disabled={isSaving} onClick={() => submitUpdate(preset)}>
                    Lưu
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-10 border-[#ba1a1a] text-[#ba1a1a] hover:bg-[#ffdad6]" disabled={isSaving} onClick={() => onDelete(preset.id)}>
                    Xóa
                  </Button>
                </div>
              </div>
            )
          })}

          {presets.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[#c4c7c8] p-4 text-center text-sm font-semibold text-[#747878]">
              Chưa có ca làm nào. Hãy thêm ca đầu tiên bên dưới.
            </p>
          ) : null}
        </div>

        <div className="mt-4 rounded-lg border border-dashed border-[#c4c7c8] bg-[#fffaf2] p-3">
          <div className="mb-2 text-sm font-bold text-[#1c1b1b]">Thêm ca làm mới</div>
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_120px_120px_auto]">
            <input
              className="h-10 rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm font-semibold outline-none focus:border-[#ef6c00]"
              value={newPreset.label}
              onChange={(event) => setNewPreset((current) => ({ ...current, label: event.target.value }))}
              placeholder="Ví dụ: Ca sáng"
            />
            <input
              type="time"
              className="h-10 rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm font-semibold outline-none focus:border-[#ef6c00]"
              value={newPreset.start}
              onChange={(event) => setNewPreset((current) => ({ ...current, start: event.target.value }))}
            />
            <input
              type="time"
              className="h-10 rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm font-semibold outline-none focus:border-[#ef6c00]"
              value={newPreset.end}
              onChange={(event) => setNewPreset((current) => ({ ...current, end: event.target.value }))}
            />
            <Button type="button" className="h-10 bg-[#ef6c00] text-white hover:bg-[#d65f00]" disabled={isSaving} onClick={submitCreate}>
              Thêm ca
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PositionEditModal({
  position,
  nextName,
  setNextName,
  isSaving,
  onClose,
  onConfirm,
}: {
  position: ShiftPosition
  nextName: string
  setNextName: (name: string) => void
  isSaving: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const trimmedNextName = nextName.trim()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl border border-[#c4c7c8] bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#1c1b1b]">Đổi tên vị trí</h2>
            <p className="mt-1 text-sm font-semibold text-[#747878]">
              Bạn có chắc muốn đổi từ {position.name} sang {trimmedNextName || "..."}?
            </p>
          </div>
          <button className="rounded p-1 text-[#747878] hover:bg-[#f6f3f2]" onClick={onClose} aria-label="Đóng">
            <X className="size-5" />
          </button>
        </div>

        <label className="block text-xs font-bold uppercase tracking-wider text-[#444748]">
          Tên vị trí mới
          <input
            autoFocus
            className="mt-1 w-full rounded-lg border border-[#c4c7c8] px-3 py-2 text-sm normal-case outline-none focus:border-[#ef6c00]"
            value={nextName}
            onChange={(event) => setNextName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onConfirm()
            }}
          />
        </label>

        <div className="mt-5 flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            Hủy
          </Button>
          <Button type="button" className="flex-1 bg-[#1c1b1b] text-white hover:bg-[#313030]" disabled={isSaving || !trimmedNextName} onClick={onConfirm}>
            Xác nhận
          </Button>
        </div>
      </div>
    </div>
  )
}

function PositionDeleteModal({
  position,
  isDeleting,
  onClose,
  onConfirm,
}: {
  position: ShiftPosition
  isDeleting: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl border border-[#c4c7c8] bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#1c1b1b]">Xóa vị trí</h2>
            <p className="mt-1 text-sm font-semibold text-[#747878]">
              Bạn có chắc chắn muốn xóa vị trí {position.name} không? Toàn bộ các ca đã phân công trong vị trí này sẽ bị xóa.
            </p>
          </div>
          <button className="rounded p-1 text-[#747878] hover:bg-[#f6f3f2]" onClick={onClose} aria-label="Đóng">
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-5 flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            Hủy
          </Button>
          <Button type="button" className="flex-1 bg-[#ba1a1a] text-white hover:bg-[#8f1111]" disabled={isDeleting} onClick={onConfirm}>
            Xóa
          </Button>
        </div>
      </div>
    </div>
  )
}

function DeleteShiftConfirmModal({
  title,
  description,
  isDeleting,
  onClose,
  onConfirm,
}: {
  title: string
  description: string
  isDeleting: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl border border-[#c4c7c8] bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#1c1b1b]">{title}</h2>
            <p className="mt-1 text-sm font-semibold text-[#747878]">{description}</p>
          </div>
          <button className="rounded p-1 text-[#747878] hover:bg-[#f6f3f2]" onClick={onClose} aria-label="Đóng">
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-5 flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            Hủy
          </Button>
          <Button type="button" className="flex-1 bg-[#ba1a1a] text-white hover:bg-[#8f1111]" disabled={isDeleting} onClick={onConfirm}>
            Xóa
          </Button>
        </div>
      </div>
    </div>
  )
}

function useIsDraggingScheduleItem() {
  return useDragLayer(
    (monitor) =>
      monitor.isDragging() &&
      (monitor.getItemType() === employeeDragType || monitor.getItemType() === shiftDragType),
  )
}

function Avatar({ initials, size = "md" }: { initials: string; size?: "sm" | "md" }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full border border-[#c4c7c8] bg-white font-semibold text-[#5d5f5f]", size === "sm" ? "size-4 text-[10px]" : "size-10 text-sm")}>
      {initials}
    </span>
  )
}

function IconButton({ ariaLabel, children, onClick }: { ariaLabel: string; children: ReactNode; onClick: () => void }) {
  return (
    <button className="rounded p-1 text-[#444748] transition-colors hover:bg-[#e5e2e1] hover:text-[#1c1b1b]" aria-label={ariaLabel} onClick={onClick}>
      {children}
    </button>
  )
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className={cn("size-3 rounded-full border", className)} />
      {label}
    </span>
  )
}
