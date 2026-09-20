import { Car, Download, Filter, Landmark, Wallet, MapPinned } from "lucide-react"

import { ProviderPageHeader } from "@/pages/provider/components/ProviderPrimitives"
import { ProviderShell } from "@/pages/provider/components/ProviderShell"
import { Button } from "@/shared/ui/button"

const chartBars = [
  { label: "T2", value: "25%", amount: "5M", active: false },
  { label: "T3", value: "50%", amount: "10M", active: false },
  { label: "T4", value: "33%", amount: "7M", active: false },
  { label: "T5", value: "75%", amount: "15M", active: true },
  { label: "T6", value: "50%", amount: "10M", active: false },
  { label: "T7", value: "66%", amount: "12M", active: false },
  { label: "CN", value: "100%", amount: "20M", active: false },
]

const transactions = [
  { id: "#PO-2410-001", date: "24/10/2024, 14:30", type: "Rút tiền", icon: Landmark, status: "Đang xử lý", amount: "-12,500,000 ₫", tone: "neutral" },
  { id: "#BK-9843", date: "23/10/2024, 18:15", type: "Thuê xe", icon: Car, status: "Hoàn tất", amount: "+450,000 ₫", tone: "success" },
  { id: "#TK-1022", date: "23/10/2024, 16:00", type: "Thuê sân", icon: MapPinned, status: "Hoàn tất", amount: "+250,000 ₫", tone: "success" },
  { id: "#PO-2409-088", date: "15/10/2024, 09:00", type: "Rút tiền", icon: Landmark, status: "Thành công", amount: "-45,000,000 ₫", tone: "neutral" },
]

export function ProviderRevenuePage() {
  return (
    <ProviderShell contentClassName="mx-0 max-w-none px-0 py-0 md:px-0">
      <ProviderPageHeader title="Doanh thu & Rút tiền" description="Quản lý dòng tiền và các khoản thanh toán." flush />

      <div className="flex w-full flex-col gap-16 px-4 py-16 md:px-6 2xl:px-8">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="relative col-span-1 flex min-h-72 flex-col justify-between overflow-hidden rounded-xl border border-[#c4c7c8] bg-white p-6 shadow-sm md:col-span-2">
            <Wallet className="absolute right-4 top-4 size-28 text-[#1c1b1b]/10" />
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#747878]">Số dư khả dụng</p>
              <h3 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-[#1c1b1b] md:text-5xl">125,450,000 ₫</h3>
              <p className="mt-2 text-sm font-semibold text-[#5d5f5f]">Đã bao gồm doanh thu từ các phiên chạy hôm nay.</p>
            </div>
            <div className="mt-6">
              <Button className="h-12 gap-2 rounded-lg bg-[#1c1b1b] px-6 font-bold text-white hover:bg-[#313030]">
                <Landmark className="size-4" />
                Rút tiền về ngân hàng
              </Button>
            </div>
          </div>

          <div className="flex min-h-72 flex-col justify-between rounded-xl border border-[#c4c7c8] bg-white p-6 shadow-sm">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#747878]">Đang chờ xử lý</p>
              <h3 className="text-3xl font-extrabold leading-tight text-[#1c1b1b]">12,500,000 ₫</h3>
              <p className="mt-2 text-sm font-semibold text-[#5d5f5f]">Dự kiến thanh toán vào 24/10/2024</p>
            </div>
            <div className="mt-4 border-t border-[#e5e2e1] pt-4">
              <div className="flex items-center justify-between text-sm text-[#5d5f5f]">
                <span className="font-semibold">Lần rút gần nhất</span>
                <span className="font-bold text-[#1c1b1b]">45,000,000 ₫</span>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-[#c4c7c8] bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h3 className="text-lg font-bold leading-tight tracking-tight text-[#1c1b1b]">Biểu đồ doanh thu</h3>
            <div className="flex rounded-lg bg-[#f1edec] p-1">
              <button className="rounded-md px-4 py-1 text-sm font-medium text-[#444748] hover:bg-[#ebe7e7]">Tuần</button>
              <button className="rounded-md bg-white px-4 py-1 text-sm font-medium text-[#1c1b1b] shadow-sm">Tháng</button>
              <button className="rounded-md px-4 py-1 text-sm font-medium text-[#444748] hover:bg-[#ebe7e7]">Năm</button>
            </div>
          </div>

          <div className="relative flex h-64 w-full items-end justify-between rounded-lg border border-dashed border-[#c4c7c8] px-4 pb-0 pt-8">
            {chartBars.map((bar) => (
              <div key={bar.label} className="group relative w-8 rounded-t-sm bg-[#e2e1eb] sm:w-12" style={{ height: bar.value }}>
                <div className="absolute -top-8 left-1/2 hidden -translate-x-1/2 rounded bg-[#1c1b1b] px-2 py-1 text-xs text-white group-hover:block">{bar.amount}</div>
                {bar.active ? <div className="h-full w-full rounded-t-sm border-2 border-[#5d5f5f] bg-white" /> : null}
              </div>
            ))}
            <div className="absolute bottom-0 left-0 h-px w-full bg-[#c4c7c8]" />
          </div>
          <div className="mt-2 flex justify-between px-4 font-mono text-xs font-medium text-[#444748]">
            {chartBars.map((bar) => (
              <span key={bar.label}>{bar.label}</span>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h3 className="text-lg font-bold leading-tight tracking-tight text-[#1c1b1b]">Lịch sử giao dịch & Rút tiền</h3>
            <div className="flex gap-2">
              <Button variant="outline" className="h-10 gap-1 rounded-lg border-[#c4c7c8] bg-transparent text-sm font-bold text-[#444748] hover:bg-[#f1edec]">
                <Filter className="size-4" />
                Lọc
              </Button>
              <Button variant="outline" className="h-10 gap-1 rounded-lg border-[#c4c7c8] bg-transparent text-sm font-bold text-[#444748] hover:bg-[#f1edec]">
                <Download className="size-4" />
                Xuất CSV
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-[#c4c7c8] bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-[#e5e2e1] bg-[#fcf8f8]/60 text-xs font-bold uppercase tracking-wider text-[#747878]">
                    <th className="p-4">Mã GD</th>
                    <th className="p-4">Ngày giờ</th>
                    <th className="p-4">Loại</th>
                    <th className="p-4">Trạng thái</th>
                    <th className="p-4 text-right">Số tiền</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {transactions.map((transaction) => {
                    const Icon = transaction.icon
                    const success = transaction.tone === "success"

                    return (
                      <tr key={transaction.id} className="border-b border-[#e5e2e1] transition-colors last:border-b-0 hover:bg-[#fcf8f8]">
                        <td className="p-4 font-bold text-[#1c1b1b]">{transaction.id}</td>
                        <td className="p-4 font-semibold text-[#5d5f5f]">{transaction.date}</td>
                        <td className="p-4">
                          <span className="inline-flex items-center gap-1 font-bold text-[#1c1b1b]">
                            <Icon className="size-4 text-[#747878]" />
                            {transaction.type}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className={success ? "inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700" : "inline-flex rounded-full border border-[#c4c7c8] bg-[#f6f3f2] px-2 py-0.5 text-xs font-bold text-[#5d5f5f]"}>
                            {transaction.status}
                          </span>
                        </td>
                        <td className={success ? "p-4 text-right font-extrabold text-[#1b5e20]" : "p-4 text-right font-extrabold text-[#1c1b1b]"}>{transaction.amount}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-center border-t border-[#e5e2e1] p-4">
              <button className="text-sm font-bold text-[#444748] transition-colors hover:text-[#1c1b1b]">Xem thêm</button>
            </div>
          </div>
        </section>
      </div>
    </ProviderShell>
  )
}
