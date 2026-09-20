import { useRouter } from 'expo-router';
import {
  Calendar,
  Clock,
  HelpCircle,
  Gamepad2,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react-native';
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';

import { getMyBookings, type BookingListItem, type BookingStatus } from '@/features/bookings/api/booking.api';
import { getDisplayBookingStatus, isCheckInWindowExpired } from '@/features/bookings/lib/check-in-window';
import { NotificationBellButton } from '@/features/notifications/components/NotificationBellButton';
import { Text } from '@/shared/ui/Text';
import { cn } from '@/shared/lib/utils';
import { useAuthStore } from '@/shared/store/auth-store';
import { createScrollHandler } from '@/shared/ui/main-tab-events';

// ── 6 category filter theo yêu cầu ──────────────────────────────────────────
type FilterKey = 'ALL' | BookingStatus;
type PlayModeFilter = 'ALL' | 'RENTAL' | 'BYOC';

interface TabConfig {
  key: FilterKey;
  label: string;
  // Màu hex thực — tránh dùng Tailwind class động để NativeWind không bị conflict
  activeBg: string;
  activeBorderColor: string;
  activeTextColor: string;
  activeBadgeBg: string;
}

const TAB_CONFIG: TabConfig[] = [
  { key: 'ALL',       label: 'Tất cả',        activeBg: '#334155',          activeBorderColor: '#64748b', activeTextColor: '#ffffff',  activeBadgeBg: 'rgba(255,255,255,0.15)' },
  { key: 'PENDING',   label: 'Chờ thanh toán', activeBg: 'rgba(245,158,11,0.2)', activeBorderColor: '#f59e0b', activeTextColor: '#fbbf24',  activeBadgeBg: 'rgba(255,255,255,0.15)' },
  { key: 'CONFIRMED', label: 'Đã xác nhận',    activeBg: 'rgba(16,185,129,0.2)', activeBorderColor: '#10b981', activeTextColor: '#34d399',  activeBadgeBg: 'rgba(255,255,255,0.15)' },
  { key: 'AWAITING_PAYMENT', label: 'Chờ trả thêm', activeBg: 'rgba(14,165,233,0.15)', activeBorderColor: '#38bdf8', activeTextColor: '#38bdf8', activeBadgeBg: 'rgba(255,255,255,0.15)' },
  { key: 'NO_SHOW',   label: 'Không đến',      activeBg: 'rgba(51,65,85,0.5)',   activeBorderColor: '#64748b', activeTextColor: '#cbd5e1',  activeBadgeBg: 'rgba(255,255,255,0.15)' },
  { key: 'COMPLETED', label: 'Hoàn thành',     activeBg: 'rgba(99,102,241,0.2)', activeBorderColor: '#6366f1', activeTextColor: '#818cf8',  activeBadgeBg: 'rgba(255,255,255,0.15)' },
  { key: 'CANCELLED', label: 'Đã hủy',         activeBg: 'rgba(239,68,68,0.2)',  activeBorderColor: '#ef4444', activeTextColor: '#f87171',  activeBadgeBg: 'rgba(255,255,255,0.15)' },
];

// ── Badge trạng thái hiển thị trên card ─────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; icon: any }> = {
  PENDING:      { label: 'Chờ thanh toán', bg: 'bg-amber-500/10 border-amber-500/20',    text: 'text-amber-500',   icon: Clock },
  CONFIRMED:    { label: 'Đã xác nhận',    bg: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-emerald-500', icon: Calendar },
  AWAITING_PAYMENT: { label: 'Chờ thanh toán thêm', bg: 'bg-blue-500/10 border-blue-500/20', text: 'text-blue-400', icon: Clock },
  NO_SHOW:      { label: 'Không đến',      bg: 'bg-slate-500/10 border-slate-500/20',    text: 'text-slate-400',   icon: HelpCircle },
  COMPLETED:    { label: 'Hoàn thành',     bg: 'bg-indigo-500/10 border-indigo-500/20',  text: 'text-indigo-400',  icon: Gamepad2 },
  CANCELLED:    { label: 'Đã hủy',         bg: 'bg-red-500/10 border-red-500/20',        text: 'text-red-400',     icon: RotateCcw },
  // Trạng thái Session thực tế
  CHECKED_IN:   { label: 'Đang nhận xe',   bg: 'bg-amber-500/10 border-amber-500/20',    text: 'text-amber-400',   icon: Clock },
  ACTIVE:       { label: 'Đang chơi',      bg: 'bg-orange-500/10 border-orange-500/20',  text: 'text-orange-500',  icon: Gamepad2 },
  EXTENDING:    { label: 'Đang gia hạn',   bg: 'bg-orange-500/10 border-orange-500/20',  text: 'text-orange-500',  icon: Gamepad2 },
  CHECKING_OUT: { label: 'Đang trả xe',    bg: 'bg-blue-500/10 border-blue-500/20',      text: 'text-blue-400',    icon: Clock },
};

// Chuyển Tailwind text class → hex color để truyền vào icon component
function resolveIconColor(textClass: string): string {
  const map: Record<string, string> = {
    'text-orange-500': '#f97316',
    'text-emerald-500': '#10b981',
    'text-amber-500': '#f59e0b',
    'text-amber-400': '#f59e0b',
    'text-blue-400': '#60a5fa',
    'text-indigo-400': '#818cf8',
    'text-slate-400': '#94a3b8',
    'text-red-400': '#f87171',
  };
  return map[textClass] ?? '#94a3b8';
}

export function BookingListScreen() {
  const router = useRouter();
  const handleScroll = useRef(createScrollHandler()).current;
  const { colorScheme } = useColorScheme();
  const role = useAuthStore((state) => state.role);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [activeTab, setActiveTab] = useState<FilterKey>('ALL');
  const [playModeFilter, setPlayModeFilter] = useState<PlayModeFilter>('ALL');
  const [bookings, setBookings] = useState<BookingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Hooks được gọi không điều kiện ở đây

  const fetchBookings = useCallback(async (isRefresh = false) => {
    if (!isAuthenticated || role !== 'customer') {
      setBookings([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      // BE giới hạn limit tối đa 50 — fetch song song theo từng status để có đủ data tất cả category
      const statuses: (BookingStatus | undefined)[] = [
        undefined,       // ALL — lấy toàn bộ theo limit 50
        'PENDING',
        'CONFIRMED',
        'AWAITING_PAYMENT',
        'NO_SHOW',
        'COMPLETED',
        'CANCELLED',
      ];
      const results = await Promise.allSettled(
        statuses.map((s) => getMyBookings({ status: s, limit: 50, page: 1 }))
      );

      // Gộp và dedup theo id, giữ thứ tự mới nhất
      const seen = new Set<string>();
      const merged: BookingListItem[] = [];
      results.forEach((r) => {
        if (r.status === 'fulfilled') {
          r.value.data.forEach((b) => {
            if (!seen.has(b.id)) {
              seen.add(b.id);
              merged.push(b);
            }
          });
        }
      });

      // Sắp xếp giảm dần theo slotStart
      merged.sort(
        (a, b) => new Date(b.slotStart).getTime() - new Date(a.slotStart).getTime()
      );
      setBookings(merged);
    } catch (error) {
      console.error('[BookingList] Failed to load bookings:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [role, isAuthenticated]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Đếm số đơn theo từng status để hiển thị badge trên tab
  const countByStatus = useMemo(() => {
    const counts: Record<FilterKey, number> = {
      ALL: bookings.length,
      PENDING: 0,
      CONFIRMED: 0,
      AWAITING_PAYMENT: 0,
      NO_SHOW: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    };
    bookings.forEach((b) => {
      const displayStatus = getDisplayBookingStatus(b.status, b.slotStart, b.session);
      if (displayStatus in counts) {
        (counts as Record<string, number>)[displayStatus]++;
      }
    });
    return counts;
  }, [bookings]);

  // Filter bookings theo tab — trực tiếp theo BookingStatus từ BE
  const filteredBookings = useMemo(() => {
    return bookings.filter((booking) => {
      const displayStatus = getDisplayBookingStatus(booking.status, booking.slotStart, booking.session);
      const matchesStatus = activeTab === 'ALL' || displayStatus === activeTab;
      const matchesPlayMode = playModeFilter === 'ALL' || booking.playMode === playModeFilter;
      return matchesStatus && matchesPlayMode;
    });
  }, [bookings, activeTab, playModeFilter]);

  const handleCardPress = (id: string) => {
    router.push({
      pathname: '/booking/[id]',
      params: { id },
    } as any);
  };

  const renderBookingItem = ({ item }: { item: BookingListItem }) => {
    // Ưu tiên hiển thị trạng thái Session thực tế nếu đang active
    const sessStatus = item.session?.status;
    const checkInExpired = isCheckInWindowExpired(item.status, item.slotStart, item.session);
    const isSessionActive =
      sessStatus && ['ACTIVE', 'EXTENDING', 'CHECKED_IN', 'CHECKING_OUT'].includes(sessStatus);
    const displayStatus = checkInExpired
      ? 'NO_SHOW'
      : isSessionActive
        ? sessStatus!
        : item.status;
    const isByoc = item.playMode === 'BYOC' || (item as any).play_mode === 'BYOC';
    const baseStatus = STATUS_CONFIG[displayStatus] ?? STATUS_CONFIG.PENDING;
    const status = {
      ...baseStatus,
      label: displayStatus === 'CHECKED_IN' && isByoc ? 'Đang vào sân' : baseStatus.label,
    };
    const StatusIcon = status.icon;

    const slotStart = new Date(item.slotStart);
    const slotEnd = new Date(item.slotEnd);
    const dateLabel = slotStart.toLocaleDateString('vi-VN', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
    });
    const timeLabel = `${slotStart.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
    })} - ${slotEnd.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
    const shortId = item.id.substring(0, 8).toUpperCase();

    const totalAmount =
      item.totalAmount ?? (item as any).total_amount ?? (item as any).snapshot?.total_charged ?? 0;
    const formattedAmount = Number(totalAmount).toLocaleString('vi-VN') + 'đ';

    return (
      <Pressable
        className="mb-4 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 active:bg-slate-100 dark:active:bg-[#0f172a]/90 shadow-xl"
        onPress={() => handleCardPress(item.id)}
      >
        {/* Thanh màu cam nếu session đang active */}
        {isSessionActive && (
          <View className="absolute top-0 right-0 left-0 h-[2px] bg-orange-500" />
        )}

        <View className="p-5 space-y-3">
          {/* Row 1: Mã booking + badge trạng thái + số tiền */}
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-1.5">
              <Text className="text-slate-500 dark:text-slate-400 text-xs font-bold font-mono">#{shortId}</Text>
              <View className={cn('px-2 py-0.5 rounded-full border flex-row items-center gap-1', status.bg)}>
                <StatusIcon color={resolveIconColor(status.text)} size={10} />
                <Text className={cn('text-[9px] font-black uppercase tracking-wide', status.text)}>
                  {status.label}
                </Text>
              </View>
            </View>
            <Text className="text-slate-900 dark:text-white text-sm" weight="700">
              {formattedAmount}
            </Text>
          </View>

          {/* Row 2: Tên chi nhánh + ngày giờ + mode */}
          <View className="space-y-2">
            <Text className="text-slate-900 dark:text-white text-[15px]" weight="600">
              {item.cafe?.name ?? 'RCField Platform Branch'}
            </Text>
            <View className="flex-row flex-wrap items-center gap-y-1 gap-x-3.5">
              <View className="flex-row items-center gap-1">
                <Calendar color="#94a3b8" size={13} />
                <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold">{dateLabel}</Text>
              </View>
              <View className="flex-row items-center gap-1">
                <Clock color="#94a3b8" size={13} />
                <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold">{timeLabel}</Text>
              </View>
              <View
                className={cn(
                  'px-2 py-0.5 rounded-md border',
                  !isByoc
                    ? 'bg-orange-500/5 border-orange-500/10'
                    : 'bg-blue-500/5 border-blue-500/10'
                )}
              >
                <Text
                  className={cn(
                    'text-[9px] font-bold uppercase',
                    !isByoc ? 'text-orange-500' : 'text-blue-500 dark:text-blue-400'
                  )}
                >
                  {!isByoc ? 'Thuê xe' : 'Xe riêng (BYOC)'}
                </Text>
              </View>
            </View>
          </View>

          {/* Row 3: Cảnh báo hạn thanh toán cho đơn PENDING */}
          {item.status === 'PENDING' && item.paymentExpiresAt && (
            <View className="flex-row items-center gap-1.5 rounded-lg bg-amber-500/5 border border-amber-500/10 p-2 mt-3">
              <AlertTriangle color="#f59e0b" size={12} />
              <Text className="text-amber-500 text-[10px] font-semibold flex-1">
                Hạn thanh toán:{' '}
                {new Date(item.paymentExpiresAt).toLocaleTimeString('vi-VN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                ngày{' '}
                {new Date(item.paymentExpiresAt).toLocaleDateString('vi-VN', {
                  day: '2-digit',
                  month: '2-digit',
                })}
              </Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  if (!isAuthenticated) {
    return (
      <SafeAreaView className="flex-grow flex-1 bg-[#f8fafc] dark:bg-[#0b0f19] justify-center items-center px-8" edges={['top', 'left', 'right']}>
        {/* Background Glows */}
        <View className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-[#f97316]/5 blur-3xl pointer-events-none" />
        <View className="absolute bottom-10 -left-20 w-80 h-80 rounded-full bg-[#6366f1]/5 blur-3xl pointer-events-none" />

        <View className="size-16 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 justify-center items-center mb-4">
          <Calendar color="#f97316" size={28} />
        </View>
        <Text className="text-slate-900 dark:text-white text-lg font-bold text-center">
          Yêu cầu đăng nhập
        </Text>
        <Text className="mt-2 text-slate-500 dark:text-slate-400 text-sm text-center leading-5 font-semibold max-w-xs mb-6">
          Vui lòng đăng nhập để xem lịch sử và quản lý danh sách đặt lịch sân chơi của bạn.
        </Text>
        <Pressable
          className="w-full h-11 items-center justify-center rounded-xl bg-[#ea580c] active:bg-[#f97316] shadow-md"
          onPress={() => router.push('/(auth)/login')}
        >
          <Text className="text-white text-sm font-bold">Đăng nhập ngay</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-grow flex-1 bg-[#f8fafc] dark:bg-[#0b0f19]" edges={['top', 'left', 'right']}>
      {/* Background Lights */}
      <View className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-[#f97316]/5 blur-3xl pointer-events-none opacity-30 dark:opacity-100" />
      <View className="absolute bottom-10 -left-20 w-80 h-80 rounded-full bg-[#6366f1]/5 blur-3xl pointer-events-none opacity-30 dark:opacity-100" />

      {/* Header */}
      <View className="px-5 pt-3 pb-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Text className="text-slate-900 dark:text-white text-3xl" variant="title" weight="700">
              Lịch sử đặt sân
            </Text>
            <Text className="mt-1 text-[13px] text-slate-500 dark:text-slate-400 font-semibold">
              Quản lý và xem tiến trình các lượt chơi của bạn.
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <NotificationBellButton size="md" />
          </View>
        </View>
      </View>


      {/* Tab Filter — ScrollView ngang chứa đủ 6 category */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, flexShrink: 0 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 16,
          paddingTop: 4,
          flexDirection: 'row',
          flexWrap: 'nowrap',
          alignItems: 'center',
        }}
      >
        {TAB_CONFIG.map((tab, index) => {
          const isActive = activeTab === tab.key;
          const count = countByStatus[tab.key] ?? 0;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[
                {
                  flexShrink: 0,
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 12,
                  borderWidth: 1,
                  marginRight: index < TAB_CONFIG.length - 1 ? 8 : 0,
                  gap: 6,
                },
                isActive
                  ? { backgroundColor: tab.activeBg, borderColor: tab.activeBorderColor }
                  : { backgroundColor: colorScheme === 'dark' ? 'rgba(15,23,42,0.6)' : '#ffffff', borderColor: colorScheme === 'dark' ? '#1e293b' : '#cbd5e1' },
              ]}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: isActive ? tab.activeTextColor : (colorScheme === 'dark' ? '#94a3b8' : '#64748b'),
                }}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
              {/* Badge đếm số đơn, chỉ hiện khi count > 0 */}
              {count > 0 && (
                <View
                  style={{
                    minWidth: 18,
                    height: 18,
                    borderRadius: 9,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 4,
                    backgroundColor: isActive ? tab.activeBadgeBg : (colorScheme === 'dark' ? '#1e293b' : '#cbd5e1'),
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '900',
                      color: isActive ? tab.activeTextColor : (colorScheme === 'dark' ? '#94a3b8' : '#64748b'),
                    }}
                  >
                    {count}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

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

      {/* Bookings List */}
      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator color="#ea580c" size="large" />
          <Text className="mt-3 text-slate-555 dark:text-slate-400 text-xs font-semibold">
            Đang tải lịch sử đặt sân...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredBookings}
          renderItem={renderBookingItem}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-5 pb-28"
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchBookings(true)}
              tintColor="#ea580c"
              colors={['#ea580c']}
            />
          }
          ListEmptyComponent={
            <View className="flex-1 justify-center items-center px-8 py-20 mt-10">
              <View className="size-16 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 justify-center items-center mb-4">
                <HelpCircle color="#94a3b8" size={28} />
              </View>
              <Text className="text-slate-900 dark:text-white text-base font-bold text-center">
                Không tìm thấy lịch đặt nào
              </Text>
              <Text className="mt-1.5 text-slate-500 dark:text-slate-400 text-xs text-center leading-4 font-semibold max-w-xs">
                {activeTab === 'ALL'
                  ? 'Bạn chưa có đơn đặt sân nào. Hãy đặt lịch chơi ngay!'
                  : `Bạn không có đơn đặt nào ở trạng thái "${TAB_CONFIG.find((t) => t.key === activeTab)?.label}".`}
              </Text>
              {activeTab === 'ALL' && (
                <Pressable
                  className="mt-6 px-5 py-2.5 rounded-xl bg-[#ea580c] active:bg-[#f97316] shadow-md"
                  onPress={() => router.push('/booking/create')}
                >
                  <Text className="text-white text-xs font-bold">Đặt lịch ngay</Text>
                </Pressable>
              )}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
