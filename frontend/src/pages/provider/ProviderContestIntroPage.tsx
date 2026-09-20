import { useState } from "react"
import { useNavigate } from "react-router"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, Check, Sparkles, X } from "lucide-react"

import { routePaths } from "@/app/router/route-paths"
import {
  contestApi,
  contestQueryKeys,
} from "@/features/contests/api/contest.api"
import type { ContestFeePlan } from "@/features/contests/types"
import { ProviderPageHeader } from "@/pages/provider/components/ProviderPrimitives"
import { ProviderShell } from "@/pages/provider/components/ProviderShell"
import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"

/**
 * So sánh việc-phải-làm-tay với việc-hệ-thống-làm.
 *
 * Cố ý viết trung tính với mọi thể thức: nền tảng có nhiều mẫu giải (tính giờ,
 * đấu loại, vòng loại + chung kết) nên không được nói riêng cho một thể thức.
 * Thứ chung của cả ba là xếp lượt, ghi kết quả, điểm danh, giao xe, thu tiền và
 * tìm người tham gia.
 */
const COMPARISON = [
  {
    job: "Xếp lượt thi đấu",
    manual: "Kẻ bảng trên giấy, xếp bằng tay, sai một ô là kẻ lại",
    withUs: "Hệ thống dựng lịch thi theo đúng thể thức bạn chọn",
  },
  {
    job: "Ghi kết quả",
    manual: "Ghi sổ rồi nhập lại, sai một lượt là tính hạng sai theo",
    withUs: "Nhập một lần, thứ hạng và vòng kế tiếp tự cập nhật",
  },
  {
    job: "Điểm danh ngày thi",
    manual: "Dò danh sách in, gọi tên từng người, dễ sót",
    withUs: "Tra mã trên vé là ra đúng người trong hai giây",
  },
  {
    job: "Giao xe cho VĐV",
    manual: "Nhớ mặt, tin nhau — xe hỏng thì không ai chứng minh được",
    withUs: "Phiếu mượn có ảnh trước và sau, hỏng hóc có bằng chứng",
  },
  {
    job: "Thu lệ phí",
    manual: "Thu tiền mặt, ghi sổ, cuối giải ngồi đối chiếu",
    withUs: "Khách trả online, đối soát sẵn theo từng người",
  },
  {
    job: "Tìm người tham gia",
    manual: "Nhắn tin từng nhóm, đăng bài rồi tự tổng hợp",
    withUs: "Khách tự tìm thấy giải và đăng ký trên trang công khai",
  },
]

export default function ProviderContestIntroPage() {
  const navigate = useNavigate()
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)

  const plansQuery = useQuery({
    queryKey: contestQueryKeys.feePlans(),
    queryFn: contestApi.listContestFeePlans,
    staleTime: 5 * 60_000,
  })
  const plans = plansQuery.data ?? []
  // Lấy từ catalog thay vì viết cứng: thêm thể thức mới là trang này tự cập
  // nhật, không phải sửa hai nơi rồi quên một nơi.
  const formatsQuery = useQuery({
    queryKey: ["contests", "catalog", "formats"],
    queryFn: contestApi.listContestFormats,
    staleTime: 5 * 60_000,
  })
  const formats = formatsQuery.data ?? []
  const selectedPlan =
    plans.find((plan) => plan.id === selectedPlanId) ?? plans[0] ?? null

  const startWizard = (planId?: string) => {
    const plan = planId ?? selectedPlan?.id
    navigate(
      plan
        ? `${routePaths.providerContestCreateForm}?plan=${plan}`
        : routePaths.providerContestCreateForm,
    )
  }

  return (
    <ProviderShell>
      <ProviderPageHeader
        title="Tổ chức giải đấu tại RCField"
        description={
          <p className="text-[11px] font-semibold text-[#5d5f5f]">
            Chọn gói rồi đi qua 5 bước thiết lập — mất khoảng 3 phút.
          </p>
        }
      />

      {/*
        Nền tối dùng lớp riêng `.provider-hero-surface`, không dùng `bg-[#1c1b1b]`:
        chủ đề provider đổi lớp đó thành cam để nhuộm nút, và cả khối mở đầu bị
        phủ cam theo.
      */}
      <section className="provider-hero-surface overflow-hidden rounded-2xl px-8 py-10">
        {/* Màu chữ trên nền tối do `.provider-hero-surface` trong globals.css lo;
            đặt lớp màu ở đây không thắng được luật chủ đề. */}
        <h2 className="max-w-3xl text-2xl font-black leading-tight sm:text-3xl">
          Một giải vài chục tay đua ngốn cả buổi để xếp lượt và ghi kết quả. Ở
          đây là vài cú bấm.
        </h2>
        <p className="mt-4 max-w-2xl text-sm font-medium leading-7 text-white/75">
          Bạn lo phần sân bãi và tay đua. Xếp lượt, điểm danh, giao xe, tính
          hạng — hệ thống làm theo đúng thể thức bạn chọn, và mọi thao tác đều
          lưu lại để không ai tranh cãi được kết quả.
        </p>

        <div className="mt-7 flex flex-wrap gap-x-10 gap-y-4">
          <HeroStat value="8 / 16 / 32" label="Tay đua mỗi giải" />
          <HeroStat value="3 phút" label="Thiết lập xong một giải" />
          <HeroStat value="0 đồng" label="Hoa hồng trên lệ phí bạn thu" />
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-[#e5e2e1] bg-white">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)] gap-x-4 border-b border-[#e5e2e1] bg-[#fcf8f8] px-5 py-3">
          <span className="text-[10px] font-black uppercase tracking-wider text-[#747878]">
            Công việc
          </span>
          <span className="text-[10px] font-black uppercase tracking-wider text-[#747878]">
            Làm tay như trước
          </span>
          <span className="text-[10px] font-black uppercase tracking-wider text-orange-700">
            Khi tổ chức ở RCField
          </span>
        </div>

        {COMPARISON.map((row) => (
          <div
            key={row.job}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)] gap-x-4 border-b border-[#f0edec] px-5 py-3.5 last:border-b-0"
          >
            <span className="text-xs font-extrabold text-[#1c1b1b]">
              {row.job}
            </span>
            <span className="flex items-start gap-1.5 text-xs font-medium leading-6 text-[#747878]">
              <X className="mt-0.5 size-3.5 shrink-0 text-[#c4c7c8]" />
              {row.manual}
            </span>
            <span className="flex items-start gap-1.5 text-xs font-semibold leading-6 text-[#1c1b1b]">
              <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
              {row.withUs}
            </span>
          </div>
        ))}
      </section>

      <section className="mt-6">
        <h3 className="text-base font-extrabold text-[#1c1b1b]">
          Thể thức bạn chọn được
        </h3>
        <p className="mt-1 text-xs font-semibold text-[#747878]">
          Gói nào cũng dùng được mọi thể thức đã mở — bạn chọn ở bước Thể thức
          khi tạo giải.
        </p>

        {formatsQuery.isLoading ? (
          <div className="mt-3 h-24 animate-pulse rounded-xl bg-[#f6f3f2]" />
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {formats.map((format) => {
              // Thể thức chưa mở vẫn bày ra để provider thấy lộ trình, nhưng
              // phải nhạt đi và nói thẳng — trang này đứng ngay trước nút trả
              // tiền, hứa thừa một chế độ là bán thứ chưa giao được.
              const isComingSoon = format.isReleased === false
              return (
                <div
                  key={format.id}
                  className={cn(
                    "rounded-xl border p-4",
                    isComingSoon
                      ? "border-dashed border-[#e5e2e1] bg-[#faf9f9]"
                      : "border-[#e5e2e1] bg-white",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={cn(
                        "text-sm font-extrabold",
                        isComingSoon ? "text-[#8a8d8d]" : "text-[#1c1b1b]",
                      )}
                    >
                      {format.name}
                    </p>
                    {isComingSoon ? (
                      <span className="shrink-0 rounded-full bg-[#f0eded] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#747878]">
                        Sắp có
                      </span>
                    ) : null}
                  </div>
                  {format.description ? (
                    <p
                      className={cn(
                        "mt-1.5 text-xs font-semibold leading-6",
                        isComingSoon ? "text-[#8a8d8d]" : "text-[#5d5f5f]",
                      )}
                    >
                      {format.description}
                    </p>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="mt-6">
        <h3 className="text-base font-extrabold text-[#1c1b1b]">
          Chọn gói tổ chức
        </h3>
        <p className="mt-1 max-w-3xl text-xs font-semibold leading-6 text-[#747878]">
          Trả theo từng giải, không dính gói đăng ký hằng tháng. Lệ phí khách
          đóng là của bạn — RCField không lấy phần trăm nào. Thanh toán bằng
          chuyển khoản, đối soát xong là mở đăng ký được.
        </p>

        {plansQuery.isLoading ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {[0, 1].map((index) => (
              <div
                key={index}
                className="h-64 animate-pulse rounded-2xl bg-[#f6f3f2]"
              />
            ))}
          </div>
        ) : plans.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-[#c4c7c8] p-6 text-center text-sm font-semibold text-[#747878]">
            Chưa có gói tổ chức nào đang mở. Liên hệ RCField để được hỗ trợ.
          </p>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                selected={selectedPlan?.id === plan.id}
                onSelect={() => setSelectedPlanId(plan.id)}
                onStart={() => startWizard(plan.id)}
              />
            ))}
          </div>
        )}

        <p className="mt-3 text-xs font-semibold text-[#747878]">
          Bạn điền thông tin giải trước, thanh toán ở bước cuối. Chưa trả phí
          thì giải vẫn là bản nháp, chưa ai nhìn thấy.
        </p>
      </section>
    </ProviderShell>
  )
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      {/*
        Cam-300 chứ không phải cam-400: trên nền #1c1b1b, cam-400 chỉ đạt khoảng
        4:1 nên chữ số nhỏ đọc mờ. Nhãn để trắng 60% thay vì 50% vì cỡ 11px viết
        hoa mà mờ quá thì gần như không đọc được.
      */}
      <p className="text-xl font-black text-orange-300">{value}</p>
      <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wider text-white/60">
        {label}
      </p>
    </div>
  )
}

function PlanCard({
  plan,
  selected,
  onSelect,
  onStart,
}: {
  plan: ContestFeePlan
  selected: boolean
  onSelect: () => void
  onStart: () => void
}) {
  const hasPromotion = plan.featured_days > 0

  return (
    <div
      onClick={onSelect}
      className={cn(
        "cursor-pointer rounded-2xl border p-6 transition-colors",
        selected
          ? "border-orange-400 bg-orange-50/40 ring-2 ring-orange-200"
          : "border-[#e5e2e1] bg-white hover:border-[#b0b4b4]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-extrabold text-[#1c1b1b]">{plan.name}</p>
        {hasPromotion ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-orange-600 px-2.5 py-1 text-[10px] font-black text-white">
            <Sparkles className="size-3" />
            Được nhiều người chọn
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-3xl font-black text-[#1c1b1b]">
        {formatVnd(plan.price)}
        <span className="ml-1.5 text-xs font-bold text-[#747878]">/giải</span>
      </p>

      {plan.description ? (
        <p className="mt-3 text-xs font-semibold leading-6 text-[#5d5f5f]">
          {plan.description}
        </p>
      ) : null}

      <div className="mt-4 space-y-2">
        <Perk label="Đủ ba thể thức: tính giờ, đấu loại, vòng loại + chung kết" />
        <Perk label="Xếp lượt, điểm danh, ghi kết quả, bảng xếp hạng" />
        <Perk label="Trang giải công khai cho khách tự đăng ký" />
        <Perk label="Phiếu mượn xe kèm ảnh khi giao nhận" />
        {hasPromotion ? (
          <Perk
            label={`${plan.featured_days} ngày hiển thị trên trang chủ RCField`}
            highlight
          />
        ) : (
          <Perk label="Không kèm suất quảng bá trên trang chủ" muted />
        )}
      </div>

      <Button
        className={cn(
          "mt-5 h-11 w-full gap-2 rounded-lg text-sm font-black",
          hasPromotion
            ? "bg-orange-600 text-white hover:bg-orange-700"
            : "bg-[#1c1b1b] text-white hover:bg-[#313030]",
        )}
        onClick={(event) => {
          event.stopPropagation()
          onStart()
        }}
      >
        Tạo giải với gói này
        <ArrowRight className="size-4" />
      </Button>
    </div>
  )
}

function Perk({
  label,
  highlight = false,
  muted = false,
}: {
  label: string
  highlight?: boolean
  muted?: boolean
}) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 text-xs font-semibold leading-6",
        highlight
          ? "text-orange-700"
          : muted
            ? "text-[#b0b4b4]"
            : "text-[#5d5f5f]",
      )}
    >
      {muted ? (
        <X className="mt-1 size-3.5 shrink-0 text-[#c4c7c8]" />
      ) : (
        <Check
          className={cn(
            "mt-1 size-3.5 shrink-0",
            highlight ? "text-orange-600" : "text-emerald-600",
          )}
        />
      )}
      {label}
    </p>
  )
}

function formatVnd(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value)
}
