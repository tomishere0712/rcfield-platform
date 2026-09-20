import { useRouter } from 'expo-router';
import {
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  CalendarClock,
  ClipboardCheck,
  Coffee,
  LogIn,
  Eye,
  PlayCircle,
  QrCode,
  RotateCcw,
  ScanLine,
  type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { staffApi, type TodayBookingItem, type TodayFnbOrderItem } from '@/features/staff/api/staff.api';
import { getBookingIdFromQrPayload } from '@/features/staff/lib/booking-qr';
import { isCheckInWindowExpired } from '@/features/bookings/lib/check-in-window';
import { getStatusLabel } from '@/features/bookings/lib/status-label';
import { useAuthStore } from '@/shared/store/auth-store';
import { wsClient } from '@/shared/lib/websocket';
import { Text } from '@/shared/ui/Text';
import { requestMainTab } from '@/shared/ui/main-tab-events';

function formatTime(iso?: string) {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function shortId(value: string) {
  return value.slice(0, 8).toUpperCase();
}

function getSessionId(booking: TodayBookingItem) {
  const session = booking.sessions?.[0];
  return session?.sessionId ?? session?.id ?? null;
}

export function StaffHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const assignedCafeId = useAuthStore((state) => state.assignedCafeId);

  const [bookings, setBookings] = useState<TodayBookingItem[]>([]);
  const [fnbOrders, setFnbOrders] = useState<TodayFnbOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scanCode, setScanCode] = useState('');
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const scanLockedRef = useRef(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraInstanceKey, setCameraInstanceKey] = useState(0);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [todayBookings, todayFnbOrders] = await Promise.all([
        staffApi.getTodayBookings(),
        staffApi.getFnbOrders(),
      ]);
      setBookings(todayBookings);
      setFnbOrders(todayFnbOrders);
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Không thể tải dữ liệu trực ca.';
      Alert.alert('Lỗi', message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const unsubscribe = wsClient.subscribe((event) => {
      if (['NEW_BOOKING', 'CUSTOMER_PAYMENT_CONFIRMED', 'CUSTOMER_CHECKOUT_CONFIRMED'].includes(event)) {
        loadData(true);
      }
    });
    return unsubscribe;
  }, [loadData]);

  const stats = useMemo(() => {
    const activeSessions = bookings.filter((booking) =>
      booking.sessions?.some((session) =>
        ['ACTIVE', 'EXTENDING', 'CHECKED_IN', 'CHECKING_OUT'].includes(session.status || '')
      )
    ).length;
    const checkInReady = bookings.filter(
      (booking) =>
        booking.status === 'CONFIRMED' &&
        !getSessionId(booking) &&
        !isCheckInWindowExpired(booking.status, booking.slotStart, booking.sessions?.[0])
    ).length;
    const pendingFnb = fnbOrders.filter((order) =>
      order.status === 'PENDING' || order.status === 'CONFIRMED'
    ).length;

    return {
      activeSessions,
      checkInReady,
      pendingFnb,
      totalBookings: bookings.length,
    };
  }, [bookings, fnbOrders]);

  const handleCheckIn = async (booking: TodayBookingItem) => {
    const sessionId = getSessionId(booking);
    if (sessionId) {
      router.push(`/staff/session/${sessionId}` as any);
      return;
    }

    if (booking.status !== 'CONFIRMED') {
      Alert.alert('Không thể check-in', 'Chỉ lịch đã xác nhận mới được bắt đầu check-in.');
      return;
    }

    if (isCheckInWindowExpired(booking.status, booking.slotStart, booking.sessions?.[0])) {
      Alert.alert('Đã quá giờ check-in', 'Khách chỉ có thể check-in trong 30 phút sau giờ bắt đầu.');
      return;
    }

    setCheckingInId(booking.bookingId);
    try {
      const session = await staffApi.checkIn(booking.bookingId);
      const newSessionId = session?.sessionId ?? session?.id;
      Alert.alert('Đã bắt đầu check-in', `Phiên ${shortId(newSessionId || booking.bookingId)} đã được tạo.`);
      await loadData(true);
      if (newSessionId) {
        router.push({
          pathname: '/staff/inspection/[sessionId]',
          params: { sessionId: newSessionId, type: 'CHECK_IN' },
        } as any);
      }
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Không thể bắt đầu check-in.';
      Alert.alert('Lỗi check-in', message);
    } finally {
      setCheckingInId(null);
    }
  };

  const handleBookingCode = async (rawCode: string) => {
    const normalized = rawCode.trim().replace(/^#/, '').toUpperCase();
    if (!normalized) return;

    const matched = bookings.find(
      (booking) =>
        booking.shortCode?.toUpperCase() === normalized ||
        booking.bookingId.toUpperCase() === normalized ||
        shortId(booking.bookingId) === normalized
    );

    if (!matched) {
      const bookingId = getBookingIdFromQrPayload(rawCode);
      if (!bookingId) {
        Alert.alert(
          'Mã không hợp lệ',
          'QR này không phải mã đặt lịch RCField. Hãy quét lại mã trên chi tiết đơn đặt.'
        );
        return;
      }

      try {
        const booking = await staffApi.getBookingForQrCheckIn(bookingId);
        const lookupBooking: TodayBookingItem = {
          bookingId: booking.id,
          shortCode: booking.id.slice(0, 8).toUpperCase(),
          cafeId: '',
          cafeName: '',
          cafeAddress: '',
          trackName: '',
          trackType: '',
          playMode: booking.playMode ?? 'RENTAL',
          source: 'APP',
          status: booking.status,
          slotStart: booking.slotStart,
          slotEnd: booking.slotEnd,
          totalAmount: 0,
          paymentStatus: 'UNPAID',
          plannedParticipants: [],
          plannedVehicles: [],
          sessions: booking.session
            ? [
                {
                  id: booking.session.id,
                  sessionId: booking.session.id,
                  status: booking.session.status,
                  plannedEndAt: booking.session.plannedEndAt,
                },
              ]
            : [],
        };
        await handleCheckIn(lookupBooking);
      } catch (error: any) {
        const message = error?.response?.data?.message;
        Alert.alert(
          'Không thể mở đơn từ QR',
          message || 'Không tìm thấy đơn, hoặc đơn này không thuộc chi nhánh bạn được phân công.'
        );
      }
      return;
    }

    await handleCheckIn(matched);
  };

  const handleScanSubmit = () => {
    void handleBookingCode(scanCode);
  };

  const openQrScanner = async () => {
    const permission = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    if (!permission.granted) {
      Alert.alert(
        'Cần quyền camera',
        'Hãy cấp quyền camera để quét mã QR check-in. Bạn vẫn có thể nhập mã đặt lịch bằng tay.'
      );
      return;
    }
    scanLockedRef.current = false;
    setHasScanned(false);
    setCameraReady(false);
    setCameraError(null);
    setCameraInstanceKey((key) => key + 1);
    setScannerVisible(true);
  };

  const handleQrScanned = ({ data }: { data: string }) => {
    if (scanLockedRef.current || !data) return;
    scanLockedRef.current = true;
    setHasScanned(true);
    setScannerVisible(false);
    setScanCode(data);
    void handleBookingCode(data);
  };

  if (!assignedCafeId) {
    return (
      <SafeAreaView className="flex-1 bg-[#f8fafc] dark:bg-[#0b0f19] px-5" edges={['top', 'left', 'right']}>
        <View className="flex-1 items-center justify-center">
          <View className="mb-4 h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10">
            <QrCode color="#f59e0b" size={28} />
          </View>
          <Text className="text-center text-[17px] text-slate-900 dark:text-white" weight="700">
            Chưa được gán chi nhánh
          </Text>
          <Text className="mt-2 text-center text-[12px] leading-5 text-slate-500 dark:text-slate-400">
            Tài khoản nhân viên cần được chủ sân phân công vào một chi nhánh trước khi trực ca.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#f8fafc] dark:bg-[#0b0f19]" edges={['top', 'left', 'right']}>
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="px-5 py-6 pb-20"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadData(true)}
              tintColor="#f97316"
              colors={['#f97316']}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View className="mb-5 flex-row items-center justify-between">
            <View>
              <Text className="text-[12px] uppercase tracking-wider text-slate-500 dark:text-slate-400" weight="700">
                Nhân viên trực ca
              </Text>
              <Text className="mt-1 text-[22px] text-slate-900 dark:text-white" weight="700">
                {user?.fullName ?? 'Nhân viên'}
              </Text>
            </View>
            <Pressable
              onPress={() => loadData(true)}
              className="h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] active:bg-slate-100 dark:active:bg-slate-900"
            >
              <RotateCcw color="#f97316" size={18} />
            </Pressable>
          </View>

          <View className="mb-5 flex-row flex-wrap gap-3">
            <StatCard label="Lịch hôm nay" value={stats.totalBookings} Icon={CalendarClock} />
            <StatCard label="Sẵn sàng nhận xe" value={stats.checkInReady} Icon={ClipboardCheck} />
            <StatCard label="Đang chạy" value={stats.activeSessions} Icon={PlayCircle} />
            <StatCard label="Đồ ăn chờ" value={stats.pendingFnb} Icon={Coffee} />
          </View>

          <View className="mb-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/70 p-4 shadow-sm">
            <View className="mb-3 flex-row items-center gap-2">
              <QrCode color="#f97316" size={18} />
              <Text className="text-[14px] text-slate-900 dark:text-white" weight="700">
                Nhận xe bằng mã đặt lịch
              </Text>
            </View>
            <View className="flex-row gap-2">
              <TextInput
                value={scanCode}
                onChangeText={setScanCode}
                autoCapitalize="characters"
                placeholder="Nhập mã đặt lịch hoặc mã ca"
                placeholderTextColor="#94a3b8"
                className="h-11 flex-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0b0f19] px-3 text-[13px] text-slate-900 dark:text-white"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Quét mã QR nhận xe"
                onPress={openQrScanner}
                className="h-11 w-11 items-center justify-center rounded-xl border border-orange-500/30 bg-orange-500/10 active:bg-orange-500/20"
              >
                <ScanLine color="#f97316" size={19} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={handleScanSubmit}
                className="h-11 items-center justify-center rounded-xl bg-[#ea580c] px-4 active:bg-[#f97316]"
              >
                <Text className="text-[12px] text-white" weight="700">
                  Mở
                </Text>
              </Pressable>
            </View>
          </View>

          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-[13px] uppercase tracking-wider text-slate-500 dark:text-slate-400" weight="700">
              Lịch gần nhất
            </Text>
            <Pressable onPress={() => requestMainTab(1)}>
              <Text className="text-[12px] text-[#f97316] font-bold">
                Xem tất cả
              </Text>
            </Pressable>
          </View>

          <View className="gap-3">
            {bookings.slice(0, 5).map((booking) => (
              <BookingRow
                key={booking.bookingId}
                booking={booking}
                checkingIn={checkingInId === booking.bookingId}
                onPress={() => handleCheckIn(booking)}
              />
            ))}
            {bookings.length === 0 && (
              <View className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/40 p-5">
                <Text className="text-center text-[13px] text-slate-800 dark:text-slate-300" weight="700">
                  Hôm nay chưa có lịch
                </Text>
                <Text className="mt-1 text-center text-[11px] text-slate-500 dark:text-slate-400">
                  Khi có khách đặt sân hoặc đăng ký tại quầy, lịch sẽ hiển thị tại đây.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      <Modal
        visible={scannerVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={() => setScannerVisible(false)}
      >
        <StatusBar style="light" backgroundColor="#020617" translucent />
        <View
          className="flex-1 bg-[#020617]"
          style={{ paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 16) }}
        >
          <View className="flex-row items-center justify-between px-5 pb-4 pt-3">
            <View className="flex-1 pr-4">
              <Text className="text-[20px] text-white" weight="700">
                Quét mã QR nhận xe
              </Text>
              <Text className="mt-1 text-[11px] leading-4 text-slate-300">
                Đưa mã QR trên đơn đặt lịch vào trong khung để bắt đầu nhận xe cho khách.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng camera quét QR"
              onPress={() => setScannerVisible(false)}
              className="rounded-xl border border-white/20 bg-white/10 px-3 py-2"
            >
              <Text className="text-[12px] text-white" weight="700">
                Đóng
              </Text>
            </Pressable>
          </View>

          <View className="flex-1 justify-center px-5">
            <View
              className="overflow-hidden rounded-3xl border border-white/20 bg-slate-950"
              style={{ aspectRatio: 1 }}
            >
              {cameraPermission?.granted ? (
                <CameraView
                  key={cameraInstanceKey}
                  style={{ flex: 1 }}
                  facing="back"
                  onCameraReady={() => setCameraReady(true)}
                  onMountError={(event) =>
                    setCameraError(event.message || 'Không thể khởi động camera trên thiết bị này.')
                  }
                  onBarcodeScanned={hasScanned ? undefined : handleQrScanned}
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                />
              ) : null}

              <View
                pointerEvents="none"
                className="absolute inset-7 rounded-3xl border-2 border-orange-400"
              />

              {!cameraPermission?.granted || cameraError ? (
                <View className="absolute inset-0 items-center justify-center bg-slate-950 px-8">
                  <QrCode color="#f97316" size={34} />
                  <Text className="mt-3 text-center text-[13px] text-white" weight="700">
                    {!cameraPermission?.granted ? 'Không có quyền dùng camera' : 'Không thể mở camera'}
                  </Text>
                  <Text className="mt-1 text-center text-[11px] leading-4 text-slate-400">
                    {cameraError || 'Hãy cấp quyền camera trong cài đặt thiết bị, sau đó thử lại.'}
                  </Text>
                  {cameraError ? (
                    <Pressable
                      onPress={() => {
                        setCameraError(null);
                        setCameraReady(false);
                        setCameraInstanceKey((key) => key + 1);
                      }}
                      className="mt-4 rounded-xl border border-orange-400/50 bg-orange-500/10 px-4 py-2"
                    >
                      <Text className="text-[11px] text-orange-300" weight="700">
                        Thử lại
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : !cameraReady ? (
                <View pointerEvents="none" className="absolute inset-0 items-center justify-center bg-slate-950/60">
                  <ActivityIndicator color="#fb923c" />
                  <Text className="mt-3 text-[11px] text-slate-200">Đang bật camera…</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View className="px-8 pt-4">
            <Text className="text-center text-[11px] leading-4 text-slate-300">
              Đặt mã trong khung cam. Mỗi mã chỉ được xử lý một lần; nếu quét nhầm, đóng camera và quét lại.
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function StatCard({
  Icon,
  label,
  value,
}: {
  Icon: LucideIcon;
  label: string;
  value: number;
}) {
  return (
    <View className="w-[47%] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-4 shadow-sm">
      <View className="mb-3 h-9 w-9 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10">
        <Icon color="#f97316" size={18} />
      </View>
      <Text className="text-[20px] text-slate-900 dark:text-white" weight="700">
        {value}
      </Text>
      <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{label}</Text>
    </View>
  );
}

function BookingRow({
  booking,
  checkingIn,
  onPress,
}: {
  booking: TodayBookingItem;
  checkingIn: boolean;
  onPress: () => void;
}) {
  const sessionId = getSessionId(booking);
  const session = booking.sessions?.[0];
  const checkInExpired = isCheckInWindowExpired(booking.status, booking.slotStart, session);
  const displayStatus =
    booking.status === 'CANCELLED'
      ? 'CANCELLED'
      : checkInExpired
        ? 'NO_SHOW'
        : sessionId
          ? session?.status || 'CHECKED_IN'
          : booking.status;
  const canOpenSession = !!sessionId;
  const canCheckIn = !sessionId && !checkInExpired && booking.status === 'CONFIRMED';
  const canAct = canOpenSession || canCheckIn;
  const actionLabel = canOpenSession
    ? 'Xem chi tiết'
    : checkInExpired
      ? 'Quá giờ'
      : booking.status === 'CANCELLED'
        ? 'Đã hủy'
        : booking.status === 'COMPLETED'
          ? 'Đã hoàn tất'
          : (booking as any).play_mode === 'BYOC' || (booking as any).playMode === 'BYOC'
            ? 'Vào sân'
            : 'Nhận xe';
  const customer = booking.participantDetails?.[0]?.name || booking.plannedParticipants?.[0] || 'Khách hàng';

  return (
    <Pressable
      disabled={!canAct || checkingIn}
      onPress={onPress}
      className={`rounded-2xl border border-slate-200 dark:border-slate-800 bg-white p-4 shadow-sm dark:bg-[#0f172a]/60 ${
        canAct ? 'active:bg-slate-50 dark:active:bg-slate-900' : 'opacity-60'
      }`}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-[14px] text-slate-900 dark:text-white" weight="700" numberOfLines={1}>
            {customer}
          </Text>
          <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400" numberOfLines={1}>
            #{booking.shortCode || shortId(booking.bookingId)} • {booking.trackName || booking.trackType}
          </Text>
          <Text className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            {formatTime(booking.slotStart)} - {formatTime(booking.slotEnd)} • {booking.playMode === 'RENTAL' ? 'Thuê xe' : 'Mang xe riêng'}
          </Text>
        </View>
        <View className="items-end">
          <View className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1">
            <Text className="text-[9px] uppercase text-emerald-600 dark:text-emerald-400" weight="700">
              {getStatusLabel(displayStatus)}
            </Text>
          </View>
          <View className="mt-3 flex-row items-center gap-1">
            {checkingIn ? (
              <ActivityIndicator size="small" color="#f97316" />
            ) : (
              canOpenSession ? <Eye color="#f97316" size={14} /> : <LogIn color="#f97316" size={14} />
            )}
            <Text className="text-[11px] text-[#f97316]" weight="700">
              {actionLabel}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
