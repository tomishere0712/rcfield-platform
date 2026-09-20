import { create } from 'zustand';

import { getMe, loginWithPassword, logoutSession, registerWithPassword, loginWithGoogle } from '@/features/auth/api/auth.api';
import type {
  AuthUser,
  LoginRequest,
  RegisterRequest,
  UserRole,
} from '@/features/auth/types/auth.types';
import { router } from 'expo-router';
import { secureTokenStorage } from '@/shared/lib/secure-storage';
import { setTokenRevokedCallback } from '@/shared/lib/api';
import { unregisterCurrentPushTokenAsync } from '@/shared/lib/push-notifications';
import { queryClient } from '@/shared/lib/query-client';

interface AuthState {
  accessToken: string | null;
  assignedCafeId: string | null;
  initializeSession: () => Promise<void>;
  isAuthenticated: boolean;
  isInitialized: boolean;
  isLoading: boolean;
  login: (payload: LoginRequest) => Promise<AuthUser>;
  loginGoogle: (idToken: string) => Promise<AuthUser>;
  registerUser: (payload: RegisterRequest) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshToken: string | null;
  role: UserRole | null;
  setSession: (session: { accessToken: string; refreshToken: string; user: AuthUser }) => void;
  setUser: (user: AuthUser | null) => void;
  user: AuthUser | null;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  assignedCafeId: null,
  initializeSession: async () => {
    set({ isLoading: true });
    const { accessToken, refreshToken } = await secureTokenStorage.getTokenPair();

    if (!accessToken || !refreshToken) {
      set({
        accessToken: null,
        assignedCafeId: null,
        isAuthenticated: false,
        isInitialized: true,
        isLoading: false,
        refreshToken: null,
        role: null,
        user: null,
      });
      return;
    }

    try {
      const user = await getMe();
      set({
        accessToken,
        assignedCafeId: user.assignedCafeId ?? null,
        isAuthenticated: true,
        isInitialized: true,
        isLoading: false,
        refreshToken,
        role: user.role,
        user,
      });
    } catch {
      await secureTokenStorage.clearTokens();
      set({
        accessToken: null,
        assignedCafeId: null,
        isAuthenticated: false,
        isInitialized: true,
        isLoading: false,
        refreshToken: null,
        role: null,
        user: null,
      });
    }
  },
  isAuthenticated: false,
  isInitialized: false,
  isLoading: false,
  login: async (payload) => {
    set({ isLoading: true });
    try {
      const session = await loginWithPassword(payload);
      await secureTokenStorage.setTokenPair(session.accessToken, session.refreshToken);
      set({
        accessToken: session.accessToken,
        assignedCafeId: session.user.assignedCafeId ?? null,
        isAuthenticated: true,
        isInitialized: true,
        isLoading: false,
        refreshToken: session.refreshToken,
        role: session.user.role,
        user: session.user,
      });
      return session.user;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },
  loginGoogle: async (idToken) => {
    set({ isLoading: true });
    try {
      const session = await loginWithGoogle({ idToken });
      await secureTokenStorage.setTokenPair(session.accessToken, session.refreshToken);
      set({
        accessToken: session.accessToken,
        assignedCafeId: session.user.assignedCafeId ?? null,
        isAuthenticated: true,
        isInitialized: true,
        isLoading: false,
        refreshToken: session.refreshToken,
        role: session.user.role,
        user: session.user,
      });
      return session.user;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },
  registerUser: async (payload) => {
    set({ isLoading: true });
    try {
      const session = await registerWithPassword(payload);
      await secureTokenStorage.setTokenPair(session.accessToken, session.refreshToken);
      set({
        accessToken: session.accessToken,
        assignedCafeId: session.user.assignedCafeId ?? null,
        isAuthenticated: true,
        isInitialized: true,
        isLoading: false,
        refreshToken: session.refreshToken,
        role: session.user.role,
        user: session.user,
      });
      return session.user;
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },
  logout: async () => {
    const refreshToken = useAuthStore.getState().refreshToken;
    try {
      await unregisterCurrentPushTokenAsync();
      if (refreshToken) {
        await logoutSession(refreshToken);
      }
    } catch {
      // Local logout should still succeed if the remote session already expired.
    } finally {
      await secureTokenStorage.clearTokens();
      queryClient.clear();
      set({
        accessToken: null,
        assignedCafeId: null,
        isAuthenticated: false,
        isInitialized: true,
        isLoading: false,
        refreshToken: null,
        role: null,
        user: null,
      });
    }
  },
  refreshToken: null,
  role: null,
  setSession: (session) =>
    set({
      accessToken: session.accessToken,
      assignedCafeId: session.user.assignedCafeId ?? null,
      isAuthenticated: true,
      isInitialized: true,
      isLoading: false,
      refreshToken: session.refreshToken,
      role: session.user.role,
      user: session.user,
    }),
  setUser: (user) =>
    set(() => ({
      user,
      role: user ? user.role : null,
      assignedCafeId: user ? (user.assignedCafeId ?? null) : null,
    })),
  user: null,
}));

// Đăng ký callback xử lý khi token bị thu hồi hoặc hết hạn (gọi từ Axios response interceptor)
setTokenRevokedCallback(() => {
  void useAuthStore.getState().logout();
  if (router.canDismiss()) {
    router.dismissAll();
  }
  router.replace('/(auth)/login');
});
