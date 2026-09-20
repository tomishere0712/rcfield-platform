import type { LucideIcon } from "lucide-react"

import { cn } from "@/shared/lib/utils"
import { Badge } from "@/shared/ui/badge"

interface StatusBadgeProps {
  label: string
  /** Tone classes (bg/text/border) supplied by the caller. */
  className?: string
  icon?: LucideIcon
}

function StatusBadge({ label, className, icon: Icon }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn("border", className)}
    >
      {Icon ? <Icon data-icon="inline-start" /> : null}
      {label}
    </Badge>
  )
}

export { StatusBadge }
export type { StatusBadgeProps }
