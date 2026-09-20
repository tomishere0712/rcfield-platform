import { useState, useEffect, useCallback } from "react"
import { useParams, useNavigate } from "react-router"
import { useQueryClient } from "@tanstack/react-query"
import {
  ChevronLeft,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Check,
  Info,
  Plus,
  Trash2,
  FileCheck,
  Wrench,
  Edit3,
} from "lucide-react"
import {
  staffApi,
  staffQueryKeys,
  type DamageLineItemInput,
} from "@/features/staff/api/staff.api"
import {
  useWebSocket,
  type WsMessage,
} from "@/features/notifications/hooks/useWebSocket"
import { toast } from "sonner"
import { cn } from "@/shared/lib/utils"
import { StaffCard, StaffButton } from "./components/StaffUI"
import { useStaffOperations } from "./context/StaffOperationContext"

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

function getPartTypeFromLabel(label: string): string | undefined {
  const l = label.toLowerCase()
  if (l.includes("khung gầm") || l.includes("chassis")) return "CHASSIS"
  if (l.includes("vỏ nhựa") || l.includes("shell")) return "SHELL"
  if (l.includes("cánh gió") || l.includes("spoiler")) return "SPOILER"
  if (l.includes("bánh") || l.includes("lốp") || l.includes("tire")) return "TIRE_WHEEL"
  if (l.includes("motor") || l.includes("động cơ")) return "MOTOR"
  if (l.includes("servo") || l.includes("tay lái")) return "SERVO"
  if (l.includes("remote") || l.includes("điều khiển")) return "REMOTE"
  return undefined
}

function parseCurrencyInput(value: string | number): number {
  if (typeof value === "number") return isNaN(value) ? 0 : Math.max(0, value)
  if (!value) return 0
  const clean = value.toString().replace(/\D/g, "")
  const parsed = parseInt(clean, 10)
  return isNaN(parsed) ? 0 : Math.max(0, parsed)
}

const DEFAULT_CHECKOUT_CHECKLIST_TEMPLATE: EditChecklistItem[] = [
  {
    itemKey: "ck-chassis",
    partType: "CHASSIS",
    itemLabel: "Khung gầm xe (nứt, gãy, cong vênh, biến dạng)",
    checked: true,
    notes: "",
  },
  {
    itemKey: "ck-shell",
    partType: "SHELL",
    itemLabel: "Vỏ nhựa xe / Shell (móp méo, rách vỡ, xước sâu)",
    checked: true,
    notes: "",
  },
  {
    itemKey: "ck-spoiler",
    partType: "SPOILER",
    itemLabel: "Cánh gió (gãy, biến dạng, rơi rụng)",
    checked: true,
    notes: "",
  },
  {
    itemKey: "ck-tire",
    partType: "TIRE_WHEEL",
    itemLabel: "Bánh xe & Lốp (văng ốc hex, mòn rách, kẹt trục)",
    checked: true,
    notes: "",
  },
  {
    itemKey: "ck-motor",
    partType: "MOTOR",
    itemLabel: "Motor / Động cơ (kẹt quay, quá nhiệt, mùi khét)",
    checked: true,
    notes: "",
  },
  {
    itemKey: "ck-servo",
    partType: "SERVO",
    itemLabel: "Hệ thống lái / Servo (kẹt góc, trượt bánh răng)",
    checked: true,
    notes: "",
  },
  {
    itemKey: "ck-remote",
    partType: "REMOTE",
    itemLabel: "Remote điều khiển (đủ tay cầm, cần lái nguyên vẹn)",
    checked: true,
    notes: "",
  },
]

function ensureInspectionChecklist(
  insp: CheckoutInspection | null,
): CheckoutInspection | null {
  if (!insp) return null
  let checklist = insp.checklist ?? []
  if (checklist.length === 0) {
    const damageTypes = new Set(
      (insp.damageLineItems ?? []).map((d) => d.partType),
    )
    checklist = DEFAULT_CHECKOUT_CHECKLIST_TEMPLATE.map((tpl) => {
      const isDamaged = damageTypes.has(tpl.partType ?? "")
      return {
        itemLabel: tpl.itemLabel,
        checked: !isDamaged,
        notes: isDamaged ? "Phát hiện hư hại cần bồi thường" : "",
      }
    })
  }
  return {
    ...insp,
    checklist,
  }
}

interface DamageLineItemRow {
  id?: string
  partType: string
  customPartName?: string | null
  partsPrice: number
  laborPrice: number
  lineTotal: number
}

interface EditChecklistItem {
  itemKey?: string
  itemLabel: string
  checked: boolean
  notes: string
  partType?: string
}

interface CheckoutInspection {
  inspectionId: string
  damageFlagged: boolean
  damageLineItems: DamageLineItemRow[]
  totalDamageCharge: number
  photos: { url: string; angle: string; notes: string }[]
  checklist: { itemLabel: string; checked: boolean; notes: string }[]
  staffNotes: string
  customerConfirmed: boolean
}

export default function StaffCheckoutSummaryPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { refreshData } = useStaffOperations()
  const [loading, setLoading] = useState(true)
  const [checkoutInspection, setCheckoutInspection] =
    useState<CheckoutInspection | null>(null)
  const [sessionStatus, setSessionStatus] = useState<string>("")

  // Editable inspection state
  const [editMode, setEditMode] = useState(false)
  const [editItems, setEditItems] = useState<DamageLineItemInput[]>([])
  const [editChecklist, setEditChecklist] = useState<EditChecklistItem[]>([])
  const [editStaffNotes, setEditStaffNotes] = useState("")
  const [savingItems, setSavingItems] = useState(false)

  const loadSession = useCallback(
    async (showLoading = true) => {
      try {
        if (showLoading) setLoading(true)
        const data = await staffApi.getSessionDetail(sessionId!)
        setCheckoutInspection(
          ensureInspectionChecklist(data.checkoutInspection ?? null),
        )
        setSessionStatus(data.status ?? "")
      } catch {
        if (showLoading) toast.error("Không thể tải thông tin phiên chơi.")
      } finally {
        if (showLoading) setLoading(false)
      }
    },
    [sessionId],
  )

  // Checkout changes the session, booking, fleet and today's booking list at
  // once. Keep every staff screen in sync immediately instead of waiting for
  // a browser refresh or a later polling cycle.
  const syncOperationalState = useCallback(async () => {
    await Promise.allSettled([
      loadSession(false),
      refreshData(),
      queryClient.invalidateQueries({ queryKey: staffQueryKeys.all }),
    ])
  }, [loadSession, queryClient, refreshData])

  useEffect(() => {
    if (!sessionId) return
    queueMicrotask(() => {
      void loadSession()
    })
  }, [sessionId, loadSession])

  // Khách có thể xác nhận biên bản và thanh toán phí phát sinh ở màn hình
  // riêng. Đồng bộ trạng thái ngắn để staff không thao tác trên CHECKING_OUT
  // đã cũ rồi nhận lỗi INVALID_SESSION_STATE.
  useEffect(() => {
    if (!sessionId || sessionStatus !== "CHECKING_OUT") return

    const intervalId = window.setInterval(() => {
      void loadSession(false)
    }, 5_000)
    return () => window.clearInterval(intervalId)
  }, [sessionId, sessionStatus, loadSession])

  const handleCheckoutRealtime = useCallback(
    (message: WsMessage) => {
      const payload = message.data as { sessionId?: string } | undefined
      if (payload?.sessionId && payload.sessionId !== sessionId) return

      if (
        [
          "CUSTOMER_CHECKOUT_CONFIRMED",
          "SESSION_CHECKOUT_COMPLETED",
          "CUSTOMER_PAYMENT_CONFIRMED",
          "BOOKING_PAYMENT_UPDATED",
          "SESSION_UPDATED",
          "CUSTOMER_INSPECTION_DISPUTED",
        ].includes(message.event)
      ) {
        void syncOperationalState()
      }
    },
    [sessionId, syncOperationalState],
  )

  useWebSocket(handleCheckoutRealtime, Boolean(sessionId))

  const enterEditMode = () => {
    if (!checkoutInspection) return
    const rawItems = checkoutInspection.damageLineItems.map((li) => ({
      partType: li.partType as DamageLineItemInput["partType"],
      customPartName: li.customPartName ?? undefined,
      partsPrice: li.partsPrice,
      laborPrice: li.laborPrice,
    }))
    setEditItems(rawItems)

    const rawChecklist =
      checkoutInspection.checklist && checkoutInspection.checklist.length > 0
        ? checkoutInspection.checklist.map((item, idx) => {
            const extra = item as { itemKey?: string; partType?: DamageLineItemInput["partType"] }
            return {
              itemKey: extra.itemKey || `ck-${idx}`,
              itemLabel: item.itemLabel,
              checked: item.checked,
              notes: item.checked ? "" : (item.notes || ""),
              partType:
                extra.partType || getPartTypeFromLabel(item.itemLabel),
            }
          })
        : DEFAULT_CHECKOUT_CHECKLIST_TEMPLATE.map((tpl) => {
            const isDamaged = rawItems.some((d) => d.partType === tpl.partType)
            return {
              ...tpl,
              checked: !isDamaged,
              notes: isDamaged ? "Phát hiện hư hại cần bồi thường" : "",
            }
          })

    setEditChecklist(rawChecklist)
    setEditStaffNotes(checkoutInspection.staffNotes || "")
    setEditMode(true)
  }

  const setEditChecklistItemStatus = (idx: number, isOk: boolean) => {
    const targetItem = editChecklist[idx]
    if (!targetItem) return

    const newChecklist = editChecklist.map((item, i) =>
      i === idx ? { ...item, checked: isOk, notes: isOk ? "" : item.notes } : item,
    )
    setEditChecklist(newChecklist)

    if (targetItem.partType) {
      const partType = targetItem.partType as DamageLineItemInput["partType"]
      if (!isOk) {
        setEditItems((prev) => {
          if (prev.some((d) => d.partType === partType)) return prev
          return [
            ...prev,
            { partType, partsPrice: 0, laborPrice: 0 },
          ]
        })
      } else {
        setEditItems((prev) => {
          return prev.filter((d) => d.partType !== targetItem.partType)
        })
      }
    }
  }

  const addEditItem = () =>
    setEditItems((prev) => [
      ...prev,
      { partType: "OTHER", customPartName: "", partsPrice: 0, laborPrice: 0 },
    ])

  const removeEditItem = (index: number) => {
    const itemToRemove = editItems[index]
    const nextItems = editItems.filter((_, i) => i !== index)
    setEditItems(nextItems)

    if (itemToRemove?.partType) {
      const hasOther = nextItems.some((d) => d.partType === itemToRemove.partType)
      if (!hasOther) {
        setEditChecklist((prev) =>
          prev.map((item) =>
            item.partType === itemToRemove.partType
              ? { ...item, checked: true, notes: "" }
              : item,
          ),
        )
      }
    }
  }

  const updateEditItem = (
    index: number,
    field: keyof DamageLineItemInput,
    value: string | number,
  ) =>
    setEditItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    )

  const saveEditItems = async () => {
    if (!checkoutInspection) return
    if (
      editItems.some(
        (item) => item.partType === "OTHER" && !item.customPartName?.trim(),
      )
    ) {
      toast.error('Vui lòng nhập tên hư hỏng cho mục "Khác".')
      return
    }
    setSavingItems(true)
    try {
      const formattedChecklist = editChecklist.map((c) => ({
        itemKey: c.itemKey || c.itemLabel,
        itemLabel: c.itemLabel,
        status: c.checked ? "OK" : "BROKEN",
        note: c.checked ? "" : (c.notes || "").trim(),
      }))

      const result = await staffApi.updateDamageItems(
        sessionId!,
        checkoutInspection.inspectionId,
        {
          damageLineItems: editItems,
          checklist: formattedChecklist,
          staffNotes: editStaffNotes,
        },
      )
      setCheckoutInspection((prev) =>
        prev
          ? {
              ...prev,
              damageLineItems: result.damageLineItems,
              totalDamageCharge: result.totalDamageCharge,
              damageFlagged: result.damageLineItems.length > 0,
              checklist: editChecklist.map((c) => ({
                itemLabel: c.itemLabel,
                checked: c.checked,
                notes: c.notes,
              })),
              staffNotes: editStaffNotes,
            }
          : prev,
      )
      setEditMode(false)
      toast.success("Đã cập nhật biên bản và danh sách bồi thường.")
      await syncOperationalState()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message
      toast.error(msg ?? "Không thể cập nhật biên bản.")
    } finally {
      setSavingItems(false)
    }
  }

  const [confirming, setConfirming] = useState(false)

  const handleConfirmCheckout = async () => {
    if (!checkoutInspection || !sessionId) return
    setConfirming(true)
    try {
      const result = await staffApi.confirmCheckout(
        sessionId!,
        checkoutInspection.inspectionId,
      )
      toast.success(
        result.alreadyCompleted
          ? "Khách đã hoàn tất xác nhận trả xe. Trạng thái phiên đã được đồng bộ."
          : "Đã xác nhận trả xe thành công. Phiên chơi đã hoàn tất!",
      )
      await syncOperationalState()
      navigate(`/staff/sessions/${sessionId}`, { replace: true })
    } catch (err: unknown) {
      const response = (
        err as { response?: { data?: { message?: string; code?: string } } }
      )?.response?.data?.message
      const code = (err as { response?: { data?: { code?: string } } })
        ?.response?.data?.code
      if (code === "INVALID_SESSION_STATE") {
        await syncOperationalState()
        toast.info("Trạng thái phiên đã được cập nhật. Vui lòng kiểm tra lại.")
      } else {
        toast.error(response ?? "Không thể xác nhận trả xe.")
      }
    } finally {
      setConfirming(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-[#6b7280] font-semibold animate-pulse">
          Đang tải biên bản...
        </p>
      </div>
    )
  }

  if (!checkoutInspection) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-4">
        <AlertTriangle className="size-12 text-[#6b7280]" />
        <h3 className="text-lg font-bold text-[#1c1b1b]">
          Chưa có biên bản trả xe
        </h3>
        <p className="text-xs text-[#6b7280] font-semibold text-center max-w-xs">
          Cần hoàn tất kiểm tra xe trước khi xem biên bản này.
        </p>
        <StaffButton
          variant="outline"
          onClick={() => navigate(`/staff/sessions/${sessionId}`)}
        >
          <ChevronLeft className="size-4" />
          Quay lại phiên chạy
        </StaffButton>
      </div>
    )
  }

  const editTotal = editItems.reduce(
    (sum, item) => sum + (item.partsPrice || 0) + (item.laborPrice || 0),
    0,
  )

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <StaffButton
          onClick={() => navigate(`/staff/sessions/${sessionId}`)}
          variant="outline"
          size="sm"
          className="p-2 min-w-0 rounded-lg"
          type="button"
        >
          <ChevronLeft className="size-5 text-[#6b7280]" />
        </StaffButton>
        <div>
          <span className="text-xs text-[#6b7280] font-bold font-mono">
            Phiên: {sessionId}
          </span>
          <h2 className="text-xl font-extrabold text-[#1c1b1b] tracking-tight">
            Biên bản trả xe — Xác nhận hoàn tất
          </h2>
        </div>
      </div>

      {/* Status banner */}
      {sessionStatus === "CHECKING_OUT" && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center justify-between gap-3 text-sm font-semibold text-amber-800">
          <div className="flex items-center gap-2.5">
            <Info className="size-5 shrink-0 text-amber-600" />
            <span>
              {editMode
                ? "Chế độ chỉnh sửa — Hãy cập nhật checklist và bảng bồi thường theo đúng thực tế đối chiếu với khách."
                : 'Đang chờ xác nhận — Trình bày biên bản cho khách xem, sau đó nhấn "Xác nhận trả xe".'}
            </span>
          </div>
          {!editMode && (
            <StaffButton
              type="button"
              size="sm"
              variant="outline"
              onClick={enterEditMode}
              className="shrink-0 bg-white"
            >
              <Edit3 className="size-3.5" />
              Chỉnh sửa biên bản
            </StaffButton>
          )}
        </div>
      )}

      {editMode ? (
        /* ================= EDIT MODE ================= */
        <div className="space-y-6 animate-fadeIn">
          {/* Editable Checklist */}
          <StaffCard className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#4c4a49] flex items-center gap-2">
                <Edit3 className="size-4 text-[#ea580c]" />
                1. Chỉnh sửa Checklist nghiệm thu linh kiện
              </h3>
              <span
                className={cn(
                  "text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border",
                  editChecklist.every((i) => i.checked)
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-rose-50 text-rose-700 border-rose-200",
                )}
              >
                {editChecklist.every((i) => i.checked)
                  ? `🟢 Đạt chuẩn (${editChecklist.length}/${editChecklist.length})`
                  : `🔴 ${editChecklist.filter((i) => !i.checked).length} lỗi`}
              </span>
            </div>

            <div className="space-y-2.5">
              {editChecklist.map((item, idx) => {
                const isOk = item.checked
                return (
                  <div
                    key={idx}
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
                          {item.itemLabel}
                        </span>
                      </div>

                      {/* 2-state toggle buttons */}
                      <div className="flex items-center rounded-lg bg-[#f5f3f2] p-0.5 border border-[#e5e2e1] shrink-0">
                        <button
                          type="button"
                          onClick={() => setEditChecklistItemStatus(idx, true)}
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
                          onClick={() => setEditChecklistItemStatus(idx, false)}
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
                          placeholder={`Ghi chú mô tả lỗi cho ${item.itemLabel.split("(")[0].trim()}...`}
                          value={item.notes || ""}
                          onChange={(e) => {
                            const newNotes = e.target.value
                            setEditChecklist((prev) =>
                              prev.map((c, i) => (i === idx ? { ...c, notes: newNotes } : c)),
                            )
                          }}
                          className="w-full rounded-lg border border-rose-300 bg-white px-2.5 py-1.5 text-[11px] text-rose-900 font-semibold focus:outline-none focus:ring-1 focus:ring-rose-500 placeholder-rose-300"
                        />
                        <div className="flex items-center gap-1 text-[10px] text-amber-700 font-bold">
                          <Wrench className="size-3" />
                          <span>Đã tự động liên kết với Bảng bồi thường bên dưới</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </StaffCard>

          {/* Editable Damage Line Items */}
          <StaffCard className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#4c4a49]">
                2. Chỉnh sửa Bảng kê bồi thường hư hỏng
              </h3>
              <StaffButton
                type="button"
                size="sm"
                variant="outline"
                onClick={addEditItem}
              >
                <Plus className="size-3.5" />
                Thêm hạng mục
              </StaffButton>
            </div>

            {editItems.length === 0 && (
              <div className="rounded-lg border border-dashed border-[#e5e2e1] p-4 text-center">
                <p className="text-xs text-[#6b7280] font-semibold">
                  Không có hư hỏng — xe đạt chuẩn hoặc nhấn "Thêm hạng mục" để ghi nhận phát sinh.
                </p>
              </div>
            )}

            {editItems.map((item, index) => (
              <div
                key={index}
                className="rounded-lg border border-[#e5e2e1] bg-[#fafaf9] p-3 space-y-2.5"
              >
                <div className="flex items-center gap-2">
                  <select
                    value={item.partType}
                    onChange={(e) =>
                      updateEditItem(index, "partType", e.target.value)
                    }
                    className="flex-1 rounded-lg border border-[#e5e2e1] bg-white px-3 py-2 text-xs font-semibold text-[#1c1b1b] focus:outline-none focus:ring-1 focus:ring-[#ea580c]"
                  >
                    {Object.entries(PART_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeEditItem(index)}
                    className="p-1.5 rounded text-[#6b7280] hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    title="Xóa dòng này"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                {item.partType === "OTHER" && (
                  <input
                    type="text"
                    placeholder="Nhập tên hư hỏng cụ thể..."
                    value={item.customPartName ?? ""}
                    onChange={(e) =>
                      updateEditItem(index, "customPartName", e.target.value)
                    }
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
                        updateEditItem(
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
                        updateEditItem(
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
                  Dòng này:{" "}
                  {(
                    (item.partsPrice || 0) + (item.laborPrice || 0)
                  ).toLocaleString("vi-VN")}{" "}
                  đ
                </div>
              </div>
            ))}

            {editItems.length > 0 && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3.5 flex justify-between items-center text-sm font-extrabold text-[#1c1b1b]">
                <span className="text-rose-900">Tổng phí bồi thường mới:</span>
                <span className="text-rose-600 text-lg">
                  {editTotal.toLocaleString("vi-VN")} đ
                </span>
              </div>
            )}
          </StaffCard>

          {/* Editable Staff Notes */}
          <StaffCard className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#4c4a49]">
              3. Ghi chú tổng quan của biên bản
            </h3>
            <textarea
              rows={3}
              placeholder="Nhập ghi chú chung của biên bản..."
              value={editStaffNotes}
              onChange={(e) => setEditStaffNotes(e.target.value)}
              className="w-full rounded-xl border border-[#e5e2e1] bg-white p-3 text-xs font-semibold text-[#1c1b1b] focus:border-[#ea580c] focus:outline-none placeholder-[#a09e9d] resize-none"
            />
          </StaffCard>

          {/* Save / Cancel action buttons */}
          <div className="flex gap-3 pt-2">
            <StaffButton
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setEditMode(false)}
              disabled={savingItems}
            >
              Hủy chỉnh sửa
            </StaffButton>
            <StaffButton
              type="button"
              variant="primary"
              className="flex-1 font-bold"
              onClick={saveEditItems}
              disabled={savingItems}
            >
              {savingItems ? "Đang lưu thay đổi..." : "Lưu thay đổi biên bản"}
            </StaffButton>
          </div>
        </div>
      ) : (
        /* ================= VIEW MODE ================= */
        <div className="space-y-6">
          {/* Checklist summary */}
          <StaffCard className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#4c4a49]">
                Kết quả kiểm tra ({checkoutInspection.checklist.length} hạng mục)
              </h3>
              <span
                className={cn(
                  "text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border",
                  checkoutInspection.checklist.every((i) => i.checked)
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-rose-50 text-rose-700 border-rose-200",
                )}
              >
                {checkoutInspection.checklist.every((i) => i.checked)
                  ? `🟢 Đạt chuẩn (${checkoutInspection.checklist.length}/${checkoutInspection.checklist.length})`
                  : `🔴 Phát hiện ${checkoutInspection.checklist.filter((i) => !i.checked).length} lỗi`}
              </span>
            </div>

            <div className="space-y-2">
              {checkoutInspection.checklist.map((item, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-start gap-2.5 p-2.5 rounded-lg border text-xs font-semibold",
                    item.checked
                      ? "bg-white border-[#e5e2e1] text-[#1c1b1b]"
                      : "bg-rose-50/50 border-rose-200 text-rose-900",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 shrink-0 font-bold",
                      item.checked ? "text-emerald-600" : "text-rose-600",
                    )}
                  >
                    {item.checked ? "✓" : "✗"}
                  </span>
                  <div className="flex-1">
                    <span className={item.checked ? "text-slate-800" : "text-rose-800 font-bold"}>
                      {item.itemLabel}
                    </span>
                    {!item.checked && item.notes && (
                      <p className="text-[11px] text-slate-500 font-normal mt-0.5 italic">
                        — {item.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {checkoutInspection.checklist.length === 0 && (
                <p className="text-xs text-[#6b7280] font-semibold">
                  Không có mục kiểm tra.
                </p>
              )}
            </div>

            {checkoutInspection.staffNotes && (
              <div className="rounded-lg bg-[#fafaf9] border border-[#e5e2e1] p-3 text-xs font-semibold text-[#4c4a49]">
                <span className="font-bold text-[#1c1b1b]">Ghi chú trực ca:</span> {checkoutInspection.staffNotes}
              </div>
            )}
          </StaffCard>

          {/* Damage breakdown */}
          <StaffCard className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#4c4a49]">
                Bảng kê hư hỏng & bồi thường
              </h3>
              {sessionStatus === "CHECKING_OUT" && (
                <StaffButton
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={enterEditMode}
                >
                  <Edit3 className="size-3.5" />
                  Sửa danh sách
                </StaffButton>
              )}
            </div>

            {!checkoutInspection.damageFlagged || checkoutInspection.damageLineItems.length === 0 ? (
              <div className="flex items-center gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 p-4">
                <CheckCircle2 className="size-6 text-emerald-500 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-emerald-800">
                    Xe trả lại nguyên vẹn
                  </p>
                  <p className="text-xs text-emerald-700 font-semibold mt-0.5">
                    Không ghi nhận hư hỏng mới. Không phát sinh phí bồi thường.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                {checkoutInspection.damageLineItems.map((item, i) => (
                  <div
                    key={item.id ?? i}
                    className="rounded-lg border border-[#e5e2e1] bg-[#fafaf9] p-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-bold text-[#1c1b1b]">
                          {PART_TYPE_LABELS[item.partType] ?? item.partType}
                          {item.customPartName && (
                            <span className="text-[#4c4a49] font-semibold">
                              {" "}
                              — {item.customPartName}
                            </span>
                          )}
                        </p>
                        <div className="flex gap-4 mt-1 text-[10px] font-semibold text-[#6b7280]">
                          <span>
                            Linh kiện: {item.partsPrice.toLocaleString("vi-VN")} đ
                          </span>
                          {item.laborPrice > 0 && (
                            <span>
                              Công sửa: {item.laborPrice.toLocaleString("vi-VN")} đ
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-sm font-extrabold text-rose-600">
                        {item.lineTotal.toLocaleString("vi-VN")} đ
                      </span>
                    </div>
                  </div>
                ))}

                <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 flex items-center justify-between">
                  <span className="text-sm font-bold text-rose-900">
                    Tổng phí bồi thường:
                  </span>
                  <span className="text-xl font-extrabold text-rose-700">
                    {checkoutInspection.totalDamageCharge.toLocaleString("vi-VN")} đ
                  </span>
                </div>
              </div>
            )}
          </StaffCard>
        </div>
      )}

      {/* Actions */}
      {!editMode && sessionStatus === "CHECKING_OUT" && (
        <div className="space-y-3 pt-2">
          <StaffButton
            type="button"
            variant="primary"
            className="w-full uppercase tracking-wider gap-2 font-bold text-sm py-3"
            onClick={handleConfirmCheckout}
            disabled={confirming}
          >
            <FileCheck className="size-5" />
            {confirming
              ? "Đang xác nhận..."
              : "Xác nhận trả xe — Hoàn tất phiên chơi"}
          </StaffButton>
        </div>
      )}

      {sessionStatus === "COMPLETED" && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex items-center gap-3">
          <CheckCircle2 className="size-6 text-emerald-500 shrink-0" />
          <div>
            <p className="text-sm font-bold text-emerald-800">
              Phiên chơi đã hoàn tất
            </p>
            <p className="text-xs text-emerald-700 font-semibold mt-0.5">
              Biên bản đã được xác nhận và quyết toán.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
