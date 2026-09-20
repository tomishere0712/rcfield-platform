import React, { useEffect } from "react"
import { Link, useNavigate } from "react-router"
import type { LucideIcon } from "lucide-react"
import { LogOut, UserRound } from "lucide-react"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { routePaths } from "@/app/router/route-paths"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"
import { useStaffOperations } from "../context/StaffOperationContext"

// Types & Interfaces
interface StaffCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
  variant?: "default" | "warning" | "error" | "success"
  glow?: boolean
}

interface StaffBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "success" | "warning" | "error" | "info" | "neutral" | "orange"
  children: React.ReactNode
}

interface StaffButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost"
  size?: "sm" | "md" | "lg"
  icon?: LucideIcon
}

interface StaffStatCardProps {
  title: string
  value: string | number
  description?: string
  icon?: LucideIcon
  trend?: {
    value: string
    type: "up" | "down" | "neutral"
  }
}

// 1. StaffCard component
export const StaffCard: React.FC<StaffCardProps> = ({
  children,
  variant = "default",
  glow = false,
  className = "",
  ...props
}) => {
  const baseStyle = "bg-white rounded-xl border border-[#e5e2e1] p-5 transition-all duration-300 hover:shadow-md"
  
  const variantStyles = {
    default: "",
    warning: "border-l-4 border-l-amber-500",
    error: "border-l-4 border-l-rose-500",
    success: "border-l-4 border-l-emerald-500",
  }

  const glowStyle = glow ? "shadow-sm shadow-orange-100 hover:shadow-orange-200/50" : ""

  return (
    <div
      className={`${baseStyle} ${variantStyles[variant]} ${glowStyle} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}

// 2. StaffBadge component
export const StaffBadge: React.FC<StaffBadgeProps> = ({
  variant = "neutral",
  children,
  className = "",
  ...props
}) => {
  const baseStyle = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide transition-colors"

  const variantStyles = {
    neutral: "bg-[#f5f3f2] text-[#4c4a49] border border-[#e5e2e1]",
    success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border border-amber-200",
    error: "bg-rose-50 text-rose-700 border border-rose-200",
    info: "bg-blue-50 text-blue-700 border border-blue-200",
    orange: "bg-[#fff3eb] text-[#ea580c] border border-[#ffdbca]",
  }

  return (
    <span
      className={`${baseStyle} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}

// 3. StaffButton component
export const StaffButton: React.FC<StaffButtonProps> = ({
  variant = "primary",
  size = "md",
  icon: Icon,
  children,
  className = "",
  ...props
}) => {
  const baseStyle = "inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]"

  const variantStyles = {
    primary: "bg-[#ea580c] hover:bg-[#d94e0b] text-white shadow-sm focus:ring-[#ea580c]",
    secondary: "bg-[#fff3eb] hover:bg-[#ffd9c3] text-[#ea580c] focus:ring-[#ea580c]",
    outline: "border border-[#e5e2e1] hover:bg-[#fcf8f8] text-[#1c1b1b] focus:ring-[#1c1b1b]",
    danger: "bg-rose-600 hover:bg-rose-700 text-white shadow-sm focus:ring-rose-500",
    ghost: "text-[#4c4a49] hover:bg-[#f5f3f2] hover:text-[#1c1b1b] focus:ring-[#1c1b1b]",
  }

  const sizeStyles = {
    sm: "px-3 py-1.5 text-xs gap-1.5",
    md: "px-4 py-2 text-sm gap-2",
    lg: "px-5 py-2.5 text-base gap-2",
  }

  return (
    <button
      className={`${baseStyle} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {Icon && <Icon className={size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"} />}
      {children}
    </button>
  )
}

// 4. StaffStatCard component
export const StaffStatCard: React.FC<StaffStatCardProps> = ({
  title,
  value,
  description,
  icon: Icon,
  trend,
}) => {
  return (
    <StaffCard className="flex items-center justify-between p-6">
      <div className="space-y-1">
        <span className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider">{title}</span>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-[#1c1b1b] tracking-tight">{value}</span>
          {trend && (
            <span
              className={`text-xs font-medium ${
                trend.type === "up"
                  ? "text-emerald-600"
                  : trend.type === "down"
                  ? "text-rose-600"
                  : "text-gray-500"
              }`}
            >
              {trend.value}
            </span>
          )}
        </div>
        {description && <p className="text-xs text-[#6b7280]">{description}</p>}
      </div>
      {Icon && (
        <div className="p-3 rounded-lg bg-[#fff3eb] text-[#ea580c]">
          <Icon className="w-6 h-6" />
        </div>
      )}
    </StaffCard>
  )
}

// 5. StaffAccountMenu component
export function StaffAccountMenu() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const clearAuthenticated = useAuthStore((state) => state.clearAuthenticated)

  const displayName = user?.fullName ?? "Nhân viên"
  const email = user?.email ?? "staff@rcfield.vn"

  const handleLogout = () => {
    clearAuthenticated()
    localStorage.removeItem("rcfield:auth")
    sessionStorage.removeItem("rcfield:auth")
    toast.success("Đã đăng xuất khỏi tài khoản nhân viên.")
    navigate(routePaths.login, { replace: true })
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(-2)
      .toUpperCase()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex items-center gap-2 rounded-xl border border-orange-200 bg-white/90 py-1.5 pl-2 pr-3 shadow-sm transition hover:bg-white">
          <Avatar>
            <AvatarImage src={user?.avatarUrl} />
            <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-32 truncate text-sm font-bold text-orange-950 xl:block">{displayName}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 rounded-xl p-2">
        <DropdownMenuLabel className="px-2 py-2">
          <div className="flex items-center gap-3">
            <Avatar size="lg">
              <AvatarImage src={user?.avatarUrl} />
              <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-950">{displayName}</p>
              <p className="truncate text-xs text-slate-500">{email}</p>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer rounded-lg px-2 py-2">
          <Link to={routePaths.profile}>
            <UserRound className="h-4 w-4" />
            Hồ sơ cá nhân
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" className="cursor-pointer rounded-lg px-2 py-2" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          Đăng xuất
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// 6. StaffHeader component
interface StaffHeaderProps {
  title: string
  subtitle?: string
  action?: React.ReactNode
}

export const StaffHeader: React.FC<StaffHeaderProps> = ({ title, subtitle, action }) => {
  const { setHeaderProps } = useStaffOperations()

  useEffect(() => {
    setHeaderProps({ title, subtitle, action })
    return () => {
      setHeaderProps(null)
    }
  }, [title, subtitle, action, setHeaderProps])

  return null
}
StaffHeader.displayName = "StaffHeader"
