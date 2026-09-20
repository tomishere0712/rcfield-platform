import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  View,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  MapPin,
  CalendarDays,
  Package as PackageIcon,
  ArrowRight,
  Star,
  Clock,
  AlertTriangle,
  MessageSquare,
  Sparkles,
  Search,
  CreditCard,
  Gamepad2,
} from 'lucide-react-native';

import { useAuthStore } from '@/shared/store/auth-store';
import { Text } from '@/shared/ui/Text';
import { requestMainTab, createScrollHandler } from '@/shared/ui/main-tab-events';
import { getMyBookings, type BookingListItem } from '@/features/bookings/api/booking.api';
import { getMyPackages, type MyPackageResponse } from '@/features/packages/api/package.api';
import { getCafes, getRecentReviews } from '@/features/explore/api/explore.api';
import { NotificationBellButton } from '@/features/notifications/components/NotificationBellButton';
import type { Cafe, Review } from '@/features/explore/types/explore.types';

function getInitials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(-2)
    .toUpperCase();
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Chào buổi sáng';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

function formatTimeRange(startIso: string, endIso: string) {
  try {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const sh = String(start.getHours()).padStart(2, '0');
    const sm = String(start.getMinutes()).padStart(2, '0');
    const eh = String(end.getHours()).padStart(2, '0');
    const em = String(end.getMinutes()).padStart(2, '0');
    const d = String(start.getDate()).padStart(2, '0');
    const m = String(start.getMonth() + 1).padStart(2, '0');
    const y = start.getFullYear();
    return `${sh}:${sm} - ${eh}:${em} • Ngày ${d}/${m}/${y}`;
  } catch {
    return 'Chưa xác định thời gian';
  }
}

function formatExpiryDate(isoString: string) {
  try {
    const d = new Date(isoString);
    const date = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${date}/${month}/${year}`;
  } catch {
    return 'Chưa rõ';
  }
}



const STEPS = [
  {
    num: '01',
    title: 'Tìm sân phù hợp',
    desc: 'Lọc thành phố, track, xem ảnh & bản đồ.',
    Icon: Search,
    color: '#f97316',
  },
  {
    num: '02',
    title: 'Chọn giờ & đặt xe',
    desc: 'Chọn khung giờ trống, thuê xe hoặc mang xe riêng.',
    Icon: CalendarDays,
    color: '#10b981',
  },
  {
    num: '03',
    title: 'Thanh toán & nhận lịch',
    desc: 'Thanh toán cọc online, nhận mã check-in tức thì.',
    Icon: CreditCard,
    color: '#3b82f6',
  },
  {
    num: '04',
    title: 'Check-in & chạy',
    desc: 'Quét mã check-in tại quầy, kiểm tra xe và đua ngay.',
    Icon: Gamepad2,
    color: '#8b5cf6',
  },
];

export function HomeScreen() {
  const router = useRouter();
  const handleScroll = useRef(createScrollHandler()).current;
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const [loading, setLoading] = useState(true);
  const [upcomingBooking, setUpcomingBooking] = useState<BookingListItem | null>(null);
  const [activePackages, setActivePackages] = useState<MyPackageResponse[]>([]);
  const [featuredCafes, setFeaturedCafes] = useState<Cafe[]>([]);
  const [recentReviews, setRecentReviews] = useState<Review[]>([]);

  const displayName = user?.fullName ?? user?.email ?? 'Khách hàng';
  const greeting = useMemo(() => getGreeting(), []);
  const isCustomer = user?.role === 'customer';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (!isAuthenticated || !isCustomer) {
        const [cafesResult, reviewsResult] = await Promise.all([
          getCafes(),
          getRecentReviews(5),
        ]);
        setUpcomingBooking(null);
        setActivePackages([]);
        setFeaturedCafes(cafesResult.slice(0, 5));
        setRecentReviews(reviewsResult);
        return;
      }

      const [bookingsResult, packagesResult, cafesResult, reviewsResult] = await Promise.all([
        getMyBookings({ limit: 10 }),
        getMyPackages('ACTIVE'),
        getCafes(),
        getRecentReviews(5),
      ]);

      const now = new Date();
      const active = bookingsResult.data.find(
        (b) => b.session && ['ACTIVE', 'EXTENDING', 'CHECKED_IN', 'CHECKING_OUT'].includes(b.session.status)
      );
      const awaitingPayment = bookingsResult.data.find((b) => b.status === 'AWAITING_PAYMENT');
      const upcoming = bookingsResult.data
        .filter((b) => (b.status === 'CONFIRMED' || b.status === 'PENDING') && new Date(b.slotStart) > now)
        .sort((a, b) => new Date(a.slotStart).getTime() - new Date(b.slotStart).getTime())[0] || null;

      const targetBooking = active || awaitingPayment || upcoming;
      setUpcomingBooking(targetBooking);
      setActivePackages(packagesResult);
      setFeaturedCafes(cafesResult.slice(0, 5));
      setRecentReviews(reviewsResult);
    } catch (err) {
      console.error('[HomeScreen] Error loading dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, isCustomer]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleActionWithAuth = (action: () => void, actionName: string) => {
    if (!isAuthenticated) {
      Alert.alert(
        'Yêu cầu đăng nhập',
        `Vui lòng đăng nhập để sử dụng tính năng ${actionName}.`,
        [
          { text: 'Hủy', style: 'cancel' },
          { text: 'Đăng nhập', onPress: () => router.push('/(auth)/login') },
        ]
      );
      return;
    }
    action();
  };

  const handleNavigateToExplore = () => {
    requestMainTab(1);
  };

  const handleNavigateToBookings = () => {
    handleActionWithAuth(() => {
      requestMainTab(2);
    }, 'Lịch đặt');
  };

  const handleSelectCafe = (cafeId: string) => {
    router.push({
      pathname: '/explore-map',
      params: { cafeId },
    } as any);
  };

  return (
    <SafeAreaView className="flex-grow flex-1 bg-[#f8fafc] dark:bg-[#0b0f19]" edges={['top', 'left', 'right']}>
      {/* Background Glows (Hiển thị mờ ở light mode và rõ ở dark mode) */}
      <View className="absolute -top-20 -right-20 w-85 h-85 rounded-full bg-[#f97316]/5 blur-3xl opacity-30 dark:opacity-100 pointer-events-none" />
      <View className="absolute bottom-10 -left-20 w-85 h-85 rounded-full bg-[#3b82f6]/5 blur-3xl opacity-30 dark:opacity-100 pointer-events-none" />

      {loading ? (
        <View className="flex-1 items-center justify-center bg-[#f8fafc] dark:bg-[#0b0f19]">
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="flex-grow px-5 py-6 pb-28"
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={loadData}
              colors={['#f97316']}
              tintColor="#f97316"
            />
          }
        >
          {/* Header Section */}
          <View className="flex-row items-center justify-between mb-5 gap-2">
            <View className="flex-row items-center gap-3.5 flex-1 min-w-0">
              {isAuthenticated && user?.avatarUrl ? (
                <Image
                  source={{ uri: user.avatarUrl }}
                  className="h-11 w-11 shrink-0 rounded-full border border-[#f97316]/30 shadow-md"
                />
              ) : (
                <View className="h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#ea580c]/10 border border-[#ea580c]/30">
                  <Text className="text-[13px] font-bold text-[#f97316]">
                    {isAuthenticated ? getInitials(displayName) : 'G'}
                  </Text>
                </View>
              )}
              <View className="flex-1 min-w-0">
                <Text className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold" numberOfLines={1}>
                  {isAuthenticated ? `${greeting},` : 'Chào mừng bạn đến với'}
                </Text>
                <Text className="text-[15px] sm:text-[16px] text-slate-900 dark:text-white" weight="700" numberOfLines={1}>
                  {isAuthenticated ? displayName : 'RCField Platform'}
                </Text>
              </View>
            </View>
            {isAuthenticated ? (
              <NotificationBellButton size="md" />
            ) : (
              <Pressable
                onPress={() => router.push('/(auth)/login')}
                className="shrink-0 rounded-xl bg-[#ea580c] px-3 py-1.5 sm:px-3.5 active:bg-[#f97316] shadow-sm"
              >
                <Text className="text-[11px] text-white font-bold">Đăng nhập</Text>
              </Pressable>
            )}
          </View>


          {/* Quick Actions Grid */}
          <View className="flex-row gap-3 mb-6">
            <Pressable
              onPress={handleNavigateToExplore}
              className="flex-1 flex-col items-center gap-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/50 py-3.5 shadow-sm active:bg-slate-100 dark:active:bg-slate-900/50"
            >
              <View className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-600/10 border border-orange-500/20">
                <MapPin color="#ea580c" size={20} />
              </View>
              <Text className="text-[12px] text-slate-800 dark:text-slate-200" weight="700">
                Tìm sân
              </Text>
            </Pressable>

            <Pressable
              onPress={handleNavigateToBookings}
              className="flex-1 flex-col items-center gap-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/50 py-3.5 shadow-sm active:bg-slate-100 dark:active:bg-slate-900/50"
            >
              <View className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600/10 border border-emerald-500/20">
                <CalendarDays color="#10b981" size={20} />
              </View>
              <Text className="text-[12px] text-slate-800 dark:text-slate-200" weight="700">
                Lịch đặt
              </Text>
            </Pressable>

            <Pressable
              onPress={() => handleActionWithAuth(() => router.push('/customer/packages' as any), 'Gói chơi')}
              className="flex-1 flex-col items-center gap-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/50 py-3.5 shadow-sm active:bg-slate-100 dark:active:bg-slate-900/50"
            >
              <View className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600/10 border border-violet-500/20">
                <PackageIcon color="#8b5cf6" size={20} />
              </View>
              <Text className="text-[12px] text-slate-800 dark:text-slate-200" weight="700">
                Gói chơi
              </Text>
            </Pressable>
          </View>

          {/* Upcoming Booking / Payment Alert */}
          <View className="mb-6">
            {(() => {
              if (!upcomingBooking) {
                return (
                  <>
                    <Text className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5 font-bold">
                      Lịch đặt sắp tới
                    </Text>
                    <View className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/30 p-5 items-center">
                      <Text className="text-[13px] text-slate-800 dark:text-slate-300 font-bold">Chưa có lịch đặt sân nào</Text>
                      <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 text-center leading-4 font-semibold text-center">
                        Tìm sân đua gần bạn và lên lịch chạy ngay hôm nay!
                      </Text>
                      <Pressable
                        onPress={handleNavigateToExplore}
                        className="mt-3.5 flex-row h-8.5 items-center justify-center rounded-xl bg-[#ea580c] active:bg-[#f97316] px-4 gap-1 shadow-sm"
                      >
                        <Text className="text-[11px] text-white" weight="700">
                          Khám phá sân đua
                        </Text>
                        <ArrowRight color="#ffffff" size={12} />
                      </Pressable>
                    </View>
                  </>
                );
              }

              const isPending = upcomingBooking.status === 'PENDING';
              const isAwaitingPayment = upcomingBooking.status === 'AWAITING_PAYMENT';
              const sessStatus = upcomingBooking.session?.status;
              const isSessionActive = sessStatus && ['ACTIVE', 'EXTENDING', 'CHECKED_IN', 'CHECKING_OUT'].includes(sessStatus);

              let sectionTitle = 'Lịch đặt sắp tới';
              if (isSessionActive) sectionTitle = 'Lượt chơi đang diễn ra';
              else if (isAwaitingPayment) sectionTitle = 'Thanh toán phát sinh';

              const handleNavigateToDetail = () => {
                router.push({
                  pathname: '/booking/[id]',
                  params: { id: upcomingBooking.id },
                } as any);
              };

              if (isSessionActive) {
                let statusLabel = 'Đang chơi';
                if (sessStatus === 'EXTENDING') statusLabel = 'Đang gia hạn';
                if (sessStatus === 'CHECKED_IN') statusLabel = 'Đang nhận xe';
                if (sessStatus === 'CHECKING_OUT') statusLabel = 'Đang trả xe';

                return (
                  <>
                    <Text className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5 font-bold">
                      {sectionTitle}
                    </Text>
                    <Pressable 
                      onPress={handleNavigateToDetail}
                      className="rounded-2xl border border-orange-200 dark:border-orange-950 bg-orange-500/5 dark:bg-orange-950/10 p-4 flex-row gap-3 active:opacity-90"
                    >
                      <View className="h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 border border-orange-500/20">
                        <Gamepad2 color="#f97316" size={20} />
                      </View>
                      <View className="flex-1">
                        <View className="flex-row justify-between items-center">
                          <Text className="text-[14px] text-orange-600 dark:text-orange-400 font-bold">
                            {statusLabel}
                          </Text>
                          <View className="rounded bg-orange-500/20 px-1.5 py-0.5">
                            <Text className="text-[9px] text-orange-600 dark:text-orange-400 font-bold">
                              {upcomingBooking.playMode === 'RENTAL' ? 'Thuê xe' : 'Xe riêng'}
                            </Text>
                          </View>
                        </View>
                        <Text className="text-[12px] text-slate-500 dark:text-slate-350 mt-1">
                          Chi nhánh: <Text className="text-slate-800 dark:text-white font-bold">{upcomingBooking.cafe?.name ?? 'RCField Branch'}</Text>
                        </Text>
                        <Text className="text-[13px] text-slate-900 dark:text-white mt-1 font-bold">
                          {formatTimeRange(upcomingBooking.slotStart, upcomingBooking.slotEnd)}
                        </Text>
                        <View className="mt-3 flex-row items-center gap-1">
                          <Text className="text-[12px] text-orange-600 dark:text-orange-400 font-bold">Xem phiên chơi</Text>
                          <ArrowRight color="#f97316" size={13} />
                        </View>
                      </View>
                    </Pressable>
                  </>
                );
              }

              if (isAwaitingPayment) {
                return (
                  <>
                    <Text className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5 font-bold">
                      {sectionTitle}
                    </Text>
                    <Pressable 
                      onPress={handleNavigateToDetail}
                      className="rounded-2xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/15 p-4 flex-row gap-3 active:opacity-90"
                    >
                      <View className="h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10 border border-rose-500/20">
                        <AlertTriangle color="#ef4444" size={20} />
                      </View>
                      <View className="flex-1">
                        <View className="flex-row justify-between items-center">
                          <Text className="text-[14px] text-rose-600 dark:text-rose-400 font-bold">
                            Chờ trả thêm
                          </Text>
                          <View className="rounded bg-rose-500/20 px-1.5 py-0.5">
                            <Text className="text-[9px] text-rose-600 dark:text-rose-400 font-bold">
                              {upcomingBooking.playMode === 'RENTAL' ? 'Thuê xe' : 'Xe riêng'}
                            </Text>
                          </View>
                        </View>
                        <Text className="text-[11px] text-slate-600 dark:text-rose-500/80 mt-0.5 leading-4 font-semibold">
                          Phiên chơi kết thúc. Vui lòng thanh toán phí phát sinh để hoàn tất.
                        </Text>
                        <Text className="text-[13px] text-slate-900 dark:text-white mt-2 font-bold">
                          {formatTimeRange(upcomingBooking.slotStart, upcomingBooking.slotEnd)}
                        </Text>
                        <View className="mt-3 flex-row items-center gap-1">
                          <Text className="text-[12px] text-rose-600 dark:text-rose-400 font-bold">Thanh toán ngay</Text>
                          <ArrowRight color="#ef4444" size={13} />
                        </View>
                      </View>
                    </Pressable>
                  </>
                );
              }

              if (isPending) {
                return (
                  <>
                    <Text className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5 font-bold">
                      {sectionTitle}
                    </Text>
                    <Pressable 
                      onPress={handleNavigateToDetail}
                      className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/15 p-4 flex-row gap-3 active:opacity-90"
                    >
                      <View className="h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20">
                        <AlertTriangle color="#f59e0b" size={20} />
                      </View>
                      <View className="flex-1 pr-2 justify-between">
                        <View>
                          <Text className="text-[14px] text-amber-500" weight="700">
                            Chờ thanh toán
                          </Text>
                          <Text className="text-[11px] text-slate-600 dark:text-amber-500/80 mt-0.5 leading-4 font-semibold">
                            Lịch đặt của bạn sẽ bị hủy nếu không thanh toán trước khi hết hạn.
                          </Text>
                          <Text className="text-[12px] text-slate-800 dark:text-slate-200 mt-2 font-bold">
                            {formatTimeRange(upcomingBooking.slotStart, upcomingBooking.slotEnd)}
                          </Text>
                        </View>
                        <View className="mt-3 flex-row items-center gap-1">
                          <Text className="text-[12px] text-amber-600 dark:text-amber-500 font-bold">Thanh toán ngay</Text>
                          <ArrowRight color="#f59e0b" size={13} />
                        </View>
                      </View>
                    </Pressable>
                  </>
                );
              }

              // CONFIRMED (Sắp diễn ra)
              return (
                <>
                  <Text className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5 font-bold">
                    {sectionTitle}
                  </Text>
                  <Pressable 
                    onPress={handleNavigateToDetail}
                    className="rounded-2xl border border-emerald-200 dark:border-emerald-950 bg-emerald-50 dark:bg-emerald-950/10 p-4 flex-row gap-3 active:opacity-90"
                  >
                    <View className="h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <Clock color="#10b981" size={20} />
                    </View>
                    <View className="flex-1">
                      <View className="flex-row justify-between items-center">
                        <Text className="text-[14px] text-emerald-600 dark:text-emerald-400 font-bold">
                          Sắp diễn ra
                        </Text>
                        <View className="rounded bg-emerald-500/20 px-1.5 py-0.5">
                          <Text className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold">
                            {upcomingBooking.playMode === 'RENTAL' ? 'Thuê xe' : 'Xe riêng'}
                          </Text>
                        </View>
                      </View>
                      <Text className="text-[12px] text-slate-500 dark:text-slate-300 mt-1">
                        Chi nhánh: <Text className="text-slate-800 dark:text-white font-bold">{upcomingBooking.cafe?.name ?? 'RCField Branch'}</Text>
                      </Text>
                      <Text className="text-[13px] text-slate-900 dark:text-white mt-0.5 font-bold">
                        {formatTimeRange(upcomingBooking.slotStart, upcomingBooking.slotEnd)}
                      </Text>
                      <View className="mt-3 flex-row items-center gap-1">
                        <Text className="text-[12px] text-emerald-600 dark:text-emerald-400 font-bold">Xem vé check-in</Text>
                        <ArrowRight color="#10b981" size={13} />
                      </View>
                    </View>
                  </Pressable>
                </>
              );
            })()}
          </View>

          {/* Active Packages (Gói hội viên đang dùng) */}
          <View className="mb-6">
            <Text className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5 font-bold">
              Gói hội viên đang dùng
            </Text>

            {activePackages.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-3.5"
                className="py-1"
              >
                {activePackages.map((pkg) => {
                  const usedPercent = pkg.slots_total > 0 ? ((pkg.slots_total - pkg.slots_remaining) / pkg.slots_total) * 100 : 0;
                  return (
                    <Pressable
                      key={pkg.id}
                      onPress={() => handleActionWithAuth(() => router.push('/customer/packages' as any), 'Gói chơi')}
                      className="w-64 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-4 shadow-sm active:bg-slate-100 dark:active:bg-slate-900/60"
                    >
                      <View className="flex-row justify-between items-start">
                        <View className="flex-1 pr-2">
                          <Text className="text-[13px] text-slate-900 dark:text-white" weight="700" numberOfLines={1}>
                            {pkg.package_name}
                          </Text>
                          <Text className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5" numberOfLines={1}>
                            {pkg.cafe_name}
                          </Text>
                        </View>
                        <View className="rounded bg-orange-500/10 px-1.5 py-0.5 border border-orange-500/20">
                          <Text className="text-[9px] text-[#f97316] font-bold">Active</Text>
                        </View>
                      </View>

                      <View className="mt-4">
                        <View className="flex-row justify-between items-baseline mb-1">
                          <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">Tình trạng sử dụng</Text>
                          <Text className="text-[12px] text-slate-800 dark:text-white" weight="700">
                            {Math.round(Number(pkg.slots_remaining))} / {Math.round(Number(pkg.slots_total))} slots
                          </Text>
                        </View>
                        <View className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <View
                            className="h-full rounded-full bg-[#f97316]"
                            style={{ width: `${100 - usedPercent}%` }}
                          />
                        </View>
                      </View>

                      <View className="mt-4 flex-row items-center gap-1">
                        <Clock color="#94a3b8" size={11} />
                        <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                          Hạn dùng: {formatExpiryDate(pkg.expires_at)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <View className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/30 p-5 items-center">
                <Text className="text-[13px] text-slate-800 dark:text-slate-300 font-bold">Bạn chưa sở hữu gói hội viên nào</Text>
                <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 text-center leading-4 font-semibold text-center">
                  Mua gói hội viên ngay để tiết kiệm chi phí và nhận nhiều ưu đãi slots chơi.
                </Text>
              </View>
            )}
          </View>

          {/* Quy trình 4 bước */}
          <View className="mb-6">
            <View className="flex-row items-center gap-1.5 mb-2.5">
              <Sparkles color="#f97316" size={15} />
              <Text className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">
                Quy trình đặt sân
              </Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-3.5"
              className="py-1"
            >
              {STEPS.map((step, idx) => {
                const IconComponent = step.Icon;
                return (
                  <View
                    key={idx}
                    className="w-52 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/40 p-4 shadow-sm"
                  >
                    <View className="flex-row justify-between items-center mb-3">
                      <View
                        className="h-8 w-8 items-center justify-center rounded-lg border"
                        style={{
                          backgroundColor: `${step.color}10`,
                          borderColor: `${step.color}30`,
                        }}
                      >
                        <IconComponent color={step.color} size={16} />
                      </View>
                      <Text className="text-[14px] text-slate-400 dark:text-slate-600" weight="700">
                        {step.num}
                      </Text>
                    </View>
                    <Text className="text-[12px] text-slate-900 dark:text-white" weight="700">
                      {step.title}
                    </Text>
                    <Text className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-4.5 font-semibold">
                      {step.desc}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>

          {/* Người chơi nói gì */}
          {recentReviews.length > 0 && (
            <View className="mb-6">
              <View className="flex-row items-center gap-1.5 mb-2.5">
                <MessageSquare color="#f97316" size={15} />
                <Text className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">
                  Người chơi nói gì
                </Text>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-3.5"
                className="py-1"
              >
                {recentReviews.map((rev) => {
                  const reviewerName = rev.user?.fullName || 'Người chơi';
                  return (
                    <View
                      key={rev.id}
                      className="w-64 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/40 p-4 shadow-sm"
                    >
                      {/* Sao đánh giá */}
                      <View className="flex-row gap-0.5 mb-2">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star 
                            key={s} 
                            color="#f59e0b" 
                            fill={s <= rev.rating ? "#f59e0b" : "transparent"} 
                            size={11} 
                          />
                        ))}
                      </View>

                      <Text className="text-[11px] text-slate-700 dark:text-slate-300 italic leading-4.5 font-semibold" numberOfLines={3}>
                        &quot;{rev.comment}&quot;
                      </Text>

                      {/* Divider */}
                      <View className="h-[1px] bg-slate-200 dark:bg-slate-800/60 my-3" />

                      {/* Info reviewer */}
                      <View className="flex-row items-center gap-2.5">
                        <View className="h-7 w-7 items-center justify-center rounded-full bg-[#ea580c]/10 border border-[#ea580c]/30">
                          <Text className="text-[9px] font-bold text-[#f97316]">
                            {getInitials(reviewerName)}
                          </Text>
                        </View>
                        <View className="flex-1">
                          <Text className="text-[11px] text-slate-900 dark:text-white" weight="700" numberOfLines={1}>
                            {reviewerName}
                          </Text>
                          <Text className="text-[9px] text-slate-500 dark:text-slate-400 font-semibold" numberOfLines={1}>
                            Đã đánh giá: {new Date(rev.createdAt).toLocaleDateString('vi-VN')}
                          </Text>
                          {rev.cafeName ? (
                            <Text className="text-[9px] text-[#f97316] font-bold mt-0.5" numberOfLines={1}>
                              Sân: {rev.cafeName}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Featured Cafes */}
          <View className="mb-6">
            <View className="flex-row justify-between items-center mb-2.5">
              <Text className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">
                Sân RC nổi bật
              </Text>
              <Pressable onPress={handleNavigateToExplore} className="flex-row items-center gap-0.5 active:opacity-75">
                <Text className="text-[11px] text-[#f97316]" weight="700">
                  Xem thêm
                </Text>
                <ArrowRight color="#f97316" size={11} />
              </Pressable>
            </View>

            {featuredCafes.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-3.5"
                className="py-1"
              >
                {featuredCafes.map((cafe) => (
                  <Pressable
                    key={cafe.id}
                    onPress={() => handleSelectCafe(cafe.id)}
                    className="w-48 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 shadow-sm active:bg-slate-100 dark:active:bg-slate-900/60"
                  >
                    <Image source={{ uri: cafe.image }} className="h-28 w-full object-cover bg-slate-950" />
                    <View className="p-3">
                      <Text className="text-[13px] text-slate-900 dark:text-white" weight="700" numberOfLines={1}>
                        {cafe.name}
                      </Text>
                      <Text className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5" numberOfLines={1}>
                        {cafe.district}, {cafe.city}
                      </Text>
                      
                      <View className="flex-row justify-between items-center mt-3">
                        <View className="flex-row items-center gap-0.5 bg-amber-500/10 px-1.5 py-0.5 rounded">
                          <Star color="#f59e0b" fill="#f59e0b" size={10} />
                          <Text className="text-[9px] text-amber-500 font-bold">
                            {cafe.rating > 0 ? cafe.rating.toFixed(1) : '—'}
                          </Text>
                        </View>
                        <Text className="text-[12px] text-[#f97316]" weight="700">
                          {cafe.priceRange.split(' ')[0]}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <View className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/30 p-5 items-center">
                <Text className="text-[12px] text-slate-500 dark:text-slate-400 font-semibold">Chưa có chi nhánh nổi bật</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
