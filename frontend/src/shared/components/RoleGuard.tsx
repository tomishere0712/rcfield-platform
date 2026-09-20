import { useEffect, useMemo } from "react"
import { Navigate } from "react-router"
import { routePaths } from "@/app/router/route-paths"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { getAuthFromJwt } from "@/features/auth/lib/jwt"
import { storageKeys } from "@/shared/lib/storage"
import type { UserRole } from "@/shared/types/common"

export type RoleGuardProps = {
  allowedRoles: UserRole[]
  children: React.ReactNode
}

export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const role = useAuthStore((state) => state.role)
  const setAuthenticated = useAuthStore((state) => state.setAuthenticated)
  const checkedRole = useMemo(() => {
    if (role) return role

    const storedAuth = localStorage.getItem(storageKeys.auth) ?? sessionStorage.getItem(storageKeys.auth)
    if (!storedAuth) return null

    try {
      const parsed = JSON.parse(storedAuth) as { accessToken?: string }
      return parsed.accessToken ? getAuthFromJwt(parsed.accessToken).role : null
    } catch {
      localStorage.removeItem(storageKeys.auth)
      sessionStorage.removeItem(storageKeys.auth)
      return null
    }
  }, [role])

  useEffect(() => {
    if (!role && checkedRole) {
      setAuthenticated(checkedRole)
    }
  }, [checkedRole, role, setAuthenticated])

  if (!checkedRole) {
    return <Navigate replace to={routePaths.login} />
  }

  if (!allowedRoles.includes(checkedRole)) {
    return <Navigate replace to={routePaths.forbidden} />
  }

  return children
}
