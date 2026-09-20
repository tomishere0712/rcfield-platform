import React, { useState } from "react"
import { Search, Phone, Mail, Shield, Compass, Calendar, HelpCircle, CheckCircle2, Info, Loader2, UserCheck } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { staffApi } from "@/features/staff/api/staff.api"
import { useStaffOperations } from "./context/StaffOperationContext"
import {
  StaffHeader,
  StaffCard,
  StaffBadge,
  StaffButton,
} from "./components/StaffUI"

interface TopCustomer {
  customerId: string
  fullName: string
  phone: string | null
  email: string
  avatarUrl: string | null
  playCount: number
}

interface SuggestedCustomer {
  customerId: string
  fullName: string
  phone: string | null
  email: string
  avatarUrl: string | null
}

interface SubscriptionItem {
  status: string
  planName: string
  cafeName?: string
  purchasedAt?: string
  expiresAt?: string
  remainingSessions: number
  totalSessions: number
}

export default function StaffPackagesPage() {
  const { assignedCafeId } = useStaffOperations()

  // Search query states
  const [searchQuery, setSearchQuery] = useState("")
  const [searchTriggerQuery, setSearchTriggerQuery] = useState("")
  const [hasSearched, setHasSearched] = useState(false)

  // Selected customer states
  const [selectedCustomerId, setSelectedCustomerId] = useState("")
  const [hasSelectedCustomer, setHasSelectedCustomer] = useState(false)

  // React Query to fetch top customers from Backend API
  const { data: topCustomers, isLoading: isTopLoading } = useQuery<TopCustomer[]>({
    queryKey: ["staff", "top-customers", assignedCafeId],
    queryFn: () => staffApi.getTopCustomers(),
    staleTime: 60000,
    enabled: !!assignedCafeId,
  })

  // React Query to fetch matching customers after Enter / click Tra cứu
  const { data: customerList = [], isLoading: isSearchingList } = useQuery<SuggestedCustomer[]>({
    queryKey: ["staff", "search-customers-list", searchTriggerQuery, assignedCafeId],
    queryFn: () => staffApi.searchCustomers(searchTriggerQuery),
    enabled: hasSearched && !!searchTriggerQuery.trim() && !!assignedCafeId,
    retry: false,
  })

  // React Query call to Backend API for detailed package lookup of the selected customer
  const { data: lookupData, isLoading: isLookupLoading, isError: isLookupError } = useQuery({
    queryKey: ["staff", "packages-lookup", selectedCustomerId, assignedCafeId],
    queryFn: () => staffApi.lookupCustomerPackages(selectedCustomerId),
    enabled: hasSelectedCustomer && !!selectedCustomerId && !!assignedCafeId,
    retry: false,
  })

  const filteredSubscriptions = lookupData?.activeSubscriptions?.filter(
    (sub: SubscriptionItem) => sub.status === "ACTIVE" || sub.status === "EXPIRED" || sub.status === "EXHAUSTED"
  ) || []

  const handleSearchChange = (val: string) => {
    setSearchQuery(val)
    if (!val.trim()) {
      setSearchTriggerQuery("")
      setHasSearched(false)
      setSelectedCustomerId("")
      setHasSelectedCustomer(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) {
      setSearchTriggerQuery("")
      setHasSearched(false)
      setSelectedCustomerId("")
      setHasSelectedCustomer(false)
      return
    }
    setSearchTriggerQuery(searchQuery.trim())
    setHasSearched(true)
    // Reset selected customer
    setSelectedCustomerId("")
    setHasSelectedCustomer(false)
  }

  const handleQuickCustomerSearch = (phoneOrEmail: string, name: string) => {
    setSearchQuery(name)
    setSearchTriggerQuery(phoneOrEmail)
    setHasSearched(true)
    // Reset selected customer
    setSelectedCustomerId("")
    setHasSelectedCustomer(false)
  }

  const handleSelectCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId)
    setHasSelectedCustomer(true)
  }

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return (
          <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase shrink-0">
            Hoạt động
          </span>
        )
      case "PENDING_PAYMENT":
        return (
          <span className="bg-amber-50 border border-amber-200 text-amber-700 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase shrink-0">
            Chờ thanh toán
          </span>
        )
      case "EXHAUSTED":
        return (
          <span className="bg-red-50 border border-red-200 text-red-700 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase shrink-0">
            Hết hạn
          </span>
        )
      case "EXPIRED":
        return (
          <span className="bg-gray-100 border border-gray-200 text-gray-600 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase shrink-0">
            Hết hạn
          </span>
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <StaffHeader
        title="Gói hội viên & Combo"
        subtitle="Tra cứu nhanh thời hạn thẻ và các gói combo của người chơi tại chi nhánh"
      />

      {/* 2. TOP CUSTOMERS QUICK PICKERS */}
      <StaffCard className="p-4 space-y-3">
        <span className="text-[10px] uppercase tracking-wider text-[#6b7280] font-bold flex items-center gap-1.5">
          <HelpCircle className="size-3.5 text-[#ea580c]" />
          Khách hàng chơi nhiều tại cơ sở (chọn để tra nhanh):
        </span>
        
        {isTopLoading ? (
          <div className="flex items-center gap-2 text-xs text-[#6b7280]">
            <Loader2 className="size-3.5 animate-spin text-[#ea580c]" />
            Đang tải danh sách top khách hàng...
          </div>
        ) : topCustomers && topCustomers.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {topCustomers.map((p) => (
              <button
                key={p.customerId}
                onClick={() => handleQuickCustomerSearch(p.phone || p.email, p.fullName)}
                className="text-[11px] font-bold border border-[#e5e2e1] bg-[#fcf8f8] hover:border-[#ea580c] hover:bg-[#fff3eb] rounded-lg px-3 py-1.5 transition-all text-[#4c4a49] flex items-center gap-1"
              >
                {p.fullName} {p.phone ? `(${p.phone})` : `(${p.email})`}
                <span className="bg-[#fff3eb] border border-orange-200 text-[#ea580c] text-[9px] px-1 rounded">
                  {p.playCount} ca
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-xs text-[#6b7280] font-semibold italic">
            Chưa ghi nhận lượt chơi hoàn thành nào của khách hàng tại cơ sở này.
          </div>
        )}
      </StaffCard>

      {/* 3. SEARCH FORM */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-4 flex items-center text-[#6b7280]">
            <Phone className="size-4" />
          </span>
          <input
            type="text"
            placeholder="Nhập số điện thoại, email hoặc họ tên thành viên cần tra cứu..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full rounded-xl border border-[#e5e2e1] bg-white pl-11 pr-4 py-3 text-xs font-semibold text-[#1c1b1b] focus:outline-none focus:ring-1 focus:ring-[#ea580c] focus:border-[#ea580c] shadow-sm"
          />
        </div>
        <StaffButton
          type="submit"
          variant="primary"
          className="uppercase tracking-wider text-xs px-6 shrink-0"
        >
          Tra cứu
        </StaffButton>
      </form>

      {/* 4. SEARCH RESULTS LIST (HIỂN THỊ KHI NHẤN ENTER HOẶC TRA CỨU) */}
      {isSearchingList ? (
        <StaffCard className="p-4 flex items-center justify-center gap-2 text-xs text-[#6b7280] border-dashed">
          <Loader2 className="size-4 animate-spin text-[#ea580c]" />
          Đang tìm kiếm khách hàng khớp từ khóa...
        </StaffCard>
      ) : hasSearched && (
        customerList.length > 0 ? (
          <StaffCard className="p-4 space-y-3">
            <span className="text-[10px] uppercase tracking-wider text-[#6b7280] font-bold block">
              Kết quả tìm thấy ({customerList.length} khách hàng):
            </span>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
              {customerList.map((cust) => {
                const isSelected = selectedCustomerId === cust.customerId
                return (
                  <button
                    key={cust.customerId}
                    type="button"
                    onClick={() => handleSelectCustomer(cust.customerId)}
                    className={`flex items-center gap-3 p-3 text-left border rounded-xl transition-all w-full ${
                      isSelected
                        ? "border-[#ea580c] bg-[#fff3eb]"
                        : "border-[#e5e2e1] bg-white hover:border-[#ea580c]/50 hover:bg-[#fffbf9]"
                    }`}
                  >
                    {cust.avatarUrl ? (
                      <img
                        src={cust.avatarUrl}
                        alt={cust.fullName}
                        className="size-10 rounded-full object-cover border border-[#ffdbca] shrink-0"
                      />
                    ) : (
                      <div className="size-10 rounded-full bg-[#fff3eb] border border-[#ffdbca] flex items-center justify-center text-[#ea580c] font-bold text-sm shrink-0">
                        {cust.fullName.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-xs text-[#1c1b1b] truncate">{cust.fullName}</p>
                      <p className={`text-[9px] truncate ${cust.phone ? "text-[#6b7280]" : "text-gray-400 font-normal"}`}>
                        SĐT: {cust.phone || "Chưa có"}
                      </p>
                      <p className="text-[9px] text-[#6b7280] truncate">Email: {cust.email}</p>
                    </div>
                    {isSelected && (
                      <UserCheck className="size-4 text-[#ea580c] shrink-0 ml-1" />
                    )}
                  </button>
                )
              })}
            </div>
          </StaffCard>
        ) : (
          <StaffCard className="py-12 text-center text-[#6b7280] space-y-1 border-dashed">
            <Info className="size-8 text-red-500 mx-auto" />
            <p className="text-sm font-bold text-[#1c1b1b]">Không tìm thấy khách hàng!</p>
            <p className="text-xs">Không tìm thấy khách hàng nào đã từng chơi tại chi nhánh của bạn khớp với từ khóa trên.</p>
          </StaffCard>
        )
      )}

      {/* 5. DETAILED PACKAGES GRID (HIỂN THỊ KHI ĐÃ CHỌN KHÁCH HÀNG) */}
      {isLookupLoading ? (
        <StaffCard className="py-20 text-center text-[#6b7280] space-y-2 border-dashed">
          <Loader2 className="size-10 text-[#ea580c] mx-auto animate-spin" />
          <p className="text-xs font-semibold">Đang tải thông tin chi tiết gói...</p>
        </StaffCard>
      ) : hasSelectedCustomer && lookupData ? (
        <div className="grid md:grid-cols-3 gap-6 animate-fadeIn">
          {/* CUSTOMER DETAILED CARD */}
          <StaffCard className="p-5 space-y-5 h-fit flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {lookupData.customer.avatarUrl ? (
                  <img
                    src={lookupData.customer.avatarUrl}
                    alt={lookupData.customer.fullName}
                    className="size-11 rounded-full object-cover border border-[#ffdbca]"
                  />
                ) : (
                  <div className="size-11 rounded-full bg-[#fff3eb] border border-[#ffdbca] flex items-center justify-center text-[#ea580c] font-bold text-sm">
                    {lookupData.customer.fullName.charAt(0)}
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-bold text-[#1c1b1b]">{lookupData.customer.fullName}</h3>
                  <StaffBadge variant="orange" className="mt-1">
                    Thành viên
                  </StaffBadge>
                </div>
              </div>

              <div className="space-y-3 border-t border-[#e5e2e1] pt-4 font-semibold text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#6b7280] flex items-center gap-1.5">
                    <Phone className="size-3.5 text-[#6b7280]" /> SĐT:
                  </span>
                  <span className={lookupData.customer.phone ? "text-[#1c1b1b]" : "text-gray-400 font-normal"}>
                    {lookupData.customer.phone || "Chưa có"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#6b7280] flex items-center gap-1.5">
                    <Mail className="size-3.5 text-[#6b7280]" /> Email:
                  </span>
                  <span className="text-[#1c1b1b] truncate max-w-[140px]" title={lookupData.customer.email}>
                    {lookupData.customer.email}
                  </span>
                </div>
              </div>
            </div>
          </StaffCard>

          {/* PACKAGES AND SUBSCRIPTIONS */}
          <div className="md:col-span-2 space-y-6">
            {/* SUB PLAN */}
            <StaffCard className="p-5 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#1c1b1b] flex items-center gap-1.5">
                <Shield className="size-4 text-[#ea580c]" />
                Thành viên tháng (Subscriptions)
              </h4>

              {filteredSubscriptions && filteredSubscriptions.length > 0 ? (
                <div className="space-y-3">
                  {filteredSubscriptions.map((sub: SubscriptionItem, idx: number) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-orange-200 bg-[#fffbf9]/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <h5 className="text-xs font-bold text-[#1c1b1b] flex items-center gap-1.5 flex-wrap">
                          <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
                          <span>{sub.planName}</span>
                          {renderStatusBadge(sub.status)}
                        </h5>
                        <p className="text-[10px] text-[#ea580c] font-bold flex items-center gap-1">
                          <Compass className="size-3 text-[#ea580c]" />
                          Cơ sở áp dụng: {sub.cafeName || "Toàn hệ thống"}
                        </p>
                        <p className="text-[10px] text-[#6b7280] font-semibold flex items-center gap-1">
                          <Calendar className="size-3 text-[#6b7280]" />
                          Ngày bắt đầu: {sub.purchasedAt ? new Date(sub.purchasedAt).toLocaleDateString("vi-VN") : "N/A"}
                        </p>
                        <p className="text-[10px] text-[#6b7280] font-semibold flex items-center gap-1">
                          <Calendar className="size-3 text-[#6b7280]" />
                          Ngày kết thúc: {sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString("vi-VN") : "Không thời hạn"}
                        </p>
                      </div>

                      <div className="rounded-lg bg-white border border-[#e5e2e1] px-3 py-1.5 text-center shrink-0 font-semibold">
                        <span className="text-[9px] text-[#6b7280] uppercase block">Còn lại</span>
                        <span className="text-xs text-[#ea580c] font-bold">
                          {sub.remainingSessions} / {sub.totalSessions} lượt chạy
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/30 p-8 text-center text-xs text-amber-700 font-bold uppercase tracking-wider">
                  Chưa mua gói
                </div>
              )}
            </StaffCard>
          </div>
        </div>
      ) : isLookupError ? (
        <StaffCard className="py-12 text-center text-[#6b7280] space-y-1 border-dashed">
          <Info className="size-8 text-red-500 mx-auto" />
          <p className="text-sm font-bold text-[#1c1b1b]">Lỗi tải chi tiết gói!</p>
          <p className="text-xs">Không thể tải thông tin chi tiết gói chơi của khách hàng này. Vui lòng thử lại.</p>
        </StaffCard>
      ) : (
        <StaffCard className="py-20 text-center text-[#6b7280] space-y-1 border-dashed">
          <Search className="size-10 text-[#6b7280] mx-auto" />
          <p className="text-sm font-bold text-[#1c1b1b]">Chọn khách hàng để tra cứu</p>
          <p className="text-xs">Thông tin hạn dùng và số lượt còn lại của khách tại cơ sở sẽ hiển thị sau khi chọn khách hàng từ kết quả tìm kiếm.</p>
        </StaffCard>
      )}
    </div>
  )
}
