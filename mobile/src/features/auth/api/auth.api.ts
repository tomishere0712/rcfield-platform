import { API_ENDPOINTS } from '@/shared/constants';
import { api } from '@/shared/lib/api';
import type { ApiResponse } from '@/shared/types/api';

import { mapBackendProfile, mapLoginResponse } from '../lib/auth-mappers';
import type {
  AuthUser,
  BackendLoginResponse,
  BackendProfile,
  LoginRequest,
  LoginResponse,
  GoogleLoginRequest,
  RegisterRequest,
  ForgotPasswordRequest,
  VerifyPasswordResetCodeRequest,
  ResetPasswordRequest,
  ChangePasswordRequest,
} from '../types/auth.types';

export async function loginWithPassword(payload: LoginRequest): Promise<LoginResponse> {
  const response = await api.post<ApiResponse<BackendLoginResponse>>(
    API_ENDPOINTS.auth.login,
    payload,
  );

  return mapLoginResponse(response.data.data);
}

export async function loginWithGoogle(payload: GoogleLoginRequest): Promise<LoginResponse> {
  const response = await api.post<ApiResponse<BackendLoginResponse>>(
    API_ENDPOINTS.auth.google,
    { id_token: payload.idToken }
  );

  return mapLoginResponse(response.data.data);
}

export async function registerWithPassword(payload: RegisterRequest): Promise<LoginResponse> {
  const response = await api.post<ApiResponse<BackendLoginResponse>>(
    API_ENDPOINTS.auth.register,
    {
      full_name: payload.fullName,
      email: payload.email,
      phone: payload.phone,
      password: payload.password,
      role: payload.role.toUpperCase(),
    }
  );

  return mapLoginResponse(response.data.data);
}

export async function getMe(): Promise<AuthUser> {
  const response = await api.get<ApiResponse<BackendProfile>>(API_ENDPOINTS.auth.me);
  return mapBackendProfile(response.data.data);
}

export async function updateMe(payload: {
  fullName?: string;
  phone?: string | null;
  avatarUrl?: string | null;
}): Promise<AuthUser> {
  const response = await api.patch<ApiResponse<BackendProfile>>(API_ENDPOINTS.auth.me, {
    full_name: payload.fullName,
    phone: payload.phone,
    avatar_url: payload.avatarUrl,
  });
  return mapBackendProfile(response.data.data);
}

export async function changePassword(payload: ChangePasswordRequest): Promise<void> {
  await api.post(API_ENDPOINTS.auth.changePassword, {
    current_password: payload.currentPassword,
    new_password: payload.newPassword,
  });
}

type UploadImageOptions = {
  fileName?: string;
  mimeType?: string;
  timeoutMs?: number;
};

const DEFAULT_IMAGE_UPLOAD_TIMEOUT_MS = 90000;

function getUploadFileInfo(uri: string, options?: UploadImageOptions) {
  const uriParts = uri.split('/');
  const rawFileName = options?.fileName || uriParts[uriParts.length - 1] || 'image.jpg';
  const fileName = rawFileName.includes('.') ? rawFileName : `${rawFileName}.jpg`;
  const extension = fileName.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
  const mimeType =
    options?.mimeType || `image/${extension === 'jpg' ? 'jpeg' : extension}`;

  return { fileName, mimeType };
}

export async function uploadImage(
  uri: string,
  usage = 'profile-avatar',
  options: UploadImageOptions = {},
): Promise<{ publicId: string; url: string }> {
  const formData = new FormData();
  const { fileName, mimeType } = getUploadFileInfo(uri, options);
  
  formData.append('file', {
    uri,
    name: fileName,
    type: mimeType,
  } as any);
  formData.append('usage', usage);
  
  const response = await api.post<ApiResponse<{ publicId: string; url: string }>>(
    API_ENDPOINTS.uploads.images,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: options.timeoutMs ?? DEFAULT_IMAGE_UPLOAD_TIMEOUT_MS,
    }
  );
  
  return response.data.data;
}

export async function requestPasswordReset(payload: ForgotPasswordRequest): Promise<void> {
  await api.post(API_ENDPOINTS.auth.forgotPassword, {
    email: payload.email,
  });
}

export async function verifyPasswordResetCode(payload: VerifyPasswordResetCodeRequest): Promise<void> {
  await api.post(API_ENDPOINTS.auth.verifyResetCode, {
    email: payload.email,
    code: payload.code,
  });
}

export async function resetPasswordWithCode(payload: ResetPasswordRequest): Promise<void> {
  await api.post(API_ENDPOINTS.auth.resetPassword, {
    email: payload.email,
    code: payload.code,
    password: payload.password,
  });
}

export async function logoutSession(refreshToken: string): Promise<void> {
  await api.post(API_ENDPOINTS.auth.logout, { refresh_token: refreshToken });
}

