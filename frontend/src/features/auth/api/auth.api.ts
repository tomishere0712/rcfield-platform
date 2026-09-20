import { api } from "@/shared/lib/axios"
import type { UserRole } from "@/shared/types/common"
import { getAuthFromJwt } from "../lib/jwt"

type BackendRole = "CUSTOMER" | "STAFF" | "PROVIDER" | "ADMIN"

export type LoginRequest = {
  email: string
  password: string
}

export type GoogleLoginRequest = {
  idToken: string
}

export type ForgotPasswordRequest = {
  email: string
}

export type VerifyPasswordResetCodeRequest = {
  email: string
  code: string
}

export type ResetPasswordRequest = {
  email: string
  code: string
  password: string
}

export type RegisterRequest = {
  fullName: string
  email: string
  phone?: string
  password: string
  role: Extract<UserRole, "customer" | "provider">
}

export type AuthUser = {
  id: string
  email: string
  fullName: string
  phone?: string
  avatarUrl?: string
  role: UserRole
  registrationStatus?: string
  assignedCafeId?: string | null
}

export type LoginResponse = {
  accessToken: string
  refreshToken: string
  user: AuthUser
}

type BackendLoginResponse = {
  success: boolean
  data: {
    access_token: string
    refresh_token: string
    user: {
      id: string
      email: string
      fullName?: string
      full_name?: string
      phone?: string | null
      avatarUrl?: string | null
      avatar_url?: string | null
      role: BackendRole
      registration_status?: string
      assignedCafeId?: string | null
    }
  }
}

export type BackendUserProfile = {
  id: string
  email: string
  fullName: string
  phone: string | null
  avatarUrl: string | null
  role: BackendRole
  assignedCafeId?: string | null
}

type BackendProfileResponse = {
  success: boolean
  data: BackendUserProfile
}

function mapBackendUser(
  user: BackendLoginResponse["data"]["user"],
  jwtUser: ReturnType<typeof getAuthFromJwt>
): AuthUser {
  return {
    id: jwtUser.id || user.id,
    email: jwtUser.email || user.email,
    fullName: user.fullName ?? user.full_name ?? jwtUser.email ?? user.email,
    phone: user.phone ?? undefined,
    avatarUrl: user.avatarUrl ?? user.avatar_url ?? undefined,
    role: jwtUser.role,
    registrationStatus: user.registration_status,
    assignedCafeId: user.assignedCafeId,
  }
}

function mapProfile(user: BackendUserProfile): AuthUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone ?? undefined,
    avatarUrl: user.avatarUrl ?? undefined,
    role: user.role.toLowerCase() as UserRole,
    assignedCafeId: user.assignedCafeId,
  }
}

export async function loginWithPassword(payload: LoginRequest): Promise<LoginResponse> {
  const response = await api.post<BackendLoginResponse>("/v1/auth/login", payload)
  const { access_token, refresh_token, user } = response.data.data
  const jwtUser = getAuthFromJwt(access_token)

  return {
    accessToken: access_token,
    refreshToken: refresh_token,
    user: mapBackendUser(user, jwtUser),
  }
}

export async function loginWithGoogle(payload: GoogleLoginRequest): Promise<LoginResponse> {
  const response = await api.post<BackendLoginResponse>("/v1/auth/google", {
    id_token: payload.idToken,
  })
  const { access_token, refresh_token, user } = response.data.data
  const jwtUser = getAuthFromJwt(access_token)

  return {
    accessToken: access_token,
    refreshToken: refresh_token,
    user: mapBackendUser(user, jwtUser),
  }
}

export async function registerWithPassword(payload: RegisterRequest): Promise<LoginResponse> {
  const response = await api.post<BackendLoginResponse>("/v1/auth/register", {
    full_name: payload.fullName,
    email: payload.email,
    phone: payload.phone,
    password: payload.password,
    role: payload.role.toUpperCase(),
  })
  const { access_token, refresh_token, user } = response.data.data
  const jwtUser = getAuthFromJwt(access_token)

  return {
    accessToken: access_token,
    refreshToken: refresh_token,
    user: mapBackendUser(user, jwtUser),
  }
}

export async function getMe(): Promise<AuthUser> {
  const response = await api.get<BackendProfileResponse>("/v1/auth/me")
  return mapProfile(response.data.data)
}

export async function updateMe(payload: {
  fullName?: string
  phone?: string | null
  avatarUrl?: string | null
}): Promise<AuthUser> {
  const response = await api.patch<BackendProfileResponse>("/v1/auth/me", {
    full_name: payload.fullName,
    phone: payload.phone,
    avatar_url: payload.avatarUrl,
  })
  return mapProfile(response.data.data)
}

export async function requestPasswordReset(payload: ForgotPasswordRequest): Promise<void> {
  await api.post("/v1/auth/forgot-password", {
    email: payload.email,
  })
}

export async function verifyPasswordResetCode(payload: VerifyPasswordResetCodeRequest): Promise<void> {
  await api.post("/v1/auth/forgot-password/verify", {
    email: payload.email,
    code: payload.code,
  })
}

export async function resetPasswordWithCode(payload: ResetPasswordRequest): Promise<void> {
  await api.post("/v1/auth/reset-password", {
    email: payload.email,
    code: payload.code,
    password: payload.password,
  })
}

export type ChangePasswordRequest = {
  currentPassword: string
  newPassword: string
}

export async function changePassword(payload: ChangePasswordRequest): Promise<void> {
  await api.post("/v1/auth/change-password", {
    current_password: payload.currentPassword,
    new_password: payload.newPassword,
  })
}

export async function logoutSession(accessToken: string, refreshToken: string): Promise<void> {
  await api.post(
    "/v1/auth/logout",
    { refresh_token: refreshToken },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )
}

export async function checkExists(data: { email?: string; phone?: string }): Promise<{ emailExists: boolean; phoneExists: boolean }> {
  const res = await api.post<{ success: boolean; data: { emailExists: boolean; phoneExists: boolean } }>("/v1/auth/check-exists", data);
  return res.data.data;
}
