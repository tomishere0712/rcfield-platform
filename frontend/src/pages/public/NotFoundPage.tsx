import { useEffect, useRef } from "react"
import { Link } from "react-router"

import { routePaths } from "@/app/router/route-paths"

/**
 * Trang 404 theo lối GitHub: số 404 lớn giữa trang, một câu tagline, và cảnh
 * minh hoạ parallax nhiều lớp trượt theo con trỏ chuột.
 *
 * Nhân vật là xe RC của chính RCField chứ không mượn hình của ai. Xe đặt lệch
 * sang phải và tràn ra ngoài khung — vừa chừa trống cột chữ ở giữa, vừa đúng
 * nghĩa "chạy khỏi vùng phủ sóng". Chữ có lớp tối phía sau nên luôn đọc được
 * dù cảnh vật trượt tới đâu.
 *
 * Route này nằm ngoài PublicLayout nên không có header — trang tự dẫn đường.
 */
export function NotFoundPage() {
  const sceneRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    // Thiết bị cảm ứng không có con trỏ, và người tắt hiệu ứng chuyển động thì
    // không nên bị cảnh vật nhúc nhích. Cả hai trường hợp đều giữ cảnh tĩnh.
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    const finePointer = window.matchMedia("(pointer: fine)")
    if (reduceMotion.matches || !finePointer.matches) return

    let frame = 0
    const onPointerMove = (event: PointerEvent) => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        // Quy về khoảng -1..1 so với tâm màn hình.
        const x = (event.clientX / window.innerWidth) * 2 - 1
        const y = (event.clientY / window.innerHeight) * 2 - 1
        scene.style.setProperty("--mx", x.toFixed(3))
        scene.style.setProperty("--my", y.toFixed(3))
      })
    }

    window.addEventListener("pointermove", onPointerMove)
    return () => {
      window.removeEventListener("pointermove", onPointerMove)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-brand-dark px-5 py-16 text-white">
      <div
        ref={sceneRef}
        className="pointer-events-none absolute inset-0 [--mx:0] [--my:0]"
        aria-hidden
      >
        {/* Lưới sân — nền CSS nên tràn hết màn hình, không lộ mép khung.
            Mask làm nó nhạt dần ra rìa thay vì cắt cụt. */}
        <ParallaxLayer depth={6}>
          <div
            className="absolute -inset-[10%] opacity-[0.16]"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.6) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
              maskImage:
                "radial-gradient(ellipse 70% 60% at 50% 50%, black 30%, transparent 100%)",
              WebkitMaskImage:
                "radial-gradient(ellipse 70% 60% at 50% 50%, black 30%, transparent 100%)",
            }}
          />
        </ParallaxLayer>

        {/* Đường đua — vòng rất rộng nên nó ôm lấy nội dung chứ không cắt ngang */}
        <ParallaxLayer depth={14}>
          <svg
            viewBox="0 0 1000 600"
            preserveAspectRatio="xMidYMid slice"
            className="absolute -inset-[6%] h-[112%] w-[112%] opacity-20"
          >
            <ellipse
              cx="500"
              cy="300"
              rx="430"
              ry="255"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeDasharray="14 12"
            />
          </svg>
        </ParallaxLayer>

        {/* Cọc tiêu — chỉ đặt sát rìa trái/phải, tránh xa cột chữ ở giữa */}
        <ParallaxLayer depth={26}>
          <div className="absolute inset-0 hidden md:block">
            <Cone className="left-[6%] top-[26%]" />
            <Cone className="left-[11%] bottom-[22%]" />
            <Cone className="right-[7%] top-[20%]" />
          </div>
        </ParallaxLayer>

        {/* Vệt tốc độ phía sau xe */}
        <ParallaxLayer depth={70}>
          <div className="absolute right-[38%] top-1/2 hidden -translate-y-1/2 flex-col gap-3 lg:flex">
            <span className="block h-[3px] w-24 rounded-full bg-primary/50" />
            <span className="block h-[3px] w-14 rounded-full bg-primary/35" />
            <span className="ml-6 block h-[3px] w-20 rounded-full bg-primary/45" />
          </div>
        </ParallaxLayer>

        {/* Xe RC — lệch phải và tràn ra ngoài mép phải */}
        <ParallaxLayer depth={44}>
          <svg
            viewBox="0 0 240 300"
            className="absolute right-[-6%] top-1/2 h-auto w-[min(42vw,420px)] -translate-y-1/2 rotate-[18deg] opacity-90 lg:right-[2%]"
          >
            {/* bóng đổ */}
            <ellipse cx="120" cy="272" rx="62" ry="13" fill="black" opacity="0.5" />

            {/* bánh xe */}
            {[
              { x: 58, y: 74 },
              { x: 158, y: 74 },
              { x: 58, y: 190 },
              { x: 158, y: 190 },
            ].map((wheel) => (
              <rect
                key={`${wheel.x}-${wheel.y}`}
                x={wheel.x}
                y={wheel.y}
                width="26"
                height="52"
                rx="9"
                fill="#111316"
                stroke="white"
                strokeOpacity="0.22"
                strokeWidth="2"
              />
            ))}

            {/* thân xe */}
            <path
              d="M120 32 C154 32 178 56 178 92 L178 226 C178 250 158 264 120 264 C82 264 62 250 62 226 L62 92 C62 56 86 32 120 32 Z"
              className="fill-primary"
            />
            {/* sọc dọc thân */}
            <rect x="114" y="36" width="12" height="224" className="fill-white/25" />
            {/* buồng lái */}
            <ellipse cx="120" cy="140" rx="38" ry="52" fill="#111316" opacity="0.78" />
            <ellipse cx="120" cy="126" rx="28" ry="30" fill="white" opacity="0.09" />
            {/* cánh gió sau */}
            <rect x="52" y="252" width="136" height="15" rx="7" fill="#111316" />

            {/* ăng-ten — chi tiết nói lên "điều khiển bằng sóng" */}
            <path
              d="M162 54 L214 8"
              stroke="white"
              strokeOpacity="0.65"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <circle cx="216" cy="6" r="7" className="fill-brand-amber" />
          </svg>
        </ParallaxLayer>
      </div>

      {/* Lớp tối phía sau chữ — đảm bảo type luôn đủ tương phản dù cảnh trượt
          tới đâu, thay vì phó mặc cho vị trí ngẫu nhiên của minh hoạ. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 46% 52% at 46% 50%, rgba(8,9,11,0.94) 0%, rgba(8,9,11,0.72) 55%, transparent 100%)",
        }}
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex w-full max-w-xl flex-col items-center text-center lg:mr-auto lg:ml-[8%] lg:items-start lg:text-left">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-brand-amber">
          Mất tín hiệu
        </p>

        <p className="mt-4 text-[clamp(5.5rem,16vw,10rem)] font-black leading-[0.82] tracking-tighter">
          404
        </p>

        <p className="mt-5 max-w-sm text-base font-semibold leading-7 text-white/70">
          Xe đã chạy khỏi vùng phủ sóng. Đường dẫn này không còn dẫn tới trang nào.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
          <Link
            to={routePaths.home}
            className="rounded-xl bg-primary px-6 py-3 text-sm font-black text-primary-foreground transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Về trang chủ
          </Link>
          <Link
            to={routePaths.cafes}
            className="rounded-xl border border-white/20 px-6 py-3 text-sm font-black text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Tìm chi nhánh
          </Link>
        </div>

        <nav aria-label="Trang khác" className="mt-9 w-full">
          <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 lg:justify-start">
            {[
              { label: "Giải đấu", to: routePaths.contests },
              { label: "Hợp tác đối tác", to: routePaths.partnerLanding },
              { label: "Chính sách", to: routePaths.customerPolicy },
            ].map(({ label, to }) => (
              <li key={label}>
                <Link
                  to={to}
                  className="text-sm font-bold text-white/55 underline-offset-4 transition hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </main>
  )
}

function Cone({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`absolute size-7 ${className}`}>
      <path d="M12 3 L18 19 L6 19 Z" className="fill-brand-amber" opacity="0.75" />
      <rect x="4" y="19" width="16" height="3" rx="1.5" className="fill-brand-amber" opacity="0.75" />
    </svg>
  )
}

/**
 * Một lớp của cảnh parallax.
 *
 * `depth` là biên độ trượt tính bằng pixel khi con trỏ đi từ tâm ra mép màn
 * hình. Lớp càng "gần" người xem thì số càng lớn, tạo cảm giác chiều sâu.
 */
function ParallaxLayer({
  depth,
  children,
}: {
  depth: number
  children: React.ReactNode
}) {
  return (
    <div
      className="absolute inset-0 transition-transform duration-300 ease-out"
      style={{
        transform: `translate3d(calc(var(--mx) * ${depth}px), calc(var(--my) * ${depth}px), 0)`,
      }}
    >
      {children}
    </div>
  )
}
