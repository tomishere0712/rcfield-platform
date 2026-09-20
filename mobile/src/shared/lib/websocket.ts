import { router } from 'expo-router';
import { Alert } from 'react-native';

import { useAuthStore } from '@/shared/store/auth-store';

type WsCallback = (event: string, data: any) => void;

const AUTH_CLOSE_CODES = new Set([4001, 4003, 4401, 4403]);

function isAuthClose(code: number, reason: string) {
  const normalizedReason = reason.toLowerCase();
  return (
    AUTH_CLOSE_CODES.has(code) ||
    normalizedReason.includes('invalid token') ||
    normalizedReason.includes('unauthorized') ||
    normalizedReason.includes('forbidden')
  );
}

function toWebSocketUrl(apiUrl: string, accessToken: string) {
  try {
    const urlObj = new URL(apiUrl);
    const protocol = urlObj.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${urlObj.host}/ws?token=${encodeURIComponent(accessToken)}`;
  } catch {
    const match = apiUrl.match(/^(https?):\/\/([^/]+)/);
    if (match) {
      const protocol = match[1] === 'https' ? 'wss' : 'ws';
      return `${protocol}://${match[2]}/ws?token=${encodeURIComponent(accessToken)}`;
    }

    return `ws://192.168.1.4:3000/ws?token=${encodeURIComponent(accessToken)}`;
  }
}

function redactToken(url: string, accessToken: string) {
  return url.replace(encodeURIComponent(accessToken), '[token]');
}

class WebSocketClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<WsCallback>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private isConnecting = false;
  private connectedToken: string | null = null;
  private rejectedToken: string | null = null;
  private intentionalDisconnect = false;

  public connect() {
    const accessToken = useAuthStore.getState().accessToken;
    if (!accessToken) {
      this.disconnect();
      return;
    }

    if (this.rejectedToken === accessToken) {
      console.warn('[WS] Token was rejected by the server. Waiting for a new token before reconnecting.');
      return;
    }

    if (this.ws || this.isConnecting) {
      if (this.connectedToken === accessToken || this.isConnecting) {
        return;
      }

      this.disconnect();
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.intentionalDisconnect = false;
    this.isConnecting = true;
    const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.18:3000/api/v1';
    const wsUrl = toWebSocketUrl(apiUrl, accessToken);

    console.log('[WS] Connecting to:', redactToken(wsUrl, accessToken));

    try {
      const socket = new WebSocket(wsUrl);
      this.ws = socket;

      socket.onopen = () => {
        console.log('[WS] Connection established');
        this.connectedToken = accessToken;
        this.isConnecting = false;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        this.startHeartbeat();
      };

      socket.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          const { event, data } = payload;
          console.log('[WS] Received event:', event, data);

          this.handleInAppNotification(event, data);
          this.listeners.forEach((callback) => callback(event, data));
        } catch (err) {
          console.error('[WS] Failed to parse message data:', err);
        }
      };

      socket.onerror = (error) => {
        console.error('[WS] Socket error:', error);
      };

      socket.onclose = (e) => {
        if (this.ws !== socket) {
          return;
        }

        console.log('[WS] Socket closed:', e.code, e.reason);
        const wasIntentional = this.intentionalDisconnect;
        this.ws = null;
        this.connectedToken = null;
        this.isConnecting = false;
        this.intentionalDisconnect = false;
        this.stopHeartbeat();

        if (wasIntentional) {
          return;
        }

        if (isAuthClose(e.code, e.reason)) {
          this.rejectedToken = accessToken;
          console.warn('[WS] Authentication rejected. Reconnect stopped until the access token changes.');
          return;
        }

        this.scheduleReconnect(accessToken);
      };
    } catch (err) {
      console.error('[WS] Connection error:', err);
      this.isConnecting = false;
      this.scheduleReconnect(accessToken);
    }
  }

  private handleInAppNotification(event: string, data: any) {
    const role = useAuthStore.getState().role;

    switch (event) {
      case 'BOOKING_CHECKED_IN': {
        const bookingId =
          data?.bookingId ||
          data?.booking_id ||
          data?.data?.bookingId ||
          data?.data?.booking_id;
        Alert.alert(
          'Đã bắt đầu check-in',
          'Nhân viên trực ca đang tiến hành kiểm tra xe và hỗ trợ bạn vào sân.',
          [
            ...(bookingId
              ? [
                  {
                    text: 'Xem đơn đặt',
                    onPress: () => {
                      router.navigate(`/booking/${bookingId}` as any);
                    },
                  },
                ]
              : []),
            { text: 'Đóng', style: 'cancel' },
          ]
        );
        break;
      }
      case 'SESSION_CHECKIN_INSPECTION': {
        const bookingId =
          data?.bookingId ||
          data?.booking_id ||
          data?.data?.bookingId ||
          data?.data?.booking_id;
        const sessionId = data?.sessionId || data?.session_id;
        Alert.alert(
          'Biên bản bàn giao xe',
          'Nhân viên trực ca vừa bàn giao xe và bắt đầu phiên chơi của bạn. Lượt chơi hiện đã có hiệu lực.',
          [
            {
              text: 'Xem chi tiết',
              onPress: () => {
                if (bookingId) {
                  router.navigate(`/booking/${bookingId}` as any);
                } else if (sessionId) {
                  router.navigate(`/customer/inspections/${sessionId}` as any);
                }
              },
            },
            { text: 'Đóng', style: 'cancel' },
          ]
        );
        break;
      }
      case 'SESSION_CHECKOUT_INSPECTION': {
        const bookingId =
          data?.bookingId ||
          data?.booking_id ||
          data?.data?.bookingId ||
          data?.data?.booking_id;
        const sessionId = data?.sessionId || data?.session_id;
        Alert.alert(
          'Biên bản trả xe',
          'Nhân viên trực ca vừa kiểm tra và nhận lại xe. Bạn có thể xem ảnh và checklist đối chiếu chi tiết trong đơn đặt chỗ.',
          [
            {
              text: 'Xem chi tiết',
              onPress: () => {
                if (bookingId) {
                  router.navigate(`/booking/${bookingId}` as any);
                } else if (sessionId) {
                  router.navigate(`/customer/inspections/${sessionId}` as any);
                }
              },
            },
            { text: 'Đóng', style: 'cancel' },
          ]
        );
        break;
      }
      case 'CUSTOMER_CHECKIN_CONFIRMED':
        if (role !== 'customer') {
          Alert.alert('Khách đã xác nhận nhận xe', 'Biên bản nhận xe đã được khách ghi nhận.');
        }
        break;
      case 'CUSTOMER_CHECKOUT_CONFIRMED':
        if (role !== 'customer') {
          Alert.alert('Khách đã xác nhận trả xe', 'Checkout đã hoàn tất hoặc đang chờ xử lý thanh toán phát sinh.');
        }
        break;
      case 'CUSTOMER_INSPECTION_DISPUTED':
        if (role !== 'customer') {
          Alert.alert(
            'Khách từ chối biên bản',
            data?.disagreementNote
              ? `Lý do: ${data.disagreementNote}`
              : 'Khách đã phản hồi sai lệch. Vui lòng kiểm tra lại phiên.'
          );
        }
        break;
      case 'CUSTOMER_PAYMENT_CONFIRMED':
        Alert.alert(
          'Thanh toán thành công',
          'Đã ghi nhận khoản thanh toán hóa đơn hoặc phí phát sinh cho đơn đặt sân.'
        );
        break;
      case 'SESSION_EXTENSION_PROPOSED': {
        const sessionId = data?.sessionId || data?.session_id;
        Alert.alert(
          'Yêu cầu gia hạn ca chơi',
          `Nhân viên vừa đề xuất gia hạn ca chơi thêm ${data.extraMinutes} phút với phí phát sinh ${Number(data.additionalFee).toLocaleString('vi-VN')}đ.`,
          [
            {
              text: 'Phản hồi',
              onPress: () => {
                if (sessionId) {
                  router.navigate(`/customer/extension/${sessionId}` as any);
                }
              },
            },
            { text: 'Để sau', style: 'cancel' },
          ]
        );
        break;
      }
      case 'CUSTOMER_EXTENSION_APPROVED':
        if (role !== 'customer') {
          Alert.alert(
            'Khách đồng ý gia hạn',
            `Khách đã đồng ý gia hạn thêm ${data?.extraMinutes || ''} phút.`
          );
        }
        break;
      case 'CUSTOMER_EXTENSION_REJECTED':
        if (role !== 'customer') {
          Alert.alert(
            'Khách từ chối gia hạn',
            `Khách đã từ chối gia hạn thêm ${data?.extraMinutes || ''} phút.`
          );
        }
        break;
      case 'SESSION_FNB_ORDER_ADDED':
        Alert.alert(
          'Gọi món thành công',
          `Món ăn/nước uống mới trị giá ${Number(data.totalAmount).toLocaleString('vi-VN')}đ đã được thêm vào phiên chạy.`
        );
        break;
      case 'FNB_ORDER_SERVED':
        Alert.alert(
          'Món của bạn đã sẵn sàng',
          'Nhân viên đã xác nhận phục vụ đơn đồ ăn & thức uống của bạn.'
        );
        break;
      case 'BOOKING_REVIEW_REQUEST': {
        const bookingId = data?.bookingId || data?.booking_id;
        Alert.alert(
          'Đánh giá trải nghiệm',
          'Cảm ơn bạn đã tham gia trải nghiệm! Hãy dành chút thời gian đánh giá dịch vụ nhé.',
          [
            {
              text: 'Đánh giá ngay',
              onPress: () => {
                if (bookingId) {
                  router.navigate(`/customer/review/${bookingId}` as any);
                }
              },
            },
            { text: 'Để sau', style: 'cancel' },
          ]
        );
        break;
      }
      case 'BOOKING_CANCELLED': {
        const bookingId = data?.bookingId || data?.booking_id;
        Alert.alert(
          data?.title || 'Đơn đặt lịch bị hủy',
          data?.message || 'Đơn hàng của bạn đã bị hủy.',
          [
            {
              text: 'Xem đơn',
              onPress: () => {
                if (bookingId) {
                  router.navigate(`/booking/${bookingId}` as any);
                } else {
                  router.navigate('/(tabs)/bookings' as any);
                }
              },
            },
            { text: 'Đóng', style: 'cancel' },
          ]
        );
        break;
      }
      case 'SESSION_OVERDUE_ALERT':
        if (role !== 'customer') {
          Alert.alert(
            'Phiên chơi quá giờ chưa kết thúc',
            data?.message || 'Vui lòng kiểm tra và hoàn tất kết thúc phiên này.'
          );
        }
        break;
    }
  }

  private scheduleReconnect(tokenAtClose: string) {
    if (this.reconnectTimer) return;

    const currentToken = useAuthStore.getState().accessToken;
    if (!currentToken || currentToken !== tokenAtClose || this.rejectedToken === currentToken) {
      return;
    }

    console.log('[WS] Scheduling reconnection in 5 seconds...');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  public subscribe(callback: WsCallback) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  public disconnect() {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.isConnecting = false;
    this.connectedToken = null;

    if (this.ws) {
      this.intentionalDisconnect = true;
      this.ws.close();
      this.ws = null;
    } else {
      this.intentionalDisconnect = false;
    }

    console.log('[WS] Disconnected');
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        console.log('[WS] Sending ping to keep-alive');
        this.ws.send('ping');
      }
    }, 30000); // 30 seconds
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

export const wsClient = new WebSocketClient();
