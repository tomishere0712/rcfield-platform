import { create } from "zustand"
import type { UserRole } from "@/shared/types/common"
import { storageKeys } from "@/shared/lib/storage"

export type AuthUser = {
  id: string
  fullName: string
  email: string
  role?: UserRole
  phone?: string
  avatarUrl?: string
  registrationStatus?: string
  assignedCafeId?: string | null
}

export type ImpersonationState = {
  providerUserId: string
  providerName: string
}

type AuthState = {
  isInitialized: boolean
  isAuthenticated: boolean
  role: UserRole | null
  user: AuthUser | null
  impersonation: ImpersonationState | null
  setAuthenticated: (role: UserRole, user?: AuthUser) => void
  setUser: (user: AuthUser) => void
  clearAuthenticated: () => void
  setInitialized: () => void
  startImpersonation: (state: ImpersonationState) => void
  exitImpersonation: () => void
}

export const useAuthStore = create<AuthState>()((set) => ({
  isInitialized: false,
  isAuthenticated: false,
  role: null,
  user: null,
  impersonation: null,
  setAuthenticated: (role, user) =>
    set((state) => {
      return {
        isAuthenticated: true,
        role,
        user: user !== undefined ? user : state.user,
      }
    }),
  setUser: (user) =>
    set((state) => {
      return { user, role: user.role ?? state.role }
    }),
  clearAuthenticated: () =>
    set((state) => {
      if (state.user?.email && !state.impersonation) {
        localStorage.setItem(storageKeys.lastEmail, state.user.email)
      }
      localStorage.removeItem(storageKeys.auth)
      localStorage.removeItem(storageKeys.legacyAuth)
      localStorage.removeItem(storageKeys.adminAuth)
      localStorage.removeItem(storageKeys.impersonation)
      sessionStorage.removeItem(storageKeys.auth)
      sessionStorage.removeItem(storageKeys.legacyAuth)
      return { isAuthenticated: false, role: null, user: null, impersonation: null }
    }),
  setInitialized: () => set({ isInitialized: true }),
  startImpersonation: (state) => set({ impersonation: state }),
  exitImpersonation: () => set({ impersonation: null }),
}))
