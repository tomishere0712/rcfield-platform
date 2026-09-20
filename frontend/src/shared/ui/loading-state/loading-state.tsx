import { Loader2 } from "lucide-react"

import { cn } from "@/shared/lib/utils"
import { Skeleton } from "@/shared/ui/skeleton"

interface LoadingStateProps {
  label?: string
  className?: string
}

function LoadingState({ label = "Đang tải...", className }: LoadingStateProps) {
  return (
    <div
      data-slot="loading-state"
      className={cn(
        "flex items-center justify-center gap-2 py-10 text-sm font-medium text-muted-foreground",
        className,
      )}
    >
      <Loader2 className="size-4 animate-spin" />
      {label}
    </div>
  )
}

interface CardListSkeletonProps {
  count?: number
  className?: string
  itemClassName?: string
}

function CardListSkeleton({
  count = 3,
  className,
  itemClassName,
}: CardListSkeletonProps) {
  return (
    <div data-slot="card-list-skeleton" className={cn("space-y-3", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className={cn("h-24 rounded-xl", itemClassName)} />
      ))}
    </div>
  )
}

export { LoadingState, CardListSkeleton }
export type { LoadingStateProps, CardListSkeletonProps }
