import { useState } from "react"
import { Link } from "react-router"
import {
  AlertTriangle,
  Car,
  ChevronRight,
  Clock,
  Compass,
  Layers,
  Loader2,
} from "lucide-react"
import { formatApplicablePlayModes } from "@/features/customer-packages/lib/play-mode"
import { useMyPackages, usePackageUsageHistory, useRepayPackage } from "@/features/customer-packages/hooks/use-customer-packages"
import type { MyPackageItem } from "@/features/customer-packages/api/customer-package.api"
import { Button } from "@/shared/ui/button"
import { Badge } from "@/shared/ui/badge"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/shared/ui/card"
import { Skeleton } from "@/shared/ui/skeleton"
import { formatCurrency } from "@/shared/lib/format"
import { CustomerSubNav } from "./components/CustomerSubNav"
import { CustomerPageShell } from "./components/CustomerPageShell"

export function CustomerPackagesPage() {
  const { data: packages = [], isLoading } = useMyPackages()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const repayMutation = useRepayPackage()
  const [purchasingId, setPurchasingId] = useState<string | null>(null)

  const handleRepay = async (pkg: MyPackageItem) => {
    setPurchasingId(pkg.id)
    try {
      const result = await repayMutation.mutateAsync({
        customerPackageId: pkg.id,
      })
      if (result.payment_url) {
        window.location.assign(result.payment_url)
      }
    } catch {
      // Error handled by mutation hook
    } finally {
      setPurchasingId(null)
    }
  }

  return (
    <CustomerPageShell>
        <CustomerSubNav activeTab="packages" />

        {/* Owned packages */}
        <div className="space-y-4">
          <h2 className="text-base font-extrabold text-slate-950 uppercase tracking-wider flex items-center gap-2">
            <Layers className="h-4 w-4 text-slate-400" />
            Gói Đang Sở Hữu
          </h2>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[1, 2].map((i) => (
                <Card key={i} className="overflow-hidden">
                  <div className="h-1.5 bg-slate-100" />
                  <CardHeader><Skeleton className="h-5 w-48" /></CardHeader>
                  <CardContent className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-2 w-full rounded-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : packages.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {gopGoiHetHan(packages).map(({ pkg, soLanDaMua }) => (
                <OwnedPackageCard
                  key={pkg.id}
                  pkg={pkg}
                  soLanDaMua={soLanDaMua}
                  showUsage={expandedId === pkg.id}
                  onToggleUsage={() =>
                    setExpandedId(expandedId === pkg.id ? null : pkg.id)
                  }
                  isPurchasing={purchasingId === pkg.id}
                  onRepay={() => void handleRepay(pkg)}
                />
              ))}
            </div>
          )}
        </div>

        {/* CTA to discover more */}
        <div className="rounded-2xl border border-dashed border-orange-300 bg-orange-50/60 p-6 text-center space-y-3">
          <Compass className="h-8 w-8 text-orange-500 mx-auto" />
          <p className="text-sm font-bold text-slate-700">
            Muốn mua thêm gói? Truy cập trang cơ sở để xem các gói slot được cung cấp.
          </p>
          <Button asChild className="bg-slate-950 hover:bg-orange-600 text-white font-bold text-xs h-9 rounded-xl">
            <Link to="/cafes">
              Khám phá cơ sở <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
    </CustomerPageShell>
  )
}

/**
 * Gộp các lần mua ĐÃ HẾT HIỆU LỰC của cùng một gói thành một thẻ.
 *
 * Mỗi lần mua là một dòng riêng trong `customer_packages` — đúng về dữ liệu, vì
 * mỗi lần có số dư lượt và hạn dùng riêng. Nhưng khi đã hết hạn thì những khác
 * biệt đó không còn ý nghĩa với người xem: hai thẻ "Gói vip — RC Tân Bình — Hết
 * hạn" nằm cạnh nhau chỉ khác nhau ở ngày, và người đọc phải dừng lại đối chiếu
 * mới hiểu vì sao có hai cái.
 *
 * Gói CÒN DÙNG ĐƯỢC thì KHÔNG gộp: lúc đó số lượt còn lại và ngày hết hạn của
 * từng lần mua là thứ khách cần biết để tính xem nên tiêu cái nào trước.
 *
 * Giữ lần mua GẦN NHẤT làm đại diện (danh sách đã sắp theo `created_at DESC`),
 * và đếm số lần để nói rõ đây là nhiều lần mua chứ không phải lỗi hiển thị.
 */
function gopGoiHetHan(
  packages: MyPackageItem[],
): Array<{ pkg: MyPackageItem; soLanDaMua: number }> {
  const ketQua: Array<{ pkg: MyPackageItem; soLanDaMua: number }> = []
  const viTriTheoGoi = new Map<string, number>()

  for (const pkg of packages) {
    const conDungDuoc =
      pkg.status !== "EXPIRED" && pkg.status !== "EXHAUSTED"
    if (conDungDuoc) {
      ketQua.push({ pkg, soLanDaMua: 1 })
      continue
    }

    // Khoá theo gói + chi nhánh: cùng tên gói ở hai chi nhánh là hai thứ khác
    // nhau, giá và quyền lợi đều riêng.
    const khoa = `${pkg.cafe_id}:${pkg.package_id}`
    const daCo = viTriTheoGoi.get(khoa)
    if (daCo === undefined) {
      viTriTheoGoi.set(khoa, ketQua.length)
      ketQua.push({ pkg, soLanDaMua: 1 })
    } else {
      ketQua[daCo].soLanDaMua += 1
    }
  }

  return ketQua
}

function OwnedPackageCard({
  pkg,
  soLanDaMua,
  showUsage,
  onToggleUsage,
  isPurchasing,
  onRepay,
}: {
  pkg: MyPackageItem
  /** Số lần đã mua gói này — chỉ khác 1 khi các lần mua hết hạn được gộp lại. */
  soLanDaMua: number
  showUsage: boolean
  onToggleUsage: () => void
  isPurchasing: boolean
  onRepay: () => void
}) {
  const { data: usage = [], isLoading: usageLoading } = usePackageUsageHistory(
    showUsage ? pkg.id : undefined,
  )

  const slotsRemaining = Math.round(Number(pkg.slots_remaining))
  const slotsTotal = Math.round(Number(pkg.slots_total))
  const usedSlots = slotsTotal - slotsRemaining
  const pct = slotsTotal > 0 ? (usedSlots / slotsTotal) * 100 : 0
  const expiryDate = new Date(pkg.expires_at)
  const expiresAt = expiryDate.toLocaleDateString("vi-VN")
  const [now] = useState(() => Date.now())

  // Backend đã suy ra trạng thái hiệu lực khi đọc. Kiểm tra thêm mốc thời gian ở
  // đây để thẻ vẫn đúng nếu tab mở xuyên qua thời điểm hết hạn hoặc cache bị cũ.
  const isPendingPayment = pkg.status === "PENDING_PAYMENT"
  const isExpired = pkg.status === "EXPIRED" || (pkg.status !== "PENDING_PAYMENT" && expiryDate.getTime() < now)
  const isExhausted = pkg.status === "EXHAUSTED"
  const isUsable = !isExpired && !isExhausted && !isPendingPayment
  const effectiveStatus: MyPackageItem["status"] = isExpired ? "EXPIRED" : pkg.status

  return (
    <Card
      className={`border-slate-200/80 shadow-sm relative overflow-hidden hover:shadow-md transition-all flex flex-col ${
        isExpired ? "bg-slate-50" : "bg-white"
      }`}
    >
      <div className={`absolute top-0 left-0 right-0 h-1.5 ${isUsable ? "bg-orange-500" : "bg-slate-300"}`} />

      <CardHeader className="flex flex-row items-start justify-between pb-3">
        <div className="min-w-0">
          <CardTitle
            className={`text-base font-extrabold leading-tight ${isExpired ? "text-slate-500" : "text-slate-950"}`}
          >
            {pkg.package_name}
          </CardTitle>
          <p className="text-[9px] font-bold text-slate-400 mt-1 truncate">{pkg.cafe_name}</p>
          {/*
            Nói rõ thẻ này gộp mấy lần mua. Thiếu dòng này thì việc gộp lại
            thành che dữ liệu: khách từng mua ba lần mà chỉ thấy một thẻ, không
            có gì cho biết hai lần kia đi đâu.
          */}
          {soLanDaMua > 1 ? (
            <p className="text-[9px] font-bold text-slate-400 mt-0.5">
              Đã mua {soLanDaMua} lần · hiển thị lần gần nhất
            </p>
          ) : null}
        </div>
        <StatusBadge status={effectiveStatus} />
      </CardHeader>

      <CardContent className="space-y-4 text-xs font-semibold text-slate-700 flex-grow">
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] font-bold text-slate-600">
            <span>Slots đã dùng</span>
            <span className="text-slate-950">{usedSlots} / {slotsTotal} lượt</span>
          </div>
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isUsable ? "bg-orange-500" : "bg-slate-300"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {/* Lượt còn lại của gói hết hạn KHÔNG dùng được — phải nói rõ, nếu chỉ
              đổi màu thì khách vẫn hiểu là còn tín dụng dùng được. */}
          <p
            className={`text-[10px] font-bold text-right ${isExpired ? "text-slate-400" : "text-slate-500"}`}
          >
            {isExpired && slotsRemaining > 0
              ? `${slotsRemaining} lượt không dùng được`
              : `${slotsRemaining} lượt còn lại`}
          </p>
        </div>

        {isExpired && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
            <p className="text-[11px] font-bold leading-relaxed text-amber-800">
              Gói đã hết hạn ngày {expiresAt}
              {pkg.slots_remaining > 0
                ? ` — ${pkg.slots_remaining} lượt chưa dùng không còn áp dụng được khi đặt sân.`
                : "."}
            </p>
          </div>
        )}

        {isPendingPayment && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
            <p className="text-[11px] font-bold leading-relaxed text-rose-800">
              Thanh toán cho gói này không thành công hoặc bị hủy. Vui lòng thanh toán lại để bắt đầu sử dụng gói.
            </p>
          </div>
        )}

        <div
          className={`grid grid-cols-2 gap-3 p-3 rounded-xl text-[11px] font-bold text-slate-600 ${
            isExpired ? "bg-white" : "bg-slate-50"
          }`}
        >
          <div>
            <span className="block text-[9px] text-slate-400 uppercase">Giá mua</span>
            <span className="text-slate-900">{formatCurrency(pkg.purchased_price)}</span>
          </div>
          <div>
            <span className="block text-[9px] text-slate-400 uppercase">
              {isExpired ? "Đã hết hạn" : "Hết hạn"}
            </span>
            <span className={`flex items-center gap-1 ${isExpired ? "text-amber-700" : "text-slate-900"}`}>
              <Clock className={`h-3 w-3 ${isExpired ? "text-amber-600" : "text-slate-400"}`} />
              {expiresAt}
            </span>
          </div>
          <div className="col-span-2">
            <span className="block text-[9px] text-slate-400 uppercase">Áp dụng cho</span>
            <span className="flex items-center gap-1 text-slate-900">
              <Car className="h-3 w-3 shrink-0 text-slate-400" />
              {formatApplicablePlayModes(pkg.applicable_play_modes)}
            </span>
          </div>
        </div>
      </CardContent>

      <CardFooter className="pt-3 border-t border-slate-50 flex-col bg-slate-50/50 gap-2">
        {isPendingPayment ? (
          <Button
            className="w-full h-9 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs flex items-center justify-center gap-1.5"
            disabled={isPurchasing}
            onClick={onRepay}
          >
            {isPurchasing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang xử lý...
              </>
            ) : (
              "Thanh toán lại"
            )}
          </Button>
        ) : (
          <>
            {/*
              Gói đã hết hiệu lực thì việc cần làm tiếp theo là MUA LẠI, không
              phải xem lịch sử. Trước đây khách phải tự nhớ ra là mình mua ở chi
              nhánh nào rồi đi tìm lại trang đó.

              Dẫn về trang chi nhánh chứ không mua thẳng tại đây: luồng mua cần
              chọn cổng thanh toán và có khung QR chuyển khoản riêng, nhân bản
              sang đây là hai chỗ cùng xử lý tiền và sớm muộn lệch nhau.
            */}
            {!isUsable && pkg.cafe_slug ? (
              <Button
                asChild
                className="w-full h-9 rounded-xl bg-slate-950 hover:bg-orange-600 text-white font-bold text-xs"
              >
                <Link to={`/cafes/${pkg.cafe_slug}#goi`}>Mua lại gói này</Link>
              </Button>
            ) : null}
            <Button
              variant="ghost"
              className="w-full h-8 text-xs font-bold text-orange-600 hover:text-orange-700 hover:bg-orange-50"
              onClick={onToggleUsage}
            >
              {showUsage ? "Ẩn lịch sử" : "Xem lịch sử dùng"}
            </Button>
          </>
        )}

        {showUsage && (
          <div className="w-full mt-2 border-t border-orange-100 pt-3 space-y-2">
            {usageLoading ? (
              <div className="flex justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              </div>
            ) : usage.length === 0 ? (
              <p className="text-[11px] text-slate-400 text-center py-2 font-semibold">
                Chưa sử dụng lượt nào
              </p>
            ) : (
              usage.map((u) => (
                <div
                  key={u.booking_id}
                  className="flex justify-between items-center text-[11px] font-semibold text-slate-600 bg-white rounded-lg px-3 py-2 border border-slate-100"
                >
                  <div>
                    <p className="text-slate-900">
                      {new Date(u.slot_start).toLocaleDateString("vi-VN")}
                    </p>
                    <p className="text-slate-400 text-[10px]">
                      {new Date(u.slot_start).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                      {" – "}
                      {new Date(u.slot_end).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    -{u.slots_used} slot
                  </Badge>
                </div>
              ))
            )}
          </div>
        )}
      </CardFooter>
    </Card>
  )
}

function StatusBadge({ status }: { status: MyPackageItem["status"] }) {
  if (status === "ACTIVE")
    return (
      <Badge className="shrink-0 bg-emerald-500/10 text-emerald-700 border-none font-bold text-[10px]">
        Hoạt động
      </Badge>
    )
  if (status === "EXHAUSTED")
    return (
      <Badge className="shrink-0 bg-amber-500/10 text-amber-700 border-none font-bold text-[10px]">
        Hết slot
      </Badge>
    )
  if (status === "PENDING_PAYMENT")
    return (
      <Badge className="shrink-0 bg-rose-500/10 text-rose-700 border-none font-bold text-[10px]">
        Thanh toán không thành công
      </Badge>
    )
  return (
    <Badge className="shrink-0 bg-slate-200 text-slate-600 border-none font-bold text-[10px]">
      Hết hạn
    </Badge>
  )
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center space-y-3">
      <Layers className="h-8 w-8 text-slate-300 mx-auto" />
      <p className="text-sm font-bold text-slate-500">Bạn chưa sở hữu gói nào.</p>
      <p className="text-xs text-slate-400">
        Truy cập trang cơ sở và mua gói slot để tiết kiệm phí sân.
      </p>
      <Button asChild variant="outline" className="mt-2 font-bold text-xs">
        <Link to="/cafes">Khám phá cơ sở</Link>
      </Button>
    </div>
  )
}
