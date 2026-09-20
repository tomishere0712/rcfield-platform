import { Link } from "react-router"
import { cn } from "@/shared/lib/utils"

type AppLogoProps = {
  className?: string
  showText?: boolean
  variant?: "light" | "dark"
  to?: string
}

export function AppLogo({
  className,
  showText = true,
  variant = "light",
  to = "/",
}: AppLogoProps) {
  return (
    <Link to={to} className={cn("inline-flex items-center gap-2", className)}>
      <img
        src="/brand/rcfield-logo.png"
        alt="RCField"
        className="h-9 w-9 rounded-xl border border-border/50 bg-white object-contain shadow-sm transition-transform duration-200 hover:scale-105"
      />
      {showText && (
        <span
          className={cn(
            "text-xl font-black tracking-tight",
            variant === "dark" ? "text-white" : "text-slate-950",
          )}
        >
          RCField
        </span>
      )}
    </Link>
  )
}
