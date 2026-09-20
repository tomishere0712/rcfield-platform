import { describe, expect, it } from '@jest/globals';

import { mapBackendProfile, mapBackendUser, mapLoginResponse } from './auth-mappers';

describe('auth mappers', () => {
  it('maps login user fields from backend casing', () => {
    expect(
      mapBackendUser({
        assignedCafeId: 'cafe-1',
        avatar_url: 'https://example.com/avatar.png',
        email: 'staff@example.com',
        full_name: 'Staff One',
        id: 'user-1',
        phone: null,
        registration_status: 'ACTIVE',
        role: 'STAFF',
      }),
    ).toEqual({
      assignedCafeId: 'cafe-1',
      avatarUrl: 'https://example.com/avatar.png',
      email: 'staff@example.com',
      fullName: 'Staff One',
      id: 'user-1',
      phone: undefined,
      registrationStatus: 'ACTIVE',
      role: 'staff',
    });
  });

  it('maps profile response to mobile auth user', () => {
    expect(
      mapBackendProfile({
        assignedCafeId: null,
        avatarUrl: null,
        email: 'customer@example.com',
        fullName: 'Customer One',
        id: 'user-2',
        phone: '0900000000',
        role: 'CUSTOMER',
      }),
    ).toMatchObject({
      assignedCafeId: null,
      email: 'customer@example.com',
      fullName: 'Customer One',
      phone: '0900000000',
      role: 'customer',
    });
  });

  it('uses cafeId as assignedCafeId fallback', () => {
    expect(
      mapBackendUser({
        cafeId: 'cafe-token-1',
        email: 'staff@example.com',
        id: 'user-staff',
        role: 'STAFF',
      }),
    ).toMatchObject({
      assignedCafeId: 'cafe-token-1',
      role: 'staff',
    });
  });

  it('maps token names from backend login response', () => {
    expect(
      mapLoginResponse({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        user: {
          email: 'user@example.com',
          id: 'user-3',
          role: 'CUSTOMER',
        },
      }),
    ).toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: {
        fullName: 'user@example.com',
        role: 'customer',
      },
    });
  });
});
