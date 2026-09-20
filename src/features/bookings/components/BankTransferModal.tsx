import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import {
  X,
  Copy,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Building2,
  RefreshCw,
  Sparkles,
  Download,
  Share2,
} from 'lucide-react-native';

import { api } from '@/shared/lib/api';
import { wsClient } from '@/shared/lib/websocket';
import { Text } from '@/shared/ui/Text';
import { bookingWizardApi, type BankTransferCheckout } from '../api/booking-wizard.api';

interface BankTransferModalProps {
  visible: boolean;
  bookingId: string;
  checkout: BankTransferCheckout | null;
  isAdditionalPayment?: boolean;
  payLaterLabel?: string;
  onClose: () => void;
  onSuccess: (bookingId: string) => void;
}

export function BankTransferModal({
  visible,
  bookingId,
  checkout,
  isAdditionalPayment = false,
  payLaterLabel,
  onClose,
  onSuccess,
}: BankTransferModalProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(5);
  const [isSavingQr, setIsSavingQr] = useState(false);
  const [isSharingQr, setIsSharingQr] = useState(false);
  const hasTriggeredSuccessRef = useRef(false);

  // 1. Countdown timer
  const expiresAtMs = useMemo(() => {
    if (!checkout?.expires_at) return Date.now() + 15 * 60 * 1000;
    return new Date(checkout.expires_at).getTime();
  }, [checkout?.expires_at]);

  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000))
  );

  useEffect(() => {
    if (!visible || !checkout) {
      setIsPaid(false);
      setRedirectCountdown(5);
      setIsCheckingStatus(false);
      setIsSavingQr(false);
      setIsSharingQr(false);
      hasTriggeredSuccessRef.current = false;
      return;
    }
    setIsPaid(false);
    setRedirectCountdown(5);
    hasTriggeredSuccessRef.current = false;
    const initialRemaining = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
    setRemainingSeconds(initialRemaining);

    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [visible, checkout, expiresAtMs]);

  // 2. Realtime WebSocket listener
  useEffect(() => {
    if (!visible || !bookingId || isPaid) return;

    const unsubscribe = wsClient.subscribe((event, data) => {
      const targetBookingId =
        data?.bookingId || data?.booking_id || data?.data?.bookingId || data?.data?.booking_id;
      if (targetBookingId && targetBookingId === bookingId) {
        if (
          [
            'CUSTOMER_PAYMENT_CONFIRMED',
            'BOOKING_PAYMENT_UPDATED',
            'BOOKING_UPDATED',
            'BOOKING_PAID',
            'SESSION_CHECKOUT_COMPLETED',
          ].includes(event)
        ) {
          console.log(`[BankTransferModal] Payment confirmed via WebSocket event '${event}'`);
          setIsPaid(true);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [visible, bookingId, isPaid]);

  // 3. Status Polling loop & manual checking
  const checkPaymentStatus = useCallback(
    async (silent = false) => {
      if (!bookingId) return;
      if (!silent) setIsCheckingStatus(true);
      try {
        // Trong môi trường sandbox / dev, kích hoạt mô phỏng thanh toán ngân hàng khi bấm nút kiểm tra
        if (!silent && checkout?.is_sandbox && checkout.ref_code) {
          try {
            await api.post('/sandbox-bank/transfer', { ref: checkout.ref_code });
          } catch (sbErr) {
            console.log('[BankTransferModal] Sandbox simulation call notice:', sbErr);
          }
        }

        const data = await bookingWizardApi.getBooking(bookingId);

        // Kiểm tra xem giao dịch chuyển khoản cụ thể này đã SUCCESS chưa
        const matchingTx = checkout?.ref_code
          ? data?.payment_transactions?.find(
              (tx: any) =>
                tx.txnRef === checkout.ref_code ||
                tx.txnRef === checkout.txn_ref ||
                (tx.rawRequest as any)?.paymentRefCode === checkout.ref_code
            )
          : null;
        const isTxSuccess = matchingTx?.status === 'SUCCESS';

        // Kiểm tra các khoản phát sinh còn nợ không
        const pendingComponents = (data?.payment_components || []).filter(
          (c: any) => c.status === 'PENDING'
        );
        const hasPendingComponents = pendingComponents.length > 0;
        const additionalOutstanding = Number(
          data?.financial_summary?.additionalOutstandingAmount ??
            data?.payment_summary?.outstandingAmount ??
            0
        );
        const isAdditionalCleared = !hasPendingComponents && additionalOutstanding <= 0;

        // Trạng thái đơn đặt lịch đã được xác nhận / hoàn tất
        const isBookingStatusValid =
          data?.status === 'CONFIRMED' ||
          data?.status === 'PAYMENT_CONFIRMED' ||
          data?.status === 'CHECKED_IN' ||
          data?.status === 'IN_SESSION' ||
          data?.status === 'COMPLETED';

        if (isTxSuccess || isAdditionalCleared || (isBookingStatusValid && data?.status !== 'PENDING')) {
          setIsPaid(true);
        } else if (!silent) {
          Alert.alert(
            'Đang chờ xác nhận',
            'Hệ thống chưa nhận được thông tin chuyển khoản khớp với mã đơn. Nếu bạn đã chuyển, vui lòng chờ trong giây lát rồi nhấn kiểm tra lại nhé.'
          );
        }
      } catch {
        if (!silent) {
          Alert.alert('Thông báo', 'Không thể kiểm tra trạng thái lúc này. Vui lòng thử lại.');
        }
      } finally {
        if (!silent) setIsCheckingStatus(false);
      }
    },
    [bookingId, checkout]
  );

  useEffect(() => {
    if (!visible || !bookingId || isPaid || remainingSeconds <= 0) return;

    const pollInterval = setInterval(() => {
      checkPaymentStatus(true);
    }, 4000);

    return () => clearInterval(pollInterval);
  }, [visible, bookingId, isPaid, remainingSeconds, checkPaymentStatus]);

  const handleSuccess = useCallback(() => {
    if (hasTriggeredSuccessRef.current) return;
    hasTriggeredSuccessRef.current = true;
    onSuccess(bookingId);
  }, [bookingId, onSuccess]);

  // 3. Auto-redirect countdown on Paid
  useEffect(() => {
    if (!isPaid) return;

    const countdownTimer = setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownTimer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownTimer);
  }, [isPaid]);

  // 4. Trigger redirect when countdown hits 0
  useEffect(() => {
    if (isPaid && redirectCountdown === 0) {
      handleSuccess();
    }
  }, [isPaid, redirectCountdown, handleSuccess]);

  const handleCopy = async (text: string, fieldName: string) => {
    await Clipboard.setStringAsync(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const getQrFileUri = async (): Promise<string | null> => {
    if (!checkout?.qr_image_data_url) return null;
    const safeRef = (checkout.ref_code || 'vietqr').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${FileSystem.cacheDirectory}vietqr_${safeRef}_${Date.now()}.png`;

    if (checkout.qr_image_data_url.startsWith('data:image')) {
      const parts = checkout.qr_image_data_url.split(',');
      const base64Data = parts.length > 1 ? parts[1] : parts[0];
      await FileSystem.writeAsStringAsync(filename, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return filename;
    } else if (checkout.qr_image_data_url.startsWith('http')) {
      const downloadResult = await FileSystem.downloadAsync(checkout.qr_image_data_url, filename);
      return downloadResult.uri;
    }
    return null;
  };

  const handleSaveQrCode = async () => {
    if (isSavingQr) return;
    setIsSavingQr(true);
    try {
      const fileUri = await getQrFileUri();
      if (!fileUri) {
        Alert.alert('Lỗi', 'Không tìm thấy hình ảnh mã QR.');
        return;
      }

      const permission = await MediaLibrary.requestPermissionsAsync();
      if (permission.granted) {
        await MediaLibrary.saveToLibraryAsync(fileUri);
        Alert.alert(
          'Đã lưu mã QR thành công! 📱',
          'Ảnh VietQR đã được lưu vào thư viện ảnh trên điện thoại của bạn.\n\nBạn hãy mở ứng dụng Ngân hàng (MB, Vietcombank, Techcombank,...) và chọn "Quét QR từ ảnh" để thanh toán nhanh chóng.'
        );
      } else {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'image/png',
            dialogTitle: 'Lưu hoặc chia sẻ mã VietQR',
          });
        } else {
          Alert.alert(
            'Quyền truy cập ảnh',
            'Vui lòng cấp quyền Thư viện ảnh trong Cài đặt để ứng dụng có thể lưu ảnh QR vào máy.'
          );
        }
      }
    } catch (error) {
      console.error('Save QR error:', error);
      Alert.alert('Thông báo', 'Không thể lưu mã QR vào thư viện ảnh. Bạn có thể chụp ảnh màn hình để thay thế.');
    } finally {
      setIsSavingQr(false);
    }
  };

  const handleShareQrCode = async () => {
    if (isSharingQr) return;
    setIsSharingQr(true);
    try {
      const fileUri = await getQrFileUri();
      if (!fileUri) {
        Alert.alert('Lỗi', 'Không tìm thấy hình ảnh mã QR.');
        return;
      }
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'image/png',
          dialogTitle: 'Chia sẻ mã VietQR thanh toán',
        });
      } else {
        Alert.alert('Thông báo', 'Thiết bị không hỗ trợ tính năng chia sẻ này.');
      }
    } catch (error) {
      console.error('Share QR error:', error);
    } finally {
      setIsSharingQr(false);
    }
  };

  if (!checkout) return null;

  const isExpired = remainingSeconds <= 0 && !isPaid;
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;

  const formattedCountdown =
    hours > 0
      ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const resolvedPayLaterLabel =
    payLaterLabel ||
    (isAdditionalPayment
      ? 'Đóng (Thanh toán tại quầy sau)'
      : 'Thanh toán sau (Giữ chỗ 30 phút)');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-[#f8fafc] dark:bg-[#0b0f19]" edges={['top', 'bottom']}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-850 bg-white dark:bg-[#0f172a]">
          <View className="flex-row items-center gap-2">
            <View className="h-8 w-8 rounded-lg bg-orange-500/10 border border-orange-500/20 items-center justify-center">
              <Building2 color="#f97316" size={16} />
            </View>
            <View>
              <Text className="text-[15px] text-slate-900 dark:text-white font-bold">
                Thanh toán Chuyển khoản
              </Text>
              <Text className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                Quét mã VietQR 24/7
              </Text>
            </View>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700"
          >
            <X color="#64748b" size={18} />
          </Pressable>
        </View>

        {isPaid ? (
          /* SUCCESS STATE */
          <View className="flex-1 items-center justify-center p-6 text-center">
            <View className="h-20 w-20 rounded-full bg-emerald-100 dark:bg-emerald-950/60 border-2 border-emerald-500/40 items-center justify-center mb-5">
              <CheckCircle2 color="#10b981" size={44} />
            </View>
            <Text className="text-xl text-slate-900 dark:text-white font-black text-center mb-2">
              Thanh toán thành công!
            </Text>
            <Text className="text-sm text-slate-600 dark:text-slate-300 text-center leading-5 font-semibold px-4 mb-6">
              Hệ thống đã xác nhận nhận tiền thành công. Lịch đặt của bạn đã được cập nhật hoàn tất.
            </Text>
            <View className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl px-5 py-3.5 mb-8 flex-row items-center gap-2.5">
              <Sparkles color="#10b981" size={18} />
              <Text className="text-xs text-emerald-800 dark:text-emerald-300 font-bold">
                Tự động chuyển đến đơn sau {redirectCountdown}s...
              </Text>
            </View>
            <Pressable
              onPress={handleSuccess}
              className="w-full bg-[#ea580c] active:bg-[#f97316] py-3.5 rounded-xl items-center justify-center shadow-lg shadow-orange-500/20"
            >
              <Text className="text-white text-sm font-bold uppercase tracking-wider">
                Xem chi tiết lịch đặt ngay
              </Text>
            </Pressable>
          </View>
        ) : isExpired ? (
          /* EXPIRED STATE */
          <View className="flex-1 items-center justify-center p-6">
            <View className="h-20 w-20 rounded-full bg-red-100 dark:bg-red-950/60 border-2 border-red-500/40 items-center justify-center mb-5">
              <AlertTriangle color="#ef4444" size={40} />
            </View>
            <Text className="text-xl text-slate-900 dark:text-white font-black text-center mb-2">
              {isAdditionalPayment ? 'Mã thanh toán hết hiệu lực' : 'Hết thời gian giữ chỗ'}
            </Text>
            <Text className="text-xs text-slate-500 dark:text-slate-400 text-center leading-5 font-semibold px-4 mb-6">
              {isAdditionalPayment
                ? 'Phiên thanh toán chuyển khoản này đã hết hạn. Bạn có thể tạo lại mã mới hoặc thanh toán trực tiếp tại quầy.'
                : 'Phiên thanh toán này đã hết hạn. Nếu bạn đã chuyển khoản, đừng lo lắng, tiền vẫn được ghi nhận trong sổ đối soát của cơ sở.'}
            </Text>
            <Pressable
              onPress={onClose}
              className="w-full bg-slate-200 dark:bg-slate-800 active:bg-slate-300 py-3.5 rounded-xl items-center justify-center"
            >
              <Text className="text-slate-800 dark:text-white text-sm font-bold">
                Đóng và thử lại
              </Text>
            </Pressable>
          </View>
        ) : (
          /* ACTIVE QR CHECKOUT STATE */
          <ScrollView
            contentContainerClassName="p-5 pb-12"
            showsVerticalScrollIndicator={false}
          >
            {/* QR Card Container */}
            <View className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-850 rounded-3xl p-5 shadow-sm items-center">
              {/* VietQR Badge */}
              <View className="flex-row items-center justify-between w-full mb-3">
                <View className="flex-row items-center gap-1.5 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/60 px-2.5 py-1 rounded-lg">
                  <Text className="text-[10px] text-blue-700 dark:text-blue-300 font-extrabold tracking-wider uppercase">
                    VIETQR
                  </Text>
                </View>

                {/* Live Countdown Badge */}
                <View className="flex-row items-center gap-1 bg-orange-50 dark:bg-orange-950/50 border border-orange-200 dark:border-orange-800/60 px-2.5 py-1 rounded-lg">
                  <Clock color="#ea580c" size={12} />
                  <Text className="text-[10px] text-[#ea580c] font-bold">
                    Còn {formattedCountdown}
                  </Text>
                </View>
              </View>

              {/* QR Image Box */}
              <View className="p-3 bg-white rounded-2xl border-2 border-slate-100 dark:border-slate-800 shadow-inner my-2">
                {checkout.qr_image_data_url ? (
                  <Image
                    source={{ uri: checkout.qr_image_data_url }}
                    className="w-56 h-56 rounded-lg"
                    resizeMode="contain"
                  />
                ) : (
                  <View className="w-56 h-56 items-center justify-center bg-slate-50">
                    <ActivityIndicator size="large" color="#f97316" />
                  </View>
                )}
              </View>

              {/* Quick Actions (Save & Share QR) */}
              <View className="flex-row items-center gap-2.5 mt-3 w-full">
                <Pressable
                  disabled={isSavingQr}
                  onPress={handleSaveQrCode}
                  className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900/60 active:bg-orange-100 dark:active:bg-orange-900/60"
                >
                  {isSavingQr ? (
                    <ActivityIndicator size="small" color="#ea580c" />
                  ) : (
                    <Download color="#ea580c" size={14} />
                  )}
                  <Text className="text-xs text-[#ea580c] font-bold">
                    Lưu mã QR về máy
                  </Text>
                </Pressable>

                <Pressable
                  disabled={isSharingQr}
                  onPress={handleShareQrCode}
                  className="flex-1 flex-row items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 active:bg-slate-100 dark:active:bg-slate-700"
                >
                  {isSharingQr ? (
                    <ActivityIndicator size="small" color="#64748b" />
                  ) : (
                    <Share2 color="#64748b" size={14} />
                  )}
                  <Text className="text-xs text-slate-700 dark:text-slate-300 font-bold">
                    Chia sẻ
                  </Text>
                </Pressable>
              </View>

              {/* Amount Display */}
              <View className="mt-4 items-center">
                <Text className="text-[11px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
                  Số tiền cần chuyển
                </Text>
                <Text className="text-2xl text-[#ea580c] font-black mt-0.5 tracking-tight">
                  {Number(checkout.amount || 0).toLocaleString('vi-VN')}đ
                </Text>
              </View>
            </View>

            {/* Manual Banking Info Card */}
            <View className="mt-4 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-3xl p-4 shadow-sm">
              <Text className="text-xs text-slate-900 dark:text-white font-bold uppercase tracking-wider mb-3 px-1">
                Thông tin chuyển khoản thủ công
              </Text>

              <View className="gap-2.5">
                {/* Bank Name */}
                <View className="flex-row justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-850">
                  <Text className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                    Ngân hàng
                  </Text>
                  <Text className="text-xs text-slate-800 dark:text-slate-200 font-bold">
                    {checkout.bank_name}
                  </Text>
                </View>

                {/* Account Name */}
                <View className="flex-row justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-850">
                  <Text className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                    Chủ tài khoản
                  </Text>
                  <Text className="text-xs text-slate-800 dark:text-slate-200 font-bold uppercase">
                    {checkout.account_name}
                  </Text>
                </View>

                {/* Account Number with Copy */}
                <View className="flex-row justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-850">
                  <View>
                    <Text className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                      Số tài khoản
                    </Text>
                    <Text className="text-sm font-mono text-slate-900 dark:text-white font-bold mt-0.5">
                      {checkout.account_number}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleCopy(checkout.account_number, 'account')}
                    className={`flex-row items-center gap-1 px-3 py-1.5 rounded-lg border ${
                      copiedField === 'account'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800'
                        : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 active:bg-slate-100'
                    }`}
                  >
                    {copiedField === 'account' ? (
                      <CheckCircle2 color="#10b981" size={13} />
                    ) : (
                      <Copy color="#64748b" size={13} />
                    )}
                    <Text
                      className={`text-[11px] font-bold ${
                        copiedField === 'account' ? 'text-emerald-600' : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {copiedField === 'account' ? 'Đã sao chép' : 'Sao chép'}
                    </Text>
                  </Pressable>
                </View>

                {/* Reference Code with Highlight & Copy */}
                <View className="flex-row justify-between items-center py-2 border-t border-slate-100 dark:border-slate-850 bg-orange-50/50 dark:bg-orange-950/20 -mx-4 px-4 rounded-b-xl">
                  <View className="flex-1 mr-2">
                    <Text className="text-xs text-[#ea580c] font-bold">
                      Nội dung chuyển khoản (Bắt buộc)
                    </Text>
                    <Text className="text-[13px] font-mono text-[#ea580c] font-black mt-0.5">
                      {checkout.ref_code}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleCopy(checkout.ref_code, 'refCode')}
                    className={`flex-row items-center gap-1 px-3 py-1.5 rounded-lg border ${
                      copiedField === 'refCode'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300'
                        : 'bg-[#ea580c] border-[#ea580c] active:bg-[#f97316]'
                    }`}
                  >
                    {copiedField === 'refCode' ? (
                      <CheckCircle2 color="#10b981" size={13} />
                    ) : (
                      <Copy color="#ffffff" size={13} />
                    )}
                    <Text
                      className={`text-[11px] font-bold ${
                        copiedField === 'refCode' ? 'text-emerald-600' : 'text-white'
                      }`}
                    >
                      {copiedField === 'refCode' ? 'Đã sao chép' : 'Sao chép mã'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {/* Waiting status pulse & helper notes */}
            <View className="mt-5 items-center justify-center">
              <View className="flex-row items-center gap-2 bg-slate-100 dark:bg-slate-900/60 px-4 py-2.5 rounded-full border border-slate-200 dark:border-slate-800">
                <ActivityIndicator size="small" color="#f97316" />
                <Text className="text-xs text-slate-600 dark:text-slate-300 font-semibold">
                  Đang chờ tiền về • Màn hình sẽ tự động cập nhật
                </Text>
              </View>

              <Text className="text-[11px] text-slate-500 dark:text-slate-400 text-center leading-4 font-semibold mt-3 px-2">
                Khi quét mã VietQR, số tiền và nội dung sẽ tự động được điền chính xác. Vui lòng không sửa nội dung chuyển tiền.
              </Text>
            </View>

            {/* Action buttons */}
            <View className="mt-6 gap-2.5">
              <Pressable
                disabled={isCheckingStatus}
                onPress={() => checkPaymentStatus(false)}
                className="w-full bg-[#ea580c] active:bg-[#f97316] py-3.5 rounded-xl flex-row items-center justify-center gap-2 shadow-lg shadow-orange-500/20"
              >
                {isCheckingStatus ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <RefreshCw color="#ffffff" size={16} />
                )}
                <Text className="text-white text-sm font-bold uppercase tracking-wider">
                  Tôi đã chuyển tiền • Kiểm tra ngay
                </Text>
              </Pressable>

              <Pressable
                onPress={onClose}
                className="w-full bg-orange-50 dark:bg-orange-950/30 active:bg-orange-100 dark:active:bg-orange-900/40 py-3.5 rounded-xl flex-row items-center justify-center gap-2 border border-orange-200 dark:border-orange-800"
              >
                <Clock color="#ea580c" size={16} />
                <Text className="text-[#ea580c] dark:text-orange-400 text-xs font-bold">
                  {resolvedPayLaterLabel}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}
