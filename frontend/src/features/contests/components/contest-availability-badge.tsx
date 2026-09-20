import { cn } from "@/shared/lib/utils"
import { StatusBadge } from "@/shared/ui/status-badge"
import {
  getContestRegistrationAvailability,
  getContestStatusClass,
  getEffectiveContestStatus,
  getRegistrationAvailabilityLabel,
} from "../lib/contest-status"
import type { ContestItem } from "../types"

export interface ContestAvailabilityBadgeProps {
  contest: ContestItem
  className?: string
}

/**
 * Unified "registration availability" pill for public contest surfaces:
 * label comes from the availability window, tone from the effective status.
 */
export function ContestAvailabilityBadge({
  contest,
  className,
}: ContestAvailabilityBadgeProps) {
  const effectiveStatus = getEffectiveContestStatus(contest)
  const availability = getContestRegistrationAvailability(contest)

  return (
    <StatusBadge
      label={getRegistrationAvailabilityLabel(availability)}
      className={cn(getContestStatusClass(effectiveStatus), className)}
    />
  )
}
