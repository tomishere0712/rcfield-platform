export type UserRole = 'customer' | 'staff' | 'provider' | 'admin';

export type BackendUserRole = 'CUSTOMER' | 'STAFF' | 'PROVIDER' | 'ADMIN';

export interface AuthUser {
  assignedCafeId?: string | null;
  avatarUrl?: string;
  email: string;
  fullName: string;
  id: string;
  phone?: string;
  registrationStatus?: string;
  role: UserRole;
  trustScore?: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface BackendLoginUser {
  assignedCafeId?: string | null;
  avatarUrl?: string | null;
  avatar_url?: string | null;
  cafeId?: string | null;
  email: string;
  fullName?: string;
  full_name?: string;
  id: string;
  phone?: string | null;
  registration_status?: string;
  role: BackendUserRole;
  trustScore?: number;
}

export interface BackendLoginResponse {
  access_token: string;
  refresh_token: string;
  user: BackendLoginUser;
}

export interface BackendProfile {
  assignedCafeId?: string | null;
  avatarUrl?: string | null;
  cafeId?: string | null;
  email: string;
  fullName: string;
  id: string;
  phone: string | null;
  role: BackendUserRole;
  trustScore?: number;
}

export interface GoogleLoginRequest {
  idToken: string;
}

export interface RegisterRequest {
  fullName: string;
  email: string;
  phone?: string;
  password: string;
  role: 'customer';
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface VerifyPasswordResetCodeRequest {
  email: string;
  code: string;
}

export interface ResetPasswordRequest {
  email: string;
  code: string;
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

