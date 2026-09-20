import type { ReactNode } from "react"
import { ArrowLeft } from "lucide-react"
import { Link } from "react-router"

import { cn } from "@/shared/lib/utils"

interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
  /** When set, renders a back link above the title. */
  backTo?: string
  backLabel?: string
  className?: string
}

function PageHeader({
  title,
  description,
  actions,
  backTo,
  backLabel = "Quay lại",
  className,
}: PageHeaderProps) {
  return (
    <div data-slot="page-header" className={cn("space-y-2", className)}>
      {backTo ? (
        <Link
          to={backTo}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {backLabel}
        </Link>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export { PageHeader }
export type { PageHeaderProps }
