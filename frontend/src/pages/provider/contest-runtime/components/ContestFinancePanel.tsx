import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Lock, Plus, TrendingDown, TrendingUp, Wallet } from "lucide-react"

import {
  contestFinanceApi,
  contestFinanceQueryKeys,
} from "@/features/contests/api/contest-finance.api"
import type {
  ContestFinanceCategoryTotal,
  ContestLedgerDirection,
  ContestLedgerEntry,
} from "@/features/contests/types"
import { Button } from "@/shared/ui/button"
import { cn } from "@/shared/lib/utils"
import { LedgerEntryFormModal } from "./finance/LedgerEntryFormModal"
import { LedgerEntryTable } from "./finance/LedgerEntryTable"

/** Tiền hiển thị bằng đồng, không phần thập phân. */
function formatVnd(value: number) {
  return `${value.toLocaleString("vi-VN", { maximumFractionDigits: 0 })}đ`
}

const INCOME_CATEGORY_LABELS: Record<string, string> = {
  ENTRY_FEE_ADJUSTMENT: "Điều chỉnh lệ phí",
  SPONSORSHIP: "Tài trợ",
  TICKET: "Bán vé",
  FNB: "Đồ ăn thức uống",
  OTHER: "Khác",
}

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  PRIZE_CASH: "Tiền thưởng",
  PRIZE_ITEM: "Giải thưởng hiện vật",
  VENUE: "Địa điểm",
  STAFF: "Nhân sự",
  MARKETING: "Truyền thông",
  FNB: "Đồ ăn thức uống",
  OTHER: "Khác",
}

const METHOD_LABELS: Record<string, string> = {
  ONLINE: "Thu trực tuyến",
  CASH: "Thu tiền mặt",
  TRANSFER: "Thu chuyển khoản",
  UNKNOWN: "Chưa rõ phương thức",
}

export function ContestFinancePanel({ contestId }: { contestId?: string }) {
  const [formState, setFormState] = useState<{
    direction: ContestLedgerDirection
    entry: ContestLedgerEntry | null
  } | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: contestFinanceQueryKeys.report(contestId),
    queryFn: () => contestFinanceApi.getReport(contestId!),
    enabled: Boolean(contestId),
  })

  const { data: entries = [] } = useQuery({
    queryKey: contestFinanceQueryKeys.ledger(contestId),
    queryFn: () => contestFinanceApi.listEntries(contestId!),
    enabled: Boolean(contestId),
  })

  if (isLoading) {
    return (
      <div className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <div
              key={key}
              className="h-24 animate-pulse rounded-xl bg-[#f1eeee]"
            />
          ))}
        </div>
        <div className="h-48 animate-pulse rounded-xl bg-[#f1eeee]" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="mt-4 rounded-xl border border-[#e5e2e1] bg-white p-6 text-sm font-semibold text-[#747878]">
        Không tải được báo cáo tài chính. Chỉ chủ doanh nghiệp sở hữu giải mới
        xem được mục này.
      </div>
    )
  }

  const { entry_fee: entryFee, income, expense, summary } = data
  const isProfit = summary.net >= 0
  const hasAnyData =
    summary.total_income > 0 ||
    summary.total_expense > 0 ||
    entryFee.pending_total > 0 ||
    entryFee.waived_total > 0

  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Tổng thu"
          value={summary.total_income}
          icon={TrendingUp}
          tone="income"
        />
        <SummaryCard
          label="Tổng chi"
          value={summary.total_expense}
          icon={TrendingDown}
          tone="expense"
        />
        <SummaryCard
          label={isProfit ? "Lãi" : "Lỗ"}
          value={summary.net}
          icon={Wallet}
          tone={isProfit ? "profit" : "loss"}
        />
      </div>

      {!hasAnyData ? (
        <div className="rounded-xl border border-dashed border-[#e5e2e1] bg-white p-8 text-center">
          <p className="text-sm font-bold text-[#1c1b1b]">
            Giải này chưa phát sinh khoản nào
          </p>
          <p className="mt-1.5 text-sm text-[#747878]">
            Lệ phí sẽ tự động vào đây khi có người đăng ký. Các khoản thu chi
            khác thì ghi tay.
          </p>
        </div>
      ) : null}

      <section className="rounded-xl border border-[#e5e2e1] bg-white p-5">
        <h3 className="text-sm font-black uppercase tracking-[0.14em] text-[#adaaaa]">
          Lệ phí giải
        </h3>
        <div className="mt-3 space-y-2">
          <MoneyRow
            label="Đã thu"
            sub={`${entryFee.counts.collected} đăng ký`}
            value={entryFee.collected_total}
            emphasis
          />
          {/* Tách theo phương thức để đối chiếu được với sao kê ngân hàng —
              tiền mặt nằm trong két, tiền online nằm trên sao kê. */}
          <div className="ml-4 space-y-1 border-l-2 border-[#f1eeee] pl-4">
            {(["ONLINE", "CASH", "TRANSFER", "UNKNOWN"] as const)
              .filter((method) => entryFee.collected_by_method[method] > 0)
              .map((method) => (
                <div
                  key={method}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="font-semibold text-[#747878]">
                    {METHOD_LABELS[method]}
                  </span>
                  <span className="font-bold text-[#5d5f5f]">
                    {formatVnd(entryFee.collected_by_method[method])}
                  </span>
                </div>
              ))}
          </div>
          <MoneyRow
            label="Chờ thu"
            sub={`${entryFee.counts.pending} đăng ký`}
            value={entryFee.pending_total}
          />
          <MoneyRow
            label="Đã miễn"
            sub={`${entryFee.counts.waived} đăng ký · không tính vào tổng thu`}
            value={entryFee.waived_total}
            muted
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <CategorySection
          title="Thu khác"
          total={income.total}
          items={income.by_category}
          labels={INCOME_CATEGORY_LABELS}
          emptyText="Chưa ghi khoản thu nào ngoài lệ phí."
        />

        <section className="rounded-xl border border-[#e5e2e1] bg-white p-5">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-black uppercase tracking-[0.14em] text-[#adaaaa]">
              Chi
            </h3>
            <span className="text-sm font-black text-[#1c1b1b]">
              {formatVnd(expense.total)}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {expense.by_category.length === 0 &&
            expense.platform_fee.amount === 0 ? (
              <p className="text-sm text-[#747878]">Chưa ghi khoản chi nào.</p>
            ) : null}

            {expense.by_category.map((item) => (
              <div
                key={item.category}
                className="flex items-center justify-between text-sm"
              >
                <span className="font-semibold text-[#5d5f5f]">
                  {EXPENSE_CATEGORY_LABELS[item.category] ?? item.category}
                  <span className="ml-1.5 text-xs text-[#adaaaa]">
                    ({item.count})
                  </span>
                </span>
                <span className="font-bold text-[#1c1b1b]">
                  {formatVnd(item.total)}
                </span>
              </div>
            ))}

            {/* Dòng phí tổ chức tính động từ đơn phí đã đối soát, không phải bút
                toán trong sổ — nên không có nút sửa/xoá, chỉ có ổ khoá. */}
            {expense.platform_fee.amount > 0 ? (
              <div className="flex items-center justify-between rounded-lg bg-[#fcf8f8] px-3 py-2 text-sm">
                <span className="inline-flex items-center gap-1.5 font-semibold text-[#5d5f5f]">
                  <Lock className="size-3.5 text-[#adaaaa]" />
                  Phí tổ chức giải
                  {expense.platform_fee.plan_name ? (
                    <span className="text-xs text-[#adaaaa]">
                      · {expense.platform_fee.plan_name}
                    </span>
                  ) : null}
                </span>
                <span className="font-bold text-[#1c1b1b]">
                  {formatVnd(expense.platform_fee.amount)}
                </span>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-[#e5e2e1] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.14em] text-[#adaaaa]">
              Sổ thu chi
            </h3>
            <p className="mt-1 text-xs text-[#747878]">
              Ghi khoản đã thực sự phát sinh. Sửa hoặc xoá đều để lại dấu trong
              nhật ký giải.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 gap-1.5 rounded-lg text-xs"
              onClick={() => setFormState({ direction: "IN", entry: null })}
            >
              <Plus className="size-3.5" />
              Thêm khoản thu
            </Button>
            <Button
              type="button"
              className="h-9 gap-1.5 rounded-lg text-xs"
              onClick={() => setFormState({ direction: "OUT", entry: null })}
            >
              <Plus className="size-3.5" />
              Thêm khoản chi
            </Button>
          </div>
        </div>

        <div className="mt-4">
          <LedgerEntryTable
            contestId={contestId!}
            entries={entries}
            onEdit={(entry) =>
              setFormState({ direction: entry.direction, entry })
            }
          />
        </div>
      </section>

      {formState && contestId ? (
        <LedgerEntryFormModal
          contestId={contestId}
          direction={formState.direction}
          entry={formState.entry}
          onClose={() => setFormState(null)}
        />
      ) : null}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  icon: typeof TrendingUp
  tone: "income" | "expense" | "profit" | "loss"
}) {
  const toneClass = {
    income: "text-emerald-600",
    expense: "text-orange-600",
    profit: "text-emerald-600",
    loss: "text-red-600",
  }[tone]

  return (
    <div className="rounded-xl border border-[#e5e2e1] bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#adaaaa]">
          {label}
        </p>
        <Icon className={cn("size-4", toneClass)} />
      </div>
      <p className={cn("mt-2 text-2xl font-black", toneClass)}>
        {formatVnd(value)}
      </p>
    </div>
  )
}

function MoneyRow({
  label,
  sub,
  value,
  emphasis,
  muted,
}: {
  label: string
  sub?: string
  value: number
  emphasis?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p
          className={cn(
            "text-sm font-bold",
            muted ? "text-[#adaaaa]" : "text-[#1c1b1b]",
          )}
        >
          {label}
        </p>
        {sub ? <p className="text-xs text-[#adaaaa]">{sub}</p> : null}
      </div>
      <p
        className={cn(
          "font-black",
          emphasis ? "text-lg text-[#1c1b1b]" : "text-sm",
          muted ? "text-[#adaaaa]" : "text-[#5d5f5f]",
        )}
      >
        {formatVnd(value)}
      </p>
    </div>
  )
}

function CategorySection({
  title,
  total,
  items,
  labels,
  emptyText,
}: {
  title: string
  total: number
  items: ContestFinanceCategoryTotal[]
  labels: Record<string, string>
  emptyText: string
}) {
  return (
    <section className="rounded-xl border border-[#e5e2e1] bg-white p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-black uppercase tracking-[0.14em] text-[#adaaaa]">
          {title}
        </h3>
        <span className="text-sm font-black text-[#1c1b1b]">
          {formatVnd(total)}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-[#747878]">{emptyText}</p>
        ) : (
          items.map((item) => (
            <div
              key={item.category}
              className="flex items-center justify-between text-sm"
            >
              <span className="font-semibold text-[#5d5f5f]">
                {labels[item.category] ?? item.category}
                <span className="ml-1.5 text-xs text-[#adaaaa]">
                  ({item.count})
                </span>
              </span>
              <span className="font-bold text-[#1c1b1b]">
                {formatVnd(item.total)}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
