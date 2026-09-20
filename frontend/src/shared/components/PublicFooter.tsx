import { Link } from "react-router"
import { routePaths } from "@/app/router/route-paths"
import { AppLogo } from "@/shared/components/AppLogo"

const footerLinks = [
  { label: "Điều khoản", to: routePaths.customerPolicy },
  { label: "Bảo mật", to: `${routePaths.customerPolicy}#dispute` },
  { label: "Đối tác liên kết", to: routePaths.partnerLanding },
  { label: "Liên hệ", to: "mailto:support@rcfield.site", isExternal: true },
  { label: "Hướng dẫn", to: routePaths.cafes },
]

export function PublicFooter() {
  return (
    <footer className="border-t border-slate-200/80 bg-white">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-8 md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5">
          <AppLogo />
          <div className="hidden h-4 w-px bg-slate-200 sm:block" />
          <p className="text-xs leading-relaxed text-slate-500 [text-wrap:balance]">
            Nền tảng tìm kiếm sân RC Cafe, đặt lịch nhanh và vận hành phiên chơi minh bạch.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium text-slate-500">
          {footerLinks.map((item) =>
            item.isExternal ? (
              <a
                key={item.label}
                href={item.to}
                className="transition-colors hover:text-orange-600"
              >
                {item.label}
              </a>
            ) : (
              <Link
                key={item.label}
                to={item.to}
                className="transition-colors hover:text-orange-600"
              >
                {item.label}
              </Link>
            ),
          )}
          <span className="text-slate-300">© 2026 RCField</span>
        </div>
      </div>
    </footer>
  )
}
