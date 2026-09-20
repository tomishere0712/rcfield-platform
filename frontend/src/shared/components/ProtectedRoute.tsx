import { Navigate, useLocation } from "react-router"
import { routePaths } from "@/app/router/route-paths"
import { useAuthStore } from "@/features/auth/stores/auth.store"

export type ProtectedRouteProps = {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation()
  const isInitialized = useAuthStore((state) => state.isInitialized)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  if (!isInitialized) return null

  if (!isAuthenticated) {
    return <Navigate replace to={routePaths.login} state={{ from: location }} />
  }

  return children
}
