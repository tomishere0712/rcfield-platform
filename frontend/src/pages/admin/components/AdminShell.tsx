import { Link, useLocation, useNavigate } from "react-router"
import type { ReactNode, ElementType } from "react"
import { useState, Children, isValidElement } from "react"
import {
  BookOpen,
  Building2,
  CircleHelp,
  Compass,
  CreditCard,
  Image,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Package,
  Receipt,
  Settings2,
  Share2,
  Sparkles,
  UserRound,
  Users,
  X,
  Zap,
  Trophy,
} from "lucide-react"
import { toast } from "sonner"

import { routePaths } from "@/app/router/route-paths"
import { logoutSession } from "@/features/auth/api/auth.api"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { storageKeys } from "@/shared/lib/storage"
import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { AdminHeader } from "./AdminPrimitives"
import { NotificationBell } from "@/features/notifications/components/NotificationBell"

type NavItem = { label: string; icon: ElementType; to: string }
type NavGroup = { heading: string; items: NavItem[] }

/*
  Nhóm theo VIỆC admin đang làm, không theo thực thể trong cơ sở dữ liệu.

  Bản trước có một nhóm tên "Provider & SaaS" nuốt 8 trong 14 mục — vì bất cứ
  thứ gì dính tới provider đều rơi vào đó: duyệt cơ sở, duyệt nâng gói, sổ giao
  dịch, lẫn cả danh mục tiện ích và loại đường chạy. Một nhóm gom quá nửa số mục
  thì không còn là nhóm nữa, nó chỉ là cái danh sách dài có tiêu đề.

  Hai mục dễ nhầm nhất nằm cách nhau sáu dòng và dùng CHUNG một icon:
    "Yêu cầu thanh toán" → hàng chờ duyệt, admin phải quyết định từng cái
    "Thanh toán SaaS"    → sổ cái chỉ để tra cứu, không thao tác gì
  Hai việc khác hẳn nhau. Đã tách sang hai nhóm và đổi tên cho nói đúng bản chất.

  Mỗi nhóm giờ tối đa 3 mục, và tên nhóm là một danh từ đơn — không còn kiểu
  "A & B" gộp hai khái niệm rời rạc.
*/
const adminNavGroups: NavGroup[] = [
  {
    heading: "Tổng quan",
    items: [
      {
        label: "Bảng điều khiển",
        icon: LayoutDashboard,
        to: routePaths.adminDashboard,
      },
      // Đặt ở "Tổng quan" chứ không phải "Đối tác": trang này theo dõi mọi
      // người dùng, mà phần lớn là khách chứ không phải chủ sân. Xếp vào nhóm
      // Đối tác thì ai đi tìm chỗ xử lý khách hỏng hẹn sẽ không nghĩ tới đó.
      {
        label: "Người dùng",
        icon: UserRound,
        to: routePaths.adminUsers,
      },
    ],
  },
  {
    // Xếp theo dòng chảy tự nhiên: tài khoản đối tác → cơ sở của họ → yêu cầu
    // nâng gói của họ.
    heading: "Đối tác",
    items: [
      { label: "Tài khoản Provider", icon: Users, to: routePaths.adminProviders },
      // Trang này duyệt CƠ SỞ, không phải tài khoản đối tác — việc đó nằm ở mục
      // ngay trên. Nhãn cũ là "Duyệt đối tác" nên ai đi tìm chỗ duyệt cơ sở đều
      // bấm nhầm sang mục kia rồi kết luận là chưa có.
      { label: "Duyệt cơ sở", icon: Building2, to: routePaths.adminCafes },
      {
        // "Yêu cầu thanh toán" quá rộng — provider trả tiền ở nhiều chỗ. Trang
        // này chỉ xử lý đúng một việc: duyệt hoặc từ chối yêu cầu nâng gói.
        label: "Yêu cầu nâng gói",
        icon: CreditCard,
        to: routePaths.adminPaymentRequests,
      },
    ],
  },
  {
    heading: "Tài chính",
    items: [
      {
        // Sổ này gồm cả giao dịch từ luồng đặt lịch lẫn cổng SaaS, nên không
        // kèm chữ "SaaS" — kèm vào là hẹp hơn thứ trang thật sự hiển thị.
        label: "Sổ giao dịch",
        icon: Receipt,
        to: routePaths.adminPayments,
      },
      {
        label: "Phí tổ chức giải",
        icon: Trophy,
        to: routePaths.adminContestFeeOrders,
      },
    ],
  },
  {
    // Dữ liệu nền hiếm khi đụng tới, tách khỏi việc hằng ngày để khỏi lẫn.
    heading: "Danh mục",
    items: [
      {
        label: "Gói dịch vụ",
        icon: Package,
        to: routePaths.adminSubscriptionPlans,
      },
      {
        label: "Tiện ích cơ sở",
        icon: Sparkles,
        to: routePaths.adminAmenities,
      },
      {
        label: "Loại đường chạy",
        icon: Compass,
        to: routePaths.adminTrackTypes,
      },
    ],
  },
  {
    heading: "Trợ lý ảo",
    items: [
      {
        label: "Cuộc trò chuyện",
        icon: MessageCircle,
        to: routePaths.adminSystemChat,
      },
      { label: "Kênh Messenger", icon: Share2, to: routePaths.adminChannels },
      {
        label: "Kho kiến thức",
        icon: BookOpen,
        to: routePaths.adminKnowledgeBase,
      },
    ],
  },
  {
    heading: "Hệ thống",
    items: [
      {
        label: "Popup trang chủ",
        icon: Image,
        to: routePaths.adminFeaturedPopups,
      },
      {
        label: "Cấu hình hệ thống",
        icon: Settings2,
        to: routePaths.adminFeatureFlags,
      },
    ],
  },
]

export function AdminShell({
  children,
  contentClassName,
}: {
  children: ReactNode
  contentClassName?: string
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const clearAuthenticated = useAuthStore((state) => state.clearAuthenticated)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleLogout = async () => {
    const storedAuth =
      localStorage.getItem(storageKeys.auth) ??
      sessionStorage.getItem(storageKeys.auth)

    if (storedAuth) {
      try {
        const auth = JSON.parse(storedAuth) as {
          accessToken?: string
          refreshToken?: string
        }

        if (auth.accessToken && auth.refreshToken) {
          await logoutSession(auth.accessToken, auth.refreshToken)
        }
      } catch {
        // Local logout still clears the app when the server session is already gone.
      }
    }

    clearAuthenticated()
    localStorage.removeItem(storageKeys.auth)
    sessionStorage.removeItem(storageKeys.auth)
    toast.success("Đã đăng xuất khỏi tài khoản Quản trị viên.")
    navigate(routePaths.login, { replace: true })
  }

  const childList = Children.toArray(children)
  const headerChildren = childList.filter(
    (child) => isValidElement(child) && child.type === AdminHeader,
  )
  const contentChildren = childList.filter(
    (child) => !(isValidElement(child) && child.type === AdminHeader),
  )

  return (
    <div className="flex h-screen overflow-hidden bg-[#fcf8f8] text-[#1c1b1b] font-sans">
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col rounded-r-xl border-r border-[#e5e2e1] bg-white p-4 md:flex shadow-sm">
        <Link
          to={routePaths.adminDashboard}
          className="mb-8 px-4 flex items-center gap-2.5"
        >
          <div className="flex size-9 items-center justify-center rounded-lg bg-[#primary] text-white bg-orange-600 shadow-md">
            <Zap className="size-4 fill-current" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight tracking-tight text-[#1c1b1b]">
              RCField Admin
            </h1>
            <p className="text-[10px] font-semibold text-[#747878] uppercase tracking-wider">
              Hệ thống quản trị
            </p>
          </div>
        </Link>

        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto pr-1">
          {adminNavGroups.map((group) => (
            <div key={group.heading}>
              <p className="mb-1 px-4 text-[10px] font-extrabold uppercase tracking-widest text-[#b0b4b4]">
                {group.heading}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const active =
                    location.pathname === item.to ||
                    (item.to !== routePaths.adminDashboard &&
                      location.pathname.startsWith(item.to))
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-bold transition-all duration-150",
                        active
                          ? "bg-orange-50 text-orange-700 shadow-sm border border-orange-100/50"
                          : "text-[#444748] hover:bg-[#f6f3f2] hover:text-[#1c1b1b]",
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-4.5",
                          active ? "text-orange-600" : "text-[#747878]",
                        )}
                      />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-3 flex flex-col gap-1 border-t border-[#e5e2e1] pt-3">
          <Link
            to={routePaths.profile}
            className="flex items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-bold text-[#444748] hover:bg-[#f6f3f2] hover:text-[#1c1b1b]"
          >
            <UserRound className="size-5 text-[#747878]" />
            Hồ sơ cá nhân
          </Link>
          <Link
            to={routePaths.adminGuide}
            className={cn(
              "flex items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-bold transition-all duration-150",
              location.pathname === routePaths.adminGuide
                ? "border border-orange-100 bg-orange-50 text-orange-700 shadow-sm"
                : "text-[#444748] hover:bg-[#f6f3f2] hover:text-[#1c1b1b]",
            )}
          >
            <CircleHelp
              className={cn(
                "size-5",
                location.pathname === routePaths.adminGuide
                  ? "text-orange-600"
                  : "text-[#747878]",
              )}
            />
            Hướng dẫn quản trị
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-bold text-[#444748] hover:bg-red-50 hover:text-red-700 text-left"
          >
            <LogOut className="size-5 text-[#747878] group-hover:text-red-600" />
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-[#e5e2e1] bg-white px-4 md:hidden shadow-sm">
        <Link
          to={routePaths.adminDashboard}
          className="flex items-center gap-2"
        >
          <div className="flex size-8 items-center justify-center rounded-lg bg-orange-600 text-white">
            <Zap className="size-4 fill-current" />
          </div>
          <span className="text-lg font-bold text-[#1c1b1b]">
            RCField Admin
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(true)}
            className="text-[#444748] hover:bg-[#f6f3f2]"
          >
            <Menu className="size-5" />
          </Button>
        </div>
      </header>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative flex w-full max-w-xs flex-col bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between mb-8 px-2">
              <span className="text-lg font-bold text-[#1c1b1b]">
                Menu Quản trị
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(false)}
              >
                <X className="size-5" />
              </Button>
            </div>

            <nav className="flex flex-1 flex-col gap-4 overflow-y-auto">
              {adminNavGroups.map((group) => (
                <div key={group.heading}>
                  <p className="mb-1 px-4 text-[10px] font-extrabold uppercase tracking-widest text-[#b0b4b4]">
                    {group.heading}
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon
                      const active =
                        location.pathname === item.to ||
                        (item.to !== routePaths.adminDashboard &&
                          location.pathname.startsWith(item.to))
                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          onClick={() => setMobileMenuOpen(false)}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-bold transition-all",
                            active
                              ? "bg-orange-50 text-orange-700 shadow-sm border border-orange-100"
                              : "text-[#444748] hover:bg-[#f6f3f2]",
                          )}
                        >
                          <Icon
                            className={cn(
                              "size-4.5",
                              active ? "text-orange-600" : "text-[#747878]",
                            )}
                          />
                          {item.label}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </nav>

            <div className="mt-3 flex flex-col gap-1 border-t border-[#e5e2e1] pt-3">
              <Link
                to={routePaths.profile}
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-bold text-[#444748] hover:bg-[#f6f3f2]"
              >
                <UserRound className="size-5" />
                Hồ sơ cá nhân
              </Link>
              <Link
                to={routePaths.adminGuide}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-bold transition-all",
                  location.pathname === routePaths.adminGuide
                    ? "border border-orange-100 bg-orange-50 text-orange-700 shadow-sm"
                    : "text-[#444748] hover:bg-[#f6f3f2]",
                )}
              >
                <CircleHelp
                  className={cn(
                    "size-5",
                    location.pathname === routePaths.adminGuide
                      ? "text-orange-600"
                      : "text-[#747878]",
                  )}
                />
                Hướng dẫn quản trị
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 text-left"
              >
                <LogOut className="size-5" />
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Pane */}
      <main className="h-full w-full flex-1 overflow-y-auto bg-[#fcf8f8] pb-24 pt-16 md:ml-64 md:pb-0 md:pt-0">
        {headerChildren}
        <div
          className={cn(
            "mx-auto max-w-7xl px-4 py-8 md:px-6",
            contentClassName,
          )}
        >
          {contentChildren}
        </div>
      </main>
    </div>
  )
}
