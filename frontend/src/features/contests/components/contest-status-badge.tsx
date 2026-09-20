import { cn } from "@/shared/lib/utils"
import { StatusBadge } from "@/shared/ui/status-badge"
import {
  getContestStatusClass,
  getContestStatusLabel,
} from "../lib/contest-status"
import type { ContestStatus } from "../types"

export interface ContestStatusBadgeProps {
  status: ContestStatus
  size?: "default" | "sm"
  className?: string
}

export function ContestStatusBadge({
  status,
  size = "default",
  className,
}: ContestStatusBadgeProps) {
  return (
    <StatusBadge
      label={getContestStatusLabel(status)}
      className={cn(
        getContestStatusClass(status),
        size === "sm" && "h-4 px-1.5 text-[10px]",
        className,
      )}
    />
  )
}
