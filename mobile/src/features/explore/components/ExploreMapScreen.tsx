import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { MapPin, Navigation, Search, ArrowLeft, RotateCcw } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';

import { getCafes } from '../api/explore.api';
import type { Cafe } from '../types/explore.types';
import { useLocation } from '@/shared/hooks/useLocation';
import { CafeDetailCard } from './CafeDetailCard';


const SAIGON_LATITUDE = 10.762622;
const SAIGON_LONGITUDE = 106.660172;

export function ExploreMapScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const params = useLocalSearchParams<{ cafeId?: string }>();
  const mapRef = useRef<MapView | null>(null);
  const { location: userLocation, requestLocation, loading: locationLoading } = useLocation();

  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [filteredCafes, setFilteredCafes] = useState<Cafe[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCafeId, setActiveCafeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load danh sách cơ sở từ API
  const fetchCafesList = useCallback(async () => {
    setLoading(true);
    const data = await getCafes();
    setCafes(data);
    setFilteredCafes(data);
    setLoading(false);

    if (params.cafeId) {
      const selected = data.find((c) => c.id === params.cafeId);
      if (selected && selected.latitude && selected.longitude) {
        setActiveCafeId(selected.id);
        setTimeout(() => {
          mapRef.current?.animateCamera(
            {
              center: {
                latitude: selected.latitude!,
                longitude: selected.longitude!,
              },
              zoom: 15,
            },
            { duration: 600 }
          );
        }, 500);
      }
    }
  }, [params.cafeId]);

  useEffect(() => {
    fetchCafesList();
  }, [fetchCafesList]);

  // Filter theo tên cơ sở
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredCafes(cafes);
    } else {
      const filtered = cafes.filter((c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredCafes(filtered);
    }
  }, [searchQuery, cafes]);

  // Xử lý khi nhấn vào Marker chi nhánh
  const handleSelectCafe = (cafe: Cafe) => {
    if (!cafe.latitude || !cafe.longitude) return;
    setActiveCafeId(cafe.id);

    // Camera di chuyển mượt mà căn giữa Marker
    mapRef.current?.animateCamera(
      {
        center: {
          latitude: cafe.latitude,
          longitude: cafe.longitude,
        },
        zoom: 15,
      },
      { duration: 600 }
    );
  };

  // Quay camera về vị trí người dùng
  const handleFocusUserLocation = () => {
    if (userLocation) {
      mapRef.current?.animateCamera(
        {
          center: {
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
          },
          zoom: 14,
        },
        { duration: 600 }
      );
    } else {
      requestLocation();
    }
  };

  const activeCafe = cafes.find((c) => c.id === activeCafeId);

  return (
    <SafeAreaView className="flex-grow flex-1 bg-[#f8fafc] dark:bg-[#0b0f19]">
      {/* Header tìm kiếm */}
      <View className="absolute top-12 left-4 right-4 z-10 flex-row items-center gap-2">
        <Pressable
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center rounded-xl bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 active:bg-slate-100 dark:active:bg-slate-800"
        >
          <ArrowLeft color={colorScheme === 'dark' ? '#ffffff' : '#475569'} size={20} />
        </Pressable>

        <View className="flex-1 flex-row h-11 items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0f172a]/95 px-3.5 shadow-md">
          <Search color="#94a3b8" size={18} />
          <TextInput
            placeholder="Tìm chi nhánh RC Cafe..."
            placeholderTextColor="#94a3b8"
            className="ml-2.5 flex-1 text-[14px] text-slate-900 dark:text-white font-medium py-0"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Bản đồ */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={StyleSheet.absoluteFillObject}
        customMapStyle={colorScheme === 'dark' ? darkMapStyle : undefined}
        initialRegion={{
          latitude: userLocation?.latitude || SAIGON_LATITUDE,
          longitude: userLocation?.longitude || SAIGON_LONGITUDE,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        }}
        showsUserLocation={false} // Tự vẽ user pin để đồng bộ
        showsMyLocationButton={false}
      >
        {/* User Location Marker */}
        {userLocation && (
          <Marker
            coordinate={{
              latitude: userLocation.latitude,
              longitude: userLocation.longitude,
            }}
            title="Vị trí của bạn"
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View className="items-center justify-center size-6 rounded-full border-2 border-white bg-blue-600 shadow-lg">
              <View className="size-2 rounded-full bg-white animate-ping" />
            </View>
          </Marker>
        )}

        {/* Cafe Location Markers */}
        {filteredCafes.map((cafe) => {
          if (!cafe.latitude || !cafe.longitude) return null;
          const isActive = cafe.id === activeCafeId;

          return (
            <Marker
              key={cafe.id}
              coordinate={{
                latitude: cafe.latitude,
                longitude: cafe.longitude,
              }}
              onPress={() => handleSelectCafe(cafe)}
              tracksViewChanges={false}
            >
              <View className="items-center justify-center">
                <View
                  className="items-center justify-center rounded-full border-2 shadow-lg"
                  style={{
                    width: isActive ? 44 : 34,
                    height: isActive ? 44 : 34,
                    borderColor: '#ffffff',
                    backgroundColor: isActive ? '#c2410c' : '#ea580c',
                  }}
                >
                  <MapPin color="#ffffff" size={isActive ? 22 : 17} strokeWidth={2.2} />
                </View>
                {/* Đuôi ghim nhọn khi active */}
                {isActive && (
                  <View
                    className="w-2.5 h-2.5 bg-[#c2410c] -mt-1.5"
                    style={{
                      transform: [{ rotate: '45deg' }],
                      borderBottomRightRadius: 2,
                    }}
                  />
                )}
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* Nút định vị & Nút tải lại */}
      <View className="absolute right-4 top-28 z-10 gap-2">
        <Pressable
          onPress={handleFocusUserLocation}
          className="h-10 w-10 items-center justify-center rounded-xl bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 active:bg-slate-100 dark:active:bg-slate-800 shadow-md"
        >
          {locationLoading ? (
            <ActivityIndicator size="small" color="#f97316" />
          ) : (
            <Navigation color={colorScheme === 'dark' ? '#ffffff' : '#475569'} size={18} />
          )}
        </Pressable>

        <Pressable
          onPress={fetchCafesList}
          className="h-10 w-10 items-center justify-center rounded-xl bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 active:bg-slate-100 dark:active:bg-slate-800 shadow-md"
        >
          {loading ? (
            <ActivityIndicator size="small" color="#f97316" />
          ) : (
            <RotateCcw color={colorScheme === 'dark' ? '#ffffff' : '#475569'} size={18} />
          )}
        </Pressable>
      </View>

      {/* Card chi tiết nổi ở dưới cùng bản đồ */}
      {activeCafe && (
        <CafeDetailCard
          cafe={activeCafe}
          userLocation={userLocation}
          onClose={() => setActiveCafeId(null)}
        />
      )}
    </SafeAreaView>
  );
}

// Giao diện bản đồ chế độ tối đồng bộ hệ Slate 950
const darkMapStyle = [
  {
    elementType: 'geometry',
    stylers: [{ color: '#0f172a' }],
  },
  {
    elementType: 'labels.text.fill',
    stylers: [{ color: '#64748b' }],
  },
  {
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#0b0f19' }],
  },
  {
    featureType: 'administrative.land_parcel',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#475569' }],
  },
  {
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [{ color: '#1e293b' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#64748b' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#0f291e' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#475569' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#1e293b' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#0f172a' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#94a3b8' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#334155' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#1e293b' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#1e293b' }],
  },
  {
    featureType: 'transit.station',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#64748b' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#0b1329' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#475569' }],
  },
];
