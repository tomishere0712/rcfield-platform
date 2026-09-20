import { Outlet } from "react-router"
import { PublicPageShell } from "@/shared/components/PublicPageShell"

export function PublicLayout() {
  return (
    <PublicPageShell>
      <Outlet />
    </PublicPageShell>
  )
}
