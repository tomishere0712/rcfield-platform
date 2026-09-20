import { Link } from "react-router"
import { CalendarCheck, Package, Star, Trophy, UserRound } from "lucide-react"
import { routePaths } from "@/app/router/route-paths"
import { cn } from "@/shared/lib/utils"

export type CustomerTab = "profile" | "bookings" | "contests" | "packages" | "reviews"

interface CustomerSubNavProps {
  activeTab: CustomerTab
}

/**
 * Năm mục, không phải bốn.
 *
 * Trang "Giải đấu đã đăng ký" vốn đã tồn tại và có route, nhưng không nằm ở
 * đây — nên từ bốn trang kia không có gì cho thấy nó có mặt trên đời, và vào
 * được nó chỉ qua menu ở thanh đầu trang. Vào rồi thì thanh tab biến mất luôn,
 * không có đường quay lại.
 *
 * Xếp ngay sau "Lịch đặt sân" vì hai thứ này cùng một họ: đều là những buổi
 * khách đã đăng ký và sắp phải có mặt.
 */
const tabConfig = [
  { id: "profile" as const, label: "Hồ sơ", path: routePaths.customerProfile, icon: UserRound },
  {
    id: "bookings" as const,
    label: "Lịch đặt sân",
    path: routePaths.customerBookings,
    icon: CalendarCheck,
  },
  {
    id: "contests" as const,
    label: "Giải đấu",
    path: routePaths.customerContestRegistrations,
    icon: Trophy,
  },
  {
    id: "packages" as const,
    label: "Gói hội viên",
    path: routePaths.customerPackages,
    icon: Package,
  },
  { id: "reviews" as const, label: "Đánh giá của tôi", path: routePaths.customerReviews, icon: Star },
]

export function CustomerSubNav({ activeTab }: CustomerSubNavProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200/60 bg-white/70 p-1 shadow-sm backdrop-blur-sm">
      {tabConfig.map((tab) => {
        const Icon = tab.icon
        const isActive = tab.id === activeTab
        return (
          <Link
            key={tab.id}
            to={tab.path}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200",
              isActive
                ? "bg-slate-900 text-white shadow-md shadow-slate-900/15"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            <Icon className={cn("h-4 w-4", isActive ? "text-orange-400" : "text-slate-400")} />
            <span className="hidden sm:inline">{tab.label}</span>
          </Link>
        )
      })}
    </div>
  )
}
