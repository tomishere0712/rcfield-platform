import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/shared/lib/utils"

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "rounded-xl border border-dashed border-border p-10 text-center",
        className,
      )}
    >
      {Icon ? (
        <Icon className="mx-auto size-8 text-muted-foreground/50" />
      ) : null}
      <p className="mt-3 text-sm font-semibold text-muted-foreground">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground/80">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}

export { EmptyState }
export type { EmptyStateProps }
