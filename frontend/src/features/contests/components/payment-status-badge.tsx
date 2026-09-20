import { cn } from "@/shared/lib/utils"
import { StatusBadge } from "@/shared/ui/status-badge"
import {
  getPaymentStatusClass,
  getPaymentStatusLabel,
} from "../lib/contest-status"
import type { ContestEntryFeePaymentStatus } from "../types"

export interface PaymentStatusBadgeProps {
  status: ContestEntryFeePaymentStatus
  size?: "default" | "sm"
  className?: string
}

export function PaymentStatusBadge({
  status,
  size = "default",
  className,
}: PaymentStatusBadgeProps) {
  return (
    <StatusBadge
      label={getPaymentStatusLabel(status)}
      className={cn(
        getPaymentStatusClass(status),
        size === "sm" && "h-4 px-1.5 text-[10px]",
        className,
      )}
    />
  )
}
