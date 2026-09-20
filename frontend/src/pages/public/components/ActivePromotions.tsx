import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { motion } from "framer-motion"
import { Tag, Copy, Check, Ticket } from "lucide-react"
import { getCafes } from "@/features/explore/api/explore.api"
import { promotionApi } from "@/features/promotions/api/promotion.api"
import { toast } from "sonner"

export function ActivePromotions() {
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  // 1. Fetch top cafes
  const { data: cafes = [], isLoading: isLoadingCafes } = useQuery({
    queryKey: ["explore", "cafes", { limit: 5 }],
    queryFn: () => getCafes({ limit: 5 }),
  })

  // 2. Fetch promotions for those cafes
  const { data: promos = [], isLoading: isLoadingPromos } = useQuery({
    queryKey: ["explore", "promotions", cafes.map((c) => c.id)],
    queryFn: async () => {
      if (cafes.length === 0) return []
      const results = await Promise.all(
        cafes.map(async (cafe) => {
          try {
            const activePromos = await promotionApi.listActive(cafe.id)
            return activePromos.map((p) => ({
              ...p,
              cafeId: cafe.id,
              cafeName: cafe.name,
            }))
          } catch (e) {
            console.warn(`Failed to load promotions for cafe ${cafe.id}`, e)
            return []
          }
        })
      )
      return results.flat()
    },
    enabled: cafes.length > 0,
  })

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    toast.success(`Đã sao chép mã giảm giá: ${code}`)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  const isLoading = isLoadingCafes || isLoadingPromos

  if (!isLoading && promos.length === 0) {
    return null // Hide section if no active promotions
  }

  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        {/* Header */}
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-orange-600">
            Ưu đãi ngập tràn
          </p>
          <h2 className="text-3xl font-black tracking-tight text-slate-950 md:text-4xl">
            Mã giảm giá đang diễn ra
          </h2>
          <p className="mt-2 text-sm font-medium text-slate-500">
            Sao chép mã ưu đãi và áp dụng trực tiếp tại bước đặt lịch để nhận chiết khấu tốt nhất.
          </p>
        </div>

        {/* Promo Grid */}
        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {promos.slice(0, 6).map((promo, index) => {
              const isPercent = promo.discount_type === "PERCENT"
              const valueFormatted = isPercent
                ? `${promo.discount_value}%`
                : `${(promo.discount_value / 1000).toFixed(0)}k`

              return (
                <motion.div
                  key={`${promo.cafeId}-${promo.code}`}
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.08, duration: 0.4 }}
                  className="relative overflow-hidden rounded-3xl border border-slate-200/60 bg-slate-50/40 p-6 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* Dashed divider border representation for ticket look */}
                  <div className="absolute top-0 bottom-0 left-0 w-1 bg-gradient-to-b from-orange-500 to-amber-500" />

                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Ticket className="h-4 w-4 text-orange-600 shrink-0" />
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-orange-600 block">
                          {promo.cafeName}
                        </span>
                      </div>
                      <h3 className="text-xl font-black text-slate-900">
                        Giảm {valueFormatted}
                      </h3>
                      <p className="text-xs font-semibold text-slate-500 line-clamp-2">
                        {promo.description || "Ưu đãi áp dụng cho tất cả phiên đặt lịch."}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-orange-50 p-2.5 shrink-0">
                      <Tag className="h-5 w-5 text-orange-600" />
                    </div>
                  </div>

                  {/* Copy field */}
                  <div className="mt-6 flex items-center justify-between gap-3 bg-white border border-slate-100 rounded-xl p-1.5 pl-3">
                    <span className="text-sm font-bold font-mono tracking-wide text-slate-800">
                      {promo.code}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(promo.code)}
                      className="flex h-8 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-bold text-white transition-all hover:bg-slate-800 active:scale-95"
                    >
                      {copiedCode === promo.code ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          Đã lưu
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Sao chép
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
