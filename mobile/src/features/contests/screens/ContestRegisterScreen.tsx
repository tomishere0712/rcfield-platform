import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Shield, Car, Check, Camera, CreditCard } from 'lucide-react-native';
import { contestsApi, type ContestRentalOptions, type ContestAvailableRentalCatalogGroup } from '../api/contests.api';
import type { Contest } from '../types/contests.types';
import { useAuthStore } from '@/shared/store/auth-store';

// Danh sách ảnh xe RC Drift demo chất lượng cao phục vụ đăng ký BYOC nhanh chóng
const MOCK_BYOC_PHOTOS = [
  'https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1534349762230-e0cadf78f5da?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1568605117036-5fecc6207a71?auto=format&fit=crop&w=400&q=80',
];

export const ContestRegisterScreen: React.FC = () => {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  const [contest, setContest] = useState<Contest | null>(null);
  const [rentalOptions, setRentalOptions] = useState<ContestRentalOptions | null>(null);
  const [availableVehicles, setAvailableVehicles] = useState<ContestAvailableRentalCatalogGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [vehicleSource, setVehicleSource] = useState<'RENTAL' | 'BYOC'>('RENTAL');
  
  // Rental states
  const [selectedCafeId, setSelectedCafeId] = useState<string>('');
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>('');

  // BYOC states
  const [byocName, setByocName] = useState('');
  const [byocBrand, setByocBrand] = useState('');
  const [byocClass, setByocClass] = useState('1/10 Drift RWD');
  const [byocNotes, setByocNotes] = useState('');
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);

  useEffect(() => {
    console.log(`[ContestRegisterScreen] Component mounted, id = ${id}, user = ${user?.email}`);
  }, [id, user]);

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;
      setLoading(true);
      console.log(`[ContestRegisterScreen] loadData starting for contest ${id}...`);
      try {
        const detail = await contestsApi.getContestDetail(id);
        console.log(`[ContestRegisterScreen] getContestDetail success:`, {
          name: detail?.name,
          policy: detail?.vehicle_rule?.vehicle_policy,
          entry_fee: detail?.entry_fee
        });
        setContest(detail);
        
        // Nếu chính sách giải cho phép thuê xe (RENTAL_ONLY hoặc MIXED)
        const policy = detail?.vehicle_rule?.vehicle_policy;
        if (detail && (policy === 'RENTAL_ONLY' || policy === 'MIXED')) {
          setVehicleSource('RENTAL');
          console.log(`[ContestRegisterScreen] Fetching rental options...`);
          const options = await contestsApi.getRentalOptions(id);
          console.log(`[ContestRegisterScreen] getRentalOptions success. Cafes count: ${options?.cafes?.length || 0}`);
          setRentalOptions(options);
          
          if (options && options.cafes.length > 0) {
            // Tự động chọn chi nhánh đầu tiên làm mặc định
            const defaultCafeId = options.cafes[0].id;
            setSelectedCafeId(defaultCafeId);
            console.log(`[ContestRegisterScreen] Default cafe selected: ${defaultCafeId}. Fetching available vehicles...`);
            
            // Tải danh sách xe khả dụng cho chi nhánh này
            setVehiclesLoading(true);
            const vehicles = await contestsApi.getAvailableRentalVehicles(id, defaultCafeId);
            console.log(`[ContestRegisterScreen] getAvailableRentalVehicles success: ${vehicles.length} catalogs`);
            setAvailableVehicles(vehicles);
            setVehiclesLoading(false);

            if (vehicles.length > 0) {
              // Ưu tiên chọn dòng xe đầu tiên còn trống
              const firstAvailable = vehicles.find(v => v.remaining_slots > 0) || vehicles[0];
              setSelectedCatalogId(firstAvailable.catalog_id);
              console.log(`[ContestRegisterScreen] Default vehicle catalog selected: ${firstAvailable.catalog_id}`);
            }
          }
        } else {
          setVehicleSource('BYOC');
          console.log(`[ContestRegisterScreen] Contest is BYOC only.`);
        }
      } catch (error) {
        console.error('[ContestRegisterScreen] Load error in useEffect:', error);
        Alert.alert('Lỗi', 'Không thể tải dữ liệu đăng ký.');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [id]);

  // Tải lại danh sách xe khả dụng khi người dùng đổi chi nhánh thi đấu
  useEffect(() => {
    const fetchVehicles = async () => {
      if (!id || !selectedCafeId) {
        setAvailableVehicles([]);
        return;
      }
      console.log(`[ContestRegisterScreen] fetchVehicles triggered for cafe: ${selectedCafeId}`);
      setVehiclesLoading(true);
      try {
        const vehicles = await contestsApi.getAvailableRentalVehicles(id, selectedCafeId);
        console.log(`[ContestRegisterScreen] fetchVehicles success for cafe ${selectedCafeId}: ${vehicles.length} catalogs`);
        setAvailableVehicles(vehicles);
        if (vehicles.length > 0) {
          // Kiểm tra xem dòng xe đã chọn trước đó có khả dụng ở chi nhánh mới này không
          const exists = vehicles.some(v => v.catalog_id === selectedCatalogId && v.remaining_slots > 0);
          if (!exists) {
            const firstAvailable = vehicles.find(v => v.remaining_slots > 0) || vehicles[0];
            setSelectedCatalogId(firstAvailable.catalog_id);
            console.log(`[ContestRegisterScreen] Switched to first available vehicle: ${firstAvailable.catalog_id}`);
          }
        } else {
          setSelectedCatalogId('');
        }
      } catch (error) {
        console.error('[ContestRegisterScreen] Error fetching vehicles:', error);
      } finally {
        setVehiclesLoading(false);
      }
    };

    // Chỉ gọi khi contest đã được load (tránh gọi trùng lặp lúc khởi động)
    if (contest && vehicleSource === 'RENTAL') {
      fetchVehicles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, selectedCafeId, vehicleSource]);

  const handlePhotoToggle = (url: string) => {
    if (selectedPhotos.includes(url)) {
      setSelectedPhotos(selectedPhotos.filter((p) => p !== url));
    } else {
      setSelectedPhotos([...selectedPhotos, url]);
    }
  };

  const handleRegisterSubmit = async () => {
    if (!contest) return;

    // Validate
    if (vehicleSource === 'RENTAL') {
      if (!selectedCafeId) {
        Alert.alert('Cảnh báo', 'Vui lòng chọn chi nhánh thi đấu.');
        return;
      }
      if (!selectedCatalogId) {
        Alert.alert('Cảnh báo', 'Vui lòng chọn dòng xe thi đấu muốn thuê.');
        return;
      }
      const currentVehicle = availableVehicles.find(v => v.catalog_id === selectedCatalogId);
      if (currentVehicle && currentVehicle.remaining_slots <= 0) {
        Alert.alert('Cảnh báo', 'Dòng xe thi đấu này đã hết xe khả dụng. Vui lòng chọn dòng xe khác.');
        return;
      }
    }

    if (vehicleSource === 'BYOC') {
      if (!byocName.trim()) {
        Alert.alert('Cảnh báo', 'Vui lòng điền tên xe cá nhân của bạn.');
        return;
      }
      if (!byocBrand.trim()) {
        Alert.alert('Cảnh báo', 'Vui lòng điền hãng xe (ví dụ: Yokomo, MST...).');
        return;
      }
      if (selectedPhotos.length < 2) {
        Alert.alert('Cảnh báo', 'Theo quy chế của giải đấu, bạn cần cung cấp ít nhất 2 ảnh chụp xe BYOC để Ban tổ chức kiểm định kỹ thuật.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload: any = {
        vehicle_source: vehicleSource,
      };

      if (vehicleSource === 'RENTAL') {
        payload.rental = {
          cafe_id: selectedCafeId,
          vehicle_catalog_id: selectedCatalogId,
        };
      } else {
        payload.byoc_vehicle_name = byocName;
        payload.byoc_vehicle_brand = byocBrand;
        payload.byoc_vehicle_class = byocClass;
        payload.byoc_vehicle_notes = byocNotes;
        payload.byoc_vehicle_photos = selectedPhotos;
      }

      await contestsApi.registerContest(contest.id, payload);
      
      Alert.alert('Đăng ký thành công', 'Hồ sơ đăng ký của bạn đã được khởi tạo thành công.', [
        {
          text: 'Tiếp tục thanh toán',
          onPress: () => {
            router.replace(`/customer/contest-detail/${contest.id}` as any);
          },
        },
      ]);
    } catch (error: any) {
      console.error('[ContestRegisterScreen] Register error:', error);
      const msg = error.response?.data?.message || 'Có lỗi xảy ra trong quá trình đăng ký. Vui lòng thử lại.';
      Alert.alert('Lỗi đăng ký', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const formatPrice = (price: any) => {
    const num = Number(price);
    if (isNaN(num) || num <= 0) return 'Miễn phí';
    return `${num.toLocaleString('vi-VN')} VND`;
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#0b0f19' : '#ffffff' }}>
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  if (!contest) {
    console.log('[ContestRegisterScreen] Render: contest is null!');
    return null;
  }
  
  const policy = contest.vehicle_rule?.vehicle_policy || 'MIXED';

  // Lấy các thông tin cho Tóm tắt đăng ký
  const profileName = user?.fullName || 'Ẩn danh';
  const profileEmail = user?.email || '--';
  const selectedRentalCafe = rentalOptions?.cafes?.find(c => c.id === selectedCafeId);
  const selectedVehicleGroup = availableVehicles.find(v => v.catalog_id === selectedCatalogId);
  const selectedRentalCatalogName = selectedVehicleGroup?.catalog_name || '';
  const selectedRentalCatalogTier = selectedVehicleGroup?.tier || '';

  // Kiểm tra tính hợp lệ của thông tin để cho phép bấm nút Submit
  const detailsValid =
    vehicleSource === 'BYOC'
      ? byocName.trim().length >= 2 && selectedPhotos.length >= 2
      : Boolean(selectedCafeId && selectedCatalogId && selectedVehicleGroup && (selectedVehicleGroup.remaining_slots ?? 0) > 0);

  console.log('[ContestRegisterScreen] Rendering components', {
    loading,
    contestName: contest.name,
    vehicleSource,
    selectedCafeId,
    selectedCatalogId,
    detailsValid,
    availableVehiclesCount: availableVehicles.length
  });

  const renderContent = () => {
    try {
      return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 42 }} showsVerticalScrollIndicator={false}>
          {/* Step Header - Card Quy Định (Đỏ nổi bật) */}
          <View className="mb-6 flex-row items-center bg-red-50 dark:bg-red-950/30 p-4 rounded-2xl border-2 border-red-200 dark:border-red-800/60">
            <View className="h-9 w-9 rounded-full bg-red-100 dark:bg-red-900/60 items-center justify-center mr-3">
              <Shield size={18} color="#ef4444" />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-extrabold text-red-700 dark:text-red-300">Quy định giải đấu</Text>
              <Text className="text-[10px] font-semibold text-red-500 dark:text-red-400 mt-0.5">
                Giải đấu áp dụng phí tham gia {formatPrice(contest.entry_fee)}. Bạn cần thanh toán giữ chỗ.
              </Text>
            </View>
          </View>

          {/* Vehicle Source Toggle (Only if MIXED policy) */}
          {policy === 'MIXED' && (
            <View className="mb-6">
              <Text className="text-sm font-extrabold text-gray-900 dark:text-white mb-3">Hình thức xe thi đấu</Text>
              <View className="flex-row gap-3">
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setVehicleSource('RENTAL')}
                  className={`flex-1 p-4 rounded-2xl border-2 items-center ${
                    vehicleSource === 'RENTAL' ? 'border-orange-500 bg-orange-50/10' : 'border-gray-100 dark:border-slate-800/80 bg-white dark:bg-[#0f172a]/60'
                  }`}
                >
                  <Car size={24} color={vehicleSource === 'RENTAL' ? '#ea580c' : '#94a3b8'} />
                  <Text className={`text-xs mt-2 ${vehicleSource === 'RENTAL' ? 'font-extrabold text-gray-900 dark:text-white' : 'font-bold text-gray-500 dark:text-slate-400'}`}>
                    Thuê xe tại quầy
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setVehicleSource('BYOC')}
                  className={`flex-1 p-4 rounded-2xl border-2 items-center ${
                    vehicleSource === 'BYOC' ? 'border-orange-500 bg-orange-50/10' : 'border-gray-100 dark:border-slate-800/80 bg-white dark:bg-[#0f172a]/60'
                  }`}
                >
                  <Shield size={24} color={vehicleSource === 'BYOC' ? '#ea580c' : '#94a3b8'} />
                  <Text className={`text-xs mt-2 ${vehicleSource === 'BYOC' ? 'font-extrabold text-gray-900 dark:text-white' : 'font-bold text-gray-500 dark:text-slate-400'}`}>
                    Xe cá nhân (BYOC)
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {policy !== 'MIXED' && (
            <View className="mb-6 p-4 bg-gray-50 dark:bg-slate-900/30 rounded-2xl border border-gray-100 dark:border-slate-800/80">
              <Text className="text-xs font-semibold text-gray-600 dark:text-slate-400">
                {policy === 'BYOC_ONLY'
                  ? 'Giải này chỉ nhận xe cá nhân (BYOC) — khai báo xe của bạn bên dưới.'
                  : 'Giải này yêu cầu thuê xe tại quầy — chọn chi nhánh và dòng xe bên dưới.'}
              </Text>
            </View>
          )}

          {/* FOR RENTAL OPTION */}
          {vehicleSource === 'RENTAL' && (
            <View style={{ gap: 24 }}>
              {/* Chi nhánh picker (Chỉ hiển thị nếu có nhiều hơn 1 chi nhánh) */}
              {rentalOptions && rentalOptions.cafes && rentalOptions.cafes.length > 1 && (
                <View>
                  <Text className="text-sm font-extrabold text-gray-900 dark:text-white mb-3">Chi nhánh thi đấu</Text>
                  <View style={{ gap: 8 }}>
                    {rentalOptions.cafes.map((cafe) => {
                      const isSelected = cafe.id === selectedCafeId;
                      return (
                        <TouchableOpacity
                          key={cafe.id}
                          activeOpacity={0.8}
                          onPress={() => setSelectedCafeId(cafe.id)}
                          className={`flex-row items-center justify-between p-4 rounded-2xl border-2 bg-white dark:bg-[#0f172a]/60 ${
                            isSelected ? 'border-orange-500 bg-orange-50/5' : 'border-gray-100 dark:border-slate-800/80'
                          }`}
                        >
                          <View>
                            <Text className={`text-xs font-extrabold ${isSelected ? 'text-orange-600 dark:text-orange-500' : 'text-gray-900 dark:text-white'}`}>{cafe.name}</Text>
                            {(cafe.district || cafe.city) && (
                              <Text className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">
                                {[cafe.district, cafe.city].filter(Boolean).join(', ')}
                              </Text>
                            )}
                          </View>
                          <View className="h-6 w-6 rounded-full border border-gray-100 dark:border-slate-800/80 items-center justify-center bg-gray-50 dark:bg-slate-900/40">
                            {isSelected && <Check size={14} color="#ea580c" />}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Xe picker */}
              <View>
                <Text className="text-sm font-extrabold text-gray-900 dark:text-white mb-3">Chọn xe thi đấu</Text>
                {!selectedCafeId ? (
                  <Text className="text-xs text-gray-400 dark:text-slate-500 italic">Chọn chi nhánh trước để xem danh sách xe.</Text>
                ) : vehiclesLoading ? (
                  <View className="flex-row items-center gap-2 py-4">
                    <ActivityIndicator size="small" color="#ea580c" />
                    <Text className="text-xs text-gray-400 dark:text-slate-500 font-bold">Đang tải danh sách xe...</Text>
                  </View>
                ) : availableVehicles.length === 0 ? (
                  <View className="p-4 bg-gray-50 dark:bg-slate-900/30 rounded-xl border border-gray-100 dark:border-slate-800/80 items-center">
                    <Text className="text-xs font-bold text-gray-400 dark:text-slate-500 italic">Chi nhánh này chưa có xe phù hợp với đường đua của giải.</Text>
                  </View>
                ) : (
                  <View style={{ gap: 12 }}>
                    {availableVehicles.map((group) => {
                      const isSelected = group.catalog_id === selectedCatalogId;
                      const isSoldOut = group.remaining_slots <= 0;
                      
                      return (
                        <TouchableOpacity
                          key={group.catalog_id}
                          activeOpacity={0.8}
                          disabled={isSoldOut}
                          onPress={() => setSelectedCatalogId(group.catalog_id)}
                          className={`flex-row items-center p-3 rounded-2xl border-2 bg-white dark:bg-[#0f172a]/60 ${
                            isSoldOut
                              ? 'border-gray-50 dark:border-slate-800/20 bg-gray-50/50 dark:bg-slate-900/10 opacity-65'
                              : isSelected
                              ? 'border-orange-500 bg-orange-50/5'
                              : 'border-gray-100 dark:border-slate-800/80'
                          }`}
                        >
                          {group.cover_image_url ? (
                            <Image
                              source={{ uri: group.cover_image_url }}
                              className="h-14 w-14 rounded-xl object-cover"
                            />
                          ) : (
                            <View className="h-14 w-14 rounded-xl bg-gray-100 dark:bg-slate-900/40 items-center justify-center">
                              <Car size={20} color="#94a3b8" />
                            </View>
                          )}
                          <View className="ml-3 flex-1">
                            <Text className="text-xs font-extrabold text-gray-900 dark:text-white">{group.catalog_name}</Text>
                            <Text className="text-[10px] font-semibold text-gray-400 dark:text-slate-500 mt-0.5">
                              {group.tier}
                            </Text>
                            <Text className={`text-[11px] font-extrabold mt-1 ${isSoldOut ? 'text-gray-400 dark:text-slate-600' : 'text-emerald-600 dark:text-emerald-500'}`}>
                              {isSoldOut ? 'Đã hết xe dòng này' : `Còn ${group.remaining_slots}/${group.total_units} xe`}
                            </Text>
                          </View>
                          <View className="h-6 w-6 rounded-full border border-gray-100 dark:border-slate-800/80 items-center justify-center bg-gray-50 dark:bg-slate-900/40">
                            {isSelected && <Check size={14} color="#ea580c" />}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* Card Thuê xe (Xanh nổi bật) */}
              <View className="bg-blue-600 dark:bg-blue-700 p-4 rounded-2xl shadow-sm">
                <View className="flex-row items-start">
                  <View className="h-7 w-7 rounded-full bg-white/20 items-center justify-center mr-3 mt-0.5">
                    <Car size={14} color="#ffffff" />
                  </View>
                  <Text className="text-xs leading-5 text-white font-semibold flex-1">
                    Thuê xe trong giải không mất thêm tiền — lệ phí giải đã bao gồm. Xe được giao khi bạn tới check-in đúng giờ thi đấu.
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* FOR BYOC OPTION */}
          {vehicleSource === 'BYOC' && (
            <View className="mb-6" style={{ gap: 16 }}>
              <Text className="text-sm font-extrabold text-gray-900 dark:text-white">Khai báo thông số xe cá nhân</Text>
              
              {/* Tên xe */}
              <View>
                <Text className="text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">Tên xe cá nhân</Text>
                <TextInput
                  value={byocName}
                  onChangeText={setByocName}
                  placeholder="Ví dụ: MST RMX 2.5"
                  placeholderTextColor={isDark ? '#4b5563' : '#94a3b8'}
                  className="w-full px-4 py-3 rounded-xl border border-gray-100 dark:border-slate-800 text-xs font-semibold text-gray-800 dark:text-white bg-gray-50/20 dark:bg-slate-900/50 focus:border-orange-500"
                />
              </View>

              {/* Hãng xe */}
              <View>
                <Text className="text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">Hãng xe</Text>
                <TextInput
                  value={byocBrand}
                  onChangeText={setByocBrand}
                  placeholder="Ví dụ: MST"
                  placeholderTextColor={isDark ? '#4b5563' : '#94a3b8'}
                  className="w-full px-4 py-3 rounded-xl border border-gray-100 dark:border-slate-800 text-xs font-semibold text-gray-800 dark:text-white bg-gray-50/20 dark:bg-slate-900/50 focus:border-orange-500"
                />
              </View>

              {/* Hệ xe / Class */}
              <View>
                <Text className="text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">Class</Text>
                <TextInput
                  value={byocClass}
                  onChangeText={setByocClass}
                  placeholder="Ví dụ: Drift / Touring"
                  placeholderTextColor={isDark ? '#4b5563' : '#94a3b8'}
                  className="w-full px-4 py-3 rounded-xl border border-gray-100 dark:border-slate-800 text-xs font-semibold text-gray-800 dark:text-white bg-gray-50/20 dark:bg-slate-900/50 focus:border-orange-500"
                />
              </View>

              {/* Ghi chú */}
              <View>
                <Text className="text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">Ghi chú xe tự mang</Text>
                <TextInput
                  value={byocNotes}
                  onChangeText={setByocNotes}
                  multiline
                  numberOfLines={3}
                  placeholder="Phụ kiện, setup, lưu ý kỹ thuật..."
                  placeholderTextColor={isDark ? '#4b5563' : '#94a3b8'}
                  className="w-full px-4 py-3 rounded-xl border border-gray-100 dark:border-slate-800 text-xs font-semibold text-gray-800 dark:text-white bg-gray-50/20 dark:bg-slate-900/50 focus:border-orange-500"
                  style={{ textAlignVertical: 'top' }}
                />
              </View>

              {/* Ảnh chụp xe */}
              <View>
                <View className="flex-row items-center mb-1">
                  <Camera size={14} color={isDark ? '#94a3b8' : '#6b7280'} style={{ marginRight: 6 }} />
                  <Text className="text-xs font-bold text-gray-700 dark:text-slate-300">Ảnh xe của bạn</Text>
                </View>
                <Text className="text-[10px] font-semibold text-gray-400 dark:text-slate-500 mb-3">
                  Ban tổ chức duyệt xe dựa vào ảnh này. Chụp rõ toàn thân xe và phần khung gầm (Chọn tối thiểu 2 ảnh):
                </Text>
                
                <View className="flex-row gap-3">
                  {MOCK_BYOC_PHOTOS.map((url, index) => {
                    const isSelected = selectedPhotos.includes(url);
                    return (
                      <TouchableOpacity
                        key={index}
                        activeOpacity={0.8}
                        onPress={() => handlePhotoToggle(url)}
                        className="relative flex-1 h-20 rounded-xl overflow-hidden border border-gray-100 dark:border-slate-800 bg-gray-100 dark:bg-slate-900"
                      >
                        <Image source={{ uri: url }} className="h-full w-full object-cover" />
                        {/* Check Overlay */}
                        {isSelected ? (
                          <View className="absolute inset-0 bg-orange-600/70 items-center justify-center">
                            <Check size={20} color="#ffffff" />
                          </View>
                        ) : (
                          <View className="absolute bottom-1 right-1 h-4 w-4 rounded-full bg-black/40 items-center justify-center border border-white/50">
                            <Text className="text-[8px] text-white">+</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View className="rounded-2xl border border-amber-250 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 p-4">
                <Text className="text-xs text-amber-800 dark:text-amber-200 leading-5">
                  Xe cá nhân cần ban tổ chức duyệt trước khi được xếp thi đấu — khai báo càng rõ thì duyệt càng nhanh.
                </Text>
              </View>
            </View>
          )}

          <View className="h-6" />

          {/* TÓM TẮT ĐĂNG KÝ */}
          <View className="mb-6 bg-gray-50/60 dark:bg-slate-900/30 border border-gray-100 dark:border-slate-800/80 p-4 rounded-2xl">
            <Text className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">Tóm tắt đăng ký</Text>
            
            <View className="flex-row flex-wrap">
              <View className="w-1/2 mb-3 pr-2">
                <Text className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase">Nguồn xe</Text>
                <Text className="text-xs font-extrabold text-gray-800 dark:text-slate-200 mt-0.5">
                  {vehicleSource === 'BYOC' ? 'Xe cá nhân mang theo' : 'Thuê xe tại quầy'}
                </Text>
              </View>
              
              <View className="w-1/2 mb-3 pl-2">
                <Text className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase">Người đăng ký</Text>
                <Text className="text-xs font-extrabold text-gray-800 dark:text-slate-200 mt-0.5" numberOfLines={1}>
                  {profileName} ({profileEmail})
                </Text>
              </View>
              
              {vehicleSource === 'RENTAL' && (
                <>
                  <View className="w-1/2 mb-3 pr-2">
                    <Text className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase">Chi nhánh thi đấu</Text>
                    <Text className="text-xs font-extrabold text-gray-800 dark:text-slate-200 mt-0.5">
                      {selectedRentalCafe?.name || '--'}
                    </Text>
                  </View>
                  
                  <View className="w-1/2 mb-3 pl-2">
                    <Text className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase">Dòng xe</Text>
                    <Text className="text-xs font-extrabold text-gray-800 dark:text-slate-200 mt-0.5" numberOfLines={1}>
                      {selectedRentalCatalogName ? `${selectedRentalCatalogName} · ${selectedRentalCatalogTier}` : '--'}
                    </Text>
                  </View>
                  
                  <View className="w-1/2 pr-2">
                    <Text className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase">Tiền thuê xe</Text>
                    <Text className="text-xs font-extrabold text-gray-800 dark:text-slate-200 mt-0.5">Miễn phí</Text>
                  </View>
                </>
              )}
              
              {vehicleSource === 'BYOC' && (
                <>
                  <View className="w-1/2 pr-2">
                    <Text className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase">Tên xe</Text>
                    <Text className="text-xs font-extrabold text-gray-800 dark:text-slate-200 mt-0.5">
                      {byocName || '--'}
                    </Text>
                  </View>
                  
                  <View className="w-1/2 pl-2">
                    <Text className="text-[9px] font-bold text-gray-400 dark:text-slate-500 uppercase">Hãng / Class</Text>
                    <Text className="text-xs font-extrabold text-gray-800 dark:text-slate-200 mt-0.5" numberOfLines={1}>
                      {[byocBrand, byocClass].filter(Boolean).join(' · ') || '--'}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>

          {/* LỆ PHÍ GIẢI ĐẤU */}
          <View className="mb-6 bg-slate-50 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800/80 p-4 rounded-2xl flex-row justify-between items-center">
            <Text className="text-xs font-bold text-slate-700 dark:text-slate-300">Lệ phí giải đấu</Text>
            <Text className="text-sm font-black text-slate-900 dark:text-white">{formatPrice(contest.entry_fee)}</Text>
          </View>

          {/* THÔNG BÁO GHI CHÚ */}
          <View className="mb-6 flex-row items-start gap-2 bg-white dark:bg-slate-900/30 border border-gray-150 dark:border-slate-800/80 p-3 rounded-2xl">
            <CreditCard size={14} color="#ea580c" style={{ marginTop: 2 }} />
            <Text className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 flex-1 leading-4">
              {vehicleSource === 'RENTAL'
                ? 'Thuê xe của quán không mất thêm tiền — bạn chỉ trả lệ phí giải (nếu có). Xe được giao khi bạn tới check-in đúng giờ thi đấu.'
                : 'Xe cá nhân sẽ chờ ban tổ chức duyệt. Lệ phí giải (nếu có) thanh toán qua VNPay ngay sau khi gửi đăng ký.'}
            </Text>
          </View>

          {/* Empty spacing scroll */}
          <View className="h-12" />
        </ScrollView>
      );
    } catch (e: any) {
      console.error('[ContestRegisterScreen] Catch block in render:', e);
      return (
        <ScrollView style={{ flex: 1, backgroundColor: isDark ? '#0b0f19' : '#ffffff' }} contentContainerStyle={{ padding: 16 }}>
          <View className="p-4 bg-red-50 dark:bg-red-950/20 rounded-2xl border border-red-200 dark:border-red-900/50 my-4">
            <Text className="text-red-800 dark:text-red-300 font-bold">Lỗi Render Giao Diện:</Text>
            <Text className="text-xs text-red-600 dark:text-red-250 mt-1">{e?.message || String(e)}</Text>
            <Text className="text-[9px] text-gray-400 dark:text-slate-500 mt-2 font-mono">{e?.stack || ''}</Text>
          </View>
        </ScrollView>
      );
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#0b0f19' : '#ffffff' }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: isDark ? '#1e293b' : '#f3f4f6', flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity activeOpacity={0.8} onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? '#94a3b8' : '#6b7280' }}>← Quay lại</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 15, fontWeight: '800', color: isDark ? '#ffffff' : '#111827', flex: 1 }} numberOfLines={1}>
          Đăng ký: {contest.name}
        </Text>
      </View>

      {renderContent()}

      {/* Button Submit */}
      <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: isDark ? '#1e293b' : '#f3f4f6', backgroundColor: isDark ? '#0b0f19' : '#ffffff' }}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleRegisterSubmit}
          disabled={submitting || !detailsValid}
          style={{
            width: '100%',
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: submitting || !detailsValid ? (isDark ? '#4b2d16' : '#fdba74') : '#ea580c',
            opacity: submitting || !detailsValid ? 0.5 : 1,
            shadowColor: '#ea580c',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 2,
          }}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#ffffff' }}>ĐĂNG KÝ & THANH TOÁN</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};
