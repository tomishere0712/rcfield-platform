const testimonials = [
  {
    name: "Hoàng Minh Tuấn",
    role: "RC enthusiast • Hà Nội",
    avatar: "HT",
    color: "bg-orange-500",
    text: "Trước đây tôi phải nhắn tin Facebook để đặt lịch, nhiều khi chờ cả tiếng không thấy rep. Giờ đặt xong là có lịch ngay, còn biết chính xác xe nào mình sẽ dùng.",
  },
  {
    name: "Ngọc Linh",
    role: "Khách mang xe riêng • TP. HCM",
    avatar: "NL",
    color: "bg-violet-500",
    text: "Tôi hay mang xe riêng đi chơi, tính năng đăng ký xe tự mang rất tiện. Đặt chỗ trước, đến nơi check-in là chạy luôn không cần chờ nhân viên sắp xếp.",
  },
  {
    name: "Minh Khoa",
    role: "Chạy tuần 2 lần • Đà Nẵng",
    avatar: "MK",
    color: "bg-emerald-500",
    text: "Phần kiểm tra xe 4 góc lúc đầu nghĩ phức tạp nhưng thực ra rất nhanh. Và lần đầu tiên tôi không lo ngại khi trả xe vì mọi thứ đã được ghi nhận rõ ràng.",
  },
]

export function LandingTestimonials() {
  return (
    <section className="bg-white py-24">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="mb-14 text-center">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-orange-600">
            Người chơi nói gì
          </p>
          <h2 className="text-3xl font-black tracking-tight text-slate-950 md:text-4xl">
            Đã có hàng nghìn phiên chơi <br className="hidden md:block" />
            được đặt qua RCField.
          </h2>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {testimonials.map(({ name, role, avatar, color, text }) => (
            <div
              key={name}
              className="flex flex-col gap-5 rounded-3xl border border-slate-100 bg-slate-50/60 p-7 transition-all duration-300 hover:border-slate-200 hover:bg-white hover:shadow-lg hover:shadow-slate-200/60 hover:-translate-y-1"
            >
              {/* Stars */}
              <div className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span key={i} className="text-amber-400 text-sm">★</span>
                ))}
              </div>

              <p className="flex-1 text-sm font-medium leading-7 text-slate-600">"{text}"</p>

              <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-black text-white ${color}`}>
                  {avatar}
                </div>
                <div>
                  <p className="text-sm font-black text-slate-900">{name}</p>
                  <p className="text-xs text-slate-400">{role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
