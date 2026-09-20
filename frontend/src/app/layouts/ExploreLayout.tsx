import { Outlet } from "react-router"
import { PublicHeader } from "@/shared/components/PublicHeader"

export function ExploreLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50/80 text-slate-950">
      <PublicHeader />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
