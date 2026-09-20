import { useMemo, useState, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useWebSocket, type WsMessage } from "@/features/notifications/hooks/useWebSocket"
import {
  Filter,
  Car,
  Building2,
  Tag,
  AlertTriangle,
  Wrench,
  CheckCircle2,
  Sparkles,
  MessageSquareText,
} from "lucide-react"
import { useStaffOperations } from "./context/StaffOperationContext"
import { ZoomableInspectionImage } from "@/shared/components/ZoomableInspectionImage"
import { staffApi, staffQueryKeys, type StaffMaintenanceLogItem } from "@/features/staff/api/staff.api"
import { toast } from "sonner"
import { cn } from "@/shared/lib/utils"
import {
  StaffHeader,
  StaffCard,
  StaffBadge,
} from "./components/StaffUI"

export const PART_TYPE_LABELS: Record<string, string> = {
  TIRE_WHEEL: "Bánh xe / Lốp",
  SPOILER: "Cánh gió",
  CHASSIS: "Khung gầm",
  MOTOR: "Motor / Động cơ",
  SHELL: "Vỏ nhựa (Shell)",
  SERVO: "Servo / Tay lái",
  REMOTE: "Remote / Điều khiển",
  OTHER: "Khác",
}

export default function StaffMaintenancePage() {
  const queryClient = useQueryClient()
  const {
    updateFleetVehicleStatus,
    assignedCafeId,
  } = useStaffOperations()

  // Realtime WebSocket Handler inside Maintenance Page
  const handleWsMessage = useCallback(
    (msg: WsMessage) => {
      if (
        msg.event === "VEHICLE_MAINTENANCE_CREATED" ||
        msg.event === "NEW_MAINTENANCE_LOG" ||
        msg.event === "DAMAGE_REPORTED" ||
        msg.event === "MAINTENANCE_LOG_UPDATED"
      ) {
        void queryClient.invalidateQueries({ queryKey: staffQueryKeys.all })
      }
    },
    [queryClient]
  )

  useWebSocket(handleWsMessage)

  // Filter states
  const [statusFilter, setStatusFilter] = useState<"ALL" | "SENT_TO_PROVIDER" | "PENDING_REPAIR" | "RECEIVED" | "COMPLETED">("ALL")
  const [searchQuery, setSearchQuery] = useState("")

  // REAL API QUERY for Maintenance Logs
  const { data: apiLogs, isLoading: apiLoading } = useQuery({
    queryKey: staffQueryKeys.maintenanceLogs(assignedCafeId ?? undefined),
    queryFn: () =>
      staffApi.getMaintenanceLogs({
        cafe_id: assignedCafeId ?? undefined,
      }),
    enabled: true,
  })

  // REAL API MUTATION for updating maintenance status
  const updateStatusApiMutation = useMutation({
    mutationFn: ({ logId, status, cost }: { logId: string; status: "SENT_TO_PROVIDER" | "PENDING_REPAIR" | "RECEIVED" | "COMPLETED"; cost?: number }) =>
      staffApi.updateMaintenanceStatus(logId, { status, cost }),
    onSuccess: () => {
      toast.success("Cập nhật trạng thái phiếu bảo trì trên Server thành công!")
      void queryClient.invalidateQueries({ queryKey: staffQueryKeys.all })
    },
    onError: (err: unknown) => {
      console.warn("Backend API status update warning:", err)
    },
  })

  // 100% REAL BACKEND DATA WITH LOCAL FILTER FOR SMOOTH UX
  const filteredLogs = useMemo(() => {
    const logs = apiLogs || []

    // 1. Filter by status
    const statusFiltered = logs.filter((item: StaffMaintenanceLogItem) => {
      if (statusFilter === "ALL") return true
      return item.status === statusFilter
    })

    // 2. Filter by search query
    const searchFiltered = statusFiltered.filter((item: StaffMaintenanceLogItem) => {
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase().trim()

      const matchVehicleId = item.vehicleId.toLowerCase().includes(q)
      const matchVehicleName = item.vehicleName?.toLowerCase().includes(q)
      const matchCategoryName = item.categoryName?.toLowerCase().includes(q)
      const matchIssue = item.issueDescription?.toLowerCase().includes(q)
      const matchLogId = item.logId.toLowerCase().includes(q)
      const matchCafe = item.cafeName?.toLowerCase().includes(q)

      return (
        matchVehicleId ||
        matchVehicleName ||
        matchCategoryName ||
        matchIssue ||
        matchLogId ||
        matchCafe
      )
    })

    return searchFiltered.map((item: StaffMaintenanceLogItem) => ({
      logId: item.logId,
      vehicleId: item.vehicleId,
      vehicleName: item.vehicleName,
      issueDescription: item.issueDescription,
      staffNotes: item.staffNotes || "",
      cost: item.cost,
      performedBy: item.performedBy || "Staff",
      status: item.status,
      createdAt: item.createdAt,
      completedAt: item.completedAt || undefined,
      vehicleImageUrl: item.vehicleImageUrl,
      cafeName: item.cafeName,
      categoryName: item.categoryName,
      categoryTier: item.categoryTier,
      inspectionPhotos: item.inspectionPhotos,
      damagedChecklist: item.damagedChecklist,
    }))
  }, [apiLogs, statusFilter, searchQuery])

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <StaffHeader
          title="Bảo trì & Kỹ thuật Đội xe"
          subtitle="Quản lý lịch sửa chữa xe sau khi trả, thay thế linh kiện hao mòn và bàn giao đội xe"
        />
      </div>

      <div className="space-y-6">

        {/* FILTER CONTROL PANEL */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between rounded-xl border border-[#e5e2e1] bg-white p-4 shadow-xs">
            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
              <Filter className="size-4 text-[#6b7280] shrink-0" />
              {([
                { code: "ALL", label: "Tất cả" },
                { code: "PENDING_REPAIR", label: "Chờ gửi" },
                { code: "SENT_TO_PROVIDER", label: "Đã gửi BT" },
                { code: "RECEIVED", label: "Đã nhận xe" },
                { code: "COMPLETED", label: "Đã xong" },
              ] as const).map((item) => (
                <button
                  key={item.code}
                  onClick={() => setStatusFilter(item.code)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-bold transition-all border shrink-0",
                    statusFilter === item.code
                      ? "bg-[#ea580c] text-white border-[#ea580c] shadow-2xs"
                      : "bg-white text-[#6b7280] border-[#e5e2e1] hover:text-[#1c1b1b] hover:bg-[#fcf8f8]"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <input
              type="text"
              placeholder="Tìm tên xe, cơ sở, loại xe..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-60 rounded-xl border border-[#e5e2e1] bg-white px-4 py-2 text-xs font-semibold text-[#1c1b1b] focus:outline-none focus:ring-1 focus:ring-[#ea580c] focus:border-[#ea580c]"
            />
          </div>

          {/* MAINTENANCE LOGS CARDS LIST */}
          <div className="grid gap-4">
            {filteredLogs.map((log) => {
              const logBadgeVariant =
                log.status === "RECEIVED"
                  ? "info"
                  : log.status === "COMPLETED"
                    ? "success"
                    : log.status === "SENT_TO_PROVIDER"
                      ? "neutral"
                      : "orange"

              return (
                <StaffCard key={log.logId} className="space-y-4 border-[#e5e2e1] hover:border-orange-200 transition-all shadow-xs">
                  {/* Header Row: Log ID & Status Badge */}
                  <div className="flex items-center justify-between border-b border-[#f3f0ef] pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold font-mono text-[#ea580c] bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                        {log.logId}
                      </span>
                      {log.createdAt && (
                        <span className="text-[10px] text-[#6b7280]">
                          Tạo ngày: {new Date(log.createdAt).toLocaleDateString("vi-VN")} lúc {new Date(log.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </div>

                    <StaffBadge variant={logBadgeVariant}>
                      {log.status === "PENDING_REPAIR" && "CHỜ GỬI"}
                      {log.status === "SENT_TO_PROVIDER" && "ĐÃ GỬI ĐỘI BẢO TRÌ"}
                      {log.status === "RECEIVED" && "ĐÃ NHẬN XE"}
                      {log.status === "COMPLETED" && "ĐÃ SỬA XONG"}
                    </StaffBadge>
                  </div>

                  {/* CONTEXT METADATA BADGES: Cafe Name & Vehicle Category */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-orange-50 text-[#ea580c] border border-orange-200">
                      <Building2 className="size-3.5" />
                      Cơ sở: {log.cafeName || "RC Field Quận 4"}
                    </span>

                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                      <Tag className="size-3.5" />
                      Loại xe: {log.categoryName || "Drift Special Nitro"} {log.categoryTier ? `(${log.categoryTier})` : ""}
                    </span>
                  </div>

                  {/* Vehicle Identity with Avatar Image */}
                  <div className="flex items-center gap-3">
                    <div className="size-12 rounded-xl overflow-hidden border border-[#e5e2e1] bg-gray-50 shrink-0">
                      {log.vehicleImageUrl ? (
                        <img src={log.vehicleImageUrl} alt={log.vehicleName} className="size-full object-cover" />
                      ) : (
                        <div className="size-full flex items-center justify-center text-[#ea580c] bg-orange-50">
                          <Car className="size-6" />
                        </div>
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-[#1c1b1b] flex items-center gap-2">
                        {log.vehicleName}
                      </h4>
                      <span className="text-xs text-[#6b7280] font-mono font-semibold">
                        Mã ID Xe: {log.vehicleId}
                      </span>
                    </div>
                  </div>

                  {/* EVIDENCE PHOTOS GALLERY (Square Aspect Ratio & Clear Label) */}
                  {log.inspectionPhotos && log.inspectionPhotos.length > 0 && (
                    <div className="space-y-2.5 rounded-xl bg-zinc-50 border border-zinc-200 p-3.5">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-800 flex items-center gap-1.5">
                        <Sparkles className="size-4 text-[#ea580c]" />
                        Ảnh tình trạng xe:
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {log.inspectionPhotos.map((photo, idx) => (
                          <div key={idx} className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 shadow-2xs aspect-square">
                            <ZoomableInspectionImage
                              src={photo.url}
                              alt={`Ảnh tình trạng xe ${idx + 1}`}
                              className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2 text-center pointer-events-none">
                              <span className="text-[11px] font-bold text-white uppercase tracking-wider">
                                Ảnh tình trạng xe {log.inspectionPhotos && log.inspectionPhotos.length > 1 ? idx + 1 : ""}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* CARD 1: DAMAGED CHECKLIST (TÁCH BỆT) */}
                  <div className="rounded-xl bg-red-50/80 border border-red-200 p-3.5 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-extrabold bg-red-600 text-white uppercase tracking-wide shadow-2xs">
                        <AlertTriangle className="size-3.5" />
                        Nguồn: Hư hỏng được ghi nhận khi nhân viên trả xe
                      </span>
                      <span className="text-[11px] font-extrabold text-red-700">
                        Biên bản kiểm tra lúc trả xe
                      </span>
                    </div>

                    {log.damagedChecklist && log.damagedChecklist.length > 0 ? (
                      <div className="space-y-1.5">
                        <span className="text-xs font-extrabold text-red-900 block">
                          Chi tiết các linh kiện bị ghi nhận hư hỏng:
                        </span>
                        <div className="flex flex-col gap-2">
                          {log.damagedChecklist.map((item, i) => {
                            const translatedLabel =
                              PART_TYPE_LABELS[item.itemLabel] ||
                              PART_TYPE_LABELS[item.itemKey] ||
                              item.itemLabel ||
                              item.itemKey

                            return (
                              <div key={i} className="flex items-start justify-between gap-2 bg-white rounded-lg p-2.5 border border-red-200 text-xs shadow-2xs">
                                <div className="space-y-0.5">
                                  <span className="font-bold text-[#1c1b1b] block">• {translatedLabel}</span>
                                  {item.note && <span className="text-[11px] text-[#6b7280] block">{item.note}</span>}
                                </div>
                                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-red-100 text-red-700 shrink-0">
                                  {item.status === "BROKEN" ? "HỎNG NẶNG" : item.status === "SCRATCHED" ? "TRẦY XƯỚC" : item.status}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white rounded-lg p-2.5 border border-red-100 text-xs shadow-2xs">
                        <span className="font-bold text-red-900 block mb-0.5">Mô tả hư hỏng ghi nhận khi trả xe:</span>
                        <p className="text-[#1c1b1b] font-medium leading-relaxed">{log.issueDescription}</p>
                      </div>
                    )}
                  </div>

                  {/* CARD 2: COMMENT GHI CHÚ TỪ STAFF CHECKOUT (TÁCH HOÀN TOÀN BÊN NGOÀI) */}
                  <div className="rounded-xl bg-amber-50/60 border border-amber-200/90 p-3.5 space-y-2 shadow-2xs">
                    <div className="flex items-center justify-between flex-wrap gap-2 border-b border-amber-200/60 pb-2">
                      <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-900">
                        <MessageSquareText className="size-4 text-[#ea580c]" />
                        <span>Ghi chú của nhân viên khi trả xe:</span>
                      </div>
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                        Nhận xét khi trả xe
                      </span>
                    </div>
                    {log.staffNotes ? (
                      <p className="text-xs text-[#1c1b1b] font-medium leading-relaxed bg-white p-3 rounded-lg border border-amber-200/80 shadow-2xs">
                        {log.staffNotes}
                      </p>
                    ) : (
                      <p className="text-xs text-[#6b7280] font-bold italic leading-relaxed bg-white p-3 rounded-lg border border-amber-200/80 shadow-2xs">
                        Chưa có ghi chú
                      </p>
                    )}
                  </div>

                  {/* Footer Row: Technician & Cost & Action buttons */}
                  <div className="border-t border-[#e5e2e1] pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-4 text-xs font-bold text-[#6b7280]">
                      <span>Người phụ trách: <strong className="text-[#1c1b1b]">{log.performedBy || "Chưa phân công"}</strong></span>
                      {log.cost > 0 && (
                        <span className="text-[#ea580c] font-extrabold text-sm">
                          {log.cost.toLocaleString("vi-VN")} đ
                        </span>
                      )}
                    </div>

                    {/* Action buttons — Flow 3 bước đầy đủ */}
                    {log.status !== "COMPLETED" && (
                      <div className="flex gap-2 flex-wrap">
                        {/* Bước 1: PENDING_REPAIR → SENT_TO_PROVIDER */}
                        {log.status === "PENDING_REPAIR" && (
                          <button
                            onClick={() => {
                              updateStatusApiMutation.mutate({ logId: log.logId, status: "SENT_TO_PROVIDER" })
                            }}
                            disabled={updateStatusApiMutation.isPending}
                            className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-xs font-bold text-white transition-all shadow-2xs flex items-center gap-1.5 disabled:opacity-60"
                          >
                            <Wrench className="size-3.5" />
                            Gửi cho đội bảo trì
                          </button>
                        )}
                        {/* Bước 2: SENT_TO_PROVIDER → RECEIVED */}
                        {log.status === "SENT_TO_PROVIDER" && (
                          <button
                            onClick={() => {
                              updateStatusApiMutation.mutate({ logId: log.logId, status: "RECEIVED" })
                            }}
                            disabled={updateStatusApiMutation.isPending}
                            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white transition-all shadow-2xs flex items-center gap-1.5 disabled:opacity-60"
                          >
                            <CheckCircle2 className="size-3.5" />
                            Xác nhận Đã nhận xe
                          </button>
                        )}
                        {/* Bước 3: RECEIVED → COMPLETED */}
                        {log.status === "RECEIVED" && (
                          <button
                            onClick={() => {
                              updateStatusApiMutation.mutate({ logId: log.logId, status: "COMPLETED" })
                              updateFleetVehicleStatus(log.vehicleId, "AVAILABLE")
                            }}
                            disabled={updateStatusApiMutation.isPending}
                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white transition-all shadow-2xs flex items-center gap-1.5 disabled:opacity-60"
                          >
                            <CheckCircle2 className="size-3.5" />
                            Đã sửa xong (Bàn giao Sẵn sàng)
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </StaffCard>
              )
            })}

            {apiLoading && (
              <StaffCard className="py-16 text-center text-[#6b7280] space-y-3 border-dashed">
                <div className="size-8 border-3 border-[#ea580c] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-bold text-[#1c1b1b]">Đang tải danh sách bảo trì từ hệ thống...</p>
              </StaffCard>
            )}

            {!apiLoading && filteredLogs.length === 0 && (
              <StaffCard className="py-16 text-center text-[#6b7280] space-y-3 border-dashed bg-[#fcf8f8]/60">
                <div className="size-12 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center mx-auto text-[#ea580c]">
                  <CheckCircle2 className="size-6 text-[#ea580c]" />
                </div>
                <div className="space-y-1">
                  <p className="text-base font-extrabold text-[#1c1b1b]">Hiện tại chưa có xe cần bảo trì</p>
                  <p className="text-xs text-[#6b7280] font-medium max-w-sm mx-auto">
                    Tất cả xe thuộc chi nhánh đang sẵn sàng cho thuê hoặc chưa ghi nhận hư hỏng mới khi trả xe.
                  </p>
                </div>
              </StaffCard>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
