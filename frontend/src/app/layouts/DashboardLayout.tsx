import { Outlet } from "react-router"

export function DashboardLayout() {
  return (
    <div className="min-h-screen bg-slate-50/80">
      <Outlet />
    </div>
  )
}
