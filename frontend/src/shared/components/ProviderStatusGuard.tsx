import { useEffect, useState } from "react"
import { Navigate } from "react-router"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { subscriptionApi } from "@/features/subscriptions/api/subscription.api"

export function ProviderStatusGuard({ children }: { children: React.ReactNode }) {
  const impersonation = useAuthStore((state) => state.impersonation)
  const user = useAuthStore((state) => state.user)
  const role = useAuthStore((state) => state.role)
  const setAuthenticated = useAuthStore((state) => state.setAuthenticated)
  const clearAuthenticated = useAuthStore((state) => state.clearAuthenticated)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<string | null>(user?.registrationStatus || null)

  const userId = user?.id
  const userEmail = user?.email
  const userRegistrationStatus = user?.registrationStatus

  useEffect(() => {
    if (role !== "provider" || !userId) {
      queueMicrotask(() => setLoading(false))
      return
    }

    let isMounted = true
    const checkStatus = async () => {
      try {
        const response = await subscriptionApi.getProviderMe()
        if (response.success && response.data) {
          const currentStatus = response.data.registration_status
          if (isMounted) {
            setStatus(currentStatus)
            if (userRegistrationStatus !== currentStatus) {
              setAuthenticated("provider", {
                ...user!,
                registrationStatus: currentStatus,
              })
            }
          }
        }
      } catch (err: unknown) {
        console.error("Failed to check provider status", err)
        const response = typeof err === "object" && err !== null ? (err as { response?: { status?: number } }).response : undefined
        if (response?.status === 401) {
          clearAuthenticated()
        }
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    checkStatus()

    return () => {
      isMounted = false
    }
  }, [role, user, userId, userEmail, userRegistrationStatus, setAuthenticated, clearAuthenticated])

  if (impersonation) return <>{children}</>

  if (role !== "provider") {
    return <>{children}</>
  }

  // If loading and we don't have a cached status, show a spinner
  if (loading && !status) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <span className="size-8 border-4 border-slate-200 border-t-orange-600 rounded-full animate-spin" />
          <p className="text-xs font-bold text-slate-500">Đang tải thông tin tài khoản...</p>
        </div>
      </div>
    )
  }

  if (status === "PENDING") {
    return <Navigate replace to="/pending-review" />
  }

  if (status === "REJECTED") {
    return <Navigate replace to="/rejected" />
  }

  if (status === "SUSPENDED") {
    return <Navigate replace to="/suspended" />
  }

  return <>{children}</>
}
