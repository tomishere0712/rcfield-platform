import * as SecureStore from 'expo-secure-store';
import { api } from '@/shared/lib/api';

const LOCAL_FAVORITE_KEY = 'rcfield_favorite_cafes';
const SYNCED_KEY = 'rcfield_favorites_synced';

export const favoriteLocal = {
  getLocalFavorites: async (): Promise<string[]> => {
    try {
      const res = await SecureStore.getItemAsync(LOCAL_FAVORITE_KEY);
      if (res) {
        const parsed = JSON.parse(res);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('[FavoriteLocal] Failed to parse local favorites', e);
    }
    return [];
  },

  setLocalFavorites: async (ids: string[]): Promise<void> => {
    await SecureStore.setItemAsync(LOCAL_FAVORITE_KEY, JSON.stringify(ids));
  },

  isSynced: async (): Promise<boolean> => {
    const res = await SecureStore.getItemAsync(SYNCED_KEY);
    return res === 'true';
  },

  setSyncedStatus: async (synced: boolean): Promise<void> => {
    await SecureStore.setItemAsync(SYNCED_KEY, synced ? 'true' : 'false');
  },

  clearSyncedStatus: async (): Promise<void> => {
    await SecureStore.deleteItemAsync(SYNCED_KEY);
  },
};

export const favoriteApi = {
  getFavorites: async (): Promise<string[]> => {
    const res = await api.get<{ success: boolean; data: string[] }>('/customer/favorites');
    return res.data.data;
  },

  addFavorite: async (cafeId: string): Promise<void> => {
    await api.post(`/customer/favorites/${cafeId}`);
  },

  removeFavorite: async (cafeId: string): Promise<void> => {
    await api.delete(`/customer/favorites/${cafeId}`);
  },

  syncFavorites: async (cafeIds: string[]): Promise<string[]> => {
    const res = await api.post<{ success: boolean; data: string[] }>('/customer/favorites/sync', { cafeIds });
    return res.data.data;
  },
};

