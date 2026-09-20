import { useState } from "react"
import { useNavigate } from "react-router"
import { 
  CreditCard, 
  CheckCircle2, 
  ChevronLeft,
  Zap,
  Info
} from "lucide-react"
import { Button } from "@/shared/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card"
import { Badge } from "@/shared/ui/badge"
import { toast } from "sonner"
import { CustomerSubNav } from "../components/CustomerSubNav"

export function CustomerSubscriptionsPage() {
  const navigate = useNavigate()
  const [isAutoRenew, setIsAutoRenew] = useState(true)

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(val)
  }

  const handleToggleAutoRenew = () => {
    setIsAutoRenew(!isAutoRenew)
    toast.success(isAutoRenew ? "Đã tắt tự động gia hạn gói VIP." : "Đã bật tự động gia hạn gói VIP.")
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-12 relative overflow-x-hidden">
      
      {/* Background decorations */}
      <div className="absolute top-0 right-[10%] w-[350px] h-[350px] rounded-full bg-orange-400/5 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[10%] left-[10%] w-[350px] h-[350px] rounded-full bg-indigo-400/5 blur-[100px] pointer-events-none" />

      <div className="max-w-5xl mx-auto space-y-6 relative z-10">
        
        {/* Back Button */}
        <div>
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors bg-white px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-sm hover:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Quay lại trang trước
          </button>
        </div>

        {/* Header Ribbon */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest">
              <Zap className="h-4 w-4 text-orange-500 animate-pulse" />
              Tài khoản & Đăng ký định kỳ
            </div>
            <h1 className="text-3xl font-extrabold text-slate-950 tracking-tight">
              Đăng Ký Thành Viên Định Kỳ
            </h1>
          </div>
        </div>

        {/* SUB NAVIGATION BAR FOR CUSTOMER SPACE */}
        <CustomerSubNav activeTab="packages" />

        {/* Subscription details card */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-slate-200/80 shadow-sm relative overflow-hidden bg-white">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-500 to-orange-600" />
              
              <CardHeader className="flex flex-row items-start justify-between pb-4 border-b border-slate-100">
                <div className="space-y-1">
                  <Badge className="bg-orange-100 text-orange-800 border-none font-bold text-[9px] uppercase tracking-wider">
                    GÓI KHÁCH HÀNG THÂN THIẾT
                  </Badge>
                  <CardTitle className="text-lg font-black text-slate-950">
                    RCField VIP Club Pro Membership
                  </CardTitle>
                  <CardDescription className="text-xs">Đặc quyền đặt lịch trước và giá thuê tốt nhất.</CardDescription>
                </div>
                <Badge className="bg-emerald-100 text-emerald-800 font-bold border-none text-xs">
                  ĐANG ACTIVE
                </Badge>
              </CardHeader>

              <CardContent className="p-6 space-y-6">
                
                {/* Benefits */}
                <div className="space-y-3">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Đặc quyền hội viên PRO đang nhận:</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {[
                      "Giảm 15% tất cả các loại xe thuê tại bất cứ Cafe nào.",
                      "Giảm 10% hóa đơn đồ ăn & thức uống phát sinh trong trận đua.",
                      "Không giới hạn số lượt Check-in Serious Inspection.",
                      "Đặc quyền đặt lịch trước tối đa 14 ngày (bình thường là 7 ngày).",
                      "Đặc quyền tham gia các giải đua nội bộ RCField Cup.",
                      "Miễn phí vệ sinh & bảo dưỡng xe cá nhân 2 lần/tháng."
                    ].map((item, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 p-3 bg-slate-50/50 rounded-xl border border-slate-100 text-xs font-semibold text-slate-700">
                        <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="h-px bg-slate-100" />

                {/* Auto Renew Switch */}
                <div className="flex justify-between items-center bg-slate-50/50 border border-slate-200/60 p-4 rounded-2xl">
                  <div className="space-y-1 pr-4">
                    <span className="block text-xs font-extrabold text-slate-900">Tự động gia hạn đăng ký</span>
                    <span className="block text-[10px] text-slate-400 font-semibold leading-normal">
                      Hệ thống sẽ tự động trừ phí hội viên định kỳ vào ngày 28 hàng tháng bằng thẻ đã liên kết.
                    </span>
                  </div>
                  <Button
                    onClick={handleToggleAutoRenew}
                    className={`h-9 text-xs font-bold rounded-xl border px-4 shrink-0 transition-all ${isAutoRenew ? 'bg-slate-900 hover:bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200'}`}
                  >
                    {isAutoRenew ? "Đang BẬT" : "Đang TẮT"}
                  </Button>
                </div>

              </CardContent>
            </Card>

            {/* Billing Ledger History */}
            <Card className="border-slate-200/80 shadow-sm bg-white">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-xs font-black text-slate-950 uppercase tracking-widest flex items-center gap-1.5">
                  <CreditCard className="h-4.5 w-4.5 text-orange-500" />
                  Lịch Sử Hóa Đơn Hội Viên
                </CardTitle>
                <CardDescription className="text-xs">Hồ sơ thanh toán gia hạn định kỳ của bạn.</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {[
                    { id: "SUB-00124", date: "28/05/2026", desc: "Phí gia hạn VIP Club Pro tháng 5/2026", amount: 250000, status: "SUCCESS" },
                    { id: "SUB-00098", date: "28/04/2026", desc: "Phí gia hạn VIP Club Pro tháng 4/2026", amount: 250000, status: "SUCCESS" },
                    { id: "SUB-00054", date: "28/03/2026", desc: "Phí kích hoạt VIP Club Pro ban đầu", amount: 250000, status: "SUCCESS" }
                  ].map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-150 text-xs font-semibold">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-900 font-extrabold">{item.id}</span>
                          <span className="text-[10px] text-slate-400 font-bold">• {item.date}</span>
                        </div>
                        <span className="text-slate-500 font-medium block">{item.desc}</span>
                      </div>
                      <div className="text-right space-y-1 shrink-0">
                        <span className="block text-slate-900 font-black">{formatCurrency(item.amount)}</span>
                        <Badge className="bg-emerald-100 text-emerald-800 text-[8px] font-bold py-0.2 border-none">THÀNH CÔNG</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column details */}
          <div className="space-y-6">
            <Card className="border-slate-200/80 shadow-md bg-white overflow-hidden">
              <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
                <CardTitle className="text-xs font-black text-slate-950 uppercase tracking-widest flex items-center gap-2">
                  <CreditCard className="h-4.5 w-4.5 text-orange-500" />
                  Cách thanh toán
                </CardTitle>
              </CardHeader>
              {/*
                Khối này trước đây in cứng một thẻ "Visa Debit •••• 8868, hết hạn
                12/29" kèm nhãn PRIMARY. Không có thẻ nào như vậy: RCField không
                lưu thẻ ngân hàng của khách, mỗi lần đặt lịch trả riêng qua VNPay
                hoặc chuyển khoản VietQR. Hiển thị một phương thức không tồn tại
                khiến khách tưởng đã liên kết thẻ và sẽ bị tự động trừ tiền.
              */}
              <CardContent className="p-5 space-y-4 text-xs font-semibold">
                <div className="p-3 bg-orange-50/30 rounded-xl border border-orange-100 space-y-1 text-[11px] text-orange-800 leading-normal font-bold">
                  <Info className="h-3.5 w-3.5 text-orange-500 inline-block mr-1 shrink-0" />
                  Mỗi lần đặt lịch bạn thanh toán riêng qua VNPay hoặc quét mã VietQR.
                  Hệ thống không lưu thẻ và không tự động trừ tiền.
                </div>
              </CardContent>
            </Card>
          </div>

        </div>

      </div>
    </div>
  )
}
