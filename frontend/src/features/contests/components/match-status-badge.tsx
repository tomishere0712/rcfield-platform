import { cn } from "@/shared/lib/utils"
import { StatusBadge } from "@/shared/ui/status-badge"
import { getMatchStatusClass, getMatchStatusLabel } from "../lib/contest-status"
import type { ContestMatchStatus } from "../types"

export interface MatchStatusBadgeProps {
  status: ContestMatchStatus
  size?: "default" | "sm"
  className?: string
}

export function MatchStatusBadge({
  status,
  size = "default",
  className,
}: MatchStatusBadgeProps) {
  return (
    <StatusBadge
      label={getMatchStatusLabel(status)}
      className={cn(
        getMatchStatusClass(status),
        size === "sm" && "h-4 px-1.5 text-[10px]",
        className,
      )}
    />
  )
}
