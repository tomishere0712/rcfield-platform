import React, { useState } from "react"
import { ShieldCheck, Plus, ClipboardList, User, Phone, Filter, Award, Search, Info, X } from "lucide-react"
import { useStaffOperations } from "./context/StaffOperationContext"
import { toast } from "sonner"
import { cn } from "@/shared/lib/utils"
import {
  StaffHeader,
  StaffCard,
  StaffBadge,
  StaffButton,
} from "./components/StaffUI"

export default function StaffByocPage() {
  const { byocRegistry, registerByoc, updateByocSafety } = useStaffOperations()

  // Form toggles
  const [showRegForm, setShowRegForm] = useState(false)

  // Form inputs
  const [ownerName, setOwnerName] = useState("")
  const [ownerPhone, setOwnerPhone] = useState("")
  const [vehicleBrand, setVehicleBrand] = useState("")
  const [vehicleScale, setVehicleScale] = useState("1/10")
  const [frequencyGhz, setFrequencyGhz] = useState("2.4 GHz")
  const [safetyChecked, setSafetyChecked] = useState(false)

  // Safety checklist verification modal
  const [selectedVerifyVehicleId, setSelectedVerifyVehicleId] = useState<string | null>(null)
  const [chkBattery, setChkBattery] = useState(true)
  const [chkRadio, setChkRadio] = useState(true)
  const [chkWheels, setChkWheels] = useState(true)

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState("")
  const [safetyFilter, setSafetyFilter] = useState<"ALL" | "PASSED" | "FAILED">("ALL")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!ownerName.trim() || !ownerPhone.trim() || !vehicleBrand.trim()) {
      toast.error("Vui lòng nhập đầy đủ tên chủ xe, số điện thoại và tên hãng xe!")
      return
    }

    registerByoc({
      ownerName,
      ownerPhone,
      vehicleBrand,
      vehicleScale,
      frequencyGhz,
      safetyChecked,
    })

    // Reset Form
    setOwnerName("")
    setOwnerPhone("")
    setVehicleBrand("")
    setVehicleScale("1/10")
    setFrequencyGhz("2.4 GHz")
    setSafetyChecked(false)
    setShowRegForm(false)
  }

  const handleConfirmSafetyPass = () => {
    if (!selectedVerifyVehicleId) return

    const passes = chkBattery && chkRadio && chkWheels
    updateByocSafety(selectedVerifyVehicleId, passes)

    if (passes) {
      toast.success("Xe đã vượt qua tất cả kiểm định an toàn và được cấp phép lên đường đua!")
    } else {
      toast.error("Xe không đạt các chỉ tiêu kiểm định. Cần khắc phục trước khi cho phép chạy.")
    }

    setSelectedVerifyVehicleId(null)
    setChkBattery(true)
    setChkRadio(true)
    setChkWheels(true)
  }

  // Filter registry list
  const filteredRegistry = byocRegistry.filter((v) => {
    const matchesSafety =
      safetyFilter === "ALL" ||
      (safetyFilter === "PASSED" && v.safetyChecked) ||
      (safetyFilter === "FAILED" && !v.safetyChecked)
    const matchesSearch =
      v.ownerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.vehicleBrand.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.ownerPhone.includes(searchQuery)
    return matchesSafety && matchesSearch
  })

  return (
    <div className="space-y-6">
      {/* 1. Page Header with CTA action button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <StaffHeader
          title="Xe tự mang của khách"
          subtitle="Quản lý tem kiểm định an toàn kỹ thuật, tần số kết nối sóng và lốp xe do khách tự mang"
        />

        <StaffButton
          onClick={() => setShowRegForm(!showRegForm)}
          variant="primary"
          className="shrink-0 uppercase tracking-wider text-xs"
        >
          <Plus className="size-4" />
          {showRegForm ? "Đóng Form Đăng Ký" : "Đăng Ký Xe Mới"}
        </StaffButton>
      </div>

      {/* 2. REGISTRATION FORM */}
      {showRegForm && (
        <form onSubmit={handleSubmit} className="animate-fadeIn">
          <StaffCard className="p-6 space-y-6 border-orange-100 bg-[#fffbf9]/60">
            <h3 className="text-base font-bold text-[#1c1b1b]">Đăng ký xe cá nhân mang vào đường đua</h3>

            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
              {/* Owner Name */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#4c4a49] mb-1.5">
                  Tên chủ sở hữu xe *
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3.5 flex items-center text-[#6b7280]">
                    <User className="size-3.5" />
                  </span>
                  <input
                    type="text"
                    placeholder="Ví dụ: Nguyễn Văn A"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    className="w-full rounded-lg border border-[#e5e2e1] bg-white pl-10 pr-3 py-2.5 text-xs font-semibold text-[#1c1b1b] focus:border-[#ea580c] focus:outline-none"
                  />
                </div>
              </div>

              {/* Phone number */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#4c4a49] mb-1.5">
                  Số điện thoại liên hệ *
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3.5 flex items-center text-[#6b7280]">
                    <Phone className="size-3.5" />
                  </span>
                  <input
                    type="text"
                    placeholder="Ví dụ: 0909112233"
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value)}
                    className="w-full rounded-lg border border-[#e5e2e1] bg-white pl-10 pr-3 py-2.5 text-xs font-semibold text-[#1c1b1b] focus:border-[#ea580c] focus:outline-none"
                  />
                </div>
              </div>

              {/* Brand Model */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#4c4a49] mb-1.5">
                  Hiệu xe / Dòng RC Model *
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3.5 flex items-center text-[#6b7280]">
                    <Award className="size-3.5" />
                  </span>
                  <input
                    type="text"
                    placeholder="Ví dụ: Yokomo YD-2, MST RMX..."
                    value={vehicleBrand}
                    onChange={(e) => setVehicleBrand(e.target.value)}
                    className="w-full rounded-lg border border-[#e5e2e1] bg-white pl-10 pr-3 py-2.5 text-xs font-semibold text-[#1c1b1b] focus:border-[#ea580c] focus:outline-none"
                  />
                </div>
              </div>

              {/* Scale */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#4c4a49] mb-1.5">
                  Tỷ lệ mô hình (Scale)
                </label>
                <select
                  value={vehicleScale}
                  onChange={(e) => setVehicleScale(e.target.value)}
                  className="w-full rounded-lg border border-[#e5e2e1] bg-white px-3 py-2.5 text-xs font-semibold text-[#1c1b1b] focus:border-[#ea580c] focus:outline-none focus:ring-1 focus:ring-[#ea580c]"
                >
                  <option value="1/10">1/10 (Tiêu chuẩn)</option>
                  <option value="1/12">1/12</option>
                  <option value="1/16">1/16</option>
                  <option value="1/24">1/24 (Mini-Q / Mini-Z)</option>
                </select>
              </div>

              {/* Radio Wave */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#4c4a49] mb-1.5">
                  Tần số kết nối điều khiển
                </label>
                <select
                  value={frequencyGhz}
                  onChange={(e) => setFrequencyGhz(e.target.value)}
                  className="w-full rounded-lg border border-[#e5e2e1] bg-white px-3 py-2.5 text-xs font-semibold text-[#1c1b1b] focus:border-[#ea580c] focus:outline-none focus:ring-1 focus:ring-[#ea580c]"
                >
                  <option value="2.4 GHz">2.4 GHz (Kỹ thuật số chống trùng sóng)</option>
                  <option value="27 MHz">27 MHz (Băng tần cũ)</option>
                  <option value="49 MHz">49 MHz (Băng tần cũ)</option>
                </select>
              </div>

              {/* Safety checkbox */}
              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-[#4c4a49]">
                  <input
                    type="checkbox"
                    checked={safetyChecked}
                    onChange={(e) => setSafetyChecked(e.target.checked)}
                    className="rounded border-[#e5e2e1] text-[#ea580c] focus:ring-[#ea580c] bg-white w-4 h-4"
                  />
                  Đã duyệt kiểm an toàn sơ bộ
                </label>
              </div>
            </div>

            <StaffButton type="submit" variant="primary" className="uppercase tracking-wider text-xs">
              Đăng ký xe & Cấp tem an toàn
            </StaffButton>
          </StaffCard>
        </form>
      )}

      {/* 3. FILTER CONTROL PANEL */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between rounded-xl border border-[#e5e2e1] bg-white p-4 shadow-sm">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          <Filter className="size-4 text-[#6b7280] shrink-0" />
          {([
            { code: "ALL", label: "Tất cả" },
            { code: "PASSED", label: "Đã kiểm duyệt (Đạt)" },
            { code: "FAILED", label: "Chờ / Cần sửa lỗi" },
          ] as const).map((item) => (
            <button
              key={item.code}
              onClick={() => setSafetyFilter(item.code)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-bold transition-all border shrink-0",
                safetyFilter === item.code
                  ? "bg-[#ea580c] text-white border-[#ea580c]"
                  : "bg-white text-[#6b7280] border-[#e5e2e1] hover:text-[#1c1b1b] hover:bg-[#fcf8f8]"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-64">
          <span className="absolute inset-y-0 left-3 flex items-center text-[#6b7280]">
            <Search className="size-3.5" />
          </span>
          <input
            type="text"
            placeholder="Tìm chủ xe, SĐT hoặc dòng xe..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-[#e5e2e1] bg-white pl-9 pr-4 py-2 text-xs font-semibold text-[#1c1b1b] focus:outline-none focus:ring-1 focus:ring-[#ea580c] focus:border-[#ea580c]"
          />
        </div>
      </div>

      {/* 4. REGISTRY CARS LIST GRID */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredRegistry.map((car) => {
          // safety checked variants
          const safetyBadgeVariant = car.safetyChecked ? "success" : "error"

          return (
            <StaffCard key={car.id} className="flex flex-col justify-between space-y-4 h-full">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#6b7280] font-bold font-mono">Tem xe: {car.id}</span>
                  <StaffBadge variant={safetyBadgeVariant}>
                    {car.safetyChecked ? "ĐẠT CHUẨN AN TOÀN" : "CẦN THẨM ĐỊNH"}
                  </StaffBadge>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-[#1c1b1b]">{car.vehicleBrand}</h4>
                  <p className="text-[10px] text-[#6b7280] font-semibold mt-0.5">Tỷ lệ: {car.vehicleScale} | Sóng: {car.frequencyGhz}</p>
                </div>

                <div className="rounded-lg bg-[#fcf8f8] border border-[#e5e2e1] p-3 text-xs text-[#4c4a49] font-semibold space-y-1">
                  <p className="flex justify-between">
                    <span className="text-[#6b7280]">Chủ xe:</span>
                    <span className="text-[#1c1b1b]">{car.ownerName}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="text-[#6b7280]">Điện thoại:</span>
                    <span className="text-[#1c1b1b]">{car.ownerPhone}</span>
                  </p>
                  <p className="flex justify-between text-[10px] border-t border-dashed border-[#e5e2e1] pt-1 mt-1 text-[#6b7280]">
                    <span>Kiểm định gần nhất:</span>
                    <span>{new Date(car.lastCheckedAt).toLocaleDateString("vi-VN")}</span>
                  </p>
                </div>
              </div>

              <div className="border-t border-[#e5e2e1] pt-3">
                <StaffButton
                  onClick={() => setSelectedVerifyVehicleId(car.id)}
                  variant="outline"
                  className="w-full text-xs text-[#ea580c] hover:bg-[#fff3eb]"
                >
                  <ClipboardList className="size-3.5" />
                  Khai báo Kỹ thuật kỹ hơn
                </StaffButton>
              </div>
            </StaffCard>
          )
        })}

        {filteredRegistry.length === 0 && (
          <StaffCard className="col-span-full py-16 text-center text-[#6b7280] space-y-2 border-dashed">
            <ClipboardList className="size-10 text-[#6b7280] mx-auto" />
            <p className="text-sm font-bold">Không có xe tự mang nào</p>
          </StaffCard>
        )}
      </div>

      {/* 5. VERIFY CHECKLIST MODAL */}
      {selectedVerifyVehicleId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <StaffCard className="w-full max-w-sm p-6 shadow-xl space-y-4 bg-white border border-[#e5e2e1]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[#ea580c] font-extrabold text-sm">
                <ShieldCheck className="size-5" />
                <h3>Bảng kiểm nghiệm xe tự mang</h3>
              </div>
              <button
                onClick={() => setSelectedVerifyVehicleId(null)}
                className="flex size-7 items-center justify-center rounded-full bg-[#f5f3f2] text-[#6b7280]"
              >
                <X className="size-4" />
              </button>
            </div>

            <p className="text-xs text-[#6b7280] font-semibold leading-relaxed">
              Nhân viên kỹ thuật cần xác nhận 3 tiêu chuẩn bắt buộc sau đây trước khi duyệt dán tem đường đua:
            </p>

            <div className="space-y-3 font-semibold text-xs">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={chkBattery}
                  onChange={(e) => setChkBattery(e.target.checked)}
                  className="rounded border-[#e5e2e1] text-[#ea580c] focus:ring-[#ea580c] bg-white w-4 h-4"
                />
                <span className="text-[#4c4a49]">Pin Lipo không phồng rộp, nứt vỡ</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={chkRadio}
                  onChange={(e) => setChkRadio(e.target.checked)}
                  className="rounded border-[#e5e2e1] text-[#ea580c] focus:ring-[#ea580c] bg-white w-4 h-4"
                />
                <span className="text-[#4c4a49]">Remote radio 2.4GHz không nhiễu sóng phát</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={chkWheels}
                  onChange={(e) => setChkWheels(e.target.checked)}
                  className="rounded border-[#e5e2e1] text-[#ea580c] focus:ring-[#ea580c] bg-white w-4 h-4"
                />
                <span className="text-[#4c4a49]">Ốc siết trục cứng cáp, lốp bám chặt</span>
              </label>
            </div>

            <div className="rounded-lg bg-[#fff3eb] border border-[#ffdbca] p-2.5 text-[10px] text-orange-950 flex gap-1.5 font-bold">
              <Info className="size-4 shrink-0 text-[#ea580c]" />
              Nếu một trong 3 tiêu chí trên không đạt, xe sẽ tự động bị đình chỉ và hiển thị nhãn báo lỗi.
            </div>

            <div className="flex gap-2 pt-2">
              <StaffButton
                onClick={() => setSelectedVerifyVehicleId(null)}
                variant="outline"
                className="flex-1"
              >
                Hủy bỏ
              </StaffButton>
              <StaffButton
                onClick={handleConfirmSafetyPass}
                variant="primary"
                className="flex-1"
              >
                Xác nhận
              </StaffButton>
            </div>
          </StaffCard>
        </div>
      )}
    </div>
  )
}
