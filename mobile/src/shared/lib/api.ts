import axios, { AxiosHeaders, create } from 'axios';

import { env } from '@/shared/config/env';
import { secureTokenStorage } from '@/shared/lib/secure-storage';

let onTokenRevokedCallback: (() => void) | null = null;

// Hàm để các phần khác của ứng dụng đăng ký callback logout tránh circular dependency
export const setTokenRevokedCallback = (callback: () => void) => {
  onTokenRevokedCallback = callback;
};

export const api = create({
  baseURL: env.apiUrl,
  timeout: 15000,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(async (config) => {
  const accessToken = await secureTokenStorage.getAccessToken();

  if (accessToken) {
    config.headers = AxiosHeaders.from(config.headers);
    config.headers.set('Authorization', `Bearer ${accessToken}`);
  }

  return config;
});

let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });

  failedQueue = [];
};

// Response interceptor để tự động refresh token khi gặp lỗi 401 (token bị thu hồi hoặc hết hạn)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Chỉ thực hiện refresh khi trả về 401 Unauthorized và chưa thử lại
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Tránh lặp vô hạn ở các endpoint auth chính
      if (
        originalRequest.url?.includes('/auth/login') ||
        originalRequest.url?.includes('/auth/refresh') ||
        originalRequest.url?.includes('/auth/register') ||
        originalRequest.url?.includes('/auth/google')
      ) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers = AxiosHeaders.from(originalRequest.headers);
            originalRequest.headers.set('Authorization', `Bearer ${token}`);
            return api(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { refreshToken } = await secureTokenStorage.getTokenPair();
        if (!refreshToken) {
          throw new Error('Không tìm thấy refresh token trong SecureStore');
        }

        // Gọi API refresh token sử dụng axios gốc để tránh interceptor
        const response = await axios.post(`${env.apiUrl}/auth/refresh`, {
          refresh_token: refreshToken,
        });

        const { access_token, refresh_token: newRefreshToken } = response.data.data;

        // Lưu token mới vào bộ nhớ an toàn
        await secureTokenStorage.setTokenPair(access_token, newRefreshToken);

        api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
        originalRequest.headers = AxiosHeaders.from(originalRequest.headers);
        originalRequest.headers.set('Authorization', `Bearer ${access_token}`);

        processQueue(null, access_token);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);

        // Trường hợp refresh token hết hạn hoặc bị thu hồi trên backend
        await secureTokenStorage.clearTokens();
        if (onTokenRevokedCallback) {
          onTokenRevokedCallback();
        }

        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
