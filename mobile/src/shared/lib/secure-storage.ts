import * as SecureStore from 'expo-secure-store';

import { STORAGE_KEYS } from '@/shared/constants';

let cachedAccessToken: string | null | undefined;
let cachedRefreshToken: string | null | undefined;

export const secureTokenStorage = {
  async getAccessToken() {
    if (cachedAccessToken !== undefined) {
      return cachedAccessToken;
    }

    cachedAccessToken = await SecureStore.getItemAsync(STORAGE_KEYS.accessToken);
    return cachedAccessToken;
  },
  setAccessToken(token: string) {
    cachedAccessToken = token;
    return SecureStore.setItemAsync(STORAGE_KEYS.accessToken, token);
  },
  deleteAccessToken() {
    cachedAccessToken = null;
    return SecureStore.deleteItemAsync(STORAGE_KEYS.accessToken);
  },
  async getRefreshToken() {
    if (cachedRefreshToken !== undefined) {
      return cachedRefreshToken;
    }

    cachedRefreshToken = await SecureStore.getItemAsync(STORAGE_KEYS.refreshToken);
    return cachedRefreshToken;
  },
  setRefreshToken(token: string) {
    cachedRefreshToken = token;
    return SecureStore.setItemAsync(STORAGE_KEYS.refreshToken, token);
  },
  deleteRefreshToken() {
    cachedRefreshToken = null;
    return SecureStore.deleteItemAsync(STORAGE_KEYS.refreshToken);
  },
  async clearTokens() {
    await Promise.all([this.deleteAccessToken(), this.deleteRefreshToken()]);
  },
  async getTokenPair() {
    const [accessToken, refreshToken] = await Promise.all([
      this.getAccessToken(),
      this.getRefreshToken(),
    ]);

    return { accessToken, refreshToken };
  },
  async setTokenPair(accessToken: string, refreshToken: string) {
    await Promise.all([this.setAccessToken(accessToken), this.setRefreshToken(refreshToken)]);
  },
};
