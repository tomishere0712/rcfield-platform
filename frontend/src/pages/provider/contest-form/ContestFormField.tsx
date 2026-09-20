import type { ReactNode } from "react"

import { cn } from "@/shared/lib/utils"
import { Label } from "@/shared/ui/label"

export function ContestFormField({
  label,
  className,
  error,
  children,
}: {
  label: string
  className?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="block text-sm font-bold text-[#1c1b1b]">{label}</Label>
      {children}
      {error ? (
        <p className="mt-1 text-xs font-semibold text-red-500">{error}</p>
      ) : null}
    </div>
  )
}
