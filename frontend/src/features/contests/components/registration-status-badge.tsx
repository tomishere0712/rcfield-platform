import { cn } from "@/shared/lib/utils"
import { StatusBadge } from "@/shared/ui/status-badge"
import {
  getRegistrationStatusClass,
  getRegistrationStatusLabel,
} from "../lib/contest-status"
import type { ContestRegistrationStatus } from "../types"

export interface RegistrationStatusBadgeProps {
  status: ContestRegistrationStatus
  size?: "default" | "sm"
  className?: string
}

export function RegistrationStatusBadge({
  status,
  size = "default",
  className,
}: RegistrationStatusBadgeProps) {
  return (
    <StatusBadge
      label={getRegistrationStatusLabel(status)}
      className={cn(
        getRegistrationStatusClass(status),
        size === "sm" && "h-4 px-1.5 text-[10px]",
        className,
      )}
    />
  )
}
