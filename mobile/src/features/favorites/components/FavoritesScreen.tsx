import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import {
  CalendarPlus,
  ChevronLeft,
  Compass,
  Heart,
  MapPin,
  RefreshCcw,
  Search,
  Star,
} from 'lucide-react-native';

import { getCafeById } from '@/features/explore/api/explore.api';
import { favoriteApi, favoriteLocal } from '@/features/explore/api/favorite.api';
import type { Cafe } from '@/features/explore/types/explore.types';
import { useAuthStore } from '@/shared/store/auth-store';
import { Text } from '@/shared/ui/Text';

export function FavoritesScreen() {
  const { colorScheme } = useColorScheme();
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const role = useAuthStore((state) => state.role);
  const isCustomer = role === 'customer' || role === null;

  const [favorites, setFavorites] = useState<Cafe[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const favoriteCount = favorites.length;
  const cityCount = useMemo(
    () => new Set(favorites.map((cafe) => cafe.city).filter(Boolean)).size,
    [favorites],
  );
  const averageRating = useMemo(() => {
    const ratedCafes = favorites.filter((cafe) => cafe.rating > 0);
    if (!ratedCafes.length) return 0;
    const total = ratedCafes.reduce((sum, cafe) => sum + cafe.rating, 0);
    return total / ratedCafes.length;
  }, [favorites]);

  const fetchFavorites = useCallback(
    async (silent = false) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const localFavs = await favoriteLocal.getLocalFavorites();
        let favIds = localFavs;

        if (isAuthenticated) {
          try {
            favIds = await favoriteApi.getFavorites();
            await favoriteLocal.setLocalFavorites(favIds);
          } catch (e) {
            console.warn('[FavoritesScreen] Failed to fetch server favorites, using local:', e);
          }
        }

        setFavoriteIds(favIds);

        // Fetch detailed info of each favorite cafe in parallel to bypass global list limits or pagination
        const cafePromises = favIds.map((id) => getCafeById(id));
        const cafesResults = await Promise.all(cafePromises);
        const activeCafes = cafesResults.filter((cafe): cafe is Cafe => cafe !== null);

        setFavorites(activeCafes);
      } catch (error) {
        console.error('[FavoritesScreen] Fetch error:', error);
        Alert.alert('Lỗi', 'Không thể tải danh sách cơ sở yêu thích.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isAuthenticated],
  );

  useEffect(() => {
    if (!isCustomer) {
      setLoading(false);
      return;
    }
    fetchFavorites();
  }, [fetchFavorites, isCustomer]);

  if (!isCustomer) {
    return (
      <SafeAreaView className="flex-1 bg-[#f8fafc] dark:bg-[#0b0f19] px-5" edges={['top', 'left', 'right']}>
        <View className="flex-1 items-center justify-center">
          <Heart color="#94a3b8" size={30} />
          <Text className="mt-3 text-center text-[15px] text-slate-900 dark:text-white" weight="700">
            Danh sách yêu thích dành cho khách hàng
          </Text>
          <Text className="mt-2 text-center text-[12px] leading-5 text-slate-500">
            Tài khoản nhân viên sử dụng chi nhánh được phân công trong hồ sơ.
          </Text>
          <Pressable
            onPress={() => router.replace('/' as any)}
            className="mt-5 rounded-xl bg-[#ea580c] px-4 py-3"
          >
            <Text className="text-[12px] text-white" weight="700">Về trang trực ca</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const handleRemoveFavorite = async (cafeId: string) => {
    const previousIds = favoriteIds;
    const previousFavorites = favorites;
    const updatedIds = favoriteIds.filter((id) => id !== cafeId);

    setFavoriteIds(updatedIds);
    setFavorites((items) => items.filter((cafe) => cafe.id !== cafeId));

    try {
      await favoriteLocal.setLocalFavorites(updatedIds);
      if (isAuthenticated) {
        await favoriteApi.removeFavorite(cafeId);
      }
    } catch (error) {
      console.error('[FavoritesScreen] Remove favorite error:', error);
      setFavoriteIds(previousIds);
      setFavorites(previousFavorites);
      Alert.alert('Lỗi', 'Không thể cập nhật trạng thái yêu thích.');
    }
  };

  const renderFavoriteItem = ({ item }: { item: Cafe }) => {
    const priceLabel =
      item.slotFeeRate && item.slotFeeRate > 0
        ? `${item.slotFeeRate.toLocaleString('vi-VN')} đ`
        : item.priceRange || 'Chưa cập nhật';
    const rating = item.rating > 0 ? item.rating.toFixed(1) : '—';

    return (
      <Pressable
        className="mb-3.5 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/70 active:bg-slate-55 dark:active:bg-slate-900 shadow-sm"
        onPress={() => router.push(`/cafe-detail/${item.id}` as any)}
      >
        <View className="flex-row p-3">
          <View className="relative h-28 w-28 overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-900">
            <Image source={{ uri: item.image }} className="h-full w-full object-cover" />
            <View className="absolute bottom-2 left-2 flex-row items-center gap-1 rounded-lg bg-black/65 px-2 py-1">
              <Star color="#f59e0b" fill="#f59e0b" size={10} />
              <Text className="text-[10px] font-black text-white">{rating}</Text>
            </View>
          </View>

          <View className="ml-3 flex-1">
            <View className="flex-row items-start gap-2">
              <View className="flex-1">
                <Text className="text-[15px] leading-5 text-slate-900 dark:text-white" numberOfLines={2} weight="700">
                  {item.name}
                </Text>
                <View className="mt-1.5 flex-row items-center gap-1">
                  <MapPin color="#94a3b8" size={12} />
                  <Text className="flex-1 text-[11px] text-slate-500 dark:text-slate-400" numberOfLines={1} weight="600">
                    {item.district}, {item.city}
                  </Text>
                </View>
              </View>

              <Pressable
                className="size-9 items-center justify-center rounded-xl bg-red-500/10 active:bg-red-500/20"
                onPress={(event) => {
                  event.stopPropagation();
                  handleRemoveFavorite(item.id);
                }}
              >
                <Heart color="#ef4444" fill="#ef4444" size={17} />
              </Pressable>
            </View>

            <View className="mt-3 flex-row flex-wrap gap-1.5">
              {item.trackTypes.slice(0, 2).map((trackType) => (
                <View
                  key={trackType}
                  className="rounded-lg border border-orange-500/20 bg-orange-500/10 px-2 py-0.5"
                >
                  <Text className="text-[9px] font-black uppercase text-[#f97316]">
                    {trackType}
                  </Text>
                </View>
              ))}
            </View>

            <View className="mt-auto flex-row items-end justify-between pt-3">
              <View>
                <Text className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500">Giá slot</Text>
                <Text className="text-[13px] font-black text-[#f97316]">{priceLabel}</Text>
              </View>
              <Pressable
                className="h-9 flex-row items-center justify-center gap-1.5 rounded-xl bg-[#ea580c] px-3 active:bg-[#f97316]"
                onPress={(event) => {
                  event.stopPropagation();
                  router.push({
                    pathname: '/booking/create',
                    params: { cafeId: item.id },
                  } as any);
                }}
              >
                <CalendarPlus color="#ffffff" size={14} />
                <Text className="text-[11px] font-black text-white">Đặt lịch</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-[#f8fafc] dark:bg-[#0b0f19]" edges={['top', 'left', 'right']}>
      <View className="absolute -top-32 -right-32 h-80 w-80 rounded-full bg-red-500/10 blur-3xl pointer-events-none" />
      <View className="absolute bottom-16 -left-24 h-72 w-72 rounded-full bg-orange-500/10 blur-3xl pointer-events-none" />

      <View className="flex-row items-center px-5 pb-3 pt-3">
        <Pressable
          className="size-10 items-center justify-center rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/70 active:bg-slate-50 dark:active:bg-slate-900 shadow-sm"
          onPress={() => router.back()}
        >
          <ChevronLeft color={colorScheme === 'dark' ? '#e2e8f0' : '#475569'} size={20} />
        </Pressable>

        <View className="ml-3 flex-1">
          <Text className="text-[22px] text-slate-900 dark:text-white" variant="title" weight="700">
            Wishlist
          </Text>
          <Text className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400" weight="600">
            Những chi nhánh bạn muốn quay lại
          </Text>
        </View>

        <Pressable
          className="size-10 items-center justify-center rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/70 active:bg-slate-55 dark:active:bg-slate-900 shadow-sm"
          onPress={() => fetchFavorites(true)}
        >
          {refreshing ? (
            <ActivityIndicator color="#f97316" size="small" />
          ) : (
            <RefreshCcw color="#f97316" size={18} />
          )}
        </Pressable>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#f97316" />
          <Text className="mt-3 text-[13px] text-slate-500 dark:text-slate-400" weight="600">
            Đang tải wishlist...
          </Text>
        </View>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(item) => item.id}
          renderItem={renderFavoriteItem}
          contentContainerClassName="px-5 pb-28 pt-2"
          ListHeaderComponent={
            <View className="mb-5 overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/75 p-5 shadow-sm">
              <View className="absolute -right-12 -top-14 h-40 w-40 rounded-full bg-red-500/15" />
              <View className="flex-row items-start gap-4">
                <View className="size-14 items-center justify-center rounded-2xl bg-red-500/15">
                  <Heart color="#ef4444" fill="#ef4444" size={28} />
                </View>
                <View className="flex-1">
                  <Text className="text-[18px] leading-6 text-slate-900 dark:text-white" weight="700">
                    Bộ sưu tập sân đua của bạn
                  </Text>
                  <Text className="mt-1.5 text-[12px] leading-5 text-slate-500 dark:text-slate-400" weight="600">
                    Lưu nhanh các chi nhánh đáng chú ý để so sánh, quay lại xem lịch trống và đặt sân nhanh hơn.
                  </Text>
                </View>
              </View>

              <View className="mt-5 flex-row gap-2">
                <View className="flex-1 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-3">
                  <Text className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500">Đã lưu</Text>
                  <Text className="mt-1 text-xl font-black text-slate-900 dark:text-white">{favoriteCount}</Text>
                </View>
                <View className="flex-1 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-3">
                  <Text className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500">Thành phố</Text>
                  <Text className="mt-1 text-xl font-black text-slate-900 dark:text-white">{cityCount}</Text>
                </View>
                <View className="flex-1 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-3">
                  <Text className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500">Đánh giá</Text>
                  <Text className="mt-1 text-xl font-black text-slate-900 dark:text-white">
                    {averageRating > 0 ? averageRating.toFixed(1) : '--'}
                  </Text>
                </View>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View className="mt-14 items-center rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/45 px-6 py-10 shadow-sm">
              <View className="size-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-900">
                <Compass color={colorScheme === 'dark' ? '#64748b' : '#94a3b8'} size={30} />
              </View>
              <Text className="mt-4 text-center text-[17px] text-slate-900 dark:text-white" weight="700">
                Wishlist đang trống
              </Text>
              <Text className="mt-2 text-center text-[12px] leading-5 text-slate-550 dark:text-slate-400" weight="600">
                Mở Khám phá và bấm trái tim trên chi nhánh bạn muốn lưu lại.
              </Text>
              <Pressable
                className="mt-5 h-11 flex-row items-center justify-center gap-2 rounded-2xl bg-[#ea580c] px-5 active:bg-[#f97316]"
                onPress={() => router.push('/(tabs)/explore' as any)}
              >
                <Search color="#ffffff" size={16} />
                <Text className="text-[13px] font-black text-white">Khám phá chi nhánh</Text>
              </Pressable>
            </View>
          }
          refreshControl={
            <RefreshControl
              colors={['#f97316']}
              onRefresh={() => fetchFavorites(true)}
              refreshing={refreshing}
              tintColor="#f97316"
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}
