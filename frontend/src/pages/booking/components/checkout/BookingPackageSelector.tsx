import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Car, CheckCircle2, ExternalLink, Layers, RefreshCw, X } from "lucide-react"
import { useMyPackages } from "@/features/customer-packages/hooks/use-customer-packages"
import {
  customerPackageQueryKeys,
  type MyPackageItem,
} from "@/features/customer-packages/api/customer-package.api"
import type { BookingPlayMode } from "@/features/booking/types/booking.types"
import {
  PLAY_MODE_LABEL,
  formatApplicablePlayModes,
} from "@/features/customer-packages/lib/play-mode"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import { formatCurrency } from "@/shared/lib/format"

type Props = {
  cafeId?: string
  /** Dùng để mở trang gói của quán. Route cafe đi theo slug, không phải id. */
  cafeSlug?: string
  playMode?: BookingPlayMode
  slotsNeeded?: number
  slotFeeRate?: number
  selectedPackageId?: string | null
  onPackageSelect?: (id: string | null) => void
}

/**
 * Gợi ý mua lại gói hết hạn — lưu ở localStorage theo từng gói cụ thể.
 *
 * Cố tình KHÔNG lưu ở backend: đây là lời mời chào bán, tắt đi là quyết định
 * nhất thời của khách trên thiết bị đó, không đáng để thêm bảng và đồng bộ.
 * Đổi lại, xoá cache trình duyệt thì gợi ý xuất hiện lại — chấp nhận được.
 */
const DISMISS_STORAGE_KEY = "rcfield.repurchase-nudge.dismissed"

function readDismissedIds(): string[] {
  try {
    const raw = window.localStorage.getItem(DISMISS_STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []
  } catch {
    // localStorage bị chặn (chế độ riêng tư) — coi như chưa tắt gợi ý nào
    return []
  }
}

function persistDismissedId(id: string): void {
  try {
    const next = Array.from(new Set([...readDismissedIds(), id]))
    window.localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Không ghi được thì thôi — gợi ý sẽ hiện lại ở lần sau, không phải lỗi chặn luồng
  }
}

function getIneligibleReason(
  pkg: MyPackageItem,
  playMode: BookingPlayMode | undefined,
  slotsNeeded: number,
): string | null {
  if (new Date(pkg.expires_at) < new Date()) return "Đã hết hạn"
  if (pkg.slots_remaining < slotsNeeded) return `Không đủ slot (còn ${pkg.slots_remaining})`
  if (
    playMode &&
    pkg.applicable_play_modes?.length &&
    !pkg.applicable_play_modes.includes(playMode)
  ) {
    return `Không áp dụng cho hình thức ${PLAY_MODE_LABEL[playMode] ?? playMode}`
  }
  return null
}

export function BookingPackageSelector({
  cafeId,
  cafeSlug,
  playMode,
  slotsNeeded = 1,
  slotFeeRate = 0,
  selectedPackageId,
  onPackageSelect,
}: Props) {
  const authRole = useAuthStore((s) => s.role)
  const isCustomer = authRole === "customer"
  const queryClient = useQueryClient()

  const [dismissedIds, setDismissedIds] = useState<string[]>(() => readDismissedIds())
  const [awaitingPurchase, setAwaitingPurchase] = useState(false)
  const [now] = useState(() => Date.now())

  // Query client đặt refetchOnWindowFocus: false toàn cục, nên sau khi khách mua
  // gói ở tab khác quay lại thì dữ liệu vẫn cũ. Chỉ bật lắng nghe focus sau khi
  // khách thực sự bấm mua, để không refetch vô cớ.
  useEffect(() => {
    if (!awaitingPurchase) return
    const handleFocus = () => {
      void queryClient.invalidateQueries({ queryKey: customerPackageQueryKeys.all })
    }
    window.addEventListener("focus", handleFocus)
    return () => window.removeEventListener("focus", handleFocus)
  }, [awaitingPurchase, queryClient])

  // KHÔNG lọc status: "ACTIVE" ở đây. Backend suy ra trạng thái hiệu lực khi đọc,
  // nên lọc ACTIVE sẽ khiến gói vừa hết hạn biến mất khỏi danh sách — khách không
  // hiểu vì sao gói của mình không được đề xuất. Thay vào đó vẫn hiển thị và nêu
  // rõ lý do không dùng được qua getIneligibleReason().
  const { data: allPackages = [] } = useMyPackages(
    cafeId && isCustomer ? { cafe_id: cafeId } : undefined,
  )

  // Dedup by package_id — keep only the one with most slots_remaining (avoid showing duplicates from old data)
  const seen = new Map<string, (typeof allPackages)[number]>()
  for (const pkg of allPackages) {
    // Gói chưa thanh toán xong thì chưa phải tài sản của khách
    if (pkg.status === "PENDING_PAYMENT") continue
    // Hết hạn VÀ hết sạch lượt thì không còn gì để nói — ẩn hẳn cho gọn
    if (new Date(pkg.expires_at) < new Date() && pkg.slots_remaining <= 0) continue
    const existing = seen.get(pkg.package_id)
    if (!existing || pkg.slots_remaining > existing.slots_remaining) {
      seen.set(pkg.package_id, pkg)
    }
  }
  const visiblePackages = Array.from(seen.values())

  // ── Điều kiện hiện gợi ý mua lại ────────────────────────────────────────────
  // Tính từ allPackages chứ không phải visiblePackages: gói hết hạn mà dùng hết
  // sạch lượt đã bị ẩn ở trên, nhưng đó lại đúng là khách dễ mua lại nhất.
  const owned = allPackages.filter((p) => p.status !== "PENDING_PAYMENT")
  const hasUsablePackage = owned.some(
    (p) => new Date(p.expires_at).getTime() >= now && p.slots_remaining > 0,
  )
  const latestExpired = owned
    .filter((p) => new Date(p.expires_at).getTime() < now)
    .sort((a, b) => new Date(b.expires_at).getTime() - new Date(a.expires_at).getTime())[0]

  // Chỉ mời mua lại khi khách KHÔNG còn gói nào dùng được — có gói tốt rồi mà
  // vẫn chào bán thì thành làm phiền.
  const showRepurchase =
    !!latestExpired && !hasUsablePackage && !dismissedIds.includes(latestExpired.id)

  if (!isCustomer || (visiblePackages.length === 0 && !showRepurchase)) return null

  const selected = visiblePackages.find((p) => p.id === selectedPackageId) ?? null

  const handleDismiss = () => {
    if (!latestExpired) return
    persistDismissedId(latestExpired.id)
    setDismissedIds((current) => [...current, latestExpired.id])
  }

  return (
    <Card className="mb-4 rounded-xl border-orange-200 bg-orange-50/40 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Layers className="h-4 w-4 text-orange-500" />
          Dùng gói slot của bạn
        </CardTitle>
        <p className="mt-0.5 text-xs text-slate-500">
          Áp dụng gói để phí lịch chơi = 0. Các khoản khác (thuê xe, đồ ăn & thức uống) vẫn thanh toán như bình thường.
        </p>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {visiblePackages.map((pkg) => {
          const ineligibleReason = getIneligibleReason(pkg, playMode, slotsNeeded)
          return (
            <PackageOption
              key={pkg.id}
              pkg={pkg}
              isSelected={selectedPackageId === pkg.id}
              slotsNeeded={slotsNeeded}
              slotFeeRate={slotFeeRate}
              ineligibleReason={ineligibleReason}
              onSelect={() => {
                if (ineligibleReason) return
                onPackageSelect?.(selectedPackageId === pkg.id ? null : pkg.id)
              }}
            />
          )
        })}
        {selected && (
          <p className="flex items-center gap-1 pt-1 text-[11px] font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Đã chọn gói — phí slot sẽ được khấu trừ từ gói.
          </p>
        )}

        {showRepurchase && latestExpired && (
          <div className="rounded-xl border border-orange-200 bg-white p-3">
            <div className="flex items-start gap-2.5">
              <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-900">
                  Gói &ldquo;{latestExpired.package_name}&rdquo; đã hết hạn
                </p>
                <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-slate-500">
                  {latestExpired.slots_remaining > 0
                    ? `${latestExpired.slots_remaining} lượt chưa dùng đã không còn hiệu lực. `
                    : ""}
                  Mua lại để tiếp tục được miễn phí slot ở những lần đặt sau.
                </p>

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {cafeSlug && (
                    <a
                      href={`/cafes/${cafeSlug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setAwaitingPurchase(true)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-orange-500 px-3 text-[11px] font-bold text-white transition-colors hover:bg-orange-600"
                    >
                      Xem gói của quán
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={handleDismiss}
                    className="inline-flex h-8 items-center rounded-lg px-3 text-[11px] font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  >
                    Để sau
                  </button>
                </div>

                {cafeSlug && (
                  <p className="mt-1.5 text-[10px] font-medium text-slate-400">
                    Mở ở tab mới — đơn đặt đang làm dở của bạn được giữ nguyên.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PackageOption({
  pkg,
  isSelected,
  slotsNeeded,
  slotFeeRate,
  ineligibleReason,
  onSelect,
}: {
  pkg: MyPackageItem
  isSelected: boolean
  slotsNeeded: number
  slotFeeRate: number
  ineligibleReason: string | null
  onSelect: () => void
}) {
  const expires = new Date(pkg.expires_at).toLocaleDateString("vi-VN")
  const isDisabled = !!ineligibleReason

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={isDisabled}
      className={`w-full rounded-xl border-2 px-3 py-2.5 text-left transition-all ${
        isDisabled
          ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-60"
          : isSelected
          ? "border-orange-500 bg-orange-50"
          : "border-slate-200 bg-white hover:border-orange-300"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className={`truncate text-xs font-bold ${isDisabled ? "text-slate-500" : "text-slate-900"}`}>
            {pkg.package_name}
          </p>
          <p className="mt-0.5 text-[10px] font-semibold text-slate-500">
            {pkg.slots_remaining} slot còn lại · Hết hạn {expires}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-slate-400">
            <Car className="h-2.5 w-2.5 shrink-0" />
            {formatApplicablePlayModes(pkg.applicable_play_modes)}
          </p>
          {ineligibleReason && (
            <p className="mt-0.5 text-[10px] font-semibold text-rose-500">{ineligibleReason}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!isDisabled && (
            <span className="text-[10px] font-bold text-orange-600">-{slotsNeeded} slot</span>
          )}
          {isDisabled ? (
            <div className="h-4 w-4 rounded-full border-2 border-slate-200 bg-slate-100" />
          ) : isSelected ? (
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-500">
              <X className="h-2.5 w-2.5 text-white" />
            </div>
          ) : (
            <div className="h-4 w-4 rounded-full border-2 border-slate-300" />
          )}
        </div>
      </div>
      {isSelected && !isDisabled && (() => {
        const savings = (slotFeeRate - pkg.purchased_price / pkg.slots_total) * slotsNeeded
        return savings > 0 ? (
          <p className="mt-1.5 text-[10px] font-semibold text-orange-700">
            Tiết kiệm ~{formatCurrency(savings)} so với đặt thường
          </p>
        ) : null
      })()}
    </button>
  )
}
