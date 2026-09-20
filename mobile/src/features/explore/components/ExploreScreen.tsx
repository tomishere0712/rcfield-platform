import React, { useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  TextInput,
  View,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Map, MapPin, Search, Star, Compass, RotateCcw, Heart, Trophy } from 'lucide-react-native';

import { getCafes, listFeaturedPopups } from '../api/explore.api';
import { favoriteApi, favoriteLocal } from '../api/favorite.api';
import type { Cafe } from '../types/explore.types';
import { useLocation } from '@/shared/hooks/useLocation';
import { useAuthStore } from '@/shared/store/auth-store';
import { NotificationBellButton } from '@/features/notifications/components/NotificationBellButton';
import { Text } from '@/shared/ui/Text';
import { createScrollHandler } from '@/shared/ui/main-tab-events';

// Hàm tính khoảng cách Haversine (km)
function getHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Bán kính Trái Đất (km)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

interface FeaturedCarouselProps {
  items: any[];
  router: any;
}

function FeaturedCarousel({ items, router }: FeaturedCarouselProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const { width: SCREEN_WIDTH } = Dimensions.get('window');
  const itemWidth = SCREEN_WIDTH - 40; // Lề trái phải 20

  if (!items || items.length === 0) return null;

  return (
    <View className="mb-4 mt-2">
      <View className="flex-row items-center justify-between px-5 mb-2.5">
        <View className="flex-row items-center gap-1.5 bg-orange-500/10 border border-orange-500/20 px-2.5 py-0.5 rounded-full">
          <Trophy color="#ea580c" size={11} />
          <Text className="text-[10.5px] text-[#ea580c] font-black uppercase">Đặc biệt cho bạn</Text>
        </View>
        <Text className="text-[10px] text-slate-400 font-bold">
          {items.length} sự kiện nổi bật
        </Text>
      </View>

      <ScrollView
        horizontal
        pagingEnabled
        decelerationRate="fast"
        snapToInterval={SCREEN_WIDTH - 30}
        snapToAlignment="center"
        showsHorizontalScrollIndicator={false}
        onScroll={(e) => {
          const contentOffset = e.nativeEvent.contentOffset.x;
          const idx = Math.round(contentOffset / (SCREEN_WIDTH - 30));
          if (idx >= 0 && idx < items.length && idx !== activeIdx) {
            setActiveIdx(idx);
          }
        }}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: 20 }}
      >
        {items.map((item) => {
          const image = item.image_url || item.contest?.banner_image_url;
          const title = item.contest?.name || item.title;
          const subtitle = item.subtitle;

          return (
            <Pressable
              key={item.id}
              onPress={() => {
                if (item.contest_id) {
                  router.push(`/customer/contest-detail/${item.contest_id}` as any);
                } else {
                  router.push('/customer/contests' as any);
                }
              }}
              style={{ width: itemWidth, marginRight: items.length > 1 ? 10 : 0 }}
              className="h-44 rounded-2xl overflow-hidden relative shadow-sm bg-slate-900"
            >
              {image ? (
                <Image source={{ uri: image }} className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <View className="absolute inset-0 bg-[#1e293b] justify-center items-center" />
              )}
              <View className="absolute inset-0 bg-black/45" />

              <View className="absolute inset-0 p-4 justify-between">
                <View className="flex-row">
                  <View className="bg-orange-500 px-2 py-0.5 rounded-lg">
                    <Text className="text-[8px] text-white font-black uppercase">QUẢNG BÁ</Text>
                  </View>
                </View>

                <View>
                  {item.contest?.contest_format?.name && (
                    <Text className="text-[9px] text-[#f97316] font-bold uppercase tracking-wider">
                      {item.contest.contest_format.name}
                    </Text>
                  )}
                  <Text className="text-[17px] text-white font-black mt-0.5" numberOfLines={2}>
                    {title}
                  </Text>
                  {subtitle && (
                    <Text className="text-[10.5px] text-slate-300 font-semibold mt-1" numberOfLines={2}>
                      {subtitle}
                    </Text>
                  )}
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {items.length > 1 && (
        <View className="flex-row justify-center gap-1.5 mt-2.5">
          {items.map((_, index) => (
            <View
              key={index}
              className={`h-1.5 rounded-full transition-all ${
                index === activeIdx ? 'w-4 bg-[#ea580c]' : 'w-1.5 bg-slate-200 dark:bg-slate-800'
              }`}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const CITIES = ['Tất cả', 'Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng'];
const TRACK_TYPES = ['Tất cả', 'Drift', 'Off-Road', 'Speed'];

export function ExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const handleScroll = useRef(createScrollHandler()).current;
  const { location: userLocation } = useLocation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [filteredCafes, setFilteredCafes] = useState<Cafe[]>([]);
  const [featuredPopups, setFeaturedPopups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState('Tất cả');
  const [selectedTrackType, setSelectedTrackType] = useState('Tất cả');
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [filterFavorites, setFilterFavorites] = useState(false);
  const favoriteCount = favoriteIds.length;

  const fetchCafes = async () => {
    setLoading(true);
    try {
      const [cafesData, featuredData] = await Promise.all([
        getCafes(),
        listFeaturedPopups(),
      ]);
      setCafes(cafesData);
      setFeaturedPopups(featuredData);
    } catch (e) {
      console.error('[ExploreScreen] Error fetching cafes/featured:', e);
    } finally {
      setLoading(false);
    }
  };

  // 1. Tải và đồng bộ hóa Favorites khi load trang hoặc trạng thái login thay đổi
  useEffect(() => {
    const loadAndSyncFavorites = async () => {
      let localFavs = await favoriteLocal.getLocalFavorites();

      if (isAuthenticated) {
        try {
          const synced = await favoriteLocal.isSynced();
          if (!synced) {
            // Chưa đồng bộ: Gọi API sync gộp
            const merged = await favoriteApi.syncFavorites(localFavs);
            setFavoriteIds(merged);
            await favoriteLocal.setLocalFavorites(merged);
            await favoriteLocal.setSyncedStatus(true);
          } else {
            // Đã đồng bộ: Lấy trực tiếp từ server
            const dbFavs = await favoriteApi.getFavorites();
            setFavoriteIds(dbFavs);
            await favoriteLocal.setLocalFavorites(dbFavs);
          }
        } catch (e) {
          console.error('[ExploreScreen] Failed to sync/fetch favorites from BE:', e);
          setFavoriteIds(localFavs);
        }
      } else {
        // Chưa đăng nhập: Dùng local
        await favoriteLocal.clearSyncedStatus();
        setFavoriteIds(localFavs);
      }
    };

    loadAndSyncFavorites();
  }, [isAuthenticated]);

  useEffect(() => {
    fetchCafes();
  }, []);

  // 2. Xử lý Thích/Bỏ thích (Toggle Favorite)
  const handleToggleFavorite = async (cafeId: string) => {
    const isFav = favoriteIds.includes(cafeId);
    const updated = isFav ? favoriteIds.filter((id) => id !== cafeId) : [...favoriteIds, cafeId];

    // Cập nhật UI trước (Optimistic Update)
    setFavoriteIds(updated);

    try {
      await favoriteLocal.setLocalFavorites(updated);
      if (isFav) {
        if (isAuthenticated) {
          await favoriteApi.removeFavorite(cafeId);
        }
      } else {
        if (isAuthenticated) {
          await favoriteApi.addFavorite(cafeId);
        }
      }
    } catch (error) {
      console.error('[ExploreScreen] Error toggling favorite:', error);
      // Rollback
      const oldFavs = await favoriteLocal.getLocalFavorites();
      setFavoriteIds(oldFavs);
      Alert.alert('Thông báo', 'Không thể cập nhật trạng thái yêu thích. Vui lòng thử lại sau.');
    }
  };

  // 3. Bộ lọc logic & Sắp xếp
  useEffect(() => {
    let result = cafes;

    // Tìm kiếm theo tên
    if (searchQuery.trim()) {
      result = result.filter((c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Lọc theo thành phố
    if (selectedCity !== 'Tất cả') {
      result = result.filter((c) =>
        c.city.toLowerCase().includes(selectedCity.toLowerCase())
      );
    }

    // Lọc theo loại đường đua
    if (selectedTrackType !== 'Tất cả') {
      result = result.filter((c) =>
        c.trackTypes.some((t) => t.toLowerCase() === selectedTrackType.toLowerCase())
      );
    }

    // Lọc chỉ xem cơ sở đã thích
    if (filterFavorites) {
      result = result.filter((c) => favoriteIds.includes(c.id));
    }

    // Sắp xếp: Ưu tiên các cơ sở được thích lên đầu tiên
    const sorted = [...result].sort((a, b) => {
      const isFavA = favoriteIds.includes(a.id);
      const isFavB = favoriteIds.includes(b.id);
      if (isFavA && !isFavB) return -1;
      if (!isFavA && isFavB) return 1;
      return 0;
    });

    setFilteredCafes(sorted);
  }, [searchQuery, selectedCity, selectedTrackType, cafes, favoriteIds, filterFavorites]);

  const handleSelectCafe = (cafeId: string) => {
    // Điều hướng sang màn hình Chi tiết chi nhánh thay vì Explore Map
    router.push(`/cafe-detail/${cafeId}` as any);
  };

  const handleOpenMap = () => {
    router.push('/explore-map' as any);
  };

  const renderCafeItem = ({ item }: { item: Cafe }) => {
    const distance =
      userLocation && item.latitude && item.longitude
        ? getHaversineDistance(
            userLocation.latitude,
            userLocation.longitude,
            item.latitude,
            item.longitude
          )
        : null;

    const isFav = favoriteIds.includes(item.id);

    return (
      <Pressable
        onPress={() => handleSelectCafe(item.id)}
        className="mx-5 mb-4 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 shadow-md active:bg-slate-100 dark:active:bg-slate-900/60"
      >
        <View className="relative h-44 w-full bg-slate-950">
          <Image source={{ uri: item.image }} className="h-full w-full object-cover" />
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              handleToggleFavorite(item.id);
            }}
            className="absolute top-3 right-3 size-9 items-center justify-center rounded-full bg-black/40 active:bg-black/60"
          >
            <Heart
              color={isFav ? '#ef4444' : '#ffffff'}
              fill={isFav ? '#ef4444' : 'transparent'}
              size={18}
            />
          </Pressable>
        </View>
        
        <View className="p-4">
          <View className="flex-row justify-between items-start">
            <View className="flex-1 pr-2">
              <Text className="text-[16px] text-slate-900 dark:text-white" weight="700">
                {item.name}
              </Text>
              <Text className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
                {item.address}, {item.district}, {item.city}
              </Text>
            </View>
            <View className="flex-row items-center gap-1 bg-amber-500/10 px-2 py-1 rounded-lg">
              <Star color="#f59e0b" fill="#f59e0b" size={12} />
              <Text className="text-[11px] text-amber-500 font-bold">
                {item.rating > 0 ? item.rating.toFixed(1) : '—'}
              </Text>
            </View>
          </View>

          {/* Track types tags */}
          <View className="flex-row flex-wrap gap-1.5 mt-3.5">
            {item.trackTypes.map((t, idx) => (
              <View
                key={idx}
                className="rounded-lg bg-orange-600/10 border border-orange-500/20 px-2 py-0.5"
              >
                <Text className="text-[10px] text-[#f97316]" weight="700">
                  {t}
                </Text>
              </View>
            ))}
          </View>

          {/* Divider */}
          <View className="h-[1px] bg-slate-200 dark:bg-slate-800/80 my-3.5" />

          <View className="flex-row justify-between items-center">
            {distance !== null ? (
              <View className="flex-row items-center gap-1">
                <MapPin color="#10b981" size={13} />
                <Text className="text-[12px] text-emerald-500 font-semibold">
                  Cách bạn {distance < 1 ? `${Math.round(distance * 1000)}m` : `${distance.toFixed(1)}km`}
                </Text>
              </View>
            ) : (
              <View className="flex-row items-center gap-1">
                <MapPin color="#64748b" size={13} />
                <Text className="text-[12px] text-slate-500 dark:text-slate-400">Không rõ khoảng cách</Text>
              </View>
            )}

            <View className="flex-row items-baseline gap-0.5">
              <Text className="text-[15px] text-[#f97316]" weight="700">
                {item.priceRange.split(' ')[0]}
              </Text>
              <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">/slot</Text>
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView className="flex-grow flex-1 bg-[#f8fafc] dark:bg-[#0b0f19]" edges={['top', 'left', 'right']}>
      {/* Background Glow */}
      <View className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-[#f97316]/5 blur-3xl pointer-events-none opacity-30 dark:opacity-100" />

      {/* Header Title */}
      <View className="px-5 pt-4 pb-2">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Text className="text-[22px] text-slate-900 dark:text-white" weight="700">
              Khám phá chi nhánh
            </Text>
            <Text className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 font-semibold">
              Tìm kiếm và đặt lịch sân chạy RC của bạn
            </Text>
          </View>

          <View className="flex-row items-center gap-2">
            <Pressable
              className="relative size-11 items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/80 active:bg-slate-100 dark:active:bg-slate-900"
              onPress={() => router.push('/favorites' as any)}
            >
              <Heart
                color={favoriteCount > 0 ? '#ef4444' : '#94a3b8'}
                fill={favoriteCount > 0 ? '#ef4444' : 'transparent'}
                size={20}
              />
              {favoriteCount > 0 ? (
                <View className="absolute -right-1 -top-1 min-w-5 rounded-full border-2 border-[#0b0f19] bg-red-500 px-1.5 py-0.5">
                  <Text className="text-center text-[9px] font-black text-white">
                    {favoriteCount > 9 ? '9+' : favoriteCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
            {isAuthenticated && <NotificationBellButton size="md" />}
          </View>
        </View>
      </View>

      {/* Tìm kiếm */}
      <View className="mx-5 my-3 flex-row h-11 items-center rounded-xl border border-slate-250 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 px-3.5 shadow-sm">
        <Search color="#94a3b8" size={18} />
        <TextInput
          placeholder="Tìm tên chi nhánh..."
          placeholderTextColor="#94a3b8"
          className="ml-2.5 flex-1 text-[13px] text-slate-900 dark:text-white font-medium py-0"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')}>
            <RotateCcw color="#94a3b8" size={15} />
          </Pressable>
        )}
      </View>

      {/* Bộ lọc ngang */}
      <View className="mb-4">
        {/* Lọc Thành Phố */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="px-5 gap-1.5"
          className="py-1"
        >
          {CITIES.map((city) => {
            const isSelected = selectedCity === city;
            return (
              <Pressable
                key={city}
                onPress={() => setSelectedCity(city)}
                className={`rounded-xl border px-3.5 py-1.5 ${
                  isSelected
                    ? 'border-[#ea580c] bg-[#ea580c]'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/40'
                }`}
              >
                <Text
                  className={`text-[11px] font-bold ${isSelected ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  {city}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Lọc Track Type & Lọc đã thích */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="px-5 gap-1.5 mt-2"
          className="py-1"
        >
          {/* Lọc Yêu thích nhanh */}
          <Pressable
            onPress={() => setFilterFavorites(!filterFavorites)}
            className={`rounded-xl border px-3.5 py-1.5 flex-row items-center gap-1 ${
              filterFavorites
                ? 'border-[#ef4444] bg-[#ef4444]/20'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/40'
            }`}
          >
            <Heart color={filterFavorites ? '#ef4444' : '#94a3b8'} fill={filterFavorites ? '#ef4444' : 'transparent'} size={11} />
            <Text
              className={`text-[11px] font-bold ${filterFavorites ? 'text-[#ef4444]' : 'text-slate-550 dark:text-slate-400'}`}
            >
              Cơ sở đã thích
            </Text>
          </Pressable>

          {TRACK_TYPES.map((type) => {
            const isSelected = selectedTrackType === type;
            return (
              <Pressable
                key={type}
                onPress={() => setSelectedTrackType(type)}
                className={`rounded-xl border px-3.5 py-1.5 ${
                  isSelected
                    ? 'border-[#ea580c] bg-[#ea580c]'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/40'
                }`}
              >
                <Text
                  className={`text-[11px] font-bold ${isSelected ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  {type}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Danh sách */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      ) : (
        <FlatList
          data={filteredCafes}
          renderItem={renderCafeItem}
          keyExtractor={(item) => item.id}
          contentContainerClassName="pb-28"
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onRefresh={fetchCafes}
          refreshing={loading}
          ListHeaderComponent={
            <>
              {featuredPopups.length > 0 && (
                <FeaturedCarousel items={featuredPopups} router={router} />
              )}
              {filteredCafes.length > 0 && (
                <View className="px-5 pb-2.5">
                  <Text className="text-[14px] text-slate-800 dark:text-slate-300 font-bold uppercase tracking-wider">
                    Tất cả chi nhánh
                  </Text>
                </View>
              )}
            </>
          }
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center px-8 py-12">
              <View className="size-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 mb-4">
                <Compass color="#94a3b8" size={28} />
              </View>
              <Text className="text-[15px] text-slate-800 dark:text-slate-300 font-bold">Không tìm thấy chi nhánh nào</Text>
              <Text className="text-[11px] text-slate-500 dark:text-slate-400 text-center mt-1 leading-4 font-semibold">
                Thử thay đổi từ khoá tìm kiếm hoặc đặt lại các bộ lọc xem sao nhé.
              </Text>
            </View>
          }
        />
      )}

      {/* Nút nổi Bản đồ - luôn cao hơn bottom tab */}
      <Pressable
        onPress={handleOpenMap}
        className="absolute right-5 h-14 w-14 items-center justify-center rounded-full bg-[#ea580c] active:bg-[#f97316] shadow-xl"
        style={{ elevation: 5, bottom: insets.bottom + 72 }}
      >
        <Map color="#ffffff" size={24} />
      </Pressable>
    </SafeAreaView>
  );
}
