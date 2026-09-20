import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
  Alert,
  Dimensions,
  Share,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import {
  ChevronLeft,
  ChevronDown,
  Heart,
  Share2,
  Star,
  MapPin,
  Clock,
  Car,
  Wallet,
  Wrench,
  Coffee,
  Plus,
  Minus,
  Sparkles,
} from 'lucide-react-native';

import { Text } from '@/shared/ui/Text';
import { useAuthStore } from '@/shared/store/auth-store';
import {
  getCafeById,
  listCafeImages,
  listCafeReviews,
  listPublicPackages,
  purchasePackage,
  listActivePromotions,
} from '../api/explore.api';
import { favoriteApi, favoriteLocal } from '../api/favorite.api';
import { bookingWizardApi } from '@/features/bookings/api/booking-wizard.api';
import { getVnpayReturnUrl } from '@/shared/lib/vnpay-return-url';
import { openVnpayPaymentSession } from '@/shared/lib/vnpay-browser';
import type { Cafe, PublicPackage, Review, ActivePromotion } from '../types/explore.types';
import type { TrackConfig, VehicleCatalog, MenuItem } from '@/features/bookings/api/booking-wizard.api';

interface CafeDetailScreenProps {
  cafeId: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ----------- Helper: Accordion Section -----------
interface AccordionSectionProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

function AccordionSection({ title, subtitle, children }: AccordionSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const animValue = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    const toValue = expanded ? 0 : 1;
    Animated.timing(animValue, {
      toValue,
      duration: 280,
      useNativeDriver: false,
    }).start();
    setExpanded(!expanded);
  };

  const chevronRotate = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <View className="gap-3">
      <Pressable
        onPress={toggle}
        className="flex-row items-center justify-between py-1 active:opacity-70"
      >
        <View className="flex-1 pr-3">
          <Text className="text-[14px] text-slate-900 dark:text-white font-bold uppercase tracking-wider">
            {title}
          </Text>
          {subtitle ? (
            <Text className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View className="size-8 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
          <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
            <ChevronDown color="#64748b" size={16} />
          </Animated.View>
        </View>
      </Pressable>

      {/* Nội dung accordion - dùng display none/flex thay maxHeight để tránh giật */}
      {expanded && (
        <Animated.View
          style={{
            opacity: animValue,
          }}
        >
          {children}
        </Animated.View>
      )}
    </View>
  );
}

// ----------- Main Component -----------
export function CafeDetailScreen({ cafeId }: CafeDetailScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);

  // Data states
  const [cafe, setCafe] = useState<Cafe | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsAggregate, setReviewsAggregate] = useState<any>(null);
  const [packages, setPackages] = useState<PublicPackage[]>([]);
  const [promotions, setPromotions] = useState<ActivePromotion[]>([]);
  const [tracks, setTracks] = useState<TrackConfig[]>([]);
  const [catalogs, setCatalogs] = useState<VehicleCatalog[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);

  // Loading & Error states
  const [loading, setLoading] = useState(true);
  const [purchasingPkgId, setPurchasingPkgId] = useState<string | null>(null);

  // Interaction states
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [fnbQuantities, setFnbQuantities] = useState<Record<string, number>>({});

  // Tính toán tổng tiền ước lượng tạm tính (1 slot + xe + F&B pre-selected)
  const totalEstimation = useMemo(() => {
    const slotFee = cafe?.slotFeeRate || 0;

    // Giá xe thuê
    let vehicleFee = 0;
    if (selectedVehicleId) {
      const match = catalogs.find((v) => v.id === selectedVehicleId);
      if (match) {
        vehicleFee = typeof match.hourlyRate === 'number' ? match.hourlyRate : Number(match.hourlyRate || 0);
      }
    }

    // Giá F&B
    const fnbFee = Object.entries(fnbQuantities).reduce((sum, [id, qty]) => {
      const match = menuItems.find((m) => m.id === id);
      const price = match ? (typeof match.price === 'number' ? match.price : Number(match.price || 0)) : 0;
      return sum + price * qty;
    }, 0);

    return slotFee + vehicleFee + fnbFee;
  }, [cafe?.slotFeeRate, selectedVehicleId, fnbQuantities, catalogs, menuItems]);

  // Fetch all details on mount
  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true);
      try {
        const [
          cafeData,
          imagesData,
          reviewsRes,
          packagesData,
          tracksData,
          catalogsData,
          menuData,
          localFavs,
          promosData,
        ] = await Promise.all([
          getCafeById(cafeId),
          listCafeImages(cafeId),
          listCafeReviews(cafeId),
          listPublicPackages(cafeId),
          bookingWizardApi.getCafeTrackConfigs(cafeId),
          bookingWizardApi.getCafeCatalogs(cafeId),
          bookingWizardApi.getCafeMenu(cafeId),
          favoriteLocal.getLocalFavorites(),
          listActivePromotions(cafeId),
        ]);

        if (cafeData) {
          setCafe(cafeData);
        } else {
          Alert.alert('Lỗi', 'Không tìm thấy chi nhánh này.');
          router.back();
          return;
        }

        setImages(imagesData.length > 0 ? imagesData : [cafeData.image]);
        setReviews(reviewsRes.data);
        setReviewsAggregate(reviewsRes.aggregate);
        setPackages(packagesData);
        setPromotions(promosData);
        setTracks(tracksData);
        setCatalogs(catalogsData);
        setMenuItems(menuData);
        setFavoriteIds(localFavs);

        // Đồng bộ wishlist nếu đăng nhập
        if (isAuthenticated) {
          try {
            const dbFavs = await favoriteApi.getFavorites();
            setFavoriteIds(dbFavs);
            await favoriteLocal.setLocalFavorites(dbFavs);
          } catch (e) {
            console.warn('[CafeDetail] Failed to pull synced favorites:', e);
          }
        }
      } catch (err) {
        console.error('[CafeDetailScreen] Fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, [cafeId, isAuthenticated, router]);

  const isFavorite = favoriteIds.includes(cafeId);

  // Toggle Favorite
  const handleToggleFavorite = async () => {
    const updated = isFavorite
      ? favoriteIds.filter((id) => id !== cafeId)
      : [...favoriteIds, cafeId];

    setFavoriteIds(updated);

    try {
      await favoriteLocal.setLocalFavorites(updated);
      if (isFavorite) {
        if (isAuthenticated) await favoriteApi.removeFavorite(cafeId);
      } else {
        if (isAuthenticated) await favoriteApi.addFavorite(cafeId);
      }
    } catch (e) {
      console.error('[CafeDetail] Toggle favorite error:', e);
      // rollback
      const oldFavs = await favoriteLocal.getLocalFavorites();
      setFavoriteIds(oldFavs);
    }
  };

  // Share cafe link
  const handleShare = async () => {
    try {
      await Share.share({
        message: `Khám phá sân đua RC chuyên nghiệp tại ${cafe?.name} - ${cafe?.address}. Tải ứng dụng RCField để đặt lịch ngay!`,
      });
    } catch (e) {
      console.warn(e);
    }
  };

  // Open Map Direction
  const handleOpenMapDirection = () => {
    router.push({
      pathname: '/explore-map',
      params: { cafeId },
    } as any);
  };

  // Copy Promo Code to Clipboard & Alert
  const handleCopyPromo = (code: string) => {
    Alert.alert('Thành công', `Đã sao chép mã khuyến mãi: ${code}`);
  };

  // Increase/Decrease F&B Pre-order
  const handleIncrementFnb = (id: string) => {
    setFnbQuantities((prev) => ({
      ...prev,
      [id]: (prev[id] || 0) + 1,
    }));
  };

  const handleDecrementFnb = (id: string) => {
    setFnbQuantities((prev) => {
      const current = prev[id] || 0;
      if (current <= 1) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: current - 1 };
    });
  };

  // Purchase membership package
  const handlePurchasePkg = async (pkg: PublicPackage) => {
    if (!isAuthenticated) {
      Alert.alert('Yêu cầu đăng nhập', 'Bạn cần đăng nhập để mua gói chơi hội viên.', [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Đăng nhập', onPress: () => router.push('/(auth)/login') },
      ]);
      return;
    }

    setPurchasingPkgId(pkg.id);
    try {
      const result = await purchasePackage(cafeId, pkg.id, getVnpayReturnUrl());
      if (result.payment_url) {
        await openVnpayPaymentSession(result.payment_url);
        Alert.alert(
          'Mua gói hội viên',
          'Yêu cầu mua gói chơi hội viên của bạn đang được hệ thống xử lý. Bạn có muốn chuyển tới trang quản lý gói để kiểm tra không?',
          [
            { text: 'Ở lại chi nhánh', style: 'cancel' },
            { text: 'Xem gói của tôi', onPress: () => router.push('/customer/packages' as any) },
          ]
        );
      } else {
        Alert.alert('Lỗi', 'Không thể khởi tạo link thanh toán.');
      }
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || 'Mua gói thất bại, vui lòng thử lại sau.';
      Alert.alert('Lỗi', errMsg);
    } finally {
      setPurchasingPkgId(null);
    }
  };

  // Navigate to Booking Wizard with selections (Smooth Transit)
  const handleBookNow = () => {
    const fnbString =
      Object.keys(fnbQuantities).length > 0
        ? encodeURIComponent(JSON.stringify(fnbQuantities))
        : '';

    router.push({
      pathname: '/booking/create',
      params: {
        cafeId,
        ...(selectedVehicleId && { vehicleId: selectedVehicleId }),
        ...(fnbString && { fnb: fnbString }),
      },
    } as any);
  };

  if (loading) {
    return (
      <View className="flex-1 bg-[#f8fafc] dark:bg-[#0b0f19] items-center justify-center">
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  if (!cafe) return null;

  return (
    <SafeAreaView
      className="flex-grow flex-1 bg-[#f8fafc] dark:bg-[#0b0f19]"
      edges={['top', 'left', 'right', 'bottom']}
    >
      <ScrollView contentContainerClassName="pb-40" showsVerticalScrollIndicator={false}>
        {/* 1. Hero Gallery */}
        <View className="relative w-full h-80 bg-slate-950">
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              setActiveImageIdx(idx);
            }}
            scrollEventThrottle={16}
          >
            {images.map((img, index) => (
              <Image
                key={index}
                source={{ uri: img }}
                style={{ width: SCREEN_WIDTH }}
                className="h-full object-cover"
              />
            ))}
          </ScrollView>

          {/* Indicator x/y */}
          <View className="absolute bottom-4 right-5 bg-black/60 px-3 py-1 rounded-full">
            <Text className="text-[10px] text-white font-bold">
              {activeImageIdx + 1} / {images.length}
            </Text>
          </View>

          {/* Back button */}
          <Pressable
            onPress={() => router.back()}
            className="absolute top-4 left-5 size-10 items-center justify-center rounded-full bg-black/50 active:bg-black/80"
          >
            <ChevronLeft color="#ffffff" size={20} />
          </Pressable>

          {/* Share & Favorite Buttons */}
          <View className="absolute top-4 right-5 flex-row gap-2.5">
            <Pressable
              onPress={handleShare}
              className="size-10 items-center justify-center rounded-full bg-black/50 active:bg-black/80"
            >
              <Share2 color="#ffffff" size={18} />
            </Pressable>

            <Pressable
              onPress={handleToggleFavorite}
              className="size-10 items-center justify-center rounded-full bg-black/50 active:bg-black/80"
            >
              <Heart
                color={isFavorite ? '#ef4444' : '#ffffff'}
                fill={isFavorite ? '#ef4444' : 'transparent'}
                size={18}
              />
            </Pressable>
          </View>
        </View>

        {/* Info Content Wrapper */}
        <View className="px-5 pt-5 gap-6">
          {/* 2. Basic Info */}
          <View>
            <View className="flex-row flex-wrap gap-1.5 mb-2">
              {cafe.trackTypes.map((type, idx) => (
                <View
                  key={idx}
                  className="rounded-lg bg-slate-200 dark:bg-slate-800 border border-slate-350 dark:border-slate-700 px-2.5 py-0.5"
                >
                  <Text className="text-[10px] text-slate-700 dark:text-slate-300 font-bold">
                    {type}
                  </Text>
                </View>
              ))}
            </View>
            <Text className="text-slate-900 dark:text-white text-2xl" weight="700">
              {cafe.name}
            </Text>
            <View className="flex-row items-center gap-1.5 mt-2">
              <MapPin color="#f97316" size={14} />
              <Text
                className="text-[12px] text-slate-500 dark:text-slate-400 flex-1 leading-4"
                numberOfLines={2}
              >
                {cafe.address}, {cafe.district}, {cafe.city}
              </Text>
            </View>
            <View className="flex-row items-center gap-1 mt-2.5">
              <Star color="#eab308" fill="#eab308" size={14} />
              <Text className="text-[13px] text-amber-500 font-bold">
                {cafe.rating > 0 ? cafe.rating.toFixed(1) : '—'}
              </Text>
              <Text className="text-[11px] text-slate-500 font-semibold">
                ({cafe.reviewsCount || 0} đánh giá)
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View className="h-[1px] bg-slate-200 dark:bg-slate-800/80" />

          {/* 3. Quick Facts */}
          <View className="grid flex-row flex-wrap gap-3">
            <View className="flex-1 min-w-[45%] flex-row items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/40 p-3 shadow-md">
              <View className="size-9 bg-orange-500/10 border border-orange-500/20 rounded-xl justify-center items-center">
                <Wallet color="#f97316" size={16} />
              </View>
              <View>
                <Text className="text-[10px] text-slate-500 font-bold uppercase">Giá slot</Text>
                <Text className="text-[12px] text-slate-900 dark:text-white font-extrabold mt-0.5">
                  {cafe.priceRange}
                </Text>
              </View>
            </View>

            <View className="flex-1 min-w-[45%] flex-row items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/40 p-3 shadow-md">
              <View className="size-9 bg-emerald-500/10 border border-emerald-500/20 rounded-xl justify-center items-center">
                <Clock color="#10b981" size={16} />
              </View>
              <View>
                <Text className="text-[10px] text-slate-500 font-bold uppercase">Slot chuẩn</Text>
                <Text className="text-[12px] text-slate-900 dark:text-white font-extrabold mt-0.5">
                  60 phút/slot
                </Text>
              </View>
            </View>

            <View className="flex-1 min-w-[45%] flex-row items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/40 p-3 shadow-md">
              <View className="size-9 bg-blue-500/10 border border-blue-500/20 rounded-xl justify-center items-center">
                <Car color="#3b82f6" size={16} />
              </View>
              <View>
                <Text className="text-[10px] text-slate-500 font-bold uppercase">Xe thuê</Text>
                <Text className="text-[12px] text-slate-900 dark:text-white font-extrabold mt-0.5">
                  {catalogs.length} mẫu xe
                </Text>
              </View>
            </View>

            <View className="flex-1 min-w-[45%] flex-row items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/40 p-3 shadow-md">
              <View className="size-9 bg-purple-500/10 border border-purple-500/20 rounded-xl justify-center items-center">
                <Star color="#a855f7" size={16} />
              </View>
              <View>
                <Text className="text-[10px] text-slate-500 font-bold uppercase">Đánh giá</Text>
                <Text className="text-[12px] text-slate-900 dark:text-white font-extrabold mt-0.5">
                  {cafe.rating > 0 ? `${cafe.rating.toFixed(1)}/5` : '—'}
                </Text>
              </View>
            </View>
          </View>

          {/* 4. Promo Banners */}
          <View className="gap-2.5">
            <View className="flex-row items-center gap-1.5">
              <Sparkles color="#f97316" size={16} />
              <Text className="text-[14px] text-slate-900 dark:text-white font-bold uppercase tracking-wider">
                Ưu đãi hôm nay
              </Text>
            </View>
            {promotions.length === 0 ? (
              <Text className="text-[11px] text-slate-500 font-medium pl-1">
                Hiện tại chi nhánh chưa có chương trình ưu đãi.
              </Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-3"
              >
                {promotions.map((p, idx) => (
                  <Pressable
                    key={idx}
                    onPress={() => handleCopyPromo(p.code)}
                    className="rounded-2xl border border-dashed border-orange-500/40 bg-orange-500/5 p-4 justify-center items-start min-w-[200px]"
                  >
                    <Text className="text-[13px] text-[#f97316]" weight="700">
                      Mã: {p.code}
                    </Text>
                    <Text className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-semibold">
                      {p.description ||
                        `Giảm ${p.discount_value}${p.discount_type === 'PERCENT' ? '%' : 'đ'}`}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Divider */}
          <View className="h-[1px] bg-slate-200 dark:bg-slate-800/80" />

          {/* 5. Track Configurations */}
          <View className="gap-3">
            <Text className="text-[14px] text-slate-900 dark:text-white font-bold uppercase tracking-wider">
              Cấu hình sân chạy
            </Text>
            {tracks.length === 0 ? (
              <Text className="text-[11px] text-slate-500 font-medium">
                Chi nhánh chưa cập nhật cấu hình làn.
              </Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-4"
              >
                {tracks.map((config) => (
                  <View
                    key={config.id}
                    className="w-64 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/40 overflow-hidden shadow-lg"
                  >
                    {config.images && config.images.length > 0 ? (
                      <Image
                        source={{ uri: config.images[0] }}
                        className="h-32 w-full object-cover"
                      />
                    ) : (
                      <View className="h-32 w-full bg-slate-100 dark:bg-slate-900 justify-center items-center">
                        <Text className="text-[11px] text-slate-550 dark:text-slate-600">
                          Chưa có ảnh
                        </Text>
                      </View>
                    )}
                    <View className="p-3">
                      <Text className="text-[13px] text-slate-900 dark:text-white" weight="700">
                        {config.track_type?.name || 'Sân đua'}
                      </Text>
                      <Text className="text-[10px] text-emerald-500 font-bold mt-1">
                        BYOC: tối đa {config.byoc_capacity || 0} xe/slot
                      </Text>
                      {config.description ? (
                        <Text
                          className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-4"
                          numberOfLines={2}
                        >
                          {config.description}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Divider */}
          <View className="h-[1px] bg-slate-200 dark:bg-slate-800/80" />

          {/* 6. Available Rental Vehicles - ACCORDION */}
          <AccordionSection
            title="Chọn thuê xe đua nhanh"
            subtitle="Xe chọn tại đây sẽ tự động đưa vào giỏ hàng đặt lịch."
          >
            {catalogs.length === 0 ? (
              <Text className="text-[11px] text-slate-500 font-medium">
                Không có xe thuê sẵn có.
              </Text>
            ) : (
              <View className="flex-row flex-wrap gap-3">
                {catalogs.map((v) => {
                  const isSelected = selectedVehicleId === v.id;
                  const rate =
                    typeof v.hourlyRate === 'number' ? v.hourlyRate : Number(v.hourlyRate || 0);

                  return (
                    <Pressable
                      key={v.id}
                      onPress={() => setSelectedVehicleId(isSelected ? null : v.id)}
                      className={`w-[47%] rounded-2xl border bg-white dark:bg-[#0f172a]/40 overflow-hidden p-2.5 shadow-md justify-between ${
                        isSelected
                          ? 'border-[#ea580c]'
                          : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      {v.coverImageUrl ? (
                        <Image
                          source={{ uri: v.coverImageUrl }}
                          className="h-24 w-full rounded-xl object-cover bg-slate-50 dark:bg-slate-900"
                        />
                      ) : (
                        <View className="h-24 w-full bg-slate-50 dark:bg-slate-900 rounded-xl justify-center items-center">
                          <Car color="#475569" size={24} />
                        </View>
                      )}
                      <View className="mt-2 flex-grow justify-between">
                        <View>
                          <Text
                            className="text-[12px] text-slate-900 dark:text-white"
                            weight="700"
                            numberOfLines={1}
                          >
                            {v.name}
                          </Text>
                          <Text className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {v.tier} · Tỷ lệ: 1:10
                          </Text>
                        </View>
                        <View className="mt-3 flex-row items-baseline justify-start border-t border-slate-200 dark:border-slate-800 pt-2 gap-1">
                          <Text className="text-[12px] text-[#f97316] font-bold">
                            {rate.toLocaleString('vi-VN')}đ
                          </Text>
                          <Text className="text-[8px] text-slate-500 font-semibold">/ giờ</Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </AccordionSection>

          {/* Divider */}
          <View className="h-[1px] bg-slate-200 dark:bg-slate-800/80" />

          {/* 7. Packages Section */}
          <View className="gap-3">
            <Text className="text-[14px] text-slate-900 dark:text-white font-bold uppercase tracking-wider">
              Gói slot hội viên
            </Text>
            {packages.length === 0 ? (
              <Text className="text-[11px] text-slate-500 font-medium">
                Chi nhánh chưa phát hành gói chơi.
              </Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-4"
              >
                {packages.map((pkg) => (
                  <View
                    key={pkg.id}
                    className="w-60 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-4 shadow-lg justify-between"
                  >
                    <View>
                      <View className="flex-row justify-between items-start">
                        <Text
                          className="text-[13px] text-slate-900 dark:text-white flex-1 pr-1 font-bold leading-5"
                          numberOfLines={1}
                        >
                          {pkg.name}
                        </Text>
                        {pkg.is_popular && (
                          <View className="bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-md">
                            <Text className="text-[8px] text-[#f97316] font-bold">Hot</Text>
                          </View>
                        )}
                      </View>
                      <Text
                        className="text-[10px] text-slate-550 dark:text-slate-400 mt-1 leading-4"
                        numberOfLines={2}
                      >
                        {pkg.description || 'Gói slot ưu đãi cho hội viên.'}
                      </Text>

                      <View className="h-[1px] bg-slate-200 dark:bg-slate-800/85 my-3" />

                      <View className="flex-row justify-between items-center bg-slate-50 dark:bg-slate-900/60 p-2 rounded-xl border border-slate-200 dark:border-slate-800/40">
                        <Text className="text-[10px] text-slate-500 font-bold">Số slot:</Text>
                        <Text className="text-[11px] text-slate-800 dark:text-white font-black">
                          {pkg.slot_count} slot
                        </Text>
                      </View>

                      <View className="mt-2.5 gap-1">
                        <Text className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">
                          • Hiệu lực: {pkg.valid_days} ngày
                        </Text>
                        {pkg.benefits.slice(0, 2).map((b, idx) => (
                          <Text key={idx} className="text-[9px] text-emerald-400 font-medium">
                            • {b}
                          </Text>
                        ))}
                      </View>
                    </View>

                    <View className="mt-4 gap-2 border-t border-slate-200 dark:border-slate-800 pt-3">
                      <View className="flex-row justify-between items-baseline">
                        <Text className="text-[9px] text-slate-500 font-bold">Giá gói:</Text>
                        <Text className="text-[13px] text-slate-900 dark:text-white font-black">
                          {Number(pkg.price).toLocaleString('vi-VN')}đ
                        </Text>
                      </View>
                      <Pressable
                        disabled={purchasingPkgId !== null}
                        onPress={() => handlePurchasePkg(pkg)}
                        className="h-8 rounded-lg bg-[#ea580c] active:bg-[#f97316] justify-center items-center"
                      >
                        {purchasingPkgId === pkg.id ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <Text className="text-[10px] text-white font-bold">Mua gói này</Text>
                        )}
                      </Pressable>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Divider */}
          <View className="h-[1px] bg-slate-200 dark:bg-slate-800/80" />

          {/* 8. F&B Pre-order - ACCORDION */}
          <AccordionSection
            title="Đặt trước đồ ăn & thức uống"
            subtitle="Phục vụ trực tiếp tại làn đua khi bạn Check-in."
          >
            {menuItems.length === 0 ? (
              <Text className="text-[11px] text-slate-500 font-medium">
                Thực đơn chưa được mở bán.
              </Text>
            ) : (
              <View className="gap-3">
                {menuItems.map((item) => {
                  const qty = fnbQuantities[item.id] || 0;
                  const price =
                    typeof item.price === 'number' ? item.price : Number(item.price || 0);

                  return (
                    <View
                      key={item.id}
                      className="flex-row items-center rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/40 p-2.5 shadow-md"
                    >
                      {item.image ? (
                        <Image
                          source={{ uri: item.image }}
                          className="h-16 w-16 rounded-xl object-cover"
                        />
                      ) : (
                        <View className="h-16 w-16 bg-slate-50 dark:bg-slate-900 rounded-xl justify-center items-center">
                          <Coffee color="#475569" size={20} />
                        </View>
                      )}
                      <View className="flex-1 ml-3 pr-2">
                        <Text className="text-[13px] text-slate-900 dark:text-white" weight="700">
                          {item.name}
                        </Text>
                        <Text className="text-[11px] text-[#f97316] font-bold mt-1">
                          {price.toLocaleString('vi-VN')}đ
                        </Text>
                      </View>

                      {/* +/- counter */}
                      {qty > 0 ? (
                        <View className="flex-row items-center border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 p-0.5 rounded-lg">
                          <Pressable
                            onPress={() => handleDecrementFnb(item.id)}
                            className="p-1"
                          >
                            <Minus color="#94a3b8" size={14} />
                          </Pressable>
                          <Text className="text-[12px] text-slate-900 dark:text-white font-bold min-w-[20px] text-center font-mono">
                            {qty}
                          </Text>
                          <Pressable
                            onPress={() => handleIncrementFnb(item.id)}
                            className="p-1"
                          >
                            <Plus color="#94a3b8" size={14} />
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable
                          onPress={() => handleIncrementFnb(item.id)}
                          className="h-8 px-3.5 border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 rounded-lg justify-center items-center active:bg-slate-200 dark:active:bg-slate-800"
                        >
                          <Text className="text-[10px] text-slate-600 dark:text-slate-300 font-bold">
                            Thêm
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </AccordionSection>

          {/* Divider */}
          <View className="h-[1px] bg-slate-200 dark:bg-slate-800/80" />

          {/* 9. Amenities & Rules */}
          <View className="gap-4">
            {/* Amenities */}
            {cafe.amenities && cafe.amenities.length > 0 ? (
              <View className="gap-2.5">
                <Text className="text-[14px] text-slate-900 dark:text-white font-bold uppercase tracking-wider">
                  Tiện ích cơ sở
                </Text>
                <View className="flex-row flex-wrap gap-2.5">
                  {cafe.amenities.map((item: any) => (
                    <View
                      key={item.id}
                      className="flex-row items-center gap-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/20 px-3 py-1.5 rounded-xl"
                    >
                      <Wrench color="#3b82f6" size={12} />
                      <Text className="text-[10px] text-slate-600 dark:text-slate-300 font-bold">
                        {item.title}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Rules */}
            {cafe.rules && cafe.rules.length > 0 ? (
              <View className="gap-2.5 mt-2">
                <Text className="text-[14px] text-slate-900 dark:text-white font-bold uppercase tracking-wider">
                  Nội quy đường đua
                </Text>
                <View className="gap-2">
                  {cafe.rules.map((rule: string, idx: number) => (
                    <View key={idx} className="flex-row items-start gap-2.5">
                      <View className="size-4 rounded-full border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 justify-center items-center mt-0.5">
                        <Text className="text-[8px] text-slate-500 dark:text-slate-400 font-black">
                          {idx + 1}
                        </Text>
                      </View>
                      <Text className="text-[10.5px] text-slate-500 dark:text-slate-400 flex-1 leading-4 font-semibold">
                        {rule}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>

          {/* Divider */}
          <View className="h-[1px] bg-slate-200 dark:bg-slate-800/80" />

          {/* 10. Reviews List */}
          <View className="gap-4">
            <Text className="text-[14px] text-slate-900 dark:text-white font-bold uppercase tracking-wider">
              Đánh giá khách hàng
            </Text>

            {/* 10.1 Reviews Summary Dashboard (Aggregate Card) */}
            {reviewsAggregate && reviewsAggregate.reviewCount > 0 ? (
              <View className="flex-row items-center border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/40 p-4 rounded-2xl shadow-sm gap-4">
                {/* Left side: Overall score */}
                <View className="items-center justify-center pr-4 border-r border-slate-200 dark:border-slate-800 min-w-[90px]">
                  <Text className="text-[32px] text-slate-900 dark:text-white font-mono" weight="700">
                    {reviewsAggregate.overallAvg ? reviewsAggregate.overallAvg.toFixed(1) : '5.0'}
                  </Text>
                  <View className="flex-row items-center gap-0.5 mt-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        color="#eab308"
                        fill={i < Math.round(reviewsAggregate.overallAvg || 5) ? '#eab308' : 'transparent'}
                        size={12}
                      />
                    ))}
                  </View>
                  <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-bold mt-1">
                    {reviewsAggregate.reviewCount} đánh giá
                  </Text>
                </View>

                {/* Right side: Categories sub-scores bars */}
                <View className="flex-1 gap-2">
                  {/* Staff rating */}
                  <View className="flex-row items-center justify-between">
                    <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-bold w-20">Nhân viên</Text>
                    <View className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 mx-2.5 overflow-hidden">
                      <View 
                        style={{ width: `${((reviewsAggregate.staffAvg || 5) / 5) * 100}%` }}
                        className="h-full rounded-full bg-amber-500" 
                      />
                    </View>
                    <Text className="text-[10px] text-slate-900 dark:text-white font-extrabold w-4 text-right font-mono">
                      {reviewsAggregate.staffAvg ? Math.round(reviewsAggregate.staffAvg) : 5}
                    </Text>
                  </View>

                  {/* Facility rating */}
                  <View className="flex-row items-center justify-between">
                    <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-bold w-20">Cơ sở vật chất</Text>
                    <View className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 mx-2.5 overflow-hidden">
                      <View 
                        style={{ width: `${((reviewsAggregate.facilityAvg || 5) / 5) * 100}%` }}
                        className="h-full rounded-full bg-amber-500" 
                      />
                    </View>
                    <Text className="text-[10px] text-slate-900 dark:text-white font-extrabold w-4 text-right font-mono">
                      {reviewsAggregate.facilityAvg ? Math.round(reviewsAggregate.facilityAvg) : 5}
                    </Text>
                  </View>

                  {/* Vehicle rating */}
                  <View className="flex-row items-center justify-between">
                    <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-bold w-20">Chất lượng xe</Text>
                    <View className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 mx-2.5 overflow-hidden">
                      <View 
                        style={{ width: `${((reviewsAggregate.vehicleAvg || 5) / 5) * 100}%` }}
                        className="h-full rounded-full bg-amber-500" 
                      />
                    </View>
                    <Text className="text-[10px] text-slate-900 dark:text-white font-extrabold w-4 text-right font-mono">
                      {reviewsAggregate.vehicleAvg ? Math.round(reviewsAggregate.vehicleAvg) : 5}
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}

            {/* 10.2 Individual Reviews List */}
            {reviews.length === 0 ? (
              <Text className="text-[11px] text-slate-500 font-medium pl-1">
                Chưa có lượt đánh giá nào cho chi nhánh này.
              </Text>
            ) : (
              <View className="gap-3.5">
                {reviews.map((rev) => (
                  <View
                    key={rev.id}
                    className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/20 p-4 rounded-2xl gap-2 shadow-sm"
                  >
                    <View className="flex-row justify-between items-start">
                      <View>
                        <Text className="text-[12px] text-slate-900 dark:text-white font-extrabold">
                          {isAuthenticated && user && rev.customerId === user.id ? 'Bạn' : (rev.user?.fullName || 'Khách hàng')}
                        </Text>
                        <Text className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5">
                          {rev.createdAt ? new Date(rev.createdAt).toLocaleDateString('vi-VN') : ''}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            color="#eab308"
                            fill={i < rev.rating ? '#eab308' : 'transparent'}
                            size={12}
                          />
                        ))}
                      </View>
                    </View>

                    {/* Review text comment */}
                    {rev.comment ? (
                      <Text className="text-[11px] text-slate-650 dark:text-slate-300 leading-4 font-medium mt-1">
                        {rev.comment}
                      </Text>
                    ) : null}

                    {/* Sub-scores Chips */}
                    {(rev.staffScore || rev.facilityScore || rev.vehicleScore) ? (
                      <View className="flex-row flex-wrap gap-1.5 mt-2">
                        {rev.staffScore ? (
                          <View className="rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-0.5">
                            <Text className="text-[9px] text-slate-650 dark:text-slate-300 font-bold">
                              Nhân viên: {rev.staffScore}/5
                            </Text>
                          </View>
                        ) : null}
                        {rev.facilityScore ? (
                          <View className="rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-0.5">
                            <Text className="text-[9px] text-slate-650 dark:text-slate-350 font-bold">
                              Cơ sở: {rev.facilityScore}/5
                            </Text>
                          </View>
                        ) : null}
                        {rev.vehicleScore ? (
                          <View className="rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-0.5">
                            <Text className="text-[9px] text-slate-650 dark:text-slate-350 font-bold">
                              Xe: {rev.vehicleScore}/5
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}

                    {rev.ownerResponse ? (
                      <View className="border-l-2 border-orange-500/80 pl-2.5 py-0.5 mt-2.5 bg-orange-500/5 rounded-r">
                        <Text className="text-[9px] text-[#f97316] font-bold">
                          Phản hồi từ chủ sân:
                        </Text>
                        <Text className="text-[10px] text-slate-500 dark:text-slate-400 leading-4 mt-0.5 font-medium">
                          {rev.ownerResponse}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* 11. Sticky Bottom CTA */}
      <View
        style={{ paddingBottom: Math.max(insets.bottom, 16), paddingTop: 16 }}
        className="absolute bottom-0 left-0 right-0 border-t border-slate-200 dark:border-slate-900 bg-white/95 dark:bg-[#0f172a]/95 px-5 flex-row justify-between items-center shadow-2xl"
      >
        <View>
          <Text className="text-[9px] text-slate-500 font-bold uppercase">Tạm tính (1 slot)</Text>
          <Text className="text-[15px] text-[#f97316] mt-0.5" weight="700">
            {totalEstimation.toLocaleString('vi-VN')}đ
          </Text>
        </View>

        <View className="flex-row gap-2">
          <Pressable
            onPress={handleOpenMapDirection}
            className="flex-row items-center justify-center border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] active:bg-slate-100 dark:active:bg-slate-900 py-3 px-4 rounded-xl gap-1.5"
          >
            <MapPin color="#f97316" size={16} />
            <Text className="text-[13px] text-slate-700 dark:text-slate-200 font-bold">
              Bản đồ
            </Text>
          </Pressable>

          <Pressable
            onPress={handleBookNow}
            className="bg-[#ea580c] active:bg-[#f97316] py-3 px-6 rounded-xl shadow-lg shadow-orange-500/10"
          >
            <Text className="text-[13px] text-white font-bold uppercase tracking-wider">
              Đặt lịch ngay
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
