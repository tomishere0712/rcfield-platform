import { useMemo, useState, type ElementType } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  ArrowDownLeft,
  CheckCircle2,
  CreditCard,
  Download,
  Landmark,
  Loader2,
  RotateCcw,
  Search,
  TrendingUp,
} from "lucide-react"
import { toast } from "sonner"

import {
  bankPaymentApi,
  bankPaymentQueryKeys,
  type ReconciliationChannel,
  type ReconciliationFilters,
  type ReconciliationRow,
} from "@/features/payments/api/bank-payment.api"
import { cafeApi } from "@/features/cafes/api/cafe.api"
import { ProviderPageHeader } from "@/pages/provider/components/ProviderPrimitives"
import { ProviderShell } from "@/pages/provider/components/ProviderShell"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Textarea } from "@/shared/ui/textarea"

/**
 * Đối soát sao kê ngân hàng.
 *
 * Màn hình này trả lời đúng một câu hỏi, và mọi thứ trên đây phục vụ câu đó:
 * **tháng vừa rồi ngân hàng ghi có bao nhiêu, hệ thống ghi nhận được bao nhiêu,
 * phần lệch nằm ở dòng nào.**
 *
 * Khác hẳn khung giao dịch trong trang chi tiết chi nhánh — khung đó dùng để
 * XỬ LÝ một khoản tiền đang treo, còn đây để CHỐT SỔ với ngân hàng. Ba khác
 * biệt bắt buộc:
 *
 *  1. Gộp mọi chi nhánh. Chủ sân so với sao kê của cả doanh nghiệp, không phải
 *     mở lần lượt từng chi nhánh rồi cộng tay.
 *  2. Mọi con số tính theo KỲ đang lọc. Tổng toàn thời gian thì không bao giờ
 *     ứng với một con số nào trên sao kê tháng.
 *  3. Hiện mã ngân hàng trả về. Không có nó thì hai bên chỉ so được bằng số
 *     tiền, mà số tiền thì trùng nhau đầy.
 */

const tienVN = (n: number) => n.toLocaleString("vi-VN") + " ₫"

const gioVN = (iso: string) =>
  new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

const NHAN_TRANG_THAI: Record<string, { text: string; lop: string }> = {
  MATCHED: { text: "Đã khớp", lop: "bg-[#e7f4ea] text-[#1e6b34] border-[#a8d4b5]" },
  NEEDS_REVIEW: { text: "Cần kiểm tra", lop: "bg-[#fdf0e3] text-[#8a4b12] border-[#e8c49a]" },
  IGNORED: { text: "Đã bỏ qua", lop: "bg-[#f1f0ef] text-[#5d5f5f] border-[#c4c7c8]" },
}

/**
 * Lý do máy không khớp được, viết lại bằng tiếng người.
 *
 * Mã gốc (`SHORT_PAID`, `REF_NOT_FOUND`…) là để log đọc, không phải để chủ quán
 * đọc. Thiếu bảng này thì cột "lý do" chỉ là chuỗi in hoa vô nghĩa, và người
 * dùng vẫn phải hỏi lại xem nó nghĩa là gì.
 */
const NHAN_LY_DO: Record<string, string> = {
  NO_REF_CODE: "Nội dung chuyển khoản không có mã tham chiếu",
  REF_NOT_FOUND: "Mã tham chiếu không khớp đơn nào",
  SHORT_PAID: "Khách chuyển thiếu so với số tiền cần thu",
  OVERPAID: "Khách chuyển dư so với số tiền cần thu",
  ALREADY_PAID: "Đơn này đã thanh toán trước đó",
  SESSION_REPLACED: "Phiên thanh toán đã bị thay bằng phiên mới",
}

const NHAN_NGUON: Record<ReconciliationChannel, { text: string; lop: string }> = {
  BANK: { text: "Chuyển khoản", lop: "bg-[#e8eef7] text-[#1f4a80] border-[#a9c2e0]" },
  VNPAY: { text: "VNPay", lop: "bg-[#f3eaf7] text-[#5c2d73] border-[#cdaadd]" },
  REFUND: { text: "Hoàn tiền", lop: "bg-[#fdf2f2] text-[#991b1b] border-[#fecaca]" },
}

const NHAN_LOAI: Record<string, string> = {
  BOOKING: "Đặt sân",
  PACKAGE: "Mua gói",
  CONTEST: "Phí dự giải",
}

/** Ngày đầu và cuối của tháng chứa `moc`, ở dạng `yyyy-mm-dd`. */
function bienThang(moc: Date): { tu: string; den: string } {
  const dau = new Date(moc.getFullYear(), moc.getMonth(), 1)
  const cuoi = new Date(moc.getFullYear(), moc.getMonth() + 1, 0)
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  return { tu: fmt(dau), den: fmt(cuoi) }
}

export function ProviderReconciliationPage() {
  const thangNay = useMemo(() => bienThang(new Date()), [])

  const [tu, setTu] = useState(thangNay.tu)
  const [den, setDen] = useState(thangNay.den)
  const [chiNhanh, setChiNhanh] = useState("")
  const [nguon, setNguon] = useState<"" | ReconciliationChannel>("")
  const [trangThai, setTrangThai] = useState("")
  const [tuKhoaGo, setTuKhoaGo] = useState("")
  const [tuKhoa, setTuKhoa] = useState("")
  const [trang, setTrang] = useState(1)
  const [dangTai, setDangTai] = useState(false)
  const [dangXuLy, setDangXuLy] = useState<ReconciliationRow | null>(null)
  const queryClient = useQueryClient()

  const boLoc: ReconciliationFilters = useMemo(
    () => ({
      // Cộng hết ngày cuối: gõ "31/07" mà gửi đi 00:00 thì mất trắng mọi giao
      // dịch trong ngày 31 — và người dùng không có cách nào nhận ra, vì bảng
      // vẫn hiện ra bình thường, chỉ là thiếu một ngày.
      from: tu ? new Date(`${tu}T00:00:00`).toISOString() : undefined,
      to: den ? new Date(`${den}T23:59:59.999`).toISOString() : undefined,
      cafe_id: chiNhanh || undefined,
      channel: nguon || undefined,
      status: trangThai || undefined,
      q: tuKhoa || undefined,
      page: trang,
      limit: 50,
    }),
    [tu, den, chiNhanh, nguon, trangThai, tuKhoa, trang],
  )

  const { data: dsChiNhanh } = useQuery({
    queryKey: ["provider-cafes", "reconciliation-filter"],
    queryFn: () => cafeApi.listCafes({ scope: "managed", limit: 100 }),
    staleTime: 5 * 60_000,
  })

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: bankPaymentQueryKeys.reconciliation(boLoc),
    queryFn: () => bankPaymentApi.listReconciliation(boLoc),
    // Giữ dữ liệu cũ khi đổi trang: bảng tiền mà chớp trắng mỗi lần bấm sang
    // trang sau thì đọc rất khó bám.
    placeholderData: (truoc) => truoc,
  })

  const tong = data?.summary
  const soTrang = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1

  /**
   * Số tài khoản nhận dùng chung cho MỌI dòng đang hiển thị, hoặc `null` khi
   * chúng khác nhau.
   *
   * Chi nhánh thường chỉ có một tài khoản nhận, nên cột nào cũng in lại đúng
   * chuỗi đó — sáu dòng là sáu lần `0372899192`. Nó không giúp phân biệt giao
   * dịch nào với giao dịch nào, chỉ chiếm một dòng chữ trên mỗi hàng.
   */
  const taiKhoanChung = (() => {
    const soTaiKhoan = (data?.items ?? []).map((r) => r.account_number).filter(Boolean)
    if (soTaiKhoan.length === 0 || soTaiKhoan.length !== (data?.items.length ?? 0)) return null
    return new Set(soTaiKhoan).size === 1 ? (soTaiKhoan[0] as string) : null
  })()

  function doiBoLoc(dat: () => void) {
    dat()
    // Đang ở trang 4 của kỳ cũ mà đổi sang kỳ chỉ có 1 trang thì bảng trống
    // trơn, trông y như không có giao dịch nào.
    setTrang(1)
  }

  async function taiCsv() {
    setDangTai(true)
    try {
      const blob = await bankPaymentApi.exportReconciliation({
        from: boLoc.from,
        to: boLoc.to,
        cafe_id: boLoc.cafe_id,
        channel: boLoc.channel,
        status: boLoc.status,
        q: boLoc.q,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `doi-soat_${tu || "tat-ca"}_den_${den || "tat-ca"}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      // Lỗi hay gặp nhất là vượt trần số dòng, và backend đã viết sẵn câu chỉ
      // rõ phải làm gì — nên ưu tiên hiện đúng câu đó thay vì câu chung chung.
      const res = (err as { response?: { data?: { message?: string } } }).response
      toast.error(res?.data?.message ?? "Không tải được tệp đối soát")
    } finally {
      setDangTai(false)
    }
  }

  return (
    <ProviderShell contentClassName="mx-0 max-w-none px-0 py-0 md:px-0">
      <ProviderPageHeader
        title="Đối soát ngân hàng"
        description="So tiền ngân hàng ghi có với đơn hàng hệ thống ghi nhận, theo từng kỳ."
        actions={
          <Button
            onClick={taiCsv}
            disabled={dangTai || !data?.total}
            className="h-11 gap-2 rounded-lg bg-[#1c1b1b] px-5 font-bold text-white hover:bg-[#313030]"
          >
            <Download className="size-4" />
            {dangTai ? "Đang tạo tệp…" : "Tải CSV"}
          </Button>
        }
      />

      <div className="flex w-full flex-col gap-6 px-4 py-6 md:px-6 2xl:px-8">
        {/* ── Bộ lọc kỳ ────────────────────────────────────────────────── */}
        <section className="rounded-xl border border-[#c4c7c8] bg-white p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-[#747878]">Từ ngày</span>
              <Input
                type="date"
                value={tu}
                onChange={(e) => doiBoLoc(() => setTu(e.target.value))}
                className="h-11"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-[#747878]">Đến ngày</span>
              <Input
                type="date"
                value={den}
                onChange={(e) => doiBoLoc(() => setDen(e.target.value))}
                className="h-11"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-[#747878]">Chi nhánh</span>
              <select
                value={chiNhanh}
                onChange={(e) => doiBoLoc(() => setChiNhanh(e.target.value))}
                className="h-11 rounded-md border border-[#c4c7c8] bg-white px-3 text-sm font-medium text-[#1c1b1b]"
              >
                <option value="">Tất cả chi nhánh</option>
                {dsChiNhanh?.data.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-[#747878]">Nguồn tiền</span>
              <select
                value={nguon}
                onChange={(e) => doiBoLoc(() => setNguon(e.target.value as "" | ReconciliationChannel))}
                className="h-11 rounded-md border border-[#c4c7c8] bg-white px-3 text-sm font-medium text-[#1c1b1b]"
              >
                <option value="">Tất cả nguồn</option>
                <option value="BANK">Chuyển khoản (Tiền vào)</option>
                <option value="VNPAY">VNPay (Tiền vào)</option>
                <option value="REFUND">Hoàn tiền (Tiền ra)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-[#747878]">Trạng thái</span>
              <select
                value={trangThai}
                onChange={(e) => doiBoLoc(() => setTrangThai(e.target.value))}
                className="h-11 rounded-md border border-[#c4c7c8] bg-white px-3 text-sm font-medium text-[#1c1b1b]"
              >
                <option value="">Tất cả</option>
                <option value="MATCHED">Đã khớp</option>
                <option value="NEEDS_REVIEW">Cần kiểm tra</option>
                <option value="IGNORED">Đã bỏ qua</option>
              </select>
            </label>
            <form
              className="flex flex-col gap-1.5"
              onSubmit={(e) => {
                e.preventDefault()
                doiBoLoc(() => setTuKhoa(tuKhoaGo.trim()))
              }}
            >
              <span className="text-xs font-bold uppercase tracking-wider text-[#747878]">Tìm kiếm</span>
              <div className="flex gap-2">
                <Input
                  value={tuKhoaGo}
                  onChange={(e) => setTuKhoaGo(e.target.value)}
                  placeholder="Mã ngân hàng, mã tham chiếu, nội dung…"
                  className="h-11"
                />
                <Button type="submit" variant="outline" className="h-11 px-3">
                  <Search className="size-4" />
                </Button>
              </div>
            </form>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {[
              { nhan: "Tháng này", moc: new Date() },
              { nhan: "Tháng trước", moc: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1) },
            ].map(({ nhan, moc }) => {
              const b = bienThang(moc)
              return (
                <button
                  key={nhan}
                  type="button"
                  onClick={() =>
                    doiBoLoc(() => {
                      setTu(b.tu)
                      setDen(b.den)
                    })
                  }
                  className="rounded-full border border-[#c4c7c8] px-3 py-1 text-xs font-bold text-[#5d5f5f] hover:bg-[#f6f3f2]"
                >
                  {nhan}
                </button>
              )
            })}
          </div>
        </section>

        {/* ── Các con số của kỳ (Dòng tiền vào - Tiền ra - Thực nhận) ───── */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <OTong
            nhan="Tổng tiền vào"
            giaTri={tienVN(tong?.total_amount ?? 0)}
            phu={`${tong?.total_count ?? 0} giao dịch thu trong kỳ`}
            icon={ArrowDownLeft}
            variant="inflow"
          />
          <OTong
            nhan="Tiền hoàn trả (Tiền ra)"
            giaTri={(tong?.refund_amount ?? 0) > 0 ? `−${tienVN(tong?.refund_amount ?? 0)}` : "0 ₫"}
            phu={`${tong?.refund_count ?? 0} giao dịch hoàn hủy đơn/cọc`}
            icon={RotateCcw}
            variant={(tong?.refund_amount ?? 0) > 0 ? "outflow" : "default"}
          />
          <OTong
            nhan="Doanh thu thực nhận"
            giaTri={tienVN(tong?.net_amount ?? ((tong?.total_amount ?? 0) - (tong?.refund_amount ?? 0)))}
            phu="Doanh thu thuần sau khi trừ hoàn tiền"
            icon={TrendingUp}
            variant="primary"
          />
          <OTong
            nhan="Chuyển khoản (VietQR)"
            giaTri={tienVN(tong?.bank_amount ?? 0)}
            phu={`${tong?.bank_count ?? 0} giao dịch · Đối chiếu sao kê ngân hàng`}
            icon={Landmark}
            variant="default"
          />
          <OTong
            nhan="Cổng thanh toán VNPay"
            giaTri={tienVN(tong?.vnpay_amount ?? 0)}
            phu={`${tong?.vnpay_count ?? 0} giao dịch · Đối chiếu báo cáo VNPay`}
            icon={CreditCard}
            variant="default"
          />
          <OTong
            nhan="Trạng thái đối soát"
            giaTri={tienVN(tong?.unreconciled_amount ?? 0)}
            phu={
              (tong?.unreconciled_amount ?? 0) > 0
                ? `${tong?.needs_review_count ?? 0} giao dịch cần kiểm tra gán đơn`
                : "Khớp 100% với đơn hệ thống"
            }
            icon={(tong?.unreconciled_amount ?? 0) > 0 ? AlertTriangle : CheckCircle2}
            variant={(tong?.unreconciled_amount ?? 0) > 0 ? "warning" : "success"}
          />
        </section>

        {/* ── Bảng ─────────────────────────────────────────────────────── */}
        {/*
          `min-w-0` là bắt buộc, không phải để cho đẹp.

          Thẻ cha là flex-col, và mọi flex item mặc định lấy `min-width: auto` —
          nghĩa là nó TỪ CHỐI co lại nhỏ hơn nội dung bên trong. Bảng rộng
          1400px vì thế nong cả khối này ra, khối này nong tiếp trang ra, và cả
          trang trượt ngang: thanh điều hướng bị cắt, ô tổng cuối cùng mất một
          nửa. Cái `overflow-x-auto` bên dưới không cứu được, vì phần tử cuộn
          chỉ cuộn khi chính nó có bề rộng hữu hạn — mà ở đây nó đang bị kéo
          rộng bằng đúng nội dung.
        */}
        <section className="min-w-0 overflow-hidden rounded-xl border border-[#c4c7c8] bg-white">
          {isLoading && !data ? (
            <p className="p-8 text-center text-sm font-semibold text-[#747878]">Đang tải sổ đối soát…</p>
          ) : isError ? (
            <div className="p-8 text-center">
              <p className="text-sm font-semibold text-[#8a2020]">Không tải được sổ đối soát.</p>
              <Button variant="outline" className="mt-3" onClick={() => refetch()}>
                Thử lại
              </Button>
            </div>
          ) : !data?.items.length ? (
            <div className="p-12 text-center">
              <Landmark className="mx-auto size-10 text-[#c4c7c8]" />
              <p className="mt-3 text-sm font-semibold text-[#5d5f5f]">
                Không có giao dịch nào trong kỳ này.
              </p>
              <p className="mt-1 text-xs text-[#747878]">
                Thử mở rộng khoảng ngày hoặc bỏ bớt bộ lọc.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                {/*
                  Sáu cột, không phải chín. Ba cặp được gộp lại vì mỗi cặp luôn
                  được đọc cùng nhau và tách ra chỉ tốn bề rộng cho tiêu đề:
                  nguồn ghép vào mã đối soát, cần-thu và chênh-lệch ghép vào số
                  tiền, nút xử lý ghép vào trạng thái.

                  `min-w` đủ hẹp để vừa màn hình laptop thường nên bảng không
                  phải cuộn ngang. Vẫn giữ `overflow-x-auto` ở thẻ bao làm lưới
                  an toàn cho màn hẹp — khi đó nó cuộn trong khung, không kéo cả
                  trang (xem chú thích `min-w-0` ở section).
                */}
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="border-b border-[#c4c7c8] bg-[#faf9f8]">
                    <tr className="text-xs font-bold uppercase tracking-wider text-[#747878]">
                      <th className="whitespace-nowrap px-4 py-3">Ngày</th>
                      {/*
                        Hai cột mã, chia theo AI SINH RA mã đó — không chia theo
                        loại mã. Người đối soát luôn làm việc theo hướng: cầm
                        dòng trên sao kê thì tra cột trái, cầm đơn hàng thì tra
                        cột phải.
                      */}
                      <th className="whitespace-nowrap px-4 py-3">Mã bên ngân hàng / cổng</th>
                      <th className="whitespace-nowrap px-4 py-3">Chi nhánh</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right">Số tiền</th>
                      <th className="whitespace-nowrap px-4 py-3">Nội dung &amp; mã đơn</th>
                      <th className="whitespace-nowrap px-4 py-3">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((r) => (
                      <Dong
                        key={r.id}
                        r={r}
                        anSoTaiKhoan={taiKhoanChung !== null}
                        onXuLy={() => setDangXuLy(r)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#c4c7c8] px-4 py-3">
                <p className="text-xs font-semibold text-[#747878]">
                  Trang {data.page}/{soTrang} · {data.total} giao dịch
                  {/*
                    Mọi dòng cùng một tài khoản nhận thì nói MỘT lần ở đây, thay
                    vì lặp lại y hệt trên từng dòng. Số tài khoản không phải thứ
                    phân biệt các giao dịch với nhau — nó chỉ trả lời "tiền về
                    tài khoản nào", một câu hỏi hỏi một lần là đủ.

                    Vẫn hiện theo dòng khi có nhiều tài khoản khác nhau, vì lúc
                    đó nó lại là thông tin phân biệt thật.
                  */}
                  {taiKhoanChung ? (
                    <>
                      {" · Tài khoản nhận "}
                      <span className="font-mono text-[#3d4040]">{taiKhoanChung}</span>
                    </>
                  ) : null}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={trang <= 1}
                    onClick={() => setTrang((p) => p - 1)}
                  >
                    Trước
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={trang >= soTrang}
                    onClick={() => setTrang((p) => p + 1)}
                  >
                    Sau
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {dangXuLy ? (
        <HopXuLy
          r={dangXuLy}
          onDong={() => setDangXuLy(null)}
          onXong={() => {
            setDangXuLy(null)
            // Làm mới cả bảng lẫn ô tổng: gán xong mà "Chưa đối soát" vẫn giữ
            // con số cũ thì người dùng tưởng thao tác không ăn.
            void queryClient.invalidateQueries({ queryKey: ["provider-reconciliation"] })
          }}
        />
      ) : null}
    </ProviderShell>
  )
}

/**
 * Xử lý một khoản tiền chưa khớp, ngay tại màn đối soát.
 *
 * Dùng lại đúng hai endpoint mà khung giao dịch per-cafe đang gọi — không mở
 * đường sửa dữ liệu nào mới. Có mặt ở đây vì nếu không, người dùng nhìn thấy
 * dòng cần xử lý ở màn gộp rồi phải nhớ nó thuộc chi nhánh nào, mở sang trang
 * đó, tìm lại đúng dòng — mà nửa lý do màn hình này tồn tại là để khỏi phải đi
 * từng chi nhánh.
 */
function HopXuLy({
  r,
  onDong,
  onXong,
}: {
  r: ReconciliationRow
  onDong: () => void
  onXong: () => void
}) {
  const [maDon, setMaDon] = useState("")
  const [ghiChu, setGhiChu] = useState("")

  const ganVaoDon = useMutation({
    mutationFn: () =>
      bankPaymentApi.assignTransaction(r.id, {
        booking_id: maDon.trim(),
        note: ghiChu.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("Đã gán giao dịch vào đơn hàng")
      onXong()
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message ?? "Không gán được"),
  })

  const boQua = useMutation({
    mutationFn: () => bankPaymentApi.ignoreTransaction(r.id, { note: ghiChu.trim() }),
    onSuccess: () => {
      toast.success("Đã đánh dấu không liên quan")
      onXong()
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message ?? "Không thực hiện được"),
  })

  const dangChay = ganVaoDon.isPending || boQua.isPending

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-xl border border-[#c4c7c8] bg-white p-6 shadow-lg">
        <h4 className="text-base font-black text-[#1c1b1b]">Xử lý khoản tiền chưa khớp</h4>
        <dl className="mt-3 space-y-1 rounded-lg bg-[#faf9f8] p-3 text-xs">
          <div className="flex justify-between gap-3">
            <dt className="font-semibold text-[#747878]">Mã ngân hàng</dt>
            <dd className="font-mono font-semibold text-[#1c1b1b]">{r.external_id}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="font-semibold text-[#747878]">Số tiền</dt>
            <dd className="font-bold text-[#1c1b1b]">{tienVN(r.amount)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="font-semibold text-[#747878]">Nội dung</dt>
            <dd className="max-w-[60%] truncate text-right text-[#5d5f5f]" title={r.content}>
              {r.content}
            </dd>
          </div>
        </dl>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs font-bold text-[#747878]">
            Mã đơn hàng cần gán
          </span>
          <Input
            className="h-10"
            value={maDon}
            placeholder="Dán mã đơn hàng"
            onChange={(e) => setMaDon(e.target.value)}
          />
        </label>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-xs font-bold text-[#747878]">Ghi chú</span>
          <Textarea
            rows={2}
            value={ghiChu}
            placeholder="Ví dụ: khách chuyển sai nội dung, đã đối chiếu sao kê"
            onChange={(e) => setGhiChu(e.target.value)}
          />
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            className="flex-1 bg-[#1c1b1b] font-bold text-white hover:bg-[#313030]"
            disabled={maDon.trim().length < 8 || dangChay}
            onClick={() => ganVaoDon.mutate()}
          >
            {ganVaoDon.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            Gán vào đơn
          </Button>
          <Button
            type="button"
            variant="outline"
            // Bỏ qua là ghi vĩnh viễn "khoản này không phải doanh thu", nên
            // buộc phải có lý do — sáu tháng sau kiểm lại mà chỉ thấy cờ bỏ
            // qua không kèm gì thì không ai dựng lại được vì sao.
            disabled={ghiChu.trim().length < 3 || dangChay}
            onClick={() => boQua.mutate()}
          >
            {boQua.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            Bỏ qua
          </Button>
          <Button type="button" variant="ghost" onClick={onDong} disabled={dangChay}>
            Đóng
          </Button>
        </div>
      </div>
    </div>
  )
}

function OTong({
  nhan,
  giaTri,
  phu,
  icon: Icon,
  variant = "default",
}: {
  nhan: string
  giaTri: string
  phu: string
  icon?: ElementType
  variant?: "default" | "primary" | "inflow" | "outflow" | "warning" | "success"
}) {
  const styles = {
    default: "border-[#e5e7eb] bg-white text-[#111827] shadow-sm hover:border-[#cbd5e1]",
    primary: "border-orange-200 bg-gradient-to-br from-orange-50/70 via-white to-amber-50/40 text-orange-950 shadow-sm hover:border-orange-300",
    inflow: "border-blue-200 bg-gradient-to-br from-blue-50/60 via-white to-indigo-50/30 text-blue-950 shadow-sm hover:border-blue-300",
    outflow: "border-rose-200 bg-gradient-to-br from-rose-50/60 via-white to-pink-50/30 text-rose-950 shadow-sm hover:border-rose-300",
    warning: "border-amber-200 bg-gradient-to-br from-amber-50/70 via-white to-yellow-50/40 text-amber-950 shadow-sm hover:border-amber-300",
    success: "border-emerald-200 bg-gradient-to-br from-emerald-50/60 via-white to-teal-50/30 text-emerald-950 shadow-sm hover:border-emerald-300",
  }[variant]

  const iconStyles = {
    default: "bg-gray-100 text-gray-600",
    primary: "bg-orange-100 text-orange-600",
    inflow: "bg-blue-100 text-blue-600",
    outflow: "bg-rose-100 text-rose-600",
    warning: "bg-amber-100 text-amber-600",
    success: "bg-emerald-100 text-emerald-600",
  }[variant]

  const valueColor = {
    default: "text-[#1c1b1b]",
    primary: "text-orange-600",
    inflow: "text-blue-700",
    outflow: "text-rose-600",
    warning: "text-amber-700",
    success: "text-emerald-700",
  }[variant]

  return (
    <div className={`relative flex flex-col justify-between overflow-hidden rounded-2xl border p-5 transition-all hover:shadow-md ${styles}`}>
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#6b7280]">
            {nhan}
          </span>
          {Icon && (
            <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${iconStyles}`}>
              <Icon className="size-4" />
            </div>
          )}
        </div>
        <div className={`mt-2.5 whitespace-nowrap text-2xl font-black tracking-tight ${valueColor}`}>
          {giaTri}
        </div>
      </div>
      <p className="mt-2 truncate text-xs font-medium text-[#6b7280]" title={phu}>
        {phu}
      </p>
    </div>
  )
}/**
 * Một mã, kèm nhãn nói rõ nó là mã gì.
 *
 * Trước đây các mã được xếp cạnh nhau, cách nhau dấu chấm giữa, không nhãn —
 * và một dòng có tới bốn mã khác nhau: mã ngân hàng, số tài khoản, mã tham
 * chiếu, mã đơn hàng. Nhìn vào không biết mã nào để tra sao kê, mã nào để tra
 * đơn. Người đối soát phải đoán, mà đoán sai thì tra nhầm hệ thống.
 */
function Ma({ nhan, gia }: { nhan?: string; gia: string }) {
  return (
    <span className="mt-0.5 flex items-baseline gap-1.5 text-[11px] leading-snug">
      {nhan ? <span className="shrink-0 text-[#8a8d8d]">{nhan}</span> : null}
      <span className="truncate font-mono font-semibold text-[#3d4040]" title={gia}>
        {gia}
      </span>
    </span>
  )
}

function Dong({
  r,
  anSoTaiKhoan,
  onXuLy,
}: {
  r: ReconciliationRow
  /** Tài khoản nhận đã ghi một lần ở chân bảng — đừng lặp lại trên từng dòng. */
  anSoTaiKhoan: boolean
  onXuLy: () => void
}) {
  const badge = NHAN_TRANG_THAI[r.match_status] ?? {
    text: r.match_status,
    lop: "bg-[#f1f0ef] text-[#5d5f5f] border-[#c4c7c8]",
  }
  // Chỉ tính được chênh lệch khi đã biết hệ thống chờ thu bao nhiêu. Chưa khớp
  // được đơn nào thì không có gì để trừ — không hiện dòng nào cả, vì 0 đọc ra
  // là "khớp đúng", ngược hẳn sự thật.
  const lech = r.expected_amount == null ? null : r.amount - r.expected_amount

  // Mã tham chiếu thường CHÍNH LÀ nội dung khách gõ khi chuyển khoản. Hiện cả
  // hai khi chúng trùng nhau thì cùng một chuỗi xuất hiện hai lần ở hai cột,
  // và người đọc tưởng là hai mã khác nhau.
  const noiDungLaMaThamChieu =
    !!r.ref_code && r.content.trim().toUpperCase() === r.ref_code.toUpperCase()

  return (
    <tr className="border-b border-[#eceaea] align-top last:border-0 hover:bg-[#faf9f8]">
      <td className="whitespace-nowrap px-4 py-3 text-[13px] font-semibold text-[#1c1b1b]">
        {gioVN(r.transaction_date)}
      </td>

      {/*
        Cột này gom mọi mã do BÊN KIA sinh ra — thứ dùng để tra trên sao kê ngân
        hàng hoặc báo cáo VNPay. Mã của phía mình (mã tham chiếu, mã đơn) nằm ở
        cột Nội dung, để hai loại không lẫn vào nhau.
      */}
      <td className="px-4 py-3">
        <div className="max-w-[260px]">
          <span
            className={
              "inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold " +
              (NHAN_NGUON[r.channel]?.lop ?? "")
            }
          >
            {NHAN_NGUON[r.channel]?.text ?? r.channel}
          </span>
          {/*
            Mã để font đơn cách: người dùng dò từng ký tự giữa màn hình này và
            tệp sao kê, mà font tỉ lệ làm 0/O, 1/l nhìn gần như nhau.
          */}
          {/*
            Bỏ nhãn "Mã ngân hàng"/"Mã VNPay": tiêu đề cột đã là "Mã bên ngân
            hàng / cổng", và chiếc chip ngay phía trên đã nói nguồn là gì. Ba
            lần nói cùng một điều trên cùng một ô.
          */}
          {r.external_id ? (
            <Ma gia={r.external_id} />
          ) : (
            // Giao dịch cũ, trả trước khi hệ thống bắt đầu lưu mã cổng. Nói
            // thẳng là chưa có, chứ để trống thì đọc ra như lỗi hiển thị.
            <span className="mt-0.5 block text-[11px] italic text-[#a0a3a3]">
              chưa lưu mã giao dịch
            </span>
          )}
          {r.account_number && !anSoTaiKhoan ? (
            <Ma nhan="TK" gia={r.account_number} />
          ) : null}
        </div>
      </td>

      <td className="whitespace-nowrap px-4 py-3 text-[13px] font-semibold text-[#1c1b1b]">
        {r.cafe_name ?? "—"}
      </td>

      {/*
        Số tiền — cần thu — chênh lệch gộp một ô, xếp dọc.

        Ba con số này luôn được đọc CÙNG NHAU: thu bao nhiêu, đáng lẽ bao nhiêu,
        lệch bao nhiêu. Tách thành ba cột thì mỗi cột rộng bằng tiêu đề của nó
        ("CHÊNH LỆCH" dài hơn hẳn con số bên dưới), và mắt phải nhảy ngang ba
        lần cho một phép trừ.
      */}
      <td className="whitespace-nowrap px-4 py-3 text-right">
        <span
          className={
            "block font-bold " +
            (r.channel === "REFUND" ? "text-rose-700" : "text-[#1c1b1b]")
          }
        >
          {r.channel === "REFUND" ? `−${tienVN(r.amount)}` : tienVN(r.amount)}
        </span>
        {r.expected_amount != null && lech !== 0 && r.channel !== "REFUND" ? (
          <span className="mt-0.5 block text-[11px] font-semibold text-[#747878]">
            Cần thu {tienVN(r.expected_amount)}
          </span>
        ) : null}
        {lech != null && lech !== 0 && r.channel !== "REFUND" ? (
          <span
            className={
              "mt-0.5 block text-[11px] font-bold " +
              (lech < 0 ? "text-[#8a2020]" : "text-[#8a4b12]")
            }
          >
            {lech < 0 ? "Thiếu " : "Dư "}
            {tienVN(Math.abs(lech))}
          </span>
        ) : null}
      </td>

      {/*
        Cột này gom mã của PHÍA MÌNH: mã tham chiếu in lên QR, và mã đơn hàng
        khoản tiền được gán vào.

        Bọc trong div chứ KHÔNG đặt max-width thẳng lên <td>: bố cục bảng bỏ qua
        max-width trên ô, nên một mã đơn 40 ký tự sẽ kéo cột giãn ra và đẩy các
        cột sau văng khỏi màn hình. Div là khối thường nên nhận max-width, và
        truncate mới cắt được.
      */}
      <td className="px-4 py-3">
        <div className="max-w-[260px]">
          {noiDungLaMaThamChieu ? (
            // Trùng nhau là ca BÌNH THƯỜNG: khách quét QR và gõ đúng nội dung
            // gợi ý. Nói gộp một dòng, đỡ bày ra hai mã y hệt nhau.
            <Ma nhan="Mã tham chiếu" gia={r.ref_code as string} />
          ) : (
            <>
              <span
                className="block truncate text-[13px] text-[#3d4040]"
                title={r.content}
              >
                {r.content}
              </span>
              {r.ref_code ? <Ma nhan="Mã tham chiếu" gia={r.ref_code} /> : null}
            </>
          )}
          {/*
            Loại giao dịch và mã đơn gộp một dòng.

            Mã đơn là định danh nội bộ, dài và bị cắt cụt nên không đọc hết
            được — nó chỉ dùng để rê chuột xem đầy đủ hoặc chép đi tra. Cho nó
            một dòng riêng kèm nhãn "Mã đơn" là trả giá bằng chiều cao của MỌI
            hàng cho một thứ hiếm khi cần tới.
          */}
          {r.subject || r.txn_ref ? (
            <span className="mt-1 flex items-baseline gap-1.5 text-[11px] leading-snug">
              {r.subject ? (
                <span className="shrink-0 font-semibold text-[#747878]">
                  {NHAN_LOAI[r.subject]}
                </span>
              ) : null}
              {r.txn_ref ? (
                <span
                  className="truncate font-mono text-[#8a8d8d]"
                  title={r.txn_ref}
                >
                  {r.txn_ref}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
      </td>

      {/*
        Trạng thái và nút xử lý gộp một ô: nút chỉ xuất hiện ở dòng CẦN KIỂM
        TRA, nên một cột riêng cho nó sẽ trống ở hầu hết các dòng.
      */}
      <td className="px-4 py-3">
        <div className="max-w-[210px]">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={
                "inline-block whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold " +
                badge.lop
              }
            >
              {badge.text}
            </span>
            {r.match_status === "NEEDS_REVIEW" ? (
              <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onXuLy}>
                Xử lý
              </Button>
            ) : null}
          </div>
          {r.match_reason ? (
            <span className="mt-1 block text-[11px] leading-snug text-[#747878]">
              {NHAN_LY_DO[r.match_reason] ?? r.match_reason}
            </span>
          ) : null}
          {r.resolved_by_name ? (
            <span className="mt-1 block truncate text-[11px] text-[#747878]">
              Xử lý bởi {r.resolved_by_name}
            </span>
          ) : null}
        </div>
      </td>
    </tr>
  )
}
