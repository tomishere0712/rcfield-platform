import { useEffect } from "react"
import { Outlet } from "react-router"
import { Toaster } from "sonner"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import type { ImpersonationState } from "@/features/auth/stores/auth.store"
import { storageKeys } from "@/shared/lib/storage"
import type { UserRole } from "@/shared/types/common"

const roleMap: Record<string, UserRole> = {
  CUSTOMER: "customer",
  STAFF: "staff",
  PROVIDER: "provider",
  ADMIN: "admin",
  customer: "customer",
  staff: "staff",
  provider: "provider",
  admin: "admin",
}

function AuthInitializer() {
  const setAuthenticated = useAuthStore((state) => state.setAuthenticated)
  const setInitialized = useAuthStore((state) => state.setInitialized)
  const startImpersonation = useAuthStore((state) => state.startImpersonation)
  const setUser = useAuthStore((state) => state.setUser)

  useEffect(() => {
    const raw =
      localStorage.getItem(storageKeys.auth) ??
      sessionStorage.getItem(storageKeys.auth) ??
      localStorage.getItem(storageKeys.legacyAuth) ??
      sessionStorage.getItem(storageKeys.legacyAuth)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as {
          user?: {
            id: string
            email: string
            fullName?: string
            phone?: string | null
            avatarUrl?: string | null
            role: string
            registrationStatus?: string
            assignedCafeId?: string | null
          }
          accessToken?: string
        }
        const normalizedRole = parsed.user?.role ? roleMap[parsed.user.role] : null
        if (parsed.user && normalizedRole) {
          setAuthenticated(normalizedRole, {
            id: parsed.user.id,
            fullName: parsed.user.fullName ?? parsed.user.email,
            email: parsed.user.email,
            role: normalizedRole,
            phone: parsed.user.phone ?? undefined,
            avatarUrl: parsed.user.avatarUrl ?? undefined,
            registrationStatus: parsed.user.registrationStatus,
            assignedCafeId: parsed.user.assignedCafeId,
          })

          // Đồng bộ dữ liệu mới nhất từ server (avatar, fullName...) sau khi đọc localStorage
          if (parsed.accessToken) {
            import("@/features/auth/api/auth.api").then(({ getMe }) => {
              getMe()
                .then((profile) => {
                  setUser({ ...profile, role: profile.role ?? normalizedRole })
                  // Cập nhật lại localStorage với dữ liệu mới nhất
                  const storage = localStorage.getItem(storageKeys.auth) ? localStorage : sessionStorage
                  const currentRaw = storage.getItem(storageKeys.auth)
                  if (currentRaw) {
                    try {
                      const currentParsed = JSON.parse(currentRaw) as Record<string, unknown>
                      storage.setItem(storageKeys.auth, JSON.stringify({ ...currentParsed, user: profile }))
                    } catch {
                      // bỏ qua lỗi parse
                    }
                  }
                })
                .catch(() => {
                  // Bỏ qua lỗi mạng — dữ liệu localStorage vẫn được dùng
                })
            })
          }
        }
      } catch (err) {
        console.error("RootLayout AuthInitializer - error parsing storage:", err)
      }
    }

    // Restore impersonation state if present
    const impersonationRaw = localStorage.getItem(storageKeys.impersonation)
    if (impersonationRaw) {
      try {
        const imp = JSON.parse(impersonationRaw) as ImpersonationState
        if (imp.providerUserId && imp.providerName) {
          startImpersonation(imp)
        }
      } catch {
        localStorage.removeItem(storageKeys.impersonation)
      }
    }

    setInitialized()
  }, [setAuthenticated, setInitialized, startImpersonation, setUser])

  return null
}

import { useSessionNotifications } from "@/features/customer-session/hooks/useSessionNotifications"
import { CompleteProfileBanner } from "@/shared/components/CompleteProfileBanner"

export function RootLayout() {
  const role = useAuthStore((state) => state.role)
  useSessionNotifications(role === "customer")

  return (
    <>
      <AuthInitializer />
      <Outlet />
      <CompleteProfileBanner />
      <Toaster richColors position="top-right" closeButton />
    </>
  )
}

