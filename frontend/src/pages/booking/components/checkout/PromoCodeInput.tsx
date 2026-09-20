import { useState } from "react"
import { Tag, X, Loader2 } from "lucide-react"
import { Input } from "@/shared/ui/input"
import { Button } from "@/shared/ui/button"
import { promotionApi } from "@/features/promotions/api/promotion.api"
import { formatCurrency } from "@/shared/lib/format"

export interface AppliedPromo {
  code: string
  discount_amount: number
  discount_type: string
  description: string | null
}

interface PromoCodeInputProps {
  cafeId: string
  playMode: "RENTAL" | "BYOC"
  slotStart: string
  subtotal: number
  appliedPromo: AppliedPromo | null
  onApply: (promo: AppliedPromo | null) => void
}

export function PromoCodeInput({
  cafeId,
  playMode,
  slotStart,
  subtotal,
  appliedPromo,
  onApply,
}: PromoCodeInputProps) {
  const [code, setCode] = useState(appliedPromo?.code ?? "")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleApply = async () => {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) return

    setIsLoading(true)
    setError(null)
    try {
      const result = await promotionApi.preview(cafeId, {
        code: trimmed,
        play_mode: playMode,
        slot_start: slotStart,
        subtotal,
      })
      onApply(result)
    } catch (err) {
      const axErr = err as { response?: { data?: { message?: string } } }
      setError(axErr?.response?.data?.message ?? "Mã ưu đãi không hợp lệ")
      onApply(null)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRemove = () => {
    setCode("")
    setError(null)
    onApply(null)
  }

  if (appliedPromo) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Tag className="size-4 shrink-0 text-emerald-600" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-emerald-800">{appliedPromo.code}</p>
            {appliedPromo.description && (
              <p className="truncate text-xs text-emerald-600">{appliedPromo.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-bold text-emerald-700">
            −{formatCurrency(appliedPromo.discount_amount)}
          </span>
          <button
            type="button"
            onClick={handleRemove}
            className="rounded-full p-0.5 text-emerald-600 hover:bg-emerald-100"
            aria-label="Xóa mã ưu đãi"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Tag className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase())
              setError(null)
            }}
            onKeyDown={(e) => e.key === "Enter" && void handleApply()}
            placeholder="Nhập mã ưu đãi..."
            className="pl-9 uppercase"
            maxLength={50}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          onClick={() => void handleApply()}
          disabled={isLoading || !code.trim()}
        >
          {isLoading ? <Loader2 className="size-4 animate-spin" /> : "Áp dụng"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
