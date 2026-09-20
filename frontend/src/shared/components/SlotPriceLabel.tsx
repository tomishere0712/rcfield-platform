import { Badge } from "@/shared/ui/badge"
import { cn } from "@/shared/lib/utils"

interface SlotPriceLabelProps {
  effectivePrice: number
  label: string | null
  className?: string
}

/** Shows effective slot price. When dynamic pricing applies, renders a coloured label badge. */
export function SlotPriceLabel({ effectivePrice, label, className }: SlotPriceLabelProps) {
  const formatted = `${(effectivePrice).toLocaleString("vi-VN")}đ/h`

  if (!label) {
    return (
      <span className={cn("text-sm font-medium text-[#1c1b1b]", className)}>
        {formatted}
      </span>
    )
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="text-sm font-bold text-[#1c1b1b]">{formatted}</span>
      <Badge className="rounded-full bg-amber-100 text-amber-800 border-amber-200 text-xs font-medium">
        {label}
      </Badge>
    </span>
  )
}
