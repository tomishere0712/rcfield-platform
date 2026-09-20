import { Alert, Image, Linking, Pressable, View } from 'react-native';
import { MapPin, Star, Route, X, Calendar } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useColorScheme } from 'nativewind';
import type { Cafe, UserLocation } from '../types/explore.types';
import { Text } from '@/shared/ui/Text';

interface CafeDetailCardProps {
  cafe: Cafe;
  userLocation: UserLocation | null;
  onClose: () => void;
}

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

export function CafeDetailCard({ cafe, userLocation, onClose }: CafeDetailCardProps) {
  const router = useRouter();
  const { colorScheme } = useColorScheme();

  const distance =
    userLocation && cafe.latitude && cafe.longitude
      ? getHaversineDistance(
          userLocation.latitude,
          userLocation.longitude,
          cafe.latitude,
          cafe.longitude
        )
      : null;

  const handleOpenGoogleMaps = () => {
    if (!cafe.latitude || !cafe.longitude) {
      Alert.alert('Lỗi', 'Cơ sở này chưa cập nhật tọa độ bản đồ.');
      return;
    }
    const origin = userLocation ? `${userLocation.latitude},${userLocation.longitude}` : '';
    const destination = `${cafe.latitude},${cafe.longitude}`;
    const url = userLocation
      ? `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`
      : `https://www.google.com/maps/search/?api=1&query=${destination}`;
    
    Linking.openURL(url).catch(() => {
      Alert.alert('Lỗi', 'Không thể mở ứng dụng bản đồ Google Maps.');
    });
  };

  const handleBookNow = () => {
    router.push({
      pathname: '/booking/create',
      params: { cafeId: cafe.id },
    } as any);
  };

  const handleGoToDetail = () => {
    router.push(`/cafe-detail/${cafe.id}` as any);
  };

  return (
    <View
      style={{ zIndex: 99, elevation: 5 }}
      className="absolute bottom-6 left-4 right-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/95 p-4 shadow-2xl backdrop-blur-md"
    >
      {/* Nút đóng card */}
      <Pressable
        onPress={onClose}
        className="absolute right-3 top-3 z-10 h-7 w-7 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800/80 active:bg-slate-200 dark:active:bg-slate-700"
      >
        <X color={colorScheme === 'dark' ? '#94a3b8' : '#64748b'} size={16} />
      </Pressable>
 
      <Pressable onPress={handleGoToDetail} className="flex-row gap-3.5">
        {/* Ảnh cơ sở */}
        <Image
          source={{ uri: cafe.image }}
          className="h-20 w-20 rounded-xl object-cover bg-slate-100 dark:bg-slate-900"
        />
 
        {/* Thông tin cơ sở */}
        <View className="flex-1 justify-between pr-4">
          <View>
            <Text className="text-[15px] text-slate-900 dark:text-white" weight="700" numberOfLines={1}>
              {cafe.name}
            </Text>
            <Text className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400" numberOfLines={1}>
              {cafe.district}, {cafe.city}
            </Text>
          </View>
 
          <View className="flex-row items-center gap-3">
            {/* Đánh giá */}
            <View className="flex-row items-center gap-1">
              <Star color="#f59e0b" fill="#f59e0b" size={14} />
              <Text className="text-[12px] text-amber-500" weight="700">
                {cafe.rating > 0 ? cafe.rating.toFixed(1) : '—'}
              </Text>
            </View>
 
            {/* Khoảng cách */}
            {distance !== null ? (
              <View className="flex-row items-center gap-1">
                <MapPin color="#10b981" size={14} />
                <Text className="text-[12px] text-emerald-500 font-semibold">
                  {distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`}
                </Text>
              </View>
            ) : null}
          </View>
 
          {/* Giá slot */}
          <Text className="text-[13px] text-[#f97316]" weight="700">
            {cafe.priceRange}
          </Text>
        </View>
      </Pressable>
 
      {/* Nút hành động */}
      <View className="mt-4 flex-row gap-2.5">
        <Pressable
          onPress={handleOpenGoogleMaps}
          className="flex-1 flex-row h-10 items-center justify-center rounded-xl border border-blue-200 dark:border-blue-900/30 bg-blue-50 dark:bg-blue-950/20 active:bg-blue-100 dark:active:bg-blue-950/40 gap-1.5"
        >
          <Route color={colorScheme === 'dark' ? '#3b82f6' : '#2563eb'} size={16} />
          <Text className="text-[13px] text-blue-600 dark:text-blue-400" weight="700">
            Chỉ đường
          </Text>
        </Pressable>
 
        <Pressable
          onPress={handleBookNow}
          className="flex-1 flex-row h-10 items-center justify-center rounded-xl bg-[#ea580c] active:bg-[#f97316] gap-1.5"
        >
          <Calendar color="#ffffff" size={16} />
          <Text className="text-[13px] text-white" weight="700">
            Đặt lịch ngay
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
