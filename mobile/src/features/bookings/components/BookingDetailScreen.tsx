import { useRouter, useFocusEffect } from 'expo-router';
import {
  Calendar,
  Clock,
  Car,
  MapPin,
  ArrowLeft,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Camera,
  User,
  CreditCard,
  Building2,
  Star,
  ClipboardCheck,
  FileText,
  UtensilsCrossed,
  Coffee,
  QrCode,
} from 'lucide-react-native';
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  View,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  AppState,
  AppStateStatus,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';

import { bookingWizardApi } from '@/features/bookings/api/booking-wizard.api';
import { getDisplayBookingStatus, isCheckInWindowExpired } from '@/features/bookings/lib/check-in-window';
import { getSessionOperationalTiming } from '@/features/staff/lib/session-operational-timing';
import { wsClient } from '@/shared/lib/websocket';
import { useAuthStore } from '@/shared/store/auth-store';
import { Text } from '@/shared/ui/Text';
import { cn } from '@/shared/lib/utils';
import { getVnpayReturnUrl } from '@/shared/lib/vnpay-return-url';
import { openVnpayPaymentSession } from '@/shared/lib/vnpay-browser';
import { ImageZoomModal } from '@/shared/ui/ImageZoomModal';
import { BankTransferModal } from './BankTransferModal';
import type { BankTransferCheckout } from '@/features/bookings/api/booking-wizard.api';

interface BookingDetailScreenProps {
  bookingId: string;
}

const INSPECTION_PHOTO_LABELS: Record<string, string> = {
  FRONT: 'Phía trước',
  BACK: 'Phía sau',
  LEFT: 'Bên trái',
  RIGHT: 'Bên phải',
  TOP: 'Từ trên',
  BOTTOM: 'Phía dưới',
  DETAIL: 'Cận cảnh',
};

export const PART_TYPE_NAMES: Record<string, string> = {
  TIRE_WHEEL: 'Bánh xe / Lốp',
  WHEEL_TIRE: 'Bánh xe / Lốp',
  MOTOR: 'Động cơ (Motor)',
  BATTERY: 'Pin / Ắc quy',
  SERVO: 'Bộ bẻ lái (Servo)',
  ESC: 'Bộ điều tốc (ESC)',
  CHASSIS: 'Khung gầm (Chassis)',
  BODY_SHELL: 'Vỏ xe (Body Shell)',
  SUSPENSION: 'Phuộc / Giảm xóc',
  TRANSMISSION: 'Hộp số / Truyền động',
  REMOTE_CONTROL: 'Tay điều khiển (Remote)',
  OTHER: 'Hạng mục khác',
};

export function getPartTypeName(partType?: string, customPartName?: string | null): string {
  if (customPartName && customPartName.trim()) return customPartName;
  if (!partType) return 'Hạng mục hư hỏng';
  return PART_TYPE_NAMES[partType.toUpperCase()] || partType;
}

function getInspectionPhotoLabel(angle?: string, index = 0) {
  return INSPECTION_PHOTO_LABELS[angle || ''] || `Ảnh ${index + 1}`;
}

function formatDateTimeStep(dateInput: Date | string) {
  const date = new Date(dateInput);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year}, ${hours}:${minutes}`;
}

function formatDateOnlyStep(dateInput: Date | string) {
  const date = new Date(dateInput);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatTimeOnlyStep(dateInput: Date | string) {
  const date = new Date(dateInput);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function BookingDetailScreen({ bookingId }: BookingDetailScreenProps) {
  const router = useRouter();
  const { colorScheme } = useColorScheme();

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/bookings');
    }
  }, [router]);

  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const currentUser = useAuthStore((state) => state.user);
  const prevUserIdRef = useRef<string | null>(currentUser?.id ?? null);

  useEffect(() => {
    if (!isAuthenticated) {
      handleBack();
      return;
    }
    if (prevUserIdRef.current && currentUser?.id && prevUserIdRef.current !== currentUser.id) {
      handleBack();
    }
    prevUserIdRef.current = currentUser?.id ?? null;
  }, [isAuthenticated, currentUser?.id, handleBack]);

  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [submittingAdditionalPayment, setSubmittingAdditionalPayment] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // States cho Hủy Đặt Lịch
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const [sessionDetail, setSessionDetail] = useState<any>(null);
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; title: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [bankTransferModalData, setBankTransferModalData] = useState<{
    bookingId: string;
    checkout: BankTransferCheckout;
    isAdditionalPayment?: boolean;
  } | null>(null);

  useEffect(() => {
    const status = booking?.session?.status;
    if (!['ACTIVE', 'EXTENDING'].includes(status)) return;
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, [booking?.session?.status, booking?.session?.plannedEndAt]);

  const mainScrollRef = useRef<ScrollView>(null);
  const [inspectionCardY, setInspectionCardY] = useState(0);
  const [inspectionPhotoTab, setInspectionPhotoTab] = useState<'CHECK_IN' | 'CHECK_OUT'>('CHECK_IN');

  const checkInInspection = useMemo(() => {
    if (!sessionDetail?.inspections) return null;
    return sessionDetail.inspections.find((i: any) => i.type === 'CHECK_IN') || null;
  }, [sessionDetail]);

  const checkOutInspection = useMemo(() => {
    if (!sessionDetail?.inspections) return null;
    return sessionDetail.inspections.find((i: any) => i.type === 'CHECK_OUT') || null;
  }, [sessionDetail]);

  const checkInPhotos = useMemo(() => checkInInspection?.photos || [], [checkInInspection]);
  const checkOutPhotos = useMemo(() => checkOutInspection?.photos || [], [checkOutInspection]);
  const checkInChecklist = useMemo(() => checkInInspection?.checklist || [], [checkInInspection]);
  const checkOutChecklist = useMemo(() => checkOutInspection?.checklist || [], [checkOutInspection]);
  const checkInStaffNotes = useMemo(() => checkInInspection?.staffNotes?.trim() || '', [checkInInspection]);
  const checkOutStaffNotes = useMemo(() => checkOutInspection?.staffNotes?.trim() || '', [checkOutInspection]);

  const handleScrollToInspection = (tab: 'CHECK_IN' | 'CHECK_OUT' = 'CHECK_OUT') => {
    setInspectionPhotoTab(tab);
    if (mainScrollRef.current && inspectionCardY > 0) {
      mainScrollRef.current.scrollTo({ y: Math.max(0, inspectionCardY - 20), animated: true });
    }
  };

  const renderPhotoGrid = (photos: any[], label: string, type: 'CHECK_IN' | 'CHECK_OUT') => {
    const isByoc = booking?.playMode === 'BYOC' || (booking as any)?.play_mode === 'BYOC';

    if (photos.length === 0) {
      return (
        <View className="w-full py-8 px-4 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-800 justify-center items-center gap-2">
          <View className="size-11 rounded-full bg-slate-200/70 dark:bg-slate-800 items-center justify-center">
            <Camera color={colorScheme === 'dark' ? '#94a3b8' : '#64748b'} size={20} />
          </View>
          <Text className="text-slate-700 dark:text-slate-300 text-xs font-bold">
            {isByoc
              ? 'Chưa có ảnh xe cá nhân vào sân'
              : `Chưa có ảnh ${type === 'CHECK_OUT' ? 'bàn giao trả xe' : 'nhận xe'}`}
          </Text>
          <Text className="text-slate-400 dark:text-slate-500 text-[11px] text-center max-w-[240px]">
            {isByoc
              ? 'Nhân viên sẽ chụp ảnh xe cá nhân của bạn khi check-in vào sân.'
              : type === 'CHECK_OUT'
                ? 'Nhân viên sẽ chụp ảnh đối chiếu 4-6 góc khi quý khách kết thúc ca chơi.'
                : 'Chưa có hình ảnh kiểm tra nhận xe.'}
          </Text>
        </View>
      );
    }

    if (isByoc) {
      return (
        <View className="gap-2.5">
          {photos.map((p: any, idx: number) => {
            const photoTitle = p.notes || (photos.length > 1 ? `Xe cá nhân người chơi ${idx + 1}` : 'Xe cá nhân vào sân');
            return (
              <Pressable
                key={p.url || idx}
                accessibilityRole="button"
                accessibilityLabel={`Phóng to ${label} ${idx + 1}`}
                onPress={() =>
                  setPreviewPhoto({
                    url: p.url,
                    title: `${label} · ${photoTitle}`,
                  })
                }
                className="w-full aspect-video rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden relative shadow-xs active:opacity-90"
              >
                <Image
                  source={{ uri: p.url }}
                  className="w-full h-full object-cover"
                />
                <View className="absolute bottom-2 left-2 bg-black/75 px-2.5 py-1 rounded-md">
                  <Text className="text-[10px] text-white font-bold tracking-wide">
                    {photoTitle}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      );
    }

    return (
      <View className="space-y-2">
        <View className="flex-row flex-wrap gap-2.5 justify-between">
          {photos.map((p: any, idx: number) => (
            <Pressable
              key={idx}
              accessibilityRole="button"
              accessibilityLabel={`Phóng to ${label} ${idx + 1}`}
              onPress={() =>
                setPreviewPhoto({
                  url: p.url,
                  title: `${label} · ${getInspectionPhotoLabel(p.angle, idx)}`,
                })
              }
              className="w-[48%] aspect-[4/3] rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden relative shadow-xs active:opacity-85"
            >
              <Image
                source={{ uri: p.url }}
                className="w-full h-full object-cover"
              />
              <View className="absolute bottom-1.5 left-1.5 bg-black/75 px-2 py-0.5 rounded-md">
                <Text className="text-[9px] text-white uppercase font-black tracking-wide">
                  {getInspectionPhotoLabel(p.angle, idx)}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
        <Text className="text-slate-400 dark:text-slate-500 text-[10px] text-center italic mt-1 font-medium">
          💡 Chạm vào bất kỳ ảnh nào để xem phóng to
        </Text>
      </View>
    );
  };

  const [isScreenFocused, setIsScreenFocused] = useState(true);

  const loadBookingDetail = useCallback(async (isSilent = false) => {
    const authState = useAuthStore.getState();
    if (!authState.isAuthenticated || !authState.accessToken) {
      setLoading(false);
      return;
    }

    try {
      const data = await bookingWizardApi.getBooking(bookingId);
      setBooking(data);
      if (data?.session?.id) {
        try {
          const sessData = await bookingWizardApi.getSessionDetail(data.session.id);
          setSessionDetail(sessData);
        } catch (sessErr) {
          console.error('[BookingDetailScreen] Failed to load session detail:', sessErr);
        }
      } else {
        setSessionDetail(null);
      }
    } catch (error: any) {
      console.error('Failed to load booking detail:', error);
      const status = error?.response?.status;
      if (status === 401 || status === 403 || status === 404) {
        setBooking(null);
        setSessionDetail(null);
      }
      if (!isSilent && status !== 401 && status !== 403) {
        Alert.alert('Lỗi', 'Không thể tải thông tin chi tiết lượt đặt sân.');
      }
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useFocusEffect(
    useCallback(() => {
      setIsScreenFocused(true);
      void loadBookingDetail(false);

      return () => {
        setIsScreenFocused(false);
      };
    }, [loadBookingDetail])
  );

  // Lưu ref của booking để so khớp trong callback websocket mà không cần re-subscribe
  const bookingRef = useRef<any>(null);
  bookingRef.current = booking;

  useEffect(() => {
    if (!isScreenFocused || !isAuthenticated) return;

    const unsubscribe = wsClient.subscribe((event, data) => {
      const targetBookingId =
        data?.bookingId || data?.booking_id || data?.data?.bookingId || data?.data?.booking_id;
      const targetSessionId =
        data?.sessionId || data?.session_id || data?.data?.sessionId || data?.data?.session_id;

      // Chỉ reload nếu sự kiện thuộc về booking hoặc session hiện tại
      const isCurrentBooking = targetBookingId && targetBookingId === bookingId;
      const isCurrentSession = targetSessionId && bookingRef.current?.session?.id === targetSessionId;

      if (isCurrentBooking || isCurrentSession) {
        if (
          [
            'SESSION_CHECKIN_INSPECTION',
            'SESSION_CHECKOUT_INSPECTION',
            'CUSTOMER_CHECKIN_CONFIRMED',
            'CUSTOMER_CHECKOUT_CONFIRMED',
            'CUSTOMER_PAYMENT_CONFIRMED',
            'CUSTOMER_INSPECTION_DISPUTED',
            'SESSION_EXTENSION_PROPOSED',
            'SESSION_EXTENSION_UPDATED',
            'SESSION_EXTENSION_EXPIRED',
            'SESSION_CHECKOUT_COMPLETED',
            'SESSION_FNB_ORDER_ADDED',
            'SESSION_FNB_ORDER_UPDATED',
            'FNB_ORDER_SERVED',
            'BOOKING_REVIEW_REQUEST',
            'SESSION_UPDATED',
            'INSPECTION_UPDATED',
            'BOOKING_CHECKED_IN',
            'BOOKING_UPDATED',
            'BOOKING_PAYMENT_UPDATED',
          ].includes(event)
        ) {
          console.log(`[BookingDetailScreen] WebSocket event '${event}' received for current booking, reloading...`);
          void loadBookingDetail(true);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isScreenFocused, isAuthenticated, bookingId, loadBookingDetail]);

  useEffect(() => {
    if (!isScreenFocused || !isAuthenticated) return;

    const sessionStatus = booking?.session?.status;
    const bookingStatus = booking?.status;
    const shouldPoll =
      bookingStatus === 'AWAITING_PAYMENT' ||
      bookingStatus === 'CONFIRMED' ||
      ['CHECKED_IN', 'ACTIVE', 'EXTENDING', 'CHECKING_OUT'].includes(sessionStatus || '');

    if (!shouldPoll) return;

    const interval = setInterval(() => {
      void loadBookingDetail(true);
    }, 10_000);

    return () => clearInterval(interval);
  }, [isScreenFocused, isAuthenticated, booking?.session?.status, booking?.status, loadBookingDetail]);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && isScreenFocused && isAuthenticated) {
        console.log('[BookingDetailScreen] App status is active, reloading booking detail...');
        void loadBookingDetail(true);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [isScreenFocused, isAuthenticated, loadBookingDetail]);

  // Hủy Lịch Đặt
  const handleCancelBooking = async () => {
    if (!cancelReason.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập lý do hủy đặt lịch.');
      return;
    }

    setCancelling(true);
    try {
      await bookingWizardApi.cancelBooking(bookingId, cancelReason.trim());
      setCancelModalVisible(false);
      setCancelReason('');
      Alert.alert('Thành công', 'Đã hủy đặt lịch thành công.');
      loadBookingDetail();
    } catch (error: any) {
      const errMsg = error?.response?.data?.message || 'Hủy đặt lịch thất bại. Vui lòng thử lại.';
      Alert.alert('Lỗi', errMsg);
    } finally {
      setCancelling(false);
    }
  };

  // Thanh toán lại (VNPay / Chuyển khoản VietQR)
  const handlePayment = async (method: 'vnpay' | 'bank_transfer' = 'vnpay') => {
    setSubmittingPayment(true);
    try {
      const returnUrl = getVnpayReturnUrl();
      const res = await bookingWizardApi.createCheckout(bookingId, returnUrl, method);

      if (res.flow === 'bank_transfer' && res.bank_transfer) {
        setBankTransferModalData({
          bookingId,
          checkout: res.bank_transfer,
          isAdditionalPayment: false,
        });
        return;
      }

      if (res.payment_url) {
        await openVnpayPaymentSession(res.payment_url);
        loadBookingDetail();
      } else {
        Alert.alert('Lỗi', 'Không tìm thấy URL hoặc thông tin thanh toán.');
      }
    } catch (error: any) {
      const errMsg = error?.response?.data?.message || 'Khởi tạo thanh toán thất bại.';
      Alert.alert('Lỗi thanh toán', errMsg);
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Thanh toán phí phát sinh (VietQR hoặc VNPay)
  const handlePaymentAdditional = async (method: 'vnpay' | 'bank_transfer' = 'vnpay') => {
    if (submittingAdditionalPayment) return;
    setSubmittingAdditionalPayment(true);
    try {
      const returnUrl = getVnpayReturnUrl();
      const res = await bookingWizardApi.createCheckoutAdditionalPayment(bookingId, returnUrl, method);

      if (res.bank_transfer && method === 'bank_transfer') {
        setBankTransferModalData({
          bookingId,
          checkout: res.bank_transfer,
          isAdditionalPayment: true,
        });
        return;
      }

      if (res.payment_url) {
        await openVnpayPaymentSession(res.payment_url);
        loadBookingDetail();
      } else {
        Alert.alert('Lỗi', 'Không tìm thấy thông tin thanh toán.');
      }
    } catch (error: any) {
      const errMsg = error?.response?.data?.message || 'Khởi tạo thanh toán phát sinh thất bại.';
      Alert.alert('Lỗi thanh toán', errMsg);
    } finally {
      setSubmittingAdditionalPayment(false);
    }
  };

  // Tính toán phí hoàn trả dự kiến khi hủy (Refund Estimation)
  const refundEstimation = useMemo(() => {
    if (!booking) return null;
    const now = new Date();
    const slotStart = new Date(booking.slotStart);
    const diffHours = (slotStart.getTime() - now.getTime()) / (1000 * 60 * 60);

    const slotFee = Number(booking.payment_components?.find((c: any) => c.type === 'SLOT_FEE')?.amount || 0);
    const rentalFee = Number(booking.payment_components?.find((c: any) => c.type === 'RENTAL_FEE')?.amount || 0);
    const deposit = Number(booking.payment_components?.find((c: any) => c.type === 'SECURITY_DEPOSIT')?.amount || 0);
    const fnb = Number(booking.payment_components?.find((c: any) => c.type === 'FNB_PREORDER')?.amount || 0);

    let refundSlotFee = 0;
    let policyText = '';

    if (diffHours >= 24) {
      refundSlotFee = slotFee; // Hoàn 100% tiền sân
      policyText = 'Hủy trước 24h: Hoàn trả 100% phí sân';
    } else if (diffHours >= 12) {
      refundSlotFee = slotFee * 0.5; // Hoàn 50% tiền sân
      policyText = 'Hủy từ 12h - 24h: Hoàn trả 50% phí sân';
    } else {
      refundSlotFee = 0; // Hoàn 0% tiền sân
      policyText = 'Hủy dưới 12h: Không hoàn phí sân';
    }

    // Các phí xe, cọc xe, fnb được hoàn lại 100%
    const totalRefund = refundSlotFee + rentalFee + deposit + fnb;

    return {
      refundSlotFee,
      rentalFee,
      deposit,
      fnb,
      totalRefund,
      policyText,
      diffHours,
    };
  }, [booking]);

  const damageLineItems = useMemo(() => {
    if (booking?.damage_breakdown?.lineItems?.length) {
      return booking.damage_breakdown.lineItems;
    }
    if (sessionDetail?.damageClaim?.damageLineItems?.length) {
      return sessionDetail.damageClaim.damageLineItems;
    }
    const checkoutInsp = sessionDetail?.inspections?.find(
      (i: any) => i.type === 'CHECK_OUT' && i.damageLineItems?.length
    );
    if (checkoutInsp?.damageLineItems?.length) {
      return checkoutInsp.damageLineItems;
    }
    return [];
  }, [booking, sessionDetail]);

  if (loading) {
    return (
      <SafeAreaView className="flex-grow flex-1 bg-[#f8fafc] dark:bg-[#0b0f19] justify-center items-center">
        <ActivityIndicator color="#ea580c" size="large" />
        <Text className="mt-3 text-slate-500 dark:text-slate-400 text-xs font-semibold">Đang tải chi tiết đặt sân...</Text>
      </SafeAreaView>
    );
  }

  if (!booking) {
    return (
      <SafeAreaView className="flex-grow flex-1 bg-[#f8fafc] dark:bg-[#0b0f19] px-5 justify-center items-center">
        <AlertCircle color="#ef4444" size={48} />
        <Text className="text-slate-900 dark:text-white text-lg font-bold mt-4">Không tìm thấy đơn đặt sân</Text>
        <Pressable
          className="mt-6 px-6 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 active:bg-slate-200 dark:active:bg-slate-700"
          onPress={handleBack}
        >
          <Text className="text-slate-900 dark:text-white text-xs font-bold">Quay lại danh sách</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const slotStart = new Date(booking.slotStart);
  const slotEnd = new Date(booking.slotEnd);
  const dateLabel = slotStart.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeLabel = `${slotStart.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - ${slotEnd.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;

  // ── Tính toán các khoản hóa đơn theo logic của Web ──
  const snapshot = booking.snapshot as any;
  const snapshotSlotFee = Number(snapshot?.slot_fee_total ?? snapshot?.slot_fee ?? 0);
  const snapshotRentalFee = Number(
    snapshot?.vehicles?.reduce((sum: number, v: any) => sum + Number(v.rental_fee ?? 0), 0) ??
    snapshot?.rental_fee ?? 0
  );
  const snapshotDeposit = Number(
    snapshot?.vehicles?.reduce((sum: number, v: any) => sum + Number(v.security_deposit ?? 0), 0) ??
    snapshot?.deposit_amount ?? 0
  );
  const snapshotFnbPreorder = Number(snapshot?.fnb_total ?? snapshot?.fnb_preorder_fee ?? 0);

  const slotFee = Number(booking.payment_components?.find((c: any) => c.type === 'SLOT_FEE')?.amount ?? snapshotSlotFee);
  const rentalFee = Number(booking.payment_components?.find((c: any) => c.type === 'RENTAL_FEE')?.amount ?? snapshotRentalFee);
  const discountAmount = Number(booking.discountAmount ?? 0);
  const depositComponent = booking.payment_components?.find((c: any) => c.type === 'SECURITY_DEPOSIT');
  const depositAmount = Number(depositComponent?.amount ?? snapshotDeposit);
  const fnbPreorderFee = Number(
    booking.payment_components?.find(
      (c: any) =>
        (c.type === 'FB_PREORDER' || c.type === 'FNB_PREORDER') &&
        (c.status === 'HELD' || c.status === 'REFUNDED')
    )?.amount ?? snapshotFnbPreorder
  );

  const isByoc = booking?.playMode === 'BYOC' || (booking as any)?.play_mode === 'BYOC';
  const totalPrepaid = slotFee + rentalFee + fnbPreorderFee + depositAmount - discountAmount;

  // Session thực tế
  const session = booking.session;
  const operationalTiming = getSessionOperationalTiming(
    sessionDetail?.plannedEnd ?? session?.plannedEndAt,
    sessionDetail?.status ?? session?.status,
    now,
  );
  const checkInExpired = isCheckInWindowExpired(booking.status, booking.slotStart, session);
  const displayBookingStatus = getDisplayBookingStatus(booking.status, booking.slotStart, session);
  const isSessionActive =
    !checkInExpired && session && ['ACTIVE', 'EXTENDING', 'CHECKED_IN', 'CHECKING_OUT'].includes(session.status);
  const isCheckoutPending =
    !isByoc &&
    ['CHECKED_IN', 'ACTIVE', 'EXTENDING', 'CHECKING_OUT'].includes(
      sessionDetail?.status ?? session?.status ?? ''
    );
  const pendingExtension =
    sessionDetail?.extensionProposal?.status === 'PENDING' && operationalTiming.state !== 'OVERDUE'
      ? sessionDetail.extensionProposal
      : null;

  const handleOpenExtensionResponse = () => {
    if (!session?.id || !pendingExtension) return;
    router.push({
      pathname: '/customer/extension/[sessionId]',
      params: { sessionId: session.id },
    } as any);
  };

  const handleOpenReview = () => {
    router.push({
      pathname: '/customer/review/[bookingId]',
      params: { bookingId },
    } as any);
  };

  // Review Status & Eligibility
  const hasReviewed = !!booking.review;
  const isBookingOrSessionDone = booking.status === 'COMPLETED' || session?.status === 'COMPLETED';
  const effectiveCompletionTime =
    booking.completedAt ||
    booking.completed_at ||
    session?.actualEndAt ||
    (isBookingOrSessionDone ? booking.slotEnd : null);
  const isReviewExpired =
    booking.is_review_expired ??
    (effectiveCompletionTime
      ? Date.now() - new Date(effectiveCompletionTime).getTime() > 5 * 24 * 60 * 60 * 1000
      : false);
  const isReviewDismissed = !!(booking.reviewDismissedAt || booking.review_dismissed_at);
  const canShowReviewPrompt = isBookingOrSessionDone && !hasReviewed && !isReviewExpired && !isReviewDismissed;

  // F&B Orders
  const customerFnbOrders: any[] = booking?.fnb_orders ?? [];
  const preorderFnbOrders = customerFnbOrders.filter((o: any) => o.orderType === 'PRE_ORDER');
  const onsiteFnbOrders = customerFnbOrders.filter(
    (o: any) =>
      o.orderType === 'ON_SITE' ||
      o.orderType === 'SESSION' ||
      o.orderType === 'EXTRA' ||
      (!o.orderType && o.sessionId)
  );

  const preorderFnbPaid =
    booking.status !== 'PENDING' &&
    booking.status !== 'CANCELLED' &&
    !booking.payment_components?.some(
      (c: any) =>
        (c.type === 'FNB_PREORDER' || c.type === 'FB_PREORDER') &&
        c.status === 'PENDING'
    );

  const onsiteFnbPaid =
    onsiteFnbOrders.length > 0 &&
    (booking.status === 'COMPLETED' ||
      session?.status === 'COMPLETED' ||
      !booking.payment_components?.some(
        (c: any) =>
          (c.type === 'FNB_ON_SITE' || c.type === 'FNB_PREORDER' || c.type === 'FB_PREORDER') &&
          c.status === 'PENDING'
      ));

  // Quyết toán cuối phiên (Counter Bill & Reconciliation)
  const onsiteComponents = booking.payment_components?.filter((c: any) =>
    !['SLOT_FEE', 'RENTAL_FEE', 'SECURITY_DEPOSIT'].includes(c.type) &&
    !((c.type === 'FNB_PREORDER' || c.type === 'FB_PREORDER') && (c.status === 'HELD' || c.status === 'REFUNDED'))
  ) || [];

  const damageComponent = onsiteComponents.find((c: any) => c.type === 'DAMAGE_CHARGE');
  const damageCharge = Number(damageComponent?.amount ?? 0);

  const approvedExtensions = sessionDetail?.approvedExtensions ?? [];
  const totalMinutes = approvedExtensions.reduce((sum: number, ext: any) => sum + Number(ext.extraMinutes), 0);
  const totalFee = approvedExtensions.reduce((sum: number, ext: any) => sum + Number(ext.additionalFee), 0);

  const initialEnd = booking?.slotEnd ? new Date(new Date(booking.slotEnd).getTime() - totalMinutes * 60_000) : null;
  const auditRows = approvedExtensions.reduce((rows: any[], extension: any) => {
    const precedingEnd = rows.length > 0 ? rows[rows.length - 1].nextEnd : initialEnd;
    const previousEnd = precedingEnd && !isNaN(precedingEnd.getTime()) ? new Date(precedingEnd) : null;
    const nextEnd = previousEnd ? new Date(previousEnd.getTime() + Number(extension.extraMinutes) * 60_000) : null;
    return [...rows, { extension, previousEnd, nextEnd }];
  }, []);

  // Additional items list for in-depth breakdown
  const onsiteFnbTotal = onsiteFnbOrders.reduce((sum: number, o: any) => sum + Number(o.totalAmount || 0), 0);
  const onsiteFnbComponent = onsiteComponents.find(
    (c: any) => c.type === 'FNB_ON_SITE' || c.type === 'FB_PREORDER' || c.type === 'FNB_PREORDER'
  );
  const fnbOnsiteAmount = onsiteFnbComponent ? Number(onsiteFnbComponent.amount) : onsiteFnbTotal;
  const isFnbOnsitePaid = onsiteFnbComponent ? onsiteFnbComponent.status !== 'PENDING' : onsiteFnbPaid;
  const allOnsiteItems = onsiteFnbOrders.flatMap((o: any) => o.items || []);

  const extensionComponent = onsiteComponents.find((c: any) => c.type === 'EXTENSION_FEE');
  const extAmount = extensionComponent ? Number(extensionComponent.amount) : totalFee;
  const isExtPaid = extensionComponent ? extensionComponent.status !== 'PENDING' : false;
  const minsExtended = totalMinutes || sessionDetail?.extensionProposal?.extraMinutes || session?.approvedExtensionMinutes;

  const dmgAmount = damageComponent ? Number(damageComponent.amount) : damageCharge;
  const isDmgPaid = damageComponent ? damageComponent.status !== 'PENDING' : false;

  const additionalLines: any[] = [];
  if (fnbOnsiteAmount > 0) {
    additionalLines.push({
      id: 'fnb_onsite',
      type: 'FNB_ON_SITE',
      label: 'Đồ ăn & Thức uống gọi tại quầy',
      amount: fnbOnsiteAmount,
      isPaid: isFnbOnsitePaid,
      items: allOnsiteItems,
    });
  }
  if (extAmount > 0) {
    additionalLines.push({
      id: 'extension',
      type: 'EXTENSION_FEE',
      label: minsExtended ? `Phí gia hạn ca chơi (+${minsExtended} phút)` : 'Phí gia hạn ca chơi',
      amount: extAmount,
      isPaid: isExtPaid,
    });
  }
  if (dmgAmount > 0) {
    additionalLines.push({
      id: 'damage',
      type: 'DAMAGE_CHARGE',
      label: 'Phí bồi thường hư hỏng xe',
      amount: dmgAmount,
      isPaid: isDmgPaid,
      items: damageLineItems,
    });
  }

  // Any other uncategorized onsite components
  onsiteComponents.forEach((c: any) => {
    if (!['FNB_ON_SITE', 'FB_PREORDER', 'FNB_PREORDER', 'EXTENSION_FEE', 'DAMAGE_CHARGE'].includes(c.type)) {
      additionalLines.push({
        id: c.id || String(Math.random()),
        type: c.type,
        label: c.label || 'Khoản phát sinh khác',
        amount: Number(c.amount),
        isPaid: c.status !== 'PENDING',
      });
    }
  });

  const additionalTotal = additionalLines.reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);
  const additionalOutstandingAmount = additionalLines
    .filter((l: any) => !l.isPaid)
    .reduce((sum: number, l: any) => sum + Number(l.amount || 0), 0);

  const prepaidPaidAmount = booking.status !== 'PENDING' ? totalPrepaid : 0;
  const totalPaidAmount = prepaidPaidAmount + Math.max(0, additionalTotal - additionalOutstandingAmount);
  const isPaid = !booking.payment_components?.some((c: any) => c.status === 'PENDING') && additionalOutstandingAmount === 0;

  const transactions = booking.payment_transactions ?? [];
  const gatewayLabel = (gateway?: string | null) => {
    if (!gateway) return 'Online';
    const gw = String(gateway).toUpperCase();
    if (gw === 'DIRECT') return 'Tiền mặt tại quầy';
    if (gw === 'BANK_TRANSFER' || gw === 'VIETQR') return 'VietQR';
    if (gw === 'VNPAY') return 'VNPay Online';
    if (gw === 'MOCK') return 'DEV Mock';
    if (gw === 'PACKAGE') return 'Gói hội viên';
    return gateway;
  };

  const prepaidTx = transactions.find(
    (t: any) => t.type === 'PAYMENT' && t.gateway !== 'DIRECT' && (t.status === 'SUCCESS' || t.status === 'COMPLETED' || t.status === 'PAID')
  );
  const counterTx = transactions.find(
    (t: any) => t.type === 'PAYMENT' && t.gateway === 'DIRECT' && (t.status === 'SUCCESS' || t.status === 'COMPLETED' || t.status === 'PAID')
  );
  const successfulPrepaidTxs = transactions.filter(
    (t: any) => t.type === 'PAYMENT' && t.gateway !== 'DIRECT' && (t.status === 'SUCCESS' || t.status === 'COMPLETED' || t.status === 'PAID')
  );
  const additionalPrepaidTx = successfulPrepaidTxs.length > 1 ? successfulPrepaidTxs[successfulPrepaidTxs.length - 1] : undefined;

  return (
    <SafeAreaView className="flex-grow flex-1 bg-[#f8fafc] dark:bg-[#0b0f19]" edges={['top', 'left', 'right']}>
      {/* Background lights */}
      <View className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-[#f97316]/5 blur-3xl pointer-events-none opacity-30 dark:opacity-100" />
      <View className="absolute bottom-10 -left-20 w-80 h-80 rounded-full bg-[#6366f1]/5 blur-3xl pointer-events-none opacity-30 dark:opacity-100" />

      {/* Header */}
      <View className="px-5 pt-3 pb-4 flex-row items-center justify-between border-b border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0b0f19]">
        <Pressable
          className="size-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 justify-center items-center active:bg-slate-100 dark:active:bg-slate-800"
          onPress={handleBack}
        >
          <ArrowLeft color={colorScheme === 'dark' ? '#ffffff' : '#475569'} size={18} />
        </Pressable>
        <Text className="text-slate-900 dark:text-white text-base" weight="700">Chi tiết đặt sân</Text>
        <View className="size-9" />
      </View>

      <ScrollView
        ref={mainScrollRef}
        contentContainerClassName="px-5 py-5 pb-12"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadBookingDetail}
            colors={['#ea580c']}
            tintColor={colorScheme === 'dark' ? '#ffffff' : '#ea580c'}
          />
        }
      >

        {/* Mã QR Code Check-in — dùng endpoint BE /bookings/:id/qr (Hiển thị ở tất cả các bước/trạng thái) */}
        <View className="items-center mb-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-6 shadow-xl">
          <View className="bg-white p-3 rounded-2xl shadow-lg mb-4">
            <Image
              source={{
                uri: `${process.env.EXPO_PUBLIC_API_URL}/bookings/${bookingId}/qr`,
                headers: { 'Cache-Control': 'no-cache' },
              }}
              className="size-48 rounded-xl"
              onError={() => console.warn('[BookingQR] QR image load failed for', bookingId)}
            />
          </View>
          <Text className="text-slate-500 dark:text-slate-400 text-xs font-bold tracking-widest uppercase">Mã check-in của bạn</Text>
          <Text className="text-slate-900 dark:text-white text-xl font-mono mt-1" weight="700">
            {bookingId.slice(0, 8).toUpperCase()}
          </Text>
          <Text className="text-slate-500 dark:text-slate-400 text-[11px] text-center font-medium mt-2 leading-4">
            {isByoc
              ? ['ACTIVE', 'EXTENDING', 'CHECKING_OUT', 'COMPLETED'].includes(session?.status ?? '')
                ? 'Mã đặt sân của bạn. Bạn đang trong ca chơi xe cá nhân tại sân.'
                : 'Đưa mã QR này cho nhân viên tại quầy để check-in vào sân và xác nhận xe cá nhân của bạn.'
              : ['ACTIVE', 'EXTENDING', 'CHECKING_OUT', 'COMPLETED'].includes(session?.status ?? '')
                ? 'Mã đặt sân của bạn. Bạn đang trong ca chạy xe thuê tại sân.'
                : 'Đưa mã QR này cho nhân viên tại quầy để check-in nhận làn đua và nhận xe thuê của bạn.'}
          </Text>
        </View>

        {checkInExpired ? (
          <View className="mb-6 flex-row items-start gap-3 rounded-2xl border border-slate-500/20 bg-slate-500/10 p-4">
            <AlertCircle color="#94a3b8" size={20} style={{ marginTop: 2 }} />
            <View className="flex-1">
              <Text className="text-[14px] text-slate-700 dark:text-slate-200" weight="700">Đơn đã quá giờ check-in</Text>
              <Text className="mt-1 text-[12px] leading-4 text-slate-500">
                Bạn đã quá thời hạn check-in 30 phút. Đơn được xem là không đến và không thể mở phiên chơi.
              </Text>
            </View>
          </View>
        ) : null}

        {(operationalTiming.state === 'DUE_FOR_CHECKOUT' || operationalTiming.state === 'OVERDUE') ? (
          <View
            className={`mb-6 flex-row items-start gap-3 rounded-2xl border p-4 ${
              operationalTiming.state === 'OVERDUE'
                ? 'border-red-500/30 bg-red-500/10'
                : 'border-amber-500/30 bg-amber-500/10'
            }`}
          >
            <AlertTriangle
              color={operationalTiming.state === 'OVERDUE' ? '#ef4444' : '#d97706'}
              size={20}
              style={{ marginTop: 2 }}
            />
            <View className="flex-1">
              <Text
                className={`text-[14px] ${operationalTiming.state === 'OVERDUE' ? 'text-red-500' : 'text-amber-600'}`}
                weight="700"
              >
                {operationalTiming.state === 'OVERDUE'
                  ? `Phiên đã quá giờ ${operationalTiming.minutesPastPlannedEnd} phút`
                  : isByoc
                    ? 'Đã hết giờ chơi'
                    : 'Đã đến giờ trả xe'}
              </Text>
              <Text className="mt-1 text-[12px] leading-4 text-slate-500">
                {isByoc
                  ? 'Vui lòng liên hệ quầy để nhân viên hoàn tất phiên chơi.'
                  : 'Vui lòng trả xe tại quầy để nhân viên kiểm tra và hoàn tất phiên. Xe vẫn được giữ trong phiên đến khi checkout xong.'}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Trạng thái / Cảnh báo thanh toán */}
        {booking.status === 'PENDING' && (
          <View className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 shadow-lg">
            <View className="flex-row items-start gap-3">
              <AlertTriangle color="#f59e0b" size={20} style={{ marginTop: 2 }} />
              <View className="flex-1">
                <Text className="text-amber-500 text-[14px]" weight="700">
                  Đơn đặt sân chưa thanh toán
                </Text>
                <Text className="text-slate-500 dark:text-slate-400 text-xs leading-4 mt-1 font-semibold">
                  Lượt đặt của bạn sẽ bị hủy nếu không thanh toán trước thời hạn. Vui lòng chọn phương thức để thanh toán ngay.
                </Text>
              </View>
            </View>

            <View className="flex-row gap-2 mt-3.5">
              <Pressable
                className="flex-1 h-9 flex-row items-center justify-center rounded-xl bg-slate-900 dark:bg-slate-800 border border-slate-700 active:bg-slate-800 gap-1.5 shadow-sm"
                onPress={() => handlePayment('vnpay')}
                disabled={submittingPayment}
              >
                <CreditCard color="#ffffff" size={13} />
                <Text className="text-white text-[11px] font-bold">Thanh toán VNPay</Text>
              </Pressable>

              <Pressable
                className="flex-1 h-9 flex-row items-center justify-center rounded-xl bg-[#ea580c] active:bg-[#f97316] gap-1.5 shadow-md"
                onPress={() => handlePayment('bank_transfer')}
                disabled={submittingPayment}
              >
                {submittingPayment ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <>
                    <Building2 color="#ffffff" size={13} />
                    <Text className="text-white text-[11px] font-bold">Chuyển khoản VietQR</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {isByoc ? (
          sessionDetail?.status === 'CHECKING_OUT' ? (
            <View className="mb-6 rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/70 dark:bg-blue-950/20 p-4 shadow-sm">
              <View className="flex-row items-start gap-3">
                <Clock color="#3b82f6" size={20} style={{ marginTop: 2 }} />
                <View className="flex-1">
                  <Text className="text-blue-800 dark:text-blue-300 text-[14px]" weight="700">
                    Đang hoàn tất phiên chơi
                  </Text>
                  <Text className="mt-1 text-xs leading-4 text-slate-700 dark:text-slate-300 font-semibold">
                    Nhân viên đang đối soát dịch vụ và kết thúc phiên chơi ca tự mang xe của bạn.
                  </Text>
                </View>
              </View>
            </View>
          ) : null
        ) : (checkOutInspection || sessionDetail?.status === 'CHECKING_OUT') ? (
          <View className="mb-6 rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/70 dark:bg-emerald-950/20 p-4 shadow-sm">
            <View className="flex-row items-start gap-3">
              <ClipboardCheck color="#10b981" size={20} style={{ marginTop: 2 }} />
              <View className="flex-1">
                <Text className="text-emerald-800 dark:text-emerald-300 text-[14px]" weight="700">
                  {checkOutInspection ? 'Biên bản bàn giao trả xe' : 'Nhân viên đang kiểm tra xe'}
                </Text>
                <Text className="mt-1 text-xs leading-4 text-slate-700 dark:text-slate-300 font-semibold">
                  {checkOutInspection
                    ? 'Nhân viên trực ca đã hoàn tất kiểm tra và cập nhật ảnh hiện trạng xe. Bạn có thể xem đối chiếu chi tiết bên dưới.'
                    : 'Nhân viên đang kiểm tra kỹ thuật và chụp ảnh hiện trạng xe trả tại quầy.'}
                </Text>
              </View>
            </View>
            <Pressable
              className="mt-3 h-10 flex-row items-center justify-center rounded-xl bg-emerald-600 active:bg-emerald-700 gap-1.5 shadow-md"
              onPress={() => handleScrollToInspection('CHECK_OUT')}
            >
              <ClipboardCheck color="#ffffff" size={15} />
              <Text className="text-white text-xs font-bold">
                Xem biên bản bàn giao xe
              </Text>
            </Pressable>
          </View>
        ) : null}

        {pendingExtension ? (
          <View className="mb-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 shadow-lg">
            <View className="flex-row items-start gap-3">
              <Clock color="#34d399" size={20} style={{ marginTop: 2 }} />
              <View className="flex-1">
                <Text className="text-emerald-300 text-[14px]" weight="700">
                  Nhân viên đề xuất gia hạn +{pendingExtension.extraMinutes} phút
                </Text>
                <Text className="mt-1 text-xs leading-4 text-slate-700 dark:text-slate-300 font-semibold">
                  Phí phát sinh {Number(pendingExtension.additionalFee || 0).toLocaleString('vi-VN')}đ. Bạn cần phản hồi để staff cập nhật giờ chơi.
                </Text>
              </View>
            </View>
            <Pressable
              className="mt-3 h-10 flex-row items-center justify-center rounded-xl bg-emerald-600 active:bg-emerald-500 gap-1.5 shadow-md"
              onPress={handleOpenExtensionResponse}
            >
              <CheckCircle2 color="#ffffff" size={15} />
              <Text className="text-white text-xs font-bold">
                Xem yêu cầu gia hạn
              </Text>
            </Pressable>
          </View>
        ) : null}

        {canShowReviewPrompt ? (
          <View className="mb-6 rounded-2xl border border-[#fde68a] dark:border-[#451a03]/50 bg-[#fffbeb] dark:bg-[#1c1912] p-4 shadow-sm">
            <View className="flex-row items-start gap-3">
              <Star color="#d97706" fill="#d97706" size={20} style={{ marginTop: 2 }} />
              <View className="flex-1">
                <Text className="text-amber-900 dark:text-amber-200 text-[14px]" weight="700">
                  Đánh giá trải nghiệm sau phiên
                </Text>
                <Text className="mt-1 text-xs leading-4 text-amber-800/80 dark:text-amber-300/80 font-semibold">
                  Gửi đánh giá về sân, xe và nhân viên sau khi hoàn tất phiên chơi (trong vòng 5 ngày).
                </Text>
              </View>
            </View>
            <Pressable
              className="mt-3 h-10 flex-row items-center justify-center rounded-xl bg-[#d97706] active:bg-[#b45309] gap-1.5 shadow-sm"
              onPress={handleOpenReview}
            >
              <Star color="#ffffff" fill="#ffffff" size={15} />
              <Text className="text-white text-xs font-bold">
                Đánh giá ngay
              </Text>
            </Pressable>
          </View>
        ) : null}

        {hasReviewed ? (
          <View className="mb-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-4 shadow-sm">
            <View className="flex-row items-start gap-3">
              <Star color="#eab308" fill="#eab308" size={20} style={{ marginTop: 2 }} />
              <View className="flex-1">
                <Text className="text-slate-900 dark:text-white text-[14px]" weight="700">
                  Đánh giá của bạn
                </Text>
                <View className="flex-row items-center gap-1 mt-1">
                  <View className="flex-row items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        color="#eab308"
                        fill={i < booking.review.overallScore ? '#eab308' : 'transparent'}
                        size={13}
                      />
                    ))}
                  </View>
                  <Text className="ml-1 text-xs text-slate-500 font-bold">
                    {booking.review.overallScore}/5 sao
                  </Text>
                </View>
                {booking.review.note ? (
                  <Text className="mt-2 text-xs leading-4 text-slate-600 dark:text-slate-300 font-medium">
                    {`"${booking.review.note}"`}
                  </Text>
                ) : (
                  <Text className="mt-2 text-xs leading-4 text-slate-400 italic">
                    Bạn không để lại bình luận.
                  </Text>
                )}
              </View>
            </View>
          </View>
        ) : null}
        <View className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-5 shadow-xl mb-6">
          <Text className="text-[12px] font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-4">
            Tiến trình lượt chơi
          </Text>

          <View className="space-y-4">
            {!session || session.status === 'CHECKED_IN' ? (
              // ─── HÌNH 1: CHƯA CHECK-IN HOẶC ĐANG CHECK-IN (3 BƯỚC) ───
              <>
                {/* Bước 1: Đặt thành công */}
                <View className="flex-row gap-3">
                  <View className="items-center">
                    <View className="size-6 rounded-full bg-emerald-500 border border-emerald-400 justify-center items-center">
                      <CheckCircle2 color="#ffffff" size={13} />
                    </View>
                    <View className={cn("w-[1.5px] h-8 mt-1", session?.status === 'CHECKED_IN' ? "bg-amber-500/50" : "bg-emerald-500/50")} />
                  </View>
                  <View className="flex-1 pt-0.5">
                    <Text className="text-slate-900 dark:text-white text-sm" weight="700">Đặt thành công</Text>
                    <Text className="text-slate-500 dark:text-slate-400 text-xs mt-0.5 font-semibold">
                      {formatDateTimeStep(booking.createdAt)}
                    </Text>
                  </View>
                </View>

                {/* Bước 2: Chờ check-in HOẶC Đang check-in */}
                {session?.status === 'CHECKED_IN' ? (
                  <View className="flex-row gap-3">
                    <View className="items-center">
                      <View className="size-6 rounded-full bg-amber-500/10 border border-amber-500/40 justify-center items-center">
                        <Clock color="#f59e0b" size={13} />
                      </View>
                      <View className="w-[1.5px] h-8 bg-slate-200 dark:bg-slate-800 mt-1" />
                    </View>
                    <View className="flex-1 pt-0.5">
                      <Text className="text-amber-600 dark:text-amber-400 text-sm" weight="700">Đang check-in</Text>
                      <Text className="text-slate-500 dark:text-slate-400 text-xs mt-0.5 font-semibold">
                        {booking.play_mode === 'BYOC' || booking.playMode === 'BYOC'
                          ? (sessionDetail?.staffName
                              ? `Nhân viên ${sessionDetail.staffName} đang kiểm tra & chụp ảnh xe cá nhân`
                              : 'Nhân viên đang kiểm tra & chụp ảnh xe cá nhân')
                          : (sessionDetail?.staffName
                              ? `Nhân viên ${sessionDetail.staffName} đang kiểm tra tình trạng xe bàn giao`
                              : 'Nhân viên đang kiểm tra tình trạng xe bàn giao')}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View className="flex-row gap-3">
                    <View className="items-center">
                      <View className="size-6 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 justify-center items-center">
                        <Clock color={colorScheme === 'dark' ? '#94a3b8' : '#64748b'} size={13} />
                      </View>
                      <View className="w-[1.5px] h-8 bg-slate-200 dark:bg-slate-800 mt-1" />
                    </View>
                    <View className="flex-1 pt-0.5">
                      <Text className="text-slate-900 dark:text-white text-sm" weight="700">Chờ check-in</Text>
                      <Text className="text-slate-500 dark:text-slate-400 text-xs mt-0.5 font-semibold">
                        Dự kiến: {formatTimeOnlyStep(booking.slotStart)} - {formatTimeOnlyStep(booking.slotEnd)}, {formatDateOnlyStep(booking.slotStart)}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Bước 3: Hoàn thành */}
                <View className="flex-row gap-3">
                  <View className="items-center">
                    <View className="size-6 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 justify-center items-center">
                      <Calendar color={colorScheme === 'dark' ? '#94a3b8' : '#64748b'} size={13} />
                    </View>
                  </View>
                  <View className="flex-1 pt-0.5">
                    <Text className="text-slate-900 dark:text-white text-sm" weight="700">Hoàn thành</Text>
                    <Text className="text-slate-550 dark:text-slate-400 text-xs mt-0.5 font-semibold">
                      Sau khi check-out hoàn tất
                    </Text>
                  </View>
                </View>
              </>
            ) : (
              // ─── HÌNH 2: ĐÃ CHECK-IN (4 BƯỚC) ───
              <>
                {/* Bước 1: Đặt thành công */}
                <View className="flex-row gap-3">
                  <View className="items-center">
                    <View className="size-6 rounded-full bg-emerald-500 border border-emerald-400 justify-center items-center">
                      <CheckCircle2 color="#ffffff" size={13} />
                    </View>
                    <View className="w-[1.5px] h-8 bg-emerald-500/50 mt-1" />
                  </View>
                  <View className="flex-1 pt-0.5">
                    <Text className="text-slate-900 dark:text-white text-sm" weight="700">Đặt thành công</Text>
                    <Text className="text-slate-500 dark:text-slate-400 text-xs mt-0.5 font-semibold">
                      {formatDateTimeStep(booking.createdAt)}
                    </Text>
                  </View>
                </View>

                {/* Bước 2: Đã check-in */}
                <View className="flex-row gap-3">
                  <View className="items-center">
                    <View className="size-6 rounded-full bg-emerald-500 border border-emerald-400 justify-center items-center">
                      <CheckCircle2 color="#ffffff" size={13} />
                    </View>
                    <View className="w-[1.5px] h-8 bg-emerald-500/50 mt-1" />
                  </View>
                  <View className="flex-1 pt-0.5">
                    <Text className="text-slate-900 dark:text-white text-sm" weight="700">Đã check-in</Text>
                    <Text className="text-slate-550 dark:text-slate-400 text-xs mt-0.5 font-semibold">
                      Bắt đầu lúc {formatTimeOnlyStep(session.actualStartAt)} · NV: {sessionDetail?.staffName || 'Nhân viên trực ca'}
                    </Text>
                  </View>
                </View>

                {/* Bước 3: Đã kết thúc phiên chơi / Đang hoàn tất checkout / Đang hoạt động */}
                {session.status === 'COMPLETED' || booking.status === 'COMPLETED' ? (
                  <View className="flex-row gap-3">
                    <View className="items-center">
                      <View className="size-6 rounded-full bg-emerald-500 border border-emerald-400 justify-center items-center">
                        <CheckCircle2 color="#ffffff" size={13} />
                      </View>
                      <View className="w-[1.5px] h-8 bg-emerald-500/50 mt-1" />
                    </View>
                    <View className="flex-1 pt-0.5">
                      <Text className="text-slate-900 dark:text-white text-sm" weight="700">Đã kết thúc phiên chơi</Text>
                      <Text className="text-slate-550 dark:text-slate-400 text-xs mt-0.5 font-semibold">
                        Kết thúc lúc {formatTimeOnlyStep(session.actualEndAt || new Date())}
                      </Text>
                    </View>
                  </View>
                ) : session.status === 'CHECKING_OUT' ? (
                  <View className="flex-row gap-3">
                    <View className="items-center">
                      <View className="size-6 rounded-full bg-orange-500 border border-orange-400 justify-center items-center">
                        <Clock color="#ffffff" size={13} />
                      </View>
                      <View className="w-[1.5px] h-8 bg-orange-500/50 mt-1" />
                    </View>
                    <View className="flex-1 pt-0.5">
                      <Text className="text-slate-900 dark:text-white text-sm" weight="700">Đang hoàn tất checkout</Text>
                      <Text className="text-slate-550 dark:text-slate-400 text-xs mt-0.5 font-semibold">
                        Nhân viên đang kiểm tra tình trạng xe trả
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View className="flex-row gap-3">
                    <View className="items-center">
                      <View className="size-6 rounded-full bg-orange-500 border border-orange-400 justify-center items-center">
                        <Clock color="#ffffff" size={13} />
                      </View>
                      <View className="w-[1.5px] h-8 bg-orange-500/50 mt-1" />
                    </View>
                    <View className="flex-1 pt-0.5">
                      <Text className="text-slate-900 dark:text-white text-sm" weight="700">Đang hoạt động</Text>
                      <Text className="text-slate-550 dark:text-slate-400 text-xs mt-0.5 font-semibold">
                        Dự kiến kết thúc lúc {formatTimeOnlyStep(session.plannedEndAt)}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Bước 4: Hoàn thành */}
                <View className="flex-row gap-3">
                  <View className="items-center">
                    <View className={cn(
                      "size-6 rounded-full justify-center items-center border",
                      booking.status === 'COMPLETED'
                        ? "bg-emerald-500 border-emerald-400"
                        : "bg-slate-100 dark:bg-slate-900 border-slate-300 dark:border-slate-800"
                    )}>
                      {booking.status === 'COMPLETED' ? (
                        <CheckCircle2 color="#ffffff" size={13} />
                      ) : (
                        <Calendar color={colorScheme === 'dark' ? '#94a3b8' : '#64748b'} size={13} />
                      )}
                    </View>
                  </View>
                  <View className="flex-1 pt-0.5">
                    <Text className="text-slate-900 dark:text-white text-sm" weight="700">Hoàn thành</Text>
                    <Text className="text-slate-550 dark:text-slate-400 text-xs mt-0.5 font-semibold">
                      {booking.status === 'COMPLETED' && session.actualEndAt
                        ? formatDateTimeStep(session.actualEndAt)
                        : "Sau khi check-out hoàn tất"}
                    </Text>
                  </View>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Thông tin Chi nhánh */}
        <View className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-5 shadow-xl mb-6">
          <View className="flex-row items-center gap-2 mb-3.5 border-b border-slate-200 dark:border-slate-800/80 pb-2">
            <MapPin color="#f97316" size={16} />
            <Text className="text-[12px] font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Chi nhánh & Làn đua
            </Text>
          </View>
          <Text className="text-slate-900 dark:text-white text-[15px]" weight="600">{booking.cafe?.name ?? 'RCField Branch'}</Text>
          <Text className="text-slate-500 dark:text-slate-400 text-xs leading-4 font-semibold mt-1">{booking.cafe?.address ?? 'Địa chỉ chi nhánh chưa được cấu hình.'}</Text>
        </View>

        {/* Thông tin Lượt đua */}
        <View className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-5 shadow-xl mb-6">
          <View className="flex-row items-center gap-2 mb-3.5 border-b border-slate-200 dark:border-slate-800/80 pb-2">
            <Calendar color="#f97316" size={16} />
            <Text className="text-[12px] font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Thông tin chi tiết lịch chạy
            </Text>
          </View>
          <View className="space-y-2.5">
            <View className="flex-row justify-between">
              <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold">Ngày chơi</Text>
              <Text className="text-slate-900 dark:text-white text-xs font-bold">{dateLabel}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold">Khung giờ</Text>
              <Text className="text-slate-900 dark:text-white text-xs font-bold">{timeLabel}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold">Chế độ chơi</Text>
              <Text className="text-slate-900 dark:text-white text-xs font-bold">
                {booking.playMode === 'RENTAL' ? 'Thuê xe của chi nhánh' : 'Mang xe riêng (BYOC)'}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold">Số lượng người chơi</Text>
              <Text className="text-slate-900 dark:text-white text-xs font-bold">{booking.participants?.length || 1} người</Text>
            </View>
          </View>
        </View>

        {/* Lịch sử gia hạn giờ chơi */}
        {approvedExtensions.length > 0 && (
          <View className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-5 shadow-xl mb-6">
            <View className="flex-row items-start justify-between mb-4 border-b border-slate-200 dark:border-slate-800/80 pb-3">
              <View className="flex-1 flex-row items-center gap-2">
                <Clock color="#f97316" size={16} />
                <Text className="text-[12px] font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Lịch sử gia hạn giờ chơi
                </Text>
              </View>
              <View className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 items-end">
                <Text className="text-[9px] font-black text-emerald-550 dark:text-emerald-400 uppercase tracking-wide">Đã gia hạn</Text>
                <Text className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">+{totalMinutes} phút · {totalFee.toLocaleString('vi-VN')}đ</Text>
              </View>
            </View>

            <View className="space-y-3">
              {auditRows.map(({ extension, previousEnd, nextEnd }: any, index: number) => (
                <View key={extension.proposalId || index} className="rounded-xl border border-slate-100 dark:border-slate-900 bg-slate-50 dark:bg-slate-950/40 p-3.5">
                  <View className="flex-row justify-between items-center">
                    <View className="flex-row items-center gap-1.5">
                      <CheckCircle2 color="#10b981" size={14} />
                      <Text className="text-slate-900 dark:text-white text-xs font-bold">
                        Lần {index + 1}: thêm {extension.extraMinutes} phút
                      </Text>
                    </View>
                    <Text className="text-[#f97316] text-xs font-bold">
                      +{Number(extension.additionalFee).toLocaleString('vi-VN')}đ
                    </Text>
                  </View>
                  <View className="mt-1.5 flex-row flex-wrap gap-x-3 gap-y-1">
                    {previousEnd && nextEnd && (
                      <Text className="text-slate-550 dark:text-slate-400 text-[10px] font-semibold">
                        Khung giờ: {formatTimeOnlyStep(previousEnd)} → {formatTimeOnlyStep(nextEnd)}
                      </Text>
                    )}
                    <Text className="text-slate-550 dark:text-slate-400 text-[10px] font-semibold">
                      Chấp thuận lúc {formatDateTimeStep(extension.approvedAt)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Danh sách người tham gia (Companions) */}
        {booking.participants && booking.participants.length > 0 && (
          <View className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-5 shadow-xl mb-6">
            <View className="flex-row items-center gap-2 mb-3.5 border-b border-slate-200 dark:border-slate-800/80 pb-2">
              <User color="#f97316" size={16} />
              <Text className="text-[12px] font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Danh sách người chơi
              </Text>
            </View>
            <View className="space-y-3">
              {booking.participants.map((p: any, idx: number) => (
                <View key={p.id || idx} className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2.5">
                    <View className="size-7 rounded-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 justify-center items-center">
                      <Text className="text-slate-500 dark:text-slate-400 text-[10px] font-bold">{idx + 1}</Text>
                    </View>
                    <View>
                      <Text className="text-slate-900 dark:text-white text-xs font-bold">
                        {p.resolvedName ?? p.guestName ?? 'Người chơi phụ'}
                      </Text>
                      <Text className="text-slate-500 dark:text-slate-400 text-[10px] font-medium">
                        {p.resolvedPhone ?? p.guestPhone ?? 'Chưa cập nhật SĐT'}
                      </Text>
                    </View>
                  </View>
                  <View className="px-2 py-0.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <Text className="text-slate-500 dark:text-slate-400 text-[9px] font-bold uppercase">
                      {p.userId === booking.customerId ? 'Người đặt' : 'Người đi cùng'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Xe tự mang (BYOC) */}
        {isByoc && (
          <View className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-5 shadow-xl mb-6">
            <View className="flex-row items-center gap-2 mb-3.5 border-b border-slate-200 dark:border-slate-800/80 pb-2">
              <Car color="#f97316" size={16} />
              <Text className="text-[12px] font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Xe tự mang (BYOC)
              </Text>
            </View>
            <View className="bg-slate-50 dark:bg-slate-950/40 p-3.5 rounded-xl border border-slate-200 dark:border-slate-900 gap-2">
              <View className="flex-row items-center justify-between">
                <Text className="text-slate-900 dark:text-white text-xs font-bold">Khách tự mang xe cá nhân</Text>
                <View className="px-2 py-0.5 rounded bg-orange-500/10 border border-orange-500/20">
                  <Text className="text-[9px] font-bold text-orange-600 dark:text-orange-400 uppercase">BYOC</Text>
                </View>
              </View>
              <Text className="text-slate-500 dark:text-slate-400 text-[11px] leading-4">
                Đơn mang xe riêng: Khách hàng tự quản lý và bảo quản xe cá nhân trong suốt ca chơi. Nhân viên chụp ảnh xe lúc vào sân để xác thực lượt chơi.
              </Text>
            </View>
          </View>
        )}

        {/* Danh sách xe thuê (Rental Vehicles) */}
        {!isByoc && booking.vehicles && booking.vehicles.length > 0 && (
          <View className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-5 shadow-xl mb-6">
            <View className="flex-row items-center gap-2 mb-3.5 border-b border-slate-200 dark:border-slate-800/80 pb-2">
              <Car color="#f97316" size={16} />
              <Text className="text-[12px] font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Danh sách xe thuê
              </Text>
            </View>
            <View className="space-y-3">
              {booking.vehicles.map((v: any, idx: number) => (
                <View key={v.id || idx} className="flex-row items-center gap-3 bg-slate-50 dark:bg-slate-950/40 p-2.5 rounded-xl border border-slate-200 dark:border-slate-900">
                  {v.coverImageUrl ? (
                    <Image source={{ uri: v.coverImageUrl }} className="size-11 rounded-lg bg-slate-100 dark:bg-slate-900" />
                  ) : (
                      <View className="size-11 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 justify-center items-center">
                      <Car color="#475569" size={18} />
                    </View>
                  )}
                  <View className="flex-1">
                    <Text className="text-slate-900 dark:text-white text-xs font-bold">{v.catalogName ?? 'Xe đua RC'}</Text>
                    <View className="flex-row items-center gap-2 mt-0.5">
                      <Text className="text-[10px] text-slate-550 dark:text-slate-400 font-semibold font-mono">Bảng số: {v.identifier ?? 'N/A'}</Text>
                      <View className="w-[1px] h-2 bg-slate-200 dark:bg-slate-800" />
                      <Text className="text-[10px] text-slate-550 dark:text-slate-400 font-semibold">Màu: {v.color ?? 'N/A'}</Text>
                    </View>
                  </View>
                  <View className={cn("px-2 py-0.5 rounded border", v.tier === 'PREMIUM' ? 'bg-yellow-500/5 border-yellow-500/10' : 'bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800')}>
                    <Text className={cn("text-[9px] font-bold uppercase", v.tier === 'PREMIUM' ? 'text-yellow-500' : 'text-slate-500 dark:text-slate-400')}>
                      {v.tier ?? 'STANDARD'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Danh sách Đồ ăn & Nước uống (F&B Orders) */}
        {customerFnbOrders.length > 0 && (
          <View className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-5 shadow-xl mb-6">
            <View className="flex-row items-center gap-2.5 mb-3.5 border-b border-slate-200 dark:border-slate-800/80 pb-2.5">
              <View className="size-8 rounded-xl bg-orange-500/10 border border-orange-500/20 justify-center items-center">
                <UtensilsCrossed color="#f97316" size={16} />
              </View>
              <View className="flex-1">
                <Text className="text-[12px] font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Đồ ăn & Thức uống ({customerFnbOrders.flatMap((o: any) => o.items || []).reduce((a: number, b: any) => a + Number(b.quantity || 1), 0)} món)
                </Text>
                <Text className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Chi tiết các món đã đặt trước và gọi thêm tại sân
                </Text>
              </View>
            </View>

            <View className="gap-3.5">
              {/* 1. Đặt trước khi đến sân */}
              {preorderFnbOrders.length > 0 && (
                <View className="rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5 gap-2.5">
                  <View className="flex-row justify-between items-center border-b border-emerald-200/60 dark:border-emerald-800/40 pb-2">
                    <View className="flex-row items-center gap-1.5">
                      <UtensilsCrossed color="#10b981" size={14} />
                      <Text className="text-xs font-bold text-emerald-950 dark:text-emerald-200">
                        Đặt trước khi đến sân
                      </Text>
                    </View>
                    <View className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/60 border border-emerald-300 dark:border-emerald-700">
                      <Text className="text-[9px] font-bold text-emerald-800 dark:text-emerald-300 uppercase">
                        {preorderFnbPaid ? 'Đã thanh toán' : 'Chờ thanh toán'}
                      </Text>
                    </View>
                  </View>

                  <View className="gap-2">
                    {preorderFnbOrders.flatMap((o: any) => o.items || []).map((item: any, idx: number) => (
                      <View key={item.id || idx} className="flex-row justify-between items-start bg-white dark:bg-[#0f172a] p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                        <View className="flex-1 pr-2">
                          <Text className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            {item.itemName ?? 'Món F&B'} {item.variantName ? <Text className="text-slate-500 font-normal text-[11px]">({item.variantName})</Text> : null}
                          </Text>
                          {item.notes ? (
                            <Text className="text-[10px] text-slate-400 italic mt-0.5">Ghi chú: {item.notes}</Text>
                          ) : null}
                        </View>
                        <View className="items-end">
                          <Text className="text-xs font-bold text-slate-900 dark:text-white">
                            {Number(item.subtotal ?? (Number(item.unitPrice || 0) * Number(item.quantity || 1))).toLocaleString('vi-VN')}đ
                          </Text>
                          <Text className="text-[10px] text-slate-400">
                            ×{item.quantity} · {Number(item.unitPrice || 0).toLocaleString('vi-VN')}đ
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* 2. Gọi thêm trong phiên chơi */}
              {onsiteFnbOrders.length > 0 && (
                <View className="rounded-2xl border border-orange-200 dark:border-orange-900/40 bg-orange-50/50 dark:bg-orange-950/20 p-3.5 gap-2.5">
                  <View className="flex-row justify-between items-center border-b border-orange-200/60 dark:border-orange-800/40 pb-2">
                    <View className="flex-row items-center gap-1.5">
                      <Coffee color="#ea580c" size={14} />
                      <Text className="text-xs font-bold text-orange-950 dark:text-orange-200">
                        Gọi thêm trong phiên chơi
                      </Text>
                    </View>
                    <View className="px-2 py-0.5 rounded-md bg-orange-100 dark:bg-orange-900/60 border border-orange-300 dark:border-orange-700">
                      <Text className="text-[9px] font-bold text-orange-800 dark:text-orange-300 uppercase">
                        {onsiteFnbPaid ? 'Đã thanh toán' : 'Chờ thanh toán'}
                      </Text>
                    </View>
                  </View>

                  <View className="gap-2">
                    {onsiteFnbOrders.flatMap((o: any) => o.items || []).map((item: any, idx: number) => (
                      <View key={item.id || idx} className="flex-row justify-between items-start bg-white dark:bg-[#0f172a] p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                        <View className="flex-1 pr-2">
                          <Text className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            {item.itemName ?? 'Món F&B'} {item.variantName ? <Text className="text-slate-500 font-normal text-[11px]">({item.variantName})</Text> : null}
                          </Text>
                          {item.notes ? (
                            <Text className="text-[10px] text-slate-400 italic mt-0.5">Ghi chú: {item.notes}</Text>
                          ) : null}
                        </View>
                        <View className="items-end">
                          <Text className="text-xs font-bold text-orange-600 dark:text-orange-400">
                            +{Number(item.subtotal ?? (Number(item.unitPrice || 0) * Number(item.quantity || 1))).toLocaleString('vi-VN')}đ
                          </Text>
                          <Text className="text-[10px] text-slate-400">
                            ×{item.quantity} · {Number(item.unitPrice || 0).toLocaleString('vi-VN')}đ
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Trình đối chiếu hình ảnh & Biên bản bàn giao Check-in/Check-out */}
        {session && (session.status === 'ACTIVE' || session.status === 'COMPLETED' || session.status === 'CHECKING_OUT') && (
          <View
            onLayout={(e) => setInspectionCardY(e.nativeEvent.layout.y)}
            className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-5 shadow-xl mb-6"
          >
            <View className="flex-row items-center justify-between mb-4 border-b border-slate-200 dark:border-slate-800/80 pb-3">
              <View className="flex-row items-center gap-2.5">
                <View className="size-8 rounded-xl bg-orange-500/10 border border-orange-500/20 justify-center items-center">
                  <Camera color="#f97316" size={16} />
                </View>
                <View>
                  <Text className="text-[12px] font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    {isByoc ? 'Xác nhận xe vào sân (BYOC)' : 'Biên bản & đối chiếu bàn giao xe'}
                  </Text>
                  <Text className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {isByoc
                      ? 'Hình ảnh xe cá nhân & checklist an toàn lúc vào sân'
                      : inspectionPhotoTab === 'CHECK_IN'
                        ? 'Hiện trạng kỹ thuật & ảnh xe lúc nhận ban đầu'
                        : 'Hiện trạng kỹ thuật & ảnh xe lúc trả sau ca chơi'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Segmented Control Tabs */}
            {!isByoc ? (
              <View className="flex-row rounded-xl bg-slate-200/70 dark:bg-slate-800/80 p-1 gap-1 mb-4">
                <Pressable
                  onPress={() => setInspectionPhotoTab('CHECK_IN')}
                  className={cn(
                    "flex-1 py-2 rounded-lg items-center justify-center",
                    inspectionPhotoTab === 'CHECK_IN'
                      ? "bg-white dark:bg-[#0f172a] shadow-xs"
                      : "opacity-75"
                  )}
                >
                  <Text
                    className={cn(
                      "text-[11px] font-bold",
                      inspectionPhotoTab === 'CHECK_IN'
                        ? "text-[#ea580c] dark:text-[#f97316]"
                        : "text-slate-600 dark:text-slate-400"
                    )}
                  >
                    📸 Nhận xe (Check-in)
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setInspectionPhotoTab('CHECK_OUT')}
                  className={cn(
                    "flex-1 py-2 rounded-lg items-center justify-center",
                    inspectionPhotoTab === 'CHECK_OUT'
                      ? "bg-white dark:bg-[#0f172a] shadow-xs"
                      : "opacity-75"
                  )}
                >
                  <Text
                    className={cn(
                      "text-[11px] font-bold",
                      inspectionPhotoTab === 'CHECK_OUT'
                        ? "text-[#ea580c] dark:text-[#f97316]"
                        : "text-slate-600 dark:text-slate-400"
                    )}
                  >
                    🏁 Trả xe (Check-out)
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View className="mb-4 flex-row items-center gap-2">
                <View className="px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20">
                  <Text className="text-[11px] font-bold text-orange-600 dark:text-orange-400">
                    Xe cá nhân vào sân (Check-in)
                  </Text>
                </View>
              </View>
            )}

            {/* Content for TAB 1: CHECK_IN */}
            {inspectionPhotoTab === 'CHECK_IN' ? (
              <View className="gap-4">
                {/* Check-in Staff Notes */}
                {Boolean(checkInStaffNotes) && (
                  <View className="rounded-2xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/70 dark:bg-amber-950/20 p-3.5 flex-row items-start gap-2.5">
                    <FileText color="#d97706" size={16} style={{ marginTop: 2 }} />
                    <View className="flex-1">
                      <Text className="text-amber-950 dark:text-amber-300 text-[11px] font-bold">
                        {isByoc ? 'Ghi chú của nhân viên khi vào sân:' : 'Ghi chú nhận xe của nhân viên (Check-in):'}
                      </Text>
                      <Text className="text-amber-900 dark:text-amber-400 text-xs mt-1 leading-4">
                        {checkInStaffNotes}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Check-in Technical Checklist */}
                {checkInChecklist.length > 0 && (
                  <View className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-4 gap-3">
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-1.5">
                        <ClipboardCheck color="#10b981" size={16} />
                        <Text className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {isByoc ? 'Checklist an toàn xe cá nhân lúc vào sân' : 'Checklist kiểm tra nhận xe (Check-in)'}
                        </Text>
                      </View>
                      <View className="bg-emerald-100 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                        <Text className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                          {
                            checkInChecklist.filter(
                              (c: any) => c.checked !== false && c.status !== 'DAMAGED' && c.status !== 'NOT_OK'
                            ).length
                          }/{checkInChecklist.length} Đạt
                        </Text>
                      </View>
                    </View>
                    <View className="gap-2">
                      {checkInChecklist.map((item: any, idx: number) => {
                        const isOk = item.checked !== false && item.status !== 'DAMAGED' && item.status !== 'NOT_OK';
                        return (
                          <View
                            key={item.itemKey || item.label || idx}
                            className="flex-row items-start justify-between bg-white dark:bg-[#0f172a] p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80"
                          >
                            <View className="flex-1 pr-2">
                              <View className="flex-row items-center gap-2">
                                <View className={cn("size-2 rounded-full", isOk ? "bg-emerald-500" : "bg-red-500")} />
                                <Text className="text-slate-800 dark:text-slate-200 text-xs font-bold">
                                  {item.itemLabel || item.label || item.itemKey}
                                </Text>
                              </View>
                              {item.notes || item.note ? (
                                <Text className="text-slate-500 dark:text-slate-400 text-[11px] mt-1 pl-4">
                                  {item.notes || item.note}
                                </Text>
                              ) : null}
                            </View>
                            <View className="px-2 py-0.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                              <Text className={cn("text-[9px] font-bold", isOk ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>
                                {isOk ? 'Đạt' : 'Cần chú ý'}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Check-in Photos Grid */}
                <View className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 p-3.5 gap-3">
                  <View className="flex-row items-center gap-1.5">
                    <Camera color="#f97316" size={14} />
                    <Text className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {isByoc
                        ? `Hình ảnh xe cá nhân vào sân (${checkInPhotos.length} ảnh)`
                        : `Hình ảnh nhận xe (${checkInPhotos.length} góc chụp)`}
                    </Text>
                  </View>
                  {renderPhotoGrid(checkInPhotos, isByoc ? 'Ảnh xe cá nhân vào sân' : 'Ảnh bàn giao Check-in', 'CHECK_IN')}
                </View>
              </View>
            ) : (
              /* Content for TAB 2: CHECK_OUT */
              <View className="gap-4">
                {checkOutInspection ? (
                  <>
                    {/* Check-out Staff Notes */}
                    {Boolean(checkOutStaffNotes) && (
                      <View className="rounded-2xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/70 dark:bg-amber-950/20 p-3.5 flex-row items-start gap-2.5">
                        <FileText color="#d97706" size={16} style={{ marginTop: 2 }} />
                        <View className="flex-1">
                          <Text className="text-amber-950 dark:text-amber-300 text-[11px] font-bold">
                            Ghi chú trả xe của nhân viên (Check-out):
                          </Text>
                          <Text className="text-amber-900 dark:text-amber-400 text-xs mt-1 leading-4">
                            {checkOutStaffNotes}
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Damage Notes */}
                    {sessionDetail?.damageNotes && (
                      <View className="rounded-2xl bg-red-500/10 border border-red-500/20 p-3.5 flex-row items-start gap-2.5">
                        <AlertTriangle color="#ef4444" size={16} style={{ marginTop: 2 }} />
                        <View className="flex-1">
                          <Text className="text-red-600 dark:text-red-400 text-[11px] font-bold uppercase tracking-wide">
                            Ghi chú hư hại từ nhân viên:
                          </Text>
                          <Text className="text-slate-800 dark:text-slate-200 text-xs font-semibold leading-4 mt-1">
                            {sessionDetail.damageNotes}
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Check-out Technical Checklist */}
                    {checkOutChecklist.length > 0 && (
                      <View className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-4 gap-3">
                        <View className="flex-row items-center justify-between">
                          <View className="flex-row items-center gap-1.5">
                            <ClipboardCheck color="#10b981" size={16} />
                            <Text className="text-xs font-bold text-slate-800 dark:text-slate-200">
                              Checklist kiểm tra trả xe (Check-out)
                            </Text>
                          </View>
                          <View className="bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
                            <Text className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                              {
                                checkOutChecklist.filter(
                                  (c: any) => c.checked !== false && c.status !== 'DAMAGED' && c.status !== 'NOT_OK'
                                ).length
                              }/{checkOutChecklist.length} Đạt
                            </Text>
                          </View>
                        </View>
                        <View className="gap-2">
                          {checkOutChecklist.map((item: any, idx: number) => {
                            const isOk = item.checked !== false && item.status !== 'DAMAGED' && item.status !== 'NOT_OK';
                            return (
                              <View
                                key={item.itemKey || item.label || idx}
                                className="flex-row items-start justify-between bg-white dark:bg-[#0f172a] p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80"
                              >
                                <View className="flex-1 pr-2">
                                  <View className="flex-row items-center gap-2">
                                    <View className={cn("size-2 rounded-full", isOk ? "bg-emerald-500" : "bg-rose-500")} />
                                    <Text className="text-slate-800 dark:text-slate-200 text-xs font-bold">
                                      {item.itemLabel || item.label || item.itemKey}
                                    </Text>
                                  </View>
                                  {item.notes || item.note ? (
                                    <Text className="text-rose-500 dark:text-rose-400 text-[11px] font-medium mt-1 pl-4">
                                      Ghi chú: {item.notes || item.note}
                                    </Text>
                                  ) : null}
                                </View>
                                <View className={cn(
                                  "px-2 py-0.5 rounded border",
                                  isOk ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800" : "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800"
                                )}>
                                  <Text className={cn("text-[9px] font-bold", isOk ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                                    {isOk ? 'Đạt' : 'Cần xử lý'}
                                  </Text>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    )}

                    {/* Check-out Photos Grid */}
                    <View className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 p-3.5 gap-3">
                      <View className="flex-row items-center gap-1.5">
                        <Camera color="#ea580c" size={14} />
                        <Text className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          Hình ảnh đối chiếu trả xe ({checkOutPhotos.length} góc chụp)
                        </Text>
                      </View>
                      {renderPhotoGrid(checkOutPhotos, 'Ảnh bàn giao Check-out', 'CHECK_OUT')}
                    </View>

                    {/* Bảng kê hư hỏng linh kiện nếu có */}
                    {damageLineItems && damageLineItems.length > 0 && (
                      <View className="rounded-2xl border border-rose-200 dark:border-rose-900/30 bg-rose-50/50 dark:bg-rose-950/20 p-4 gap-2.5">
                        <View className="flex-row items-center gap-1.5">
                          <AlertTriangle color="#ef4444" size={14} />
                          <Text className="text-xs font-bold text-rose-900 dark:text-rose-200">
                            Bảng kê chi phí hư hại / thay thế linh kiện
                          </Text>
                        </View>
                        <View className="gap-2">
                          {damageLineItems.map((item: any, idx: number) => {
                            const name = getPartTypeName(item.partType, item.customPartName);
                            const partsPrice = Number(item.partsPrice || 0);
                            const laborPrice = Number(item.laborPrice || 0);
                            const lineTotal = Number(item.subtotal ?? item.lineTotal ?? (partsPrice + laborPrice));
                            return (
                              <View key={item.id || idx} className="flex-row justify-between items-start bg-white dark:bg-[#0f172a] p-2.5 rounded-xl border border-rose-100 dark:border-rose-900/40">
                                <View className="flex-1 pr-2">
                                  <Text className="text-xs font-bold text-slate-900 dark:text-slate-100">{name}</Text>
                                  <Text className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5">
                                    Linh kiện: {partsPrice.toLocaleString('vi-VN')}đ · Công: {laborPrice.toLocaleString('vi-VN')}đ
                                  </Text>
                                </View>
                                <Text className="text-xs font-bold text-rose-600 dark:text-rose-400">
                                  {lineTotal.toLocaleString('vi-VN')}đ
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    )}
                  </>
                ) : (
                  /* Waiting for Check-out State */
                  <View className="py-10 px-4 rounded-2xl bg-slate-50/70 dark:bg-slate-900/30 border border-dashed border-slate-200 dark:border-slate-800 justify-center items-center gap-2.5">
                    <View className="size-12 rounded-full bg-slate-200/70 dark:bg-slate-800 items-center justify-center">
                      <Camera color={colorScheme === 'dark' ? '#94a3b8' : '#64748b'} size={22} />
                    </View>
                    <Text className="text-slate-800 dark:text-slate-200 text-xs font-bold text-center">
                      Chưa có biên bản trả xe (Check-out)
                    </Text>
                    <Text className="text-slate-500 dark:text-slate-400 text-[11px] text-center max-w-[260px] leading-4">
                      Khi kết thúc ca chơi, nhân viên tại quầy sẽ kiểm tra tình trạng xe, chụp ảnh 4 góc và lập biên bản bàn giao xe cùng bạn.
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Section: Thanh toán & Quyết toán (Billing & Settlement) */}
        <View className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-5 shadow-xl mb-6">
          <View className="flex-row items-center gap-2 mb-4 border-b border-slate-200 dark:border-slate-800/80 pb-3">
            <CreditCard color="#f97316" size={16} />
            <Text className="text-[12px] font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Thanh toán & Quyết toán
            </Text>
          </View>

          {/* Block 1: Khoản trả trước khi đặt lịch */}
          <View className="space-y-3">
            <View className="flex-row items-center gap-2">
              <CheckCircle2 color={booking.status === 'PENDING' ? '#f59e0b' : '#10b981'} size={15} />
              <Text
                className={`text-xs font-bold uppercase tracking-wide ${
                  booking.status === 'PENDING' ? 'text-amber-500' : 'text-[#10b981]'
                }`}
              >
                {booking.status === 'PENDING'
                  ? 'Chờ thanh toán'
                  : prepaidTx
                    ? `Đã trả qua ${gatewayLabel(prepaidTx.gateway)}`
                    : (booking.selected_package_id || booking.package_id)
                      ? 'Đã trả qua Gói hội viên'
                      : 'Đã thanh toán'}
              </Text>
            </View>

            <View className="pl-5 space-y-2">
              {slotFee > 0 && (
                <View className="flex-row justify-between">
                  <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold">Phí lịch sân</Text>
                  <Text className="text-slate-900 dark:text-white text-xs font-bold">{slotFee.toLocaleString('vi-VN')}đ</Text>
                </View>
              )}
              {rentalFee > 0 && (
                <View className="flex-row justify-between">
                  <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold">Phí thuê xe</Text>
                  <Text className="text-slate-900 dark:text-white text-xs font-bold">{rentalFee.toLocaleString('vi-VN')}đ</Text>
                </View>
              )}
              {fnbPreorderFee > 0 && (
                <View className="flex-row justify-between">
                  <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold">F&B đặt trước</Text>
                  <Text className="text-slate-900 dark:text-white text-xs font-bold">{fnbPreorderFee.toLocaleString('vi-VN')}đ</Text>
                </View>
              )}
              {depositAmount > 0 && (
                <View className="flex-row justify-between">
                  <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold">Tiền cọc an toàn giữ xe</Text>
                  <Text className="text-slate-900 dark:text-white text-xs font-bold">{depositAmount.toLocaleString('vi-VN')}đ</Text>
                </View>
              )}
              {discountAmount > 0 && (
                <View className="flex-row justify-between">
                  <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold">Ưu đãi áp dụng</Text>
                  <Text className="text-emerald-500 text-xs font-bold">-{discountAmount.toLocaleString('vi-VN')}đ</Text>
                </View>
              )}

              {/* Dòng gạch chân và Tổng đã trả trước */}
              <View className="w-full h-[1px] bg-slate-200 dark:bg-slate-800/60 my-1" />
              <View className="flex-row justify-between">
                <Text className="text-slate-700 dark:text-slate-200 text-xs font-bold">
                  {booking.status === 'PENDING' ? 'Tổng cần thanh toán' : 'Đã thanh toán khi đặt lịch'}
                </Text>
                <Text className="text-slate-900 dark:text-white text-xs font-bold">{prepaidPaidAmount.toLocaleString('vi-VN')}đ</Text>
              </View>
            </View>
          </View>

          {/* Block 2: Chi tiết các khoản phát sinh trong ca chơi (In-session Additional Fees) */}
          {(additionalLines.length > 0 || isSessionActive || booking.status === 'COMPLETED' || booking.status === 'AWAITING_PAYMENT') && (
            <View className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800/80 space-y-3">
              <View className="flex-row items-center gap-2">
                <Clock color="#f97316" size={15} />
                <Text className="text-slate-700 dark:text-slate-300 text-xs font-bold uppercase tracking-wide">
                  Chi tiết phí phát sinh tại sân
                </Text>
              </View>

              <View className="pl-5 space-y-3">
                {additionalLines.length > 0 ? (
                  additionalLines.map((line: any) => (
                    <View key={line.id} className="rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800 p-3 gap-2">
                      <View className="flex-row justify-between items-start">
                        <View className="flex-1 pr-2">
                          <Text className="text-slate-800 dark:text-slate-200 text-xs font-bold">{line.label}</Text>
                          <View className="flex-row items-center gap-1.5 mt-0.5">
                            <View className={cn("size-2 rounded-full", line.isPaid ? "bg-emerald-500" : "bg-amber-500")} />
                            <Text className={cn(
                              "text-[10.5px] font-semibold",
                              line.isPaid ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                            )}>
                              {line.isPaid ? "Đã thanh toán" : "Chờ thanh toán"}
                            </Text>
                          </View>
                        </View>
                        <Text className="text-orange-600 dark:text-orange-400 text-xs font-black">
                          +{Number(line.amount).toLocaleString('vi-VN')}đ
                        </Text>
                      </View>

                      {/* Sub-breakdown cho món F&B tại quầy */}
                      {line.type === 'FNB_ON_SITE' && line.items && line.items.length > 0 && (
                        <View className="mt-1 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 gap-1.5">
                          {line.items.map((item: any, idx: number) => (
                            <View key={item.id || idx} className="flex-row justify-between text-[11px]">
                              <Text className="text-slate-600 dark:text-slate-400 text-[11px] flex-1 pr-2">
                                • {item.itemName ?? 'Món'} {item.variantName ? `(${item.variantName})` : ''} <Text className="text-slate-400">×{item.quantity}</Text>
                              </Text>
                              <Text className="text-slate-700 dark:text-slate-300 text-[11px] font-semibold">
                                {Number(item.subtotal ?? (Number(item.unitPrice || 0) * Number(item.quantity || 1))).toLocaleString('vi-VN')}đ
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Sub-breakdown cho phí hư hại linh kiện */}
                      {line.type === 'DAMAGE_CHARGE' && line.items && line.items.length > 0 && (
                        <View className="mt-1 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 gap-1.5">
                          {line.items.map((item: any, idx: number) => {
                            const name = getPartTypeName(item.partType, item.customPartName);
                            const partsPrice = Number(item.partsPrice || 0);
                            const laborPrice = Number(item.laborPrice || 0);
                            const lineTotal = Number(item.subtotal ?? item.lineTotal ?? (partsPrice + laborPrice));
                            return (
                              <View key={item.id || idx} className="flex-row justify-between items-center text-[11px]">
                                <Text className="text-slate-600 dark:text-slate-400 text-[11px] flex-1 pr-2">
                                  • {name} {partsPrice > 0 ? `(Linh kiện: ${partsPrice.toLocaleString('vi-VN')}đ)` : ''}
                                </Text>
                                <Text className="text-rose-600 dark:text-rose-400 text-[11px] font-semibold">
                                  {lineTotal.toLocaleString('vi-VN')}đ
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  ))
                ) : (
                  <Text className="text-slate-400 text-xs italic">
                    Chưa phát sinh phí phụ thu trong phiên chơi.
                  </Text>
                )}

                <View className="w-full h-[1px] bg-slate-200 dark:bg-slate-800/60 my-1" />
                <View className="flex-row justify-between">
                  <Text className="text-slate-700 dark:text-slate-200 text-xs font-bold">Tổng phí phát sinh</Text>
                  <Text className="text-orange-600 dark:text-orange-400 text-xs font-black">
                    +{additionalTotal.toLocaleString('vi-VN')}đ
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Block 3: Tổng đã thanh toán & Quyết toán phát sinh */}
          <View className="w-full h-[1px] bg-slate-200 dark:bg-slate-800/60 my-4" />
          <View className="flex-row justify-between items-center bg-slate-50 dark:bg-slate-900/60 p-3 rounded-2xl border border-slate-200/60 dark:border-slate-800">
            <Text className="text-slate-800 dark:text-slate-200 text-xs font-bold uppercase tracking-wide">Tổng đã thanh toán</Text>
            <Text className="text-slate-950 dark:text-white text-base font-black">
              {totalPaidAmount.toLocaleString('vi-VN')}đ
            </Text>
          </View>

          {/* Action & Alerts cho phí phát sinh chưa trả */}
          {additionalOutstandingAmount > 0 ? (
            <View className="mt-4 gap-3">
              {isCheckoutPending ? (
                <View className="rounded-2xl border border-amber-300 dark:border-amber-800/60 bg-amber-100/90 dark:bg-amber-950/30 p-3.5 flex-row items-start gap-2.5">
                  <AlertTriangle color="#b45309" size={16} style={{ marginTop: 2 }} />
                  <View className="flex-1">
                    <Text className="text-amber-950 dark:text-amber-200 text-xs font-bold">
                      Chờ nhân viên kiểm tra & xác nhận trả xe
                    </Text>
                    <Text className="text-amber-900 dark:text-amber-400 text-[11px] leading-4 mt-0.5">
                      Còn {additionalOutstandingAmount.toLocaleString('vi-VN')}đ phí phát sinh. Vui lòng chờ Nhân viên xác nhận hoàn tất kiểm tra trả xe tại quầy trước khi thanh toán.
                    </Text>
                  </View>
                </View>
              ) : (
                <View className="rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 p-3.5 flex-row items-center gap-2.5">
                  <AlertTriangle color="#f59e0b" size={16} />
                  <Text className="text-amber-800 dark:text-amber-300 text-xs font-semibold flex-1">
                    Còn <Text className="font-bold text-amber-600 dark:text-amber-400">{additionalOutstandingAmount.toLocaleString('vi-VN')}đ</Text> phí phát sinh cần thanh toán.
                  </Text>
                </View>
              )}

              {/* Các nút thanh toán phát sinh */}
              <View className="gap-2 pt-1">
                {/* Nút 1: Quét mã VietQR */}
                <Pressable
                  className={cn(
                    "h-11 flex-row items-center justify-center rounded-2xl gap-2 shadow-sm border",
                    isCheckoutPending
                      ? "bg-amber-100/90 border-amber-300 dark:bg-amber-950/20 dark:border-amber-900/40 opacity-75"
                      : "bg-[#ea580c] active:bg-[#c2410c] border-[#ea580c]"
                  )}
                  onPress={() => handlePaymentAdditional('bank_transfer')}
                  disabled={submittingAdditionalPayment || isCheckoutPending}
                >
                  <QrCode color={isCheckoutPending ? "#b45309" : "#ffffff"} size={16} />
                  <Text className={cn("text-xs font-bold", isCheckoutPending ? "text-amber-950 dark:text-amber-300" : "text-white")}>
                    {isCheckoutPending ? "Quét mã VietQR (Chờ xác nhận trả xe)" : "Quét mã VietQR thanh toán"}
                  </Text>
                </Pressable>

                {/* Nút 2: Thanh toán qua VNPay */}
                <Pressable
                  className={cn(
                    "h-11 flex-row items-center justify-center rounded-2xl gap-2 shadow-sm border",
                    isCheckoutPending
                      ? "bg-amber-100/90 border-amber-300 dark:bg-amber-950/20 dark:border-amber-900/40 opacity-75"
                      : "bg-white dark:bg-slate-900 border-[#ea580c] active:bg-orange-50 dark:active:bg-slate-800"
                  )}
                  onPress={() => handlePaymentAdditional('vnpay')}
                  disabled={submittingAdditionalPayment || isCheckoutPending}
                >
                  {submittingAdditionalPayment ? (
                    <ActivityIndicator color="#ea580c" size="small" />
                  ) : (
                    <>
                      <CreditCard color={isCheckoutPending ? "#b45309" : "#ea580c"} size={16} />
                      <Text className={cn("text-xs font-bold", isCheckoutPending ? "text-amber-950 dark:text-amber-300" : "text-[#ea580c]")}>
                        {isCheckoutPending ? "Thanh toán VNPay (Chờ xác nhận trả xe)" : "Thanh toán qua VNPay"}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          ) : additionalTotal > 0 && isPaid ? (
            <View className="mt-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-3.5 flex-row items-center justify-center gap-2">
              <CheckCircle2 color="#10b981" size={16} />
              <Text className="text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                Đã thanh toán đầy đủ các khoản phát sinh
                {(counterTx || additionalPrepaidTx) ? (
                  <Text className="font-semibold text-[11px] text-[#10b981]">
                    {` · ${gatewayLabel((counterTx ?? additionalPrepaidTx)!.gateway)}`}
                  </Text>
                ) : null}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Nút hủy đặt lịch */}
        {(displayBookingStatus === 'CONFIRMED' || displayBookingStatus === 'PENDING') && (
          <Pressable
            className="w-full h-11 flex-row items-center justify-center rounded-xl border border-red-200 dark:border-red-900/20 bg-red-50 dark:bg-red-950/15 active:bg-red-100 dark:active:bg-red-950/30 gap-2 shadow-sm"
            onPress={() => setCancelModalVisible(true)}
          >
            <RotateCcw color="#ef4444" size={16} />
            <Text className="text-red-500 dark:text-red-400 text-xs font-bold">Hủy đặt lịch chơi</Text>
          </Pressable>
        )}
      </ScrollView>

      <Modal
        animationType="slide"
        transparent={true}
        visible={cancelModalVisible}
        onRequestClose={() => setCancelModalVisible(false)}
      >
        <View className="flex-1 bg-black/60 justify-end">
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
          >
            <View className="bg-white dark:bg-[#0f172a] rounded-t-3xl border-t border-slate-200 dark:border-slate-800 p-6 pb-10 space-y-4">
              <View className="flex-row justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-3">
                <Text className="text-slate-900 dark:text-white text-base" weight="700">Xác nhận hủy đặt lịch</Text>
                <Pressable onPress={() => setCancelModalVisible(false)}>
                  <Text className="text-slate-500 dark:text-slate-400 text-xs font-bold">Đóng</Text>
                </Pressable>
              </View>

              {refundEstimation && (
                <View className="rounded-xl bg-amber-500/5 border border-amber-500/10 p-3 space-y-2 mt-6">
                  <Text className="text-amber-500 text-xs font-bold uppercase tracking-wider">
                    ⚠️ Chính sách hoàn phí chi tiết:
                  </Text>
                  <Text className="text-slate-700 dark:text-slate-300 text-xs leading-4 font-semibold">
                    • {refundEstimation.policyText}{'\n'}
                    • Phí thuê xe & dịch vụ F&B: Hoàn 100%
                  </Text>
                  <View className="w-full h-[1px] bg-slate-200 dark:bg-slate-800/80 my-1" />
                  <View className="flex-row justify-between items-center">
                    <Text className="text-slate-500 dark:text-slate-400 text-xs font-bold">Tổng tiền hoàn dự kiến:</Text>
                    <Text className="text-emerald-400 text-sm font-black">
                      {refundEstimation.totalRefund.toLocaleString('vi-VN')}đ
                    </Text>
                  </View>
                </View>
              )}

              <View className="space-y-1.5 mt-4">
                <Text className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">Nhập lý do hủy đặt lịch</Text>
                <TextInput
                  className="w-full min-h-[70px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-slate-900 dark:text-white text-xs font-medium leading-4 mt-3"
                  multiline={true}
                  placeholder="Nhập lý do hủy lịch chơi của bạn..."
                  placeholderTextColor="#94a3b8"
                  value={cancelReason}
                  onChangeText={setCancelReason}
                />
              </View>

              <Pressable
                className="h-11 flex-row items-center justify-center rounded-xl bg-red-600 active:bg-red-700 gap-2 mt-2 shadow-md"
                onPress={handleCancelBooking}
                disabled={cancelling}
              >
                {cancelling ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <>
                    <RotateCcw color="#ffffff" size={15} />
                    <Text className="text-white text-xs font-bold">Xác nhận hủy đơn</Text>
                  </>
                )}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      <ImageZoomModal
        visible={!!previewPhoto}
        imageUrl={previewPhoto?.url}
        title={previewPhoto?.title}
        onClose={() => setPreviewPhoto(null)}
      />
      <BankTransferModal
        visible={bankTransferModalData !== null}
        bookingId={bankTransferModalData?.bookingId || ''}
        checkout={bankTransferModalData?.checkout || null}
        isAdditionalPayment={bankTransferModalData?.isAdditionalPayment}
        onClose={() => {
          setBankTransferModalData(null);
          loadBookingDetail();
        }}
        onSuccess={() => {
          setBankTransferModalData(null);
          loadBookingDetail();
        }}
      />
    </SafeAreaView>
  );
}
