import type {
  AuthUser,
  BackendLoginResponse,
  BackendLoginUser,
  BackendProfile,
  UserRole,
} from '@/features/auth/types/auth.types';

export function mapBackendRole(role: string): UserRole {
  return role.toLowerCase() as UserRole;
}

export function mapBackendUser(user: BackendLoginUser): AuthUser {
  return {
    assignedCafeId: user.assignedCafeId ?? user.cafeId ?? null,
    avatarUrl: user.avatarUrl ?? user.avatar_url ?? undefined,
    email: user.email,
    fullName: user.fullName ?? user.full_name ?? user.email,
    id: user.id,
    phone: user.phone ?? undefined,
    registrationStatus: user.registration_status,
    role: mapBackendRole(user.role),
    trustScore: user.trustScore,
  };
}

export function mapBackendProfile(profile: BackendProfile): AuthUser {
  return {
    assignedCafeId: profile.assignedCafeId ?? profile.cafeId ?? null,
    avatarUrl: profile.avatarUrl ?? undefined,
    email: profile.email,
    fullName: profile.fullName,
    id: profile.id,
    phone: profile.phone ?? undefined,
    role: mapBackendRole(profile.role),
    trustScore: profile.trustScore,
  };
}

export function mapLoginResponse(response: BackendLoginResponse) {
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    user: mapBackendUser(response.user),
  };
}
