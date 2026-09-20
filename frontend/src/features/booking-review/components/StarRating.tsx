import { Star } from "lucide-react"
import { cn } from "@/shared/lib/utils"

interface StarRatingProps {
  value: number
  onChange?: (value: number) => void
  readOnly?: boolean
  size?: "sm" | "md" | "lg"
}

const SIZE_MAP = {
  sm: "h-3.5 w-3.5",
  md: "h-5 w-5",
  lg: "h-7 w-7",
}

export function StarRating({ value, onChange, readOnly = false, size = "md" }: StarRatingProps) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          onClick={() => !readOnly && onChange?.(star)}
          className={cn(
            "transition-colors",
            readOnly ? "cursor-default" : "cursor-pointer hover:scale-110",
          )}
          aria-label={readOnly ? `${star} sao` : `Chọn ${star} sao`}
        >
          <Star
            className={cn(
              SIZE_MAP[size],
              star <= value ? "fill-amber-400 text-amber-400" : "fill-none text-slate-300",
            )}
          />
        </button>
      ))}
    </div>
  )
}
