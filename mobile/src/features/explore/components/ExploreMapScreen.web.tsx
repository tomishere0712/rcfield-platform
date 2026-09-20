import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { ArrowLeft, MapPin, Navigation, RotateCcw, Search } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';

import { getCafes } from '../api/explore.api';
import type { Cafe } from '../types/explore.types';
import { Text } from '@/shared/ui/Text';

/**
 * react-native-maps is only available in native builds. On web, retain the
 * useful discovery flow (search, details, directions and booking) without
 * importing a native map implementation into the bundle.
 */
export function ExploreMapScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const params = useLocalSearchParams<{ cafeId?: string }>();
  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadCafes = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      setCafes(await getCafes());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadCafes();
  }, [loadCafes]);

  const filteredCafes = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('vi-VN');
    const matched = query
      ? cafes.filter((cafe) => `${cafe.name} ${cafe.district} ${cafe.city}`.toLocaleLowerCase('vi-VN').includes(query))
      : cafes;

    if (!params.cafeId) return matched;
    return [...matched].sort((a, b) => Number(b.id === params.cafeId) - Number(a.id === params.cafeId));
  }, [cafes, params.cafeId, searchQuery]);

  const openDirections = (cafe: Cafe) => {
    if (!cafe.latitude || !cafe.longitude) return;
    void Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${cafe.latitude},${cafe.longitude}`
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-[#f8fafc] dark:bg-[#0b0f19]" edges={['top', 'left', 'right']}>
      <View className="border-b border-slate-200 bg-white px-5 pb-4 pt-3 dark:border-slate-800 dark:bg-[#0b0f19]">
        <View className="flex-row items-center gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
          >
            <ArrowLeft color={colorScheme === 'dark' ? '#ffffff' : '#475569'} size={19} />
          </Pressable>
          <View className="flex-1">
            <Text className="text-[16px] text-slate-900 dark:text-white" weight="700">
              Tìm cơ sở trên bản đồ
            </Text>
            <Text className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              Chọn cơ sở để xem chi tiết hoặc chỉ đường.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tải lại danh sách cơ sở"
            onPress={() => loadCafes(true)}
            className="h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
          >
            {loading || refreshing ? (
              <ActivityIndicator size="small" color="#f97316" />
            ) : (
              <RotateCcw color="#f97316" size={18} />
            )}
          </Pressable>
        </View>

        <View className="mt-4 flex-row items-center rounded-xl border border-slate-200 bg-slate-50 px-3 dark:border-slate-800 dark:bg-slate-900">
          <Search color="#94a3b8" size={17} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Tìm chi nhánh RC Cafe..."
            placeholderTextColor="#94a3b8"
            className="h-11 flex-1 px-2 text-[13px] text-slate-900 dark:text-white"
          />
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="gap-3 px-5 py-5 pb-10"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadCafes(true)} />}
          showsVerticalScrollIndicator={false}
        >
          <View className="rounded-2xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-500/20 dark:bg-orange-500/10">
            <View className="flex-row items-center gap-2">
              <MapPin color="#f97316" size={18} />
              <Text className="text-[13px] text-orange-800 dark:text-orange-200" weight="700">
                Bản đồ tương tác có trên ứng dụng iOS và Android
              </Text>
            </View>
            <Text className="mt-1 text-[11px] leading-4 text-orange-700 dark:text-orange-300">
              Trên web, bạn vẫn có thể tìm cơ sở và mở chỉ đường bằng Google Maps.
            </Text>
          </View>

          {filteredCafes.map((cafe) => (
            <View
              key={cafe.id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0f172a]/60"
            >
              <Pressable
                onPress={() => router.push(`/cafe-detail/${cafe.id}` as any)}
                className="flex-row gap-3 p-3 active:bg-slate-50 dark:active:bg-slate-900"
              >
                <Image source={{ uri: cafe.image }} className="h-16 w-16 rounded-xl bg-slate-100" resizeMode="cover" />
                <View className="flex-1 justify-center">
                  <Text className="text-[14px] text-slate-900 dark:text-white" weight="700" numberOfLines={1}>
                    {cafe.name}
                  </Text>
                  <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400" numberOfLines={1}>
                    {cafe.address || `${cafe.district}, ${cafe.city}`}
                  </Text>
                  <Text className="mt-1 text-[11px] text-[#f97316]" weight="700">
                    {cafe.priceRange}
                  </Text>
                </View>
              </Pressable>
              <View className="flex-row border-t border-slate-100 dark:border-slate-800">
                <Pressable
                  onPress={() => openDirections(cafe)}
                  disabled={!cafe.latitude || !cafe.longitude}
                  className="h-10 flex-1 flex-row items-center justify-center gap-1 border-r border-slate-100 dark:border-slate-800"
                >
                  <Navigation color={cafe.latitude && cafe.longitude ? '#2563eb' : '#94a3b8'} size={15} />
                  <Text className={`text-[11px] ${cafe.latitude && cafe.longitude ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} weight="700">
                    Chỉ đường
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push({ pathname: '/booking/create', params: { cafeId: cafe.id } } as any)}
                  className="h-10 flex-1 items-center justify-center"
                >
                  <Text className="text-[11px] text-[#f97316]" weight="700">
                    Đặt lịch
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}

          {filteredCafes.length === 0 ? (
            <View className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#0f172a]/40">
              <Text className="text-center text-[13px] text-slate-800 dark:text-slate-200" weight="700">
                Không tìm thấy cơ sở phù hợp
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
