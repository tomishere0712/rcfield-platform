import React, { useState } from "react"
import { AlertTriangle, Plus, ClipboardList, Check, User, Phone, DollarSign, Filter } from "lucide-react"
import { useStaffOperations } from "./context/StaffOperationContext"
import { toast } from "sonner"
import { cn } from "@/shared/lib/utils"
import {
  StaffHeader,
  StaffCard,
  StaffBadge,
  StaffButton,
} from "./components/StaffUI"

type IncidentType = "CRASH" | "EQUIPMENT_DAMAGE" | "MISCONDUCT" | "TRACK_VIOLATION"
type IncidentSeverity = "LOW" | "MEDIUM" | "HIGH"
type IncidentStatusFilter = "ALL" | "UNRESOLVED" | "RESOLVED"

export default function StaffIncidentsPage() {
  const { incidents, logIncident, resolveIncident, sessions, bookings } = useStaffOperations()

  // Form states
  const [showReportForm, setShowReportForm] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [type, setType] = useState<IncidentType>("CRASH")
  const [severity, setSeverity] = useState<IncidentSeverity>("LOW")
  const [description, setDescription] = useState("")
  const [fineAmount, setFineAmount] = useState(0)

  // Filter states
  const [statusFilter, setStatusFilter] = useState<IncidentStatusFilter>("ALL")
  const [searchQuery, setSearchQuery] = useState("")

  // Handle session selection to auto-fill customer info
  const handleSessionChange = (sessId: string) => {
    setSelectedSessionId(sessId)
    if (!sessId) return

    const session = sessions.find((s) => s.sessionId === sessId)
    const booking = bookings.find((b) => b.sessions?.some((s) => s.sessionId === sessId))

    if (session) {
      const primaryParticipant = booking?.participantDetails?.[0]
      setCustomerName(primaryParticipant?.name || session.participants[0]?.name || booking?.plannedParticipants?.[0] || "Khách lẻ")
      setCustomerPhone(primaryParticipant?.phone || "")
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!customerName.trim() || !customerPhone.trim() || !description.trim()) {
      toast.error("Vui lòng điền đầy đủ tên khách hàng, số điện thoại và mô tả sự cố!")
      return
    }

    logIncident({
      sessionId: selectedSessionId || undefined,
      customerName,
      customerPhone,
      type,
      severity,
      description,
      fineAmount,
      status: "UNRESOLVED",
    })

    // Reset Form
    setSelectedSessionId("")
    setCustomerName("")
    setCustomerPhone("")
    setType("CRASH")
    setSeverity("LOW")
    setDescription("")
    setFineAmount(0)
    setShowReportForm(false)
  }

  // Filtered listing
  const filteredIncidents = incidents.filter((inc) => {
    const matchesStatus = statusFilter === "ALL" || inc.status === statusFilter
    const matchesSearch =
      inc.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inc.incidentId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inc.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesStatus && matchesSearch
  })

  return (
    <div className="space-y-6">
      {/* 1. Page Header with CTA Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <StaffHeader
          title="Báo cáo & Ghi nhận Sự cố"
          subtitle="Ghi nhận va chạm thiết bị, lỗi đường đua hoặc hành vi gây gián đoạn để xử lý đền bù"
        />

        <StaffButton
          onClick={() => setShowReportForm(!showReportForm)}
          variant="primary"
          className="shrink-0 uppercase tracking-wider text-xs"
        >
          <Plus className="size-4" />
          {showReportForm ? "Đóng Form" : "Báo Cáo Sự Cố Mới"}
        </StaffButton>
      </div>

      {/* 2. DYNAMIC REPORT FORM */}
      {showReportForm && (
        <form onSubmit={handleSubmit} className="animate-fadeIn">
          <StaffCard className="p-6 space-y-6 border-orange-100 bg-[#fffbf9]/60">
            <div className="flex items-center gap-3 border-b border-[#e5e2e1] pb-4">
              <div className="flex size-10 items-center justify-center rounded-lg bg-orange-50 border border-orange-200 text-[#ea580c]">
                <AlertTriangle className="size-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#1c1b1b]">Lập biên bản sự cố đường đua</h3>
                <p className="text-xs text-[#6b7280]">Ghi lại thông tin khách hàng, hình thức thiệt hại và các khoản đền bù phát sinh</p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
              {/* Session association */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#4c4a49] mb-1.5">
                  Gắn với ca chạy (Không bắt buộc)
                </label>
                <select
                  value={selectedSessionId}
                  onChange={(e) => handleSessionChange(e.target.value)}
                  className="w-full rounded-lg border border-[#e5e2e1] bg-white px-3 py-2.5 text-xs font-semibold text-[#1c1b1b] focus:border-[#ea580c] focus:outline-none focus:ring-1 focus:ring-[#ea580c]"
                >
                  <option value="">-- Chọn ca chạy đang diễn ra --</option>
                  {sessions
                    .filter((s) => s.status === "ACTIVE" || s.status === "EXTENDING")
                    .map((s) => (
                      <option key={s.sessionId} value={s.sessionId}>
                        Phiên: {s.sessionId} ({s.participants[0]?.name})
                      </option>
                    ))}
                </select>
              </div>

              {/* Customer Name */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#4c4a49] mb-1.5">
                  Họ tên khách hàng <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3.5 flex items-center text-[#6b7280]">
                    <User className="size-3.5" />
                  </span>
                  <input
                    type="text"
                    placeholder="Ví dụ: Nguyễn Văn A"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full rounded-lg border border-[#e5e2e1] bg-white pl-10 pr-3 py-2.5 text-xs font-semibold text-[#1c1b1b] focus:border-[#ea580c] focus:outline-none"
                  />
                </div>
              </div>

              {/* Phone number */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#4c4a49] mb-1.5">
                  Số điện thoại <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3.5 flex items-center text-[#6b7280]">
                    <Phone className="size-3.5" />
                  </span>
                  <input
                    type="tel"
                    placeholder="Ví dụ: 0908123456"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full rounded-lg border border-[#e5e2e1] bg-white pl-10 pr-3 py-2.5 text-xs font-semibold text-[#1c1b1b] focus:border-[#ea580c] focus:outline-none"
                  />
                </div>
              </div>

              {/* Incident type */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#4c4a49] mb-1.5">
                  Loại sự cố phát sinh
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as IncidentType)}
                  className="w-full rounded-lg border border-[#e5e2e1] bg-white px-3 py-2.5 text-xs font-semibold text-[#1c1b1b] focus:border-[#ea580c] focus:outline-none focus:ring-1 focus:ring-[#ea580c]"
                >
                  <option value="CRASH">Va chạm phương tiện (Crash)</option>
                  <option value="EQUIPMENT_DAMAGE">Hư hỏng thiết bị/Cơ khí</option>
                  <option value="MISCONDUCT">Hành vi sai quy định</option>
                  <option value="TRACK_VIOLATION">Vi phạm quy tắc đường đua</option>
                </select>
              </div>

              {/* Severity */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#4c4a49] mb-1.5">
                  Mức độ nghiêm trọng
                </label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
                  className="w-full rounded-lg border border-[#e5e2e1] bg-white px-3 py-2.5 text-xs font-semibold text-[#1c1b1b] focus:border-[#ea580c] focus:outline-none focus:ring-1 focus:ring-[#ea580c]"
                >
                  <option value="LOW">Thấp (LOW)</option>
                  <option value="MEDIUM">Vừa phải (MEDIUM)</option>
                  <option value="HIGH">Nghiêm trọng (HIGH)</option>
                </select>
              </div>

              {/* Fine amount */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#4c4a49] mb-1.5">
                  Phí đền bù đề xuất (nếu có)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3.5 flex items-center text-[#6b7280]">
                    <DollarSign className="size-3.5" />
                  </span>
                  <input
                    type="number"
                    placeholder="0"
                    value={fineAmount}
                    onChange={(e) => setFineAmount(Number(e.target.value))}
                    className="w-full rounded-lg border border-[#e5e2e1] bg-white pl-10 pr-3 py-2.5 text-xs font-semibold text-[#1c1b1b] focus:border-[#ea580c] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Description textarea */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#4c4a49] mb-1.5">
                Mô tả chi tiết diễn biến sự việc <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                placeholder="Ghi chi tiết thiết bị hỏng gì, xảy ra tại góc cua số mấy..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-[#e5e2e1] bg-white p-3 text-xs font-semibold text-[#1c1b1b] focus:border-[#ea580c] focus:outline-none placeholder-[#a09e9d] resize-none"
              />
            </div>

            <StaffButton type="submit" variant="primary" className="uppercase tracking-wider text-xs">
              Lưu & Đăng ký sự cố
            </StaffButton>
          </StaffCard>
        </form>
      )}

      {/* 3. FILTER & SEARCH CONTROL BOX */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between rounded-xl border border-[#e5e2e1] bg-white p-4 shadow-sm">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
          <Filter className="size-4 text-[#6b7280] shrink-0" />
          {([
            { code: "ALL", label: "Tất cả" },
            { code: "UNRESOLVED", label: "Chưa giải quyết" },
            { code: "RESOLVED", label: "Đã giải quyết" },
          ] as const).map((tab) => (
            <button
              key={tab.code}
              onClick={() => setStatusFilter(tab.code)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-bold transition-all border shrink-0",
                statusFilter === tab.code
                  ? "bg-[#ea580c] text-white border-[#ea580c]"
                  : "bg-white text-[#6b7280] border-[#e5e2e1] hover:text-[#1c1b1b] hover:bg-[#fcf8f8]"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Tìm tên khách hàng hoặc mã sự cố..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full md:w-64 rounded-xl border border-[#e5e2e1] bg-white px-4 py-2 text-xs font-semibold text-[#1c1b1b] focus:outline-none focus:ring-1 focus:ring-[#ea580c] focus:border-[#ea580c]"
        />
      </div>

      {/* 4. INCIDENTS LIST GRID */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredIncidents.map((inc) => {
          // Compute severity badges
          const severityBadgeVariant =
            inc.severity === "LOW"
              ? "neutral"
              : inc.severity === "MEDIUM"
              ? "warning"
              : "error"

          return (
            <StaffCard key={inc.incidentId} className="flex flex-col justify-between space-y-4 h-full">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#6b7280] font-bold font-mono">{inc.incidentId}</span>
                  <StaffBadge variant={severityBadgeVariant}>
                    {inc.severity === "LOW" && "Mức thấp"}
                    {inc.severity === "MEDIUM" && "Mức vừa"}
                    {inc.severity === "HIGH" && "NGHIÊM TRỌNG"}
                  </StaffBadge>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-[#1c1b1b]">{inc.customerName}</h4>
                  <p className="text-[10px] text-[#6b7280] font-semibold mt-0.5">SĐT: {inc.customerPhone}</p>
                  {inc.sessionId && (
                    <span className="inline-block mt-1 bg-[#f5f3f2] border border-[#e5e2e1] text-[#4c4a49] rounded px-1.5 py-0.5 text-[9px] font-bold">
                      Phiên: {inc.sessionId}
                    </span>
                  )}
                </div>

                <div className="rounded-lg bg-[#fcf8f8] border border-[#e5e2e1] p-3 text-xs text-[#4c4a49] font-medium leading-relaxed">
                  <p className="line-clamp-3 hover:line-clamp-none transition-all">{inc.description}</p>
                </div>
              </div>

              <div className="border-t border-[#e5e2e1] pt-3.5 space-y-3 font-semibold">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#6b7280]">Hình thức sự cố:</span>
                  <span className="text-[#1c1b1b] font-bold">
                    {inc.type === "CRASH" && "Va chạm đường đua"}
                    {inc.type === "EQUIPMENT_DAMAGE" && "Lỗi hỏng cơ khí"}
                    {inc.type === "MISCONDUCT" && "Sai quy định hành vi"}
                    {inc.type === "TRACK_VIOLATION" && "Lỗi chạy lấn làn"}
                  </span>
                </div>

                {inc.fineAmount > 0 && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[#6b7280]">Tiền bồi thường:</span>
                    <span className="text-rose-600 font-extrabold">{inc.fineAmount.toLocaleString("vi-VN")} đ</span>
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-dashed border-[#e5e2e1] pt-3 text-xs">
                  <span className="text-[10px] text-[#6b7280]">Trạng thái xử lý:</span>
                  {inc.status === "RESOLVED" ? (
                    <span className="text-emerald-700 flex items-center gap-1 font-bold">
                      <Check className="size-4" /> Đã hoàn tất
                    </span>
                  ) : (
                    <StaffButton
                      onClick={() => resolveIncident(inc.incidentId)}
                      variant="primary"
                      size="sm"
                      className="py-1 px-2.5 text-[9px] font-bold rounded-lg"
                    >
                      Duyệt Xong
                    </StaffButton>
                  )}
                </div>
              </div>
            </StaffCard>
          )
        })}

        {filteredIncidents.length === 0 && (
          <StaffCard className="col-span-full py-16 text-center text-[#6b7280] space-y-2 border-dashed">
            <ClipboardList className="size-10 text-[#6b7280] mx-auto" />
            <p className="text-sm font-bold">Không tìm thấy báo cáo sự cố nào</p>
            <p className="text-xs">Tất cả biên bản sự cố và hồ sơ xử lý được đăng bởi nhân viên sẽ nằm ở đây.</p>
          </StaffCard>
        )}
      </div>
    </div>
  )
}
