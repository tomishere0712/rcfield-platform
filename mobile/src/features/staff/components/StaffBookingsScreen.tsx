import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarDays, Car, ChevronLeft, ChevronRight, Eye, LogIn, Smartphone, UserRound, Zap, type LucideIcon } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'nativewind';

import {
  staffApi,
  type StaffBookingStatus,
  type TodayBookingItem,
} from '@/features/staff/api/staff.api';
import { getDisplayBookingStatus, isCheckInWindowExpired } from '@/features/bookings/lib/check-in-window';
import { getSessionOperationalTiming } from '@/features/staff/lib/session-operational-timing';
import { getStatusLabel } from '@/features/bookings/lib/status-label';
import { wsClient } from '@/shared/lib/websocket';
import { Text } from '@/shared/ui/Text';

type FilterKey = 'ALL' | StaffBookingStatus | 'CHECKED_IN';
type PlayModeFilter = 'ALL' | 'RENTAL' | 'BYOC';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'CONFIRMED', label: 'Đã xác nhận' },
  { key: 'AWAITING_PAYMENT', label: 'Chờ trả thêm' },
  { key: 'NO_SHOW', label: 'Không đến' },
  { key: 'CHECKED_IN', label: 'Đã nhận xe' },
  { key: 'PENDING', label: 'Chờ thanh toán' },
  { key: 'COMPLETED', label: 'Hoàn tất' },
  { key: 'CANCELLED', label: 'Đã hủy' },
];

function formatDateTime(iso: string) {
  const date = new Date(iso);
  return {
    date: date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
    time: date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
  };
}

function getSessionId(booking: TodayBookingItem) {
  const session = booking.sessions?.[0];
  return session?.sessionId ?? session?.id ?? null;
}

function getCustomerName(booking: TodayBookingItem) {
  return booking.participantDetails?.[0]?.name || booking.plannedParticipants?.[0] || 'Khách hàng';
}

function vietnamDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function shiftDate(date: string, offset: number) {
  const value = new Date(`${date}T12:00:00+07:00`);
  value.setDate(value.getDate() + offset);
  return value.toISOString().slice(0, 10);
}

export function StaffBookingsScreen() {
  const router = useRouter();
  const [bookings, setBookings] = useState<TodayBookingItem[]>([]);
  const [selectedDate, setSelectedDate] = useState(vietnamDateString);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('ALL');
  const [playModeFilter, setPlayModeFilter] = useState<PlayModeFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const loadBookings = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const data = await staffApi.getBookings(selectedDate);
      setBookings(data);
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Không thể tải lịch hôm nay.';
      Alert.alert('Lỗi', message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsubscribe = wsClient.subscribe((event, data) => {
      if (
        ![
          'BOOKING_CREATED',
          'BOOKING_UPDATED',
          'BOOKING_CANCELLED',
          'BOOKING_STATUS_CHANGED',
          'CUSTOMER_PAYMENT_CONFIRMED',
          'CUSTOMER_CHECKIN_CONFIRMED',
          'CUSTOMER_CHECKOUT_CONFIRMED',
          'CUSTOMER_INSPECTION_DISPUTED',
        ].includes(event)
      ) {
        return;
      }

      loadBookings(true);
    });

    return unsubscribe;
  }, [loadBookings]);

  const filteredBookings = useMemo(() => {
    return bookings.filter((booking) => {
      const session = booking.sessions?.[0];
      const displayStatus = getDisplayBookingStatus(booking.status, booking.slotStart, session);

      if (playModeFilter !== 'ALL' && booking.playMode !== playModeFilter) {
        return false;
      }

      if (activeFilter === 'ALL') return true;
      if (activeFilter === 'CHECKED_IN') return Boolean(session);
      return displayStatus === activeFilter;
    });
  }, [activeFilter, bookings, playModeFilter]);

  const handleOpenBooking = (booking: TodayBookingItem) => {
    const sessionId = getSessionId(booking);
    if (sessionId) {
      router.push(`/staff/session/${sessionId}` as any);
    }
  };

  const handleCheckIn = async (booking: TodayBookingItem) => {
    const sessionId = getSessionId(booking);
    if (sessionId) {
      router.push(`/staff/session/${sessionId}` as any);
      return;
    }

    if (booking.status !== 'CONFIRMED') {
      Alert.alert('Không thể check-in', 'Lịch này chưa ở trạng thái đã xác nhận.');
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
      await loadBookings(true);
      if (newSessionId) {
        router.push({
          pathname: '/staff/inspection/[sessionId]',
          params: { sessionId: newSessionId, type: 'CHECK_IN' },
        } as any);
      } else {
        Alert.alert('Đã check-in', 'Phiên đã được tạo.');
      }
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Không thể check-in lịch này.';
      Alert.alert('Lỗi check-in', message);
    } finally {
      setCheckingInId(null);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#f8fafc] dark:bg-[#0b0f19]" edges={['top', 'left', 'right']}>
      <View className="border-b border-slate-200 dark:border-slate-900 px-5 py-4">
        <Text className="text-[12px] uppercase tracking-wider text-slate-500 dark:text-slate-400" weight="700">
          Nhân viên trực ca
        </Text>
        <Text className="mt-1 text-[22px] text-slate-900 dark:text-white" weight="700">
          Lịch đặt sân
        </Text>
        <View className="mt-3 flex-row items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-1">
          <Pressable onPress={() => setSelectedDate((date) => shiftDate(date, -1))} className="h-9 w-9 items-center justify-center rounded-lg">
            <ChevronLeft color="#f97316" size={18} />
          </Pressable>
          <Pressable onPress={() => setSelectedDate(vietnamDateString())} className="flex-1 items-center py-1">
            <Text className="text-[12px] text-slate-900 dark:text-white" weight="700">
              {selectedDate === vietnamDateString()
                ? 'Hôm nay'
                : new Date(`${selectedDate}T12:00:00+07:00`).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
            </Text>
            {selectedDate !== vietnamDateString() ? <Text className="mt-0.5 text-[9px] text-[#f97316]">Chạm để về hôm nay</Text> : null}
          </Pressable>
          <Pressable onPress={() => setSelectedDate((date) => shiftDate(date, 1))} className="h-9 w-9 items-center justify-center rounded-lg">
            <ChevronRight color="#f97316" size={18} />
          </Pressable>
        </View>
      </View>

      <View className="py-3">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 px-5"
        >
          {FILTERS.map((filter) => {
            const active = activeFilter === filter.key;
            return (
              <Pressable
                key={filter.key}
                onPress={() => setActiveFilter(filter.key)}
                className={`rounded-xl border px-3 py-2 ${
                  active
                    ? 'border-orange-500 bg-orange-500/10'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60'
                }`}
              >
                <Text className={`text-[11px] ${active ? 'text-[#f97316]' : 'text-slate-500 dark:text-slate-400'}`} weight="700">
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View className="mb-3 flex-row gap-2 px-5">
        {([
          ['ALL', 'Tất cả hình thức'],
          ['RENTAL', 'Thuê xe'],
          ['BYOC', 'Mang xe riêng'],
        ] as const).map(([mode, label]) => {
          const active = playModeFilter === mode;
          return (
            <Pressable
              key={mode}
              onPress={() => setPlayModeFilter(mode)}
              className={`rounded-lg border px-3 py-2 ${
                active
                  ? 'border-orange-500 bg-orange-500/10'
                  : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0f172a]/60'
              }`}
            >
              <Text className={`text-[10px] ${active ? 'text-[#f97316]' : 'text-slate-500'}`} weight="700">
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      ) : (
        <FlatList
          data={filteredBookings}
          keyExtractor={(item) => item.bookingId}
          contentContainerClassName="px-5 pb-24 pt-1"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadBookings(true)}
              colors={['#f97316']}
              tintColor="#f97316"
            />
          }
          renderItem={({ item }) => (
            <BookingCard
              booking={item}
              now={now}
              checkingIn={checkingInId === item.bookingId}
              onOpen={() => handleOpenBooking(item)}
              onCheckIn={() => handleCheckIn(item)}
            />
          )}
          ListEmptyComponent={
            <View className="mt-10 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/40 p-6">
              <Text className="text-center text-[14px] text-slate-800 dark:text-slate-300" weight="700">
                Không có lịch phù hợp
              </Text>
              <Text className="mt-1 text-center text-[11px] text-slate-500">
                Thử đổi bộ lọc hoặc kéo xuống để tải lại dữ liệu.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function BookingCard({
  booking,
  now,
  checkingIn,
  onCheckIn,
  onOpen,
}: {
  booking: TodayBookingItem;
  now: number;
  checkingIn: boolean;
  onCheckIn: () => void;
  onOpen: () => void;
}) {
  const { colorScheme } = useColorScheme();
  const start = formatDateTime(booking.slotStart);
  const end = formatDateTime(booking.slotEnd);
  const sessionId = getSessionId(booking);
  const session = booking.sessions?.[0];
  const timing = getSessionOperationalTiming(
    session?.plannedEnd ?? session?.plannedEndAt ?? booking.slotEnd,
    session?.status,
    now,
  );
  const checkInExpired = isCheckInWindowExpired(booking.status, booking.slotStart, session);
  const displayStatus =
    booking.status === 'CANCELLED'
      ? 'CANCELLED'
      : checkInExpired
        ? 'NO_SHOW'
        : sessionId
          ? session?.status || 'CHECKED_IN'
          : booking.status;
  const customerName = getCustomerName(booking);
  const isWalkIn = (booking as any).source === 'STAFF_MANUAL' || (booking as any).source === 'WALK_IN';
  const isByoc = (booking as any).play_mode === 'BYOC' || (booking as any).playMode === 'BYOC';
  const canOpenSession = !!sessionId;
  const canCheckIn = !sessionId && !checkInExpired && booking.status === 'CONFIRMED';
  const actionLabel = canOpenSession
    ? session?.status === 'CHECKING_OUT'
      ? isByoc
        ? 'Hoàn tất phiên'
        : 'Tiếp tục trả xe'
      : timing.state === 'DUE_FOR_CHECKOUT' || timing.state === 'OVERDUE'
        ? isByoc
          ? 'Xử lý phiên'
          : 'Xử lý trả xe'
        : 'Xem chi tiết'
    : checkInExpired
      ? 'Quá giờ'
      : booking.status === 'CANCELLED'
        ? 'Đã hủy'
        : booking.status === 'COMPLETED'
          ? 'Đã hoàn tất'
          : isByoc
            ? 'Vào sân'
            : 'Nhận xe';
  const canAct = canOpenSession || canCheckIn;

  return (
    <Pressable
      onPress={canOpenSession ? onOpen : undefined}
      className="mb-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-4 active:bg-slate-50 dark:active:bg-slate-900 shadow-sm"
    >
      <View className="mb-3 flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <View className="flex-row items-center gap-1.5 flex-wrap">
            <Text className="text-[15px] text-slate-900 dark:text-white" weight="700" numberOfLines={1}>
              {customerName}
            </Text>
            {isWalkIn ? (
              <View className="flex-row items-center gap-1 rounded-full border border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/60 px-2 py-0.5">
                <Zap color="#ea580c" size={9} />
                <Text className="text-[9px] text-[#ea580c] font-black uppercase">
                  Vãng lai
                </Text>
              </View>
            ) : (
              <View className="flex-row items-center gap-1 rounded-full border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/60 px-2 py-0.5">
                <Smartphone color="#0284c7" size={9} />
                <Text className="text-[9px] text-sky-700 dark:text-sky-300 font-bold uppercase">
                  Web/App
                </Text>
              </View>
            )}
          </View>
          <Text className="mt-1 text-[11px] text-slate-500">
            #{booking.shortCode || booking.bookingId.slice(0, 8).toUpperCase()}
          </Text>
        </View>
        <View className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 px-2 py-1">
          <Text className="text-[9px] uppercase text-slate-600 dark:text-slate-300" weight="700">
            {getStatusLabel(displayStatus)}
          </Text>
        </View>
      </View>

      <View className="gap-2">
        <InfoRow Icon={CalendarDays} text={`${start.date} • ${start.time} - ${end.time}`} colorScheme={colorScheme} />
        <InfoRow Icon={Car} text={`${booking.playMode === 'RENTAL' ? 'Thuê xe' : 'Mang xe riêng'} • ${booking.trackName || booking.trackType || 'Đường đua'}`} colorScheme={colorScheme} />
        <InfoRow Icon={UserRound} text={`${booking.plannedParticipants?.length || 1} người chơi`} colorScheme={colorScheme} />
      </View>

      {timing.state === 'DUE_FOR_CHECKOUT' || timing.state === 'OVERDUE' ? (
        <View
          className={`mt-3 rounded-xl border px-3 py-2 ${
            timing.state === 'OVERDUE'
              ? 'border-red-500/30 bg-red-500/10'
              : 'border-amber-500/30 bg-amber-500/10'
          }`}
        >
          <Text
            className={`text-[11px] ${timing.state === 'OVERDUE' ? 'text-red-500' : 'text-amber-600'}`}
            weight="700"
          >
            {timing.state === 'OVERDUE'
              ? `Quá giờ ${timing.minutesPastPlannedEnd} phút${timing.shouldAlert ? (isByoc ? ' · Cần đóng ca' : ' · Cần xử lý trả xe') : ''}`
              : isByoc
                ? 'Đã hết giờ chơi · Sẵn sàng hoàn tất phiên'
                : 'Đã đến giờ trả xe · Vui lòng hoàn tất biên bản trả xe'}
          </Text>
        </View>
      ) : null}

      <View className="mt-4 flex-row items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-3">
        <Text className="text-[12px] text-[#f97316]" weight="700">
          {Number(booking.totalAmount || 0).toLocaleString('vi-VN')}đ
        </Text>
        <Pressable
          disabled={!canAct || checkingIn}
          onPress={canOpenSession ? onOpen : onCheckIn}
          className={`flex-row items-center gap-1 rounded-xl px-3 py-2 ${
            canAct ? 'bg-[#ea580c] active:bg-[#f97316]' : 'bg-slate-200 dark:bg-slate-800 opacity-50'
          }`}
        >
          {checkingIn ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : sessionId ? (
            <Eye color="#ffffff" size={14} />
          ) : (
            <LogIn color="#ffffff" size={14} />
          )}
          <Text className="text-[11px] text-white" weight="700">
            {actionLabel}
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function InfoRow({ Icon, text, colorScheme }: { Icon: LucideIcon; text: string; colorScheme: string | null | undefined }) {
  return (
    <View className="flex-row items-center gap-2">
      <Icon color={colorScheme === 'dark' ? '#94a3b8' : '#64748b'} size={13} />
      <Text className="flex-1 text-[11px] text-slate-500 dark:text-slate-400" numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}
