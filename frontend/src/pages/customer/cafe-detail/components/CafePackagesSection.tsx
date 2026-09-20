import { useState } from "react"
import { CheckCircle2, Loader2, QrCode } from "lucide-react"
import { toast } from "sonner"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import {
  useMyPackages,
  usePublicPackages,
  usePurchasePackage,
} from "@/features/customer-packages/hooks/use-customer-packages"
import type {
  PublicPackage,
  PurchasePackageResult,
} from "@/features/customer-packages/api/customer-package.api"
import { BankTransferQrPanel } from "@/pages/booking/components/checkout/BankTransferQrPanel"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/dialog"
import { formatApplicablePlayModes } from "@/features/customer-packages/lib/play-mode"
import { Button } from "@/shared/ui/button"
import { Skeleton } from "@/shared/ui/skeleton"
import { formatCurrency } from "@/shared/lib/format"
import { cn } from "@/shared/lib/utils"

import { CafeSection } from "./SectionShell"

interface CafePackagesSectionProps {
  cafeId?: string
}

export function CafePackagesSection({ cafeId }: CafePackagesSectionProps) {
  const { data: packages = [], isLoading } = usePublicPackages(cafeId)
  const purchaseMutation = usePurchasePackage()
  const authRole = useAuthStore((s) => s.role)
  const isCustomer = authRole === "customer"
  const [purchasingId, setPurchasingId] = useState<string | null>(null)
  // Phiên chuyển khoản đang mở. Giữ nguyên kết quả trả về thay vì tách nhỏ:
  // panel QR cần cả mã lẫn id gói để biết khi nào tiền về.
  const [transferSession, setTransferSession] = useState<PurchasePackageResult | null>(null)

  const { data: myPackages = [] } = useMyPackages(
    cafeId && isCustomer ? { cafe_id: cafeId } : undefined,
  )

  // Set of package_ids the customer currently owns (ACTIVE)
  const ownedPackageIds = new Set(
    myPackages
      .filter((p) => p.status === "ACTIVE")
      .map((p) => p.package_id),
  )

  if (!isLoading && packages.length === 0) return null

  const handlePurchase = async (pkg: PublicPackage, gateway: "vnpay" | "bank_transfer") => {
    if (!cafeId) return
    setPurchasingId(pkg.id)
    try {
      const result = await purchaseMutation.mutateAsync({ cafeId, packageId: pkg.id, gateway })
      if (result.flow === "bank_transfer" && result.bank_transfer) {
        setTransferSession(result)
        return
      }
      // Luồng cổng thanh toán vẫn chuyển trang như cũ.
      if (result.payment_url) window.location.assign(result.payment_url)
    } catch (err) {
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code
      if (code === "PACKAGE_ALREADY_OWNED") {
        toast.error("Bạn đã có gói này đang hoạt động. Hãy dùng hết trước khi mua lại.")
      } else if (code === "PAYMENT_METHOD_UNAVAILABLE") {
        toast.error("Cơ sở này chưa mở chuyển khoản. Hãy chọn thanh toán qua cổng.")
      } else {
        toast.error("Không thể mua gói. Vui lòng thử lại.")
      }
    } finally {
      setPurchasingId(null)
    }
  }

  return (
    <CafeSection
      // Neo cho nút "Mua lại gói này" ở trang Gói hội viên nhảy thẳng xuống đây,
      // thay vì đổ khách xuống đầu một trang chi nhánh rất dài.
      id="goi"
      title="Gói slot tại cơ sở này"
      lead="Mua trước nhiều lượt để chơi rẻ hơn — gói dùng dần, không cần đặt hết một lúc."
    >
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 border-y border-slate-200">
          {packages.map((pkg) => (
            <PackageRow
              key={pkg.id}
              pkg={pkg}
              isCustomer={isCustomer}
              isOwned={ownedPackageIds.has(pkg.id)}
              isPurchasing={purchasingId === pkg.id}
              onPurchase={(gateway) => void handlePurchase(pkg, gateway)}
            />
          ))}
        </ul>
      )}
      <Dialog
        open={Boolean(transferSession)}
        onOpenChange={(open) => !open && setTransferSession(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Quét mã để thanh toán gói</DialogTitle>
          </DialogHeader>
          {transferSession?.bank_transfer && (
            <BankTransferQrPanel
              subject={{
                kind: "package",
                customerPackageId: transferSession.customer_package_id,
              }}
              checkout={transferSession.bank_transfer}
              onPaid={() => toast.success("Đã nhận được thanh toán, gói đã kích hoạt!")}
              onContinue={() => setTransferSession(null)}
              onExpired={() => setTransferSession(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </CafeSection>
  )
}

/**
 * Một gói trình bày theo hàng ngang.
 *
 * Bản cũ dùng thẻ có header/content/footer riêng, mỗi thông tin lại được bọc thêm
 * một hộp xám bên trong — ba lớp khung lồng nhau cho vài dòng chữ. Hàng ngang đặt
 * mọi con số lên cùng một đường ngang nên so hai gói với nhau chỉ cần liếc dọc.
 */
function PackageRow({
  pkg,
  isCustomer,
  isOwned,
  isPurchasing,
  onPurchase,
}: {
  pkg: PublicPackage
  isCustomer: boolean
  isOwned: boolean
  isPurchasing: boolean
  onPurchase: (gateway: "vnpay" | "bank_transfer") => void
}) {
  // Dùng helper chung: mảng rỗng = áp dụng mọi hình thức, map+join thẳng sẽ
  // cho ra chuỗi rỗng và khách tưởng gói không dùng được cho hình thức nào.
  const playModeLabel = formatApplicablePlayModes(pkg.applicable_play_modes)

  return (
    <li className={cn("flex flex-wrap items-center gap-x-6 gap-y-4 py-5", isOwned && "bg-emerald-50/40")}>
      <div className="min-w-[220px] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-black text-slate-950">{pkg.name}</h3>
          {isOwned ? (
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
              Đã sở hữu
            </span>
          ) : pkg.is_popular ? (
            <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-bold text-orange-700">
              Phổ biến
            </span>
          ) : null}
        </div>

        {pkg.description && (
          <p className="mt-1 text-sm leading-6 text-slate-500">{pkg.description}</p>
        )}

        {pkg.benefits.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
            {pkg.benefits.slice(0, 3).map((benefit, index) => (
              <li key={index} className="flex items-center gap-1.5 text-sm text-slate-600">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                {benefit}
              </li>
            ))}
          </ul>
        )}
      </div>

      <dl className="flex shrink-0 items-center gap-x-8">
        <Stat label="Số lượt" value={`${pkg.slot_count}`} className="sm:w-20" />
        <Stat label="Hiệu lực" value={`${pkg.valid_days} ngày`} className="sm:w-24" />
        <Stat label="Áp dụng" value={playModeLabel} className="sm:w-36" />
      </dl>

      <div className="flex shrink-0 items-center justify-end gap-4 sm:w-64">
        <div className="text-right">
          <p className="text-lg font-black text-slate-950">{formatCurrency(pkg.price)}</p>
          <p className="text-xs font-semibold text-slate-400">giá gói</p>
        </div>

        {isCustomer ? (
          isOwned ? (
            <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-700 whitespace-nowrap">
              <CheckCircle2 className="size-4" />
              Đang hoạt động
            </span>
          ) : (
            <div className="flex flex-col items-stretch gap-1.5">
              {/*
                Chuyển khoản đặt làm nút chính: tiền về thẳng tài khoản quán,
                không qua cổng trung gian, và khách quét là xong trong một nhịp.
              */}
              <Button
                className="h-10 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white transition-colors hover:bg-orange-600"
                disabled={isPurchasing}
                onClick={() => onPurchase("bank_transfer")}
              >
                {isPurchasing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Đang xử lý...
                  </>
                ) : (
                  <>
                    <QrCode className="size-4" /> Quét mã trả
                  </>
                )}
              </Button>
              <button
                type="button"
                disabled={isPurchasing}
                onClick={() => onPurchase("vnpay")}
                className="text-xs font-semibold text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline disabled:opacity-50"
              >
                Trả qua cổng thanh toán
              </button>
            </div>
          )
        ) : (
          <span className="text-sm font-semibold text-slate-400">Đăng nhập để mua</span>
        )}
      </div>
    </li>
  )
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm font-black text-slate-900">{value}</dd>
    </div>
  )
}
