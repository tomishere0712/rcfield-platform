import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, ActivityIndicator, RefreshControl, Modal, TextInput, TouchableOpacity, Alert, Image, ScrollView } from 'react-native';
import { Trophy, Edit, X, Camera, Check } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { contestsApi } from '../api/contests.api';
import { getVnpayReturnUrl } from '@/shared/lib/vnpay-return-url';
import { openVnpayPaymentSession } from '@/shared/lib/vnpay-browser';
import { bookingWizardApi } from '@/features/bookings/api/booking-wizard.api';
import { MyRegistrationCard } from '../components/MyRegistrationCard';
import type { ContestRegistration } from '../types/contests.types';
import { useColorScheme } from 'nativewind';
import { SafeAreaView } from 'react-native-safe-area-context';

WebBrowser.maybeCompleteAuthSession();

const MOCK_BYOC_PHOTOS = [
  'https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1534349762230-e0cadf78f5da?auto=format&fit=crop&w=400&q=80',
  'https://images.unsplash.com/photo-1568605117036-5fecc6207a71?auto=format&fit=crop&w=400&q=80',
];

export const MyContestsScreen: React.FC = () => {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  
  const [registrations, setRegistrations] = useState<ContestRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Edit BYOC Modal States
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedReg, setSelectedReg] = useState<ContestRegistration | null>(null);
  const [editName, setEditName] = useState('');
  const [editBrand, setEditBrand] = useState('');
  const [editClass, setEditClass] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editPhotos, setEditPhotos] = useState<string[]>([]);

  const fetchMyRegistrations = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const data = await contestsApi.listMyRegistrations();
      // Sắp xếp đăng ký mới nhất lên đầu
      data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setRegistrations(data);
    } catch (error) {
      console.error('[MyContestsScreen] Load registrations error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMyRegistrations();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchMyRegistrations(false);
  };

  const handlePayPress = async (registrationId: string) => {
    setActionLoading(true);
    try {
      const returnUrl = getVnpayReturnUrl() || 'rcfield://payment-return';
      const reg = registrations.find((r) => r.id === registrationId);
      const bookingId = reg?.booking_id;
      let result;

      if (bookingId) {
        result = await bookingWizardApi.createCheckout(bookingId, returnUrl, 'vnpay');
      } else {
        result = await contestsApi.createEntryFeePayment(registrationId, returnUrl);
      }

      if (result && result.payment_url) {
        await openVnpayPaymentSession(result.payment_url!);
        
        // Polling để đợi Backend cập nhật trạng thái thanh toán từ VNPay IPN
        let attempts = 0;
        const maxAttempts = 4;
        const interval = 1500;
        
        const poll = async () => {
          try {
            // Fetch lại danh sách để check xem đã CONFIRMED hay MARKED_PAID chưa
            const res = await contestsApi.listMyRegistrations();
            const updatedReg = res.find((r: ContestRegistration) => r.id === registrationId);
            console.log(`[MyContestsScreen] Polling payment status attempt ${attempts + 1}:`, {
              status: updatedReg?.status,
              payment_status: updatedReg?.payment_status
            });
            
            if (
              updatedReg?.payment_status === 'MARKED_PAID' ||
              updatedReg?.status === 'CONFIRMED'
            ) {
              console.log('[MyContestsScreen] Payment confirmed via polling!');
              fetchMyRegistrations(false);
              return;
            }
          } catch (e) {
            console.error('[MyContestsScreen] Polling error:', e);
          }
          
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(poll, interval);
          } else {
            console.log('[MyContestsScreen] Polling finished, performing final data fetch.');
            fetchMyRegistrations(false);
          }
        };
        
        // Chờ 500ms trước khi bắt đầu check lần đầu
        setTimeout(poll, 500);
      } else {
        Alert.alert('Thất bại', 'Không thể khởi tạo thanh toán VNPay.');
      }
    } catch (error: any) {
      console.error('[MyContestsScreen] Pay error:', error);
      const errMsg = error?.response?.data?.message || 'Đã xảy ra lỗi khi tạo link thanh toán.';
      Alert.alert('Không thể thanh toán', errMsg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelPress = async (registrationId: string) => {
    setActionLoading(true);
    try {
      await contestsApi.cancelRegistration(registrationId);
      Alert.alert('Thành công', 'Đã hủy đăng ký giải đấu.');
      fetchMyRegistrations(false);
    } catch (error: any) {
      console.error('[MyContestsScreen] Cancel error:', error);
      const msg = error.response?.data?.message || 'Không thể hủy đăng ký. Giải đấu có thể đã đóng đăng ký.';
      Alert.alert('Lỗi hủy', msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditByocPress = (reg: ContestRegistration) => {
    setSelectedReg(reg);
    const decl = reg.metadata?.byoc_declaration;
    setEditName(decl?.vehicle_name || '');
    setEditBrand(decl?.vehicle_brand || '');
    setEditClass(decl?.vehicle_class || '1/10 Drift RWD');
    setEditNotes(decl?.notes || '');
    setEditPhotos(decl?.photos || []);
    setEditModalOpen(true);
  };

  const handlePhotoToggle = (url: string) => {
    if (editPhotos.includes(url)) {
      setEditPhotos(editPhotos.filter((p) => p !== url));
    } else {
      setEditPhotos([...editPhotos, url]);
    }
  };

  const handleSaveByoc = async () => {
    if (!selectedReg) return;
    if (!editName.trim()) {
      Alert.alert('Cảnh báo', 'Vui lòng điền tên xe.');
      return;
    }
    if (!editBrand.trim()) {
      Alert.alert('Cảnh báo', 'Vui lòng điền hãng sản xuất.');
      return;
    }
    if (editPhotos.length < 2) {
      Alert.alert('Cảnh báo', 'Bạn cần chọn ít nhất 2 ảnh chụp xe BYOC.');
      return;
    }

    setActionLoading(true);
    try {
      await contestsApi.updateByocDeclaration(selectedReg.id, {
        vehicle_name: editName,
        vehicle_brand: editBrand,
        vehicle_class: editClass,
        notes: editNotes,
        photos: editPhotos,
      });
      
      Alert.alert('Thành công', 'Đã cập nhật thông số xe cá nhân BYOC.');
      setEditModalOpen(false);
      fetchMyRegistrations(false);
    } catch (error) {
      console.error('[MyContestsScreen] Save BYOC error:', error);
      Alert.alert('Lỗi', 'Không thể lưu thông tin xe BYOC.');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePressCard = (contestId: string) => {
    router.push(`/customer/contest-detail/${contestId}` as any);
  };

  const renderEmptyComponent = () => {
    if (loading) return null;
    return (
      <View className="py-20 px-8 items-center justify-center bg-white dark:bg-[#0b0f19]">
        <Trophy size={48} color={isDark ? '#475569' : '#cbd5e1'} style={{ marginBottom: 12 }} />
        <Text className="text-base font-extrabold text-gray-700 dark:text-slate-350 text-center mb-1">Bạn chưa đăng ký giải đấu nào</Text>
        <Text className="text-xs font-semibold text-gray-400 dark:text-slate-500 text-center">
          Khám phá danh sách giải đấu trong tab Giải đấu và tham gia tranh tài ngay.
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-[#0b0f19]">
      {/* Header */}
      <View className="px-5 py-3 border-b border-gray-50 dark:border-slate-800/80 flex-row justify-between items-center bg-white dark:bg-[#0b0f19]">
        <Text className="text-xl font-extrabold text-gray-900 dark:text-white">Giải Đấu Của Tôi</Text>
      </View>

      {/* List */}
      {loading && registrations.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#ea580c" />
        </View>
      ) : (
        <FlatList
          data={registrations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MyRegistrationCard
              registration={item}
              onPayPress={handlePayPress}
              onCancelPress={handleCancelPress}
              onEditByocPress={handleEditByocPress}
              onPressCard={handlePressCard}
            />
          )}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={renderEmptyComponent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ea580c']} />
          }
        />
      )}

      {/* MODAL EDIT BYOC */}
      <Modal visible={editModalOpen} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white dark:bg-[#0f172a] rounded-t-3xl h-[85%] p-5 border-t border-gray-100 dark:border-slate-800">
            {/* Header Modal */}
            <View className="flex-row justify-between items-center border-b border-gray-100 dark:border-slate-800 pb-3 mb-4">
              <View className="flex-row items-center">
                <Edit size={18} color="#ea580c" style={{ marginRight: 8 }} />
                <Text className="text-base font-extrabold text-gray-900 dark:text-white">Chỉnh sửa xe BYOC</Text>
              </View>
              <TouchableOpacity activeOpacity={0.8} onPress={() => setEditModalOpen(false)}>
                <X size={20} className="text-gray-400 dark:text-slate-500" />
              </TouchableOpacity>
            </View>

            {/* Scrollable Form */}
            <ScrollView className="flex-1 space-y-4 pr-1" showsVerticalScrollIndicator={false}>
              {/* Tên xe */}
              <View className="mb-3">
                <Text className="text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">Tên xe / Model</Text>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Nhập tên xe..."
                  placeholderTextColor="#94a3b8"
                  className="w-full px-4 py-3 rounded-xl border border-gray-100 dark:border-slate-800 text-xs font-semibold text-gray-850 dark:text-white bg-gray-50/20 dark:bg-slate-900/50"
                />
              </View>

              {/* Hãng xe */}
              <View className="mb-3">
                <Text className="text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">Hãng xe</Text>
                <TextInput
                  value={editBrand}
                  onChangeText={setEditBrand}
                  placeholder="Nhập hãng xe..."
                  placeholderTextColor="#94a3b8"
                  className="w-full px-4 py-3 rounded-xl border border-gray-100 dark:border-slate-800 text-xs font-semibold text-gray-850 dark:text-white bg-gray-50/20 dark:bg-slate-900/50"
                />
              </View>

              {/* Phân khúc */}
              <View className="mb-3">
                <Text className="text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">Phân khúc xe (Class)</Text>
                <TextInput
                  value={editClass}
                  onChangeText={setEditClass}
                  placeholder="Ví dụ: 1/10 Drift RWD..."
                  placeholderTextColor="#94a3b8"
                  className="w-full px-4 py-3 rounded-xl border border-gray-100 dark:border-slate-800 text-xs font-semibold text-gray-850 dark:text-white bg-gray-50/20 dark:bg-slate-900/50"
                />
              </View>

              {/* Ghi chú */}
              <View className="mb-3">
                <Text className="text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">Mô tả cấu hình độ / Nâng cấp (Ghi chú)</Text>
                <TextInput
                  value={editNotes}
                  onChangeText={setEditNotes}
                  multiline
                  numberOfLines={3}
                  placeholder="Ví dụ: Nâng cấp servo, bộ lốp mới..."
                  placeholderTextColor="#94a3b8"
                  className="w-full px-4 py-3 rounded-xl border border-gray-100 dark:border-slate-800 text-xs font-semibold text-gray-850 dark:text-white bg-gray-50/20 dark:bg-slate-900/50"
                  style={{ textAlignVertical: 'top' }}
                />
              </View>

              {/* Chọn ảnh chụp xe */}
              <View className="mb-4">
                <View className="flex-row items-center mb-1.5">
                  <Camera size={14} color="#6b7280" style={{ marginRight: 6 }} />
                  <Text className="text-xs font-bold text-gray-700 dark:text-slate-300">Tải lên ảnh chụp xe (Chọn tối thiểu 2 ảnh)</Text>
                </View>
                
                <View className="flex-row gap-3">
                  {MOCK_BYOC_PHOTOS.map((url, idx) => {
                    const isSelected = editPhotos.includes(url);
                    return (
                      <TouchableOpacity
                        key={idx}
                        activeOpacity={0.8}
                        onPress={() => handlePhotoToggle(url)}
                        className="relative flex-1 h-20 rounded-xl overflow-hidden border border-gray-100 dark:border-slate-800 bg-gray-100 dark:bg-slate-900"
                      >
                        <Image source={{ uri: url }} className="h-full w-full object-cover" />
                        {isSelected && (
                          <View className="absolute inset-0 bg-orange-600/70 items-center justify-center">
                            <Check size={20} color="#ffffff" />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View className="h-10" />
            </ScrollView>

            {/* Save Button */}
            <View className="border-t border-gray-50 dark:border-slate-800/80 pt-4 flex-row gap-3">
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setEditModalOpen(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-slate-700 items-center justify-center bg-white dark:bg-slate-900"
              >
                <Text className="text-xs font-bold text-gray-500 dark:text-slate-400">Đóng</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleSaveByoc}
                disabled={actionLoading}
                className="flex-2 bg-orange-600 py-3 rounded-xl items-center justify-center shadow-sm"
                style={{ flex: 2 }}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text className="text-xs font-extrabold text-white">LƯU THAY ĐỔI</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};
