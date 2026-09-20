import { Trophy } from "lucide-react"

import { cn } from "@/shared/lib/utils"

// Tier màu theo achievement code (khớp sort_order trong seed achievement_definitions).
// Khi chỉ có label (contest payload không trả code) → dùng tier mặc định.
const TITLE_TIER_CLASS: Record<string, string> = {
  ROOKIE_1_PLAY: "border-slate-300 bg-slate-100 text-slate-700",
  ROAD_REGULAR_3_PLAYS: "border-sky-200 bg-sky-50 text-sky-700",
  GRID_VERIFIED_1: "border-violet-200 bg-violet-50 text-violet-700",
  BEST_LAP_UNDER_32000: "border-orange-200 bg-orange-50 text-orange-700",
  SPEED_NOMAD_5_CAFES: "border-amber-300 bg-amber-50 text-amber-700",
  REGULAR_10_PLAYS: "border-emerald-200 bg-emerald-50 text-emerald-700",
}
const DEFAULT_TIER_CLASS = "border-orange-200 bg-orange-50 text-orange-700"

export function DriverTitleChip({
  label,
  code,
  className,
}: {
  label?: string | null
  code?: string | null
  className?: string
}) {
  if (!label) return null

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold",
        TITLE_TIER_CLASS[code ?? ""] ?? DEFAULT_TIER_CLASS,
        className,
      )}
    >
      <Trophy className="size-3 shrink-0" />
      {label}
    </span>
  )
}
