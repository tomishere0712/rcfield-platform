import { cn } from "@/shared/lib/utils"
import { StatusBadge } from "@/shared/ui/status-badge"
import {
  getJourneyStatusClass,
  getJourneyStatusLabel,
} from "../lib/contest-status"
import type { CustomerJourneyStatus } from "../types"

export interface JourneyStatusBadgeProps {
  status: CustomerJourneyStatus | null
  size?: "default" | "sm"
  className?: string
}

export function JourneyStatusBadge({
  status,
  size = "default",
  className,
}: JourneyStatusBadgeProps) {
  return (
    <StatusBadge
      label={getJourneyStatusLabel(status)}
      className={cn(
        getJourneyStatusClass(status),
        size === "sm" && "h-4 px-1.5 text-[10px]",
        className,
      )}
    />
  )
}
