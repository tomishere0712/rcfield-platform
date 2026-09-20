import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  CheckCircle2,
  Clock,
  Copy,
  Check,
  QrCode,
  X,
  Banknote,
} from 'lucide-react-native';

import { Text } from '@/shared/ui/Text';
import { wsClient } from '@/shared/lib/websocket';
import { staffApi, type BankTransferCheckout } from '@/features/staff/api/staff.api';

interface WalkInBankTransferModalProps {
  visible: boolean;
  bookingId: string;
  bookingCode?: string;
  bankTransfer: BankTransferCheckout | null;
  onClose: () => void;
  onSuccess: () => void;
  onSwitchToCash?: () => void;
}

function formatCurrency(value?: number | string) {
  return `${Number(value || 0).toLocaleString('vi-VN')}đ`;
}

function useCountdown(expiresAt?: string): { minutes: number; seconds: number; isExpired: boolean } {
  const target = useMemo(() => {
    if (!expiresAt) return Date.now() + 15 * 60 * 1000;
    return new Date(expiresAt).getTime();
  }, [expiresAt]);

  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor((target - Date.now()) / 1000))
  );

  useEffect(() => {
    const initialRemaining = Math.max(0, Math.floor((target - Date.now()) / 1000));
    setRemaining(initialRemaining);

    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((target - Date.now()) / 1000));
      setRemaining(diff);
      if (diff <= 0) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [target]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return { minutes, seconds, isExpired: remaining <= 0 };
}

export function WalkInBankTransferModal({
  visible,
  bookingId,
  bookingCode,
  bankTransfer,
  onClose,
  onSuccess,
  onSwitchToCash,
}: WalkInBankTransferModalProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const hasTriggeredSuccessRef = useRef(false);

  const { minutes, seconds, isExpired } = useCountdown(bankTransfer?.expires_at);

  const handleSuccess = useCallback(() => {
    if (hasTriggeredSuccessRef.current) return;
    hasTriggeredSuccessRef.current = true;
    setIsPaid(true);
    setTimeout(() => {
      onSuccess();
    }, 1200);
  }, [onSuccess]);

  // Reset state when opening/closing
  useEffect(() => {
    if (!visible || !bankTransfer) {
      setIsPaid(false);
      setIsConfirming(false);
      setCopiedField(null);
      hasTriggeredSuccessRef.current = false;
      return;
    }
    setIsPaid(false);
    hasTriggeredSuccessRef.current = false;
  }, [visible, bankTransfer]);

  // Realtime WebSocket listener
  useEffect(() => {
    if (!visible || isPaid) return;

    const unsubscribe = wsClient.subscribe((event, data) => {
      if (
        [
          'CUSTOMER_PAYMENT_CONFIRMED',
          'BOOKING_UPDATED',
          'BOOKING_STATUS_CHANGED',
        ].includes(event)
      ) {
        const payloadBookingId =
          (data as any)?.bookingId ||
          (data as any)?.booking_id ||
          (data as any)?.id;

        if (!payloadBookingId || payloadBookingId === bookingId) {
          handleSuccess();
        }
      }
    });

    return unsubscribe;
  }, [visible, isPaid, bookingId, handleSuccess]);

  const handleCopy = async (text: string, field: string) => {
    await Clipboard.setStringAsync(text);
    setCopiedField(field);
    setTimeout(() => {
      setCopiedField((current) => (current === field ? null : current));
    }, 2000);
  };

  const handleManualConfirm = async () => {
    if (!bookingId || isConfirming) return;

    setIsConfirming(true);
    try {
      // Confirm bank transfer or settle pending payments
      const res = await staffApi.confirmWalkInBankTransfer(bookingId);
      if (res?.success !== false) {
        handleSuccess();
      }
    } catch (error: any) {
      // If endpoint returns already paid / completed or fallback
      const message =
        error?.response?.data?.message ||
        error?.message ||
        'Không thể xác nhận thanh toán chuyển khoản.';
      Alert.alert('Lỗi', message);
    } finally {
      setIsConfirming(false);
    }
  };

  if (!visible || !bankTransfer) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View className="flex-1 bg-black/75 justify-center items-center px-4 py-6">
        <View className="w-full max-w-md max-h-[90%] rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4 bg-slate-50/80 dark:bg-slate-800/40">
            <View className="flex-row items-center gap-2.5">
              <View className="h-9 w-9 rounded-xl bg-orange-100 dark:bg-orange-950/60 items-center justify-center border border-orange-200 dark:border-orange-800">
                <QrCode color="#ea580c" size={20} />
              </View>
              <View>
                <Text className="text-[15px] font-bold text-slate-900 dark:text-white">
                  Thanh toán chuyển khoản QR
                </Text>
                <Text className="text-[11px] text-slate-500">
                  Mã đơn: <Text className="font-bold text-[#ea580c]">#{bookingCode || bookingId.slice(0, 8).toUpperCase()}</Text>
                </Text>
              </View>
            </View>
            <Pressable
              disabled={isConfirming}
              onPress={onClose}
              className="p-1 rounded-lg bg-slate-200/60 dark:bg-slate-800 active:bg-slate-300"
            >
              <X color="#94a3b8" size={18} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerClassName="p-5 gap-4"
            showsVerticalScrollIndicator={false}
          >
            {isPaid ? (
              /* THÀNH CÔNG */
              <View className="py-8 items-center justify-center gap-3">
                <View className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 items-center justify-center border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 color="#10b981" size={36} />
                </View>
                <Text className="text-[17px] font-black text-slate-900 dark:text-white">
                  Thanh toán thành công!
                </Text>
                <Text className="text-[12px] text-slate-500 text-center">
                  Hệ thống đã nhận được tiền và hoàn tất quyết toán phiên chơi.
                </Text>
                <View className="mt-2 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-5 py-3 items-center">
                  <Text className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                    Số tiền đã nhận:
                  </Text>
                  <Text className="text-[20px] font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {formatCurrency(bankTransfer.amount)}
                  </Text>
                </View>
              </View>
            ) : (
              /* GIAO DIỆN QUÉT MÃ */
              <>
                {/* Countdown Timer Bar */}
                <View className="flex-row items-center justify-between rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900/60 px-3.5 py-2.5">
                  <View className="flex-row items-center gap-1.5">
                    <Clock color="#ea580c" size={15} />
                    <Text className="text-[11px] font-bold text-orange-950 dark:text-orange-200">
                      Thời gian chờ thanh toán:
                    </Text>
                  </View>
                  <Text className="font-mono font-black text-[13px] text-[#ea580c]">
                    {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                  </Text>
                </View>

                {/* QR Code Container */}
                <View className="items-center justify-center p-4 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <View className="h-56 w-56 bg-slate-50 dark:bg-slate-900 rounded-xl items-center justify-center overflow-hidden border border-slate-100 dark:border-slate-800">
                    {bankTransfer.qr_image_data_url ? (
                      <Image
                        source={{ uri: bankTransfer.qr_image_data_url }}
                        className="h-full w-full"
                        resizeMode="contain"
                        accessibilityLabel="Mã VietQR Chuyển Khoản"
                      />
                    ) : (
                      <ActivityIndicator size="small" color="#ea580c" />
                    )}
                  </View>
                  <Text className="mt-2.5 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    Quét bằng mọi ứng dụng ngân hàng / Ví điện tử
                  </Text>
                </View>

                {/* Thông tin chuyển khoản */}
                <View className="gap-2">
                  <View className="flex-row justify-between items-center rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 p-2.5">
                    <Text className="text-[11px] text-slate-500 font-medium">Ngân hàng:</Text>
                    <Text className="text-[12px] font-bold text-slate-900 dark:text-white">
                      {bankTransfer.bank_name}
                    </Text>
                  </View>

                  <View className="flex-row justify-between items-center rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 p-2.5">
                    <Text className="text-[11px] text-slate-500 font-medium">Chủ tài khoản:</Text>
                    <Text className="text-[12px] font-bold text-slate-900 dark:text-white">
                      {bankTransfer.account_name}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => handleCopy(bankTransfer.account_number, 'account_number')}
                    className="flex-row justify-between items-center rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 p-2.5 active:bg-slate-100"
                  >
                    <View>
                      <Text className="text-[10px] text-slate-500 font-bold uppercase">Số tài khoản:</Text>
                      <Text className="text-[13px] font-mono font-black text-slate-900 dark:text-white mt-0.5">
                        {bankTransfer.account_number}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-1 bg-white dark:bg-slate-700 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600">
                      {copiedField === 'account_number' ? (
                        <>
                          <Check color="#10b981" size={13} />
                          <Text className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Đã chép</Text>
                        </>
                      ) : (
                        <>
                          <Copy color="#64748b" size={13} />
                          <Text className="text-[10px] font-bold text-slate-600 dark:text-slate-300">Sao chép</Text>
                        </>
                      )}
                    </View>
                  </Pressable>

                  <View className="flex-row justify-between items-center rounded-xl bg-orange-50/60 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900/40 p-2.5">
                    <Text className="text-[11px] font-bold text-orange-950 dark:text-orange-300">Số tiền cần chuyển:</Text>
                    <Text className="text-[15px] font-black text-[#ea580c]">
                      {formatCurrency(bankTransfer.amount)}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => handleCopy(bankTransfer.ref_code, 'ref_code')}
                    className="flex-row justify-between items-center rounded-xl bg-orange-50/60 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900/40 p-2.5 active:bg-orange-100"
                  >
                    <View className="flex-1 pr-2">
                      <Text className="text-[10px] text-orange-900 dark:text-orange-300 font-bold uppercase">Nội dung chuyển khoản:</Text>
                      <Text className="text-[13px] font-mono font-black text-[#ea580c] mt-0.5" numberOfLines={1}>
                        {bankTransfer.ref_code}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-1 bg-white dark:bg-slate-800 px-2 py-1 rounded-lg border border-orange-200 dark:border-orange-800">
                      {copiedField === 'ref_code' ? (
                        <>
                          <Check color="#10b981" size={13} />
                          <Text className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Đã chép</Text>
                        </>
                      ) : (
                        <>
                          <Copy color="#ea580c" size={13} />
                          <Text className="text-[10px] font-bold text-[#ea580c]">Sao chép</Text>
                        </>
                      )}
                    </View>
                  </Pressable>
                </View>

                {/* Nút hành động */}
                <View className="gap-2 mt-2">
                  <Pressable
                    disabled={isConfirming || isExpired}
                    onPress={handleManualConfirm}
                    className={`h-11 flex-row items-center justify-center gap-2 rounded-xl bg-emerald-600 active:bg-emerald-700 shadow-sm ${
                      isConfirming || isExpired ? 'opacity-60' : ''
                    }`}
                  >
                    {isConfirming ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <CheckCircle2 color="#ffffff" size={16} />
                    )}
                    <Text className="text-[12px] font-bold text-white">
                      Tôi đã kiểm tra & Khách đã chuyển khoản
                    </Text>
                  </Pressable>

                  {onSwitchToCash && (
                    <Pressable
                      disabled={isConfirming}
                      onPress={() => {
                        onClose();
                        onSwitchToCash();
                      }}
                      className="h-10 flex-row items-center justify-center gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 active:bg-slate-200"
                    >
                      <Banknote color="#64748b" size={14} />
                      <Text className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                        Đổi sang thu tiền mặt tại quầy
                      </Text>
                    </Pressable>
                  )}
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
