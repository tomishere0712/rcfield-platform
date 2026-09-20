import { useAuthStore } from "@/features/auth/stores/auth.store"
import { storageKeys } from "@/shared/lib/storage"

export function ImpersonationBanner() {
  const impersonation = useAuthStore((s) => s.impersonation)

  if (!impersonation) return null

  const handleExit = () => {
    const adminRaw = localStorage.getItem(storageKeys.adminAuth)
    if (adminRaw) {
      localStorage.setItem(storageKeys.auth, adminRaw)
      localStorage.removeItem(storageKeys.adminAuth)
    }
    localStorage.removeItem(storageKeys.impersonation)

    const returnPath = `/admin/providers/${impersonation.providerUserId}`

    // Full page reload to cleanly restore admin role in RoleGuard context
    window.location.href = returnPath
  }

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between bg-orange-500 px-4 py-2.5 text-white shadow-md">
      <span className="text-sm font-semibold">
        Đang truy cập với tư cách:{" "}
        <strong className="font-extrabold">{impersonation.providerName}</strong>
      </span>
      <button
        onClick={handleExit}
        className="rounded-lg border border-white/40 bg-white/10 px-3 py-1 text-sm font-bold hover:bg-white/20 transition-colors"
      >
        Thoát
      </button>
    </div>
  )
}
