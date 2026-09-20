const steps = [
  {
    n: "01",
    title: "Tìm sân phù hợp",
    desc: "Nhập thành phố và ngày muốn chơi. Xem danh sách RC Cafe trên bản đồ, lọc theo loại track và giá.",
    tag: "Khám phá",
  },
  {
    n: "02",
    title: "Chọn giờ & đặt xe",
    desc: "Chọn khung giờ trống, thêm xe thuê hoặc đăng ký mang xe cá nhân. Xem ngay tổng chi phí trước khi xác nhận.",
    tag: "Đặt lịch",
  },
  {
    n: "03",
    title: "Thanh toán & nhận lịch",
    desc: "Thanh toán qua VNPay. Lịch giữ ngay lập tức, nhận email xác nhận và mã check-in.",
    tag: "Xác nhận",
  },
  {
    n: "04",
    title: "Check-in & chơi",
    desc: "Đến quán, quét mã, kiểm tra xe 4 góc cùng nhân viên rồi bắt đầu phiên chơi.",
    tag: "Check-in",
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-slate-950 py-24">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="mb-16 text-center">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-orange-500">
            Chỉ 4 bước
          </p>
          <h2 className="text-3xl font-black tracking-tight text-white md:text-4xl">
            Từ ý định đến phiên chơi <br className="hidden md:block" />
            trong vài phút.
          </h2>
        </div>

        <div className="relative grid gap-px md:grid-cols-4">
          {/* Connector line */}
          <div className="pointer-events-none absolute left-0 right-0 top-10 hidden h-px bg-gradient-to-r from-transparent via-orange-600/40 to-transparent md:block" />

          {steps.map(({ n, title, desc, tag }) => (
            <div key={n} className="group relative flex flex-col gap-4 rounded-3xl bg-slate-900/60 p-7 transition-all duration-300 hover:bg-slate-800/80">
              {/* Step number */}
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-orange-600/40 bg-orange-600/10 text-sm font-black text-orange-500">
                {n}
              </div>

              <div>
                <span className="mb-2 inline-block rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  {tag}
                </span>
                <h3 className="mb-2 text-base font-black text-white">{title}</h3>
                <p className="text-sm font-medium leading-6 text-slate-500">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
