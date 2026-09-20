import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import {
  ChevronLeft,
  Calendar,
  Clock,
  Compass,
  ArrowRight,
  History,
  Tag,
  HelpCircle,
  CreditCard,
  AlertCircle,
} from 'lucide-react-native';

import { Text } from '@/shared/ui/Text';
import { openVnpayPaymentSession } from '@/shared/lib/vnpay-browser';
import {
  getMyPackages,
  getPackageUsageHistory,
  getRepayUrl,
  type MyPackageResponse,
  type PackageUsageEntry,
} from '../api/package.api';

export function MyPackagesScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [packages, setPackages] = useState<MyPackageResponse[]>([]);
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');

  // Trạng thái loading thanh toán lại cho từng gói
  const [repayingId, setRepayingId] = useState<string | null>(null);

  // Modal lịch sử sử dụng
  const [selectedPackage, setSelectedPackage] = useState<MyPackageResponse | null>(null);
  const [usageHistory, setUsageHistory] = useState<PackageUsageEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadPackages = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const data = await getMyPackages();
      setPackages(data);
    } catch (err) {
      console.error('[MyPackagesScreen] Error loading packages:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadPackages();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadPackages(false);
  };

  const handleOpenHistory = async (pkg: MyPackageResponse) => {
    setSelectedPackage(pkg);
    setLoadingHistory(true);
    try {
      const history = await getPackageUsageHistory(pkg.id);
      setUsageHistory(history);
    } catch (err) {
      console.error('[MyPackagesScreen] Error loading usage history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleCloseHistory = () => {
    setSelectedPackage(null);
    setUsageHistory([]);
  };

  // Xử lý thanh toán lại cho gói đang PENDING_PAYMENT
  const handleRepay = useCallback(async (pkg: MyPackageResponse) => {
    try {
      setRepayingId(pkg.id);
      const result = await getRepayUrl(pkg.id);
      if (result?.payment_url) {
        // Sử dụng sandbox VNPay WebView nhất quán với toàn bộ app
        await openVnpayPaymentSession(result.payment_url);
        // Refresh lại danh sách sau khi quay về (gói có thể đã được kích hoạt)
        loadPackages(false);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Đã xảy ra lỗi khi tạo link thanh toán.';
      Alert.alert('Thanh toán thất bại', msg);
    } finally {
      setRepayingId(null);
    }
  }, []);

  // Phân lọc gói theo tab
  const filteredPackages = packages.filter((pkg) => {
    if (activeTab === 'ACTIVE') {
      return pkg.status === 'ACTIVE' || pkg.status === 'PENDING_PAYMENT';
    } else {
      return pkg.status === 'EXHAUSTED' || pkg.status === 'EXPIRED';
    }
  });

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    } catch {
      return 'Chưa rõ';
    }
  };

  const formatPrice = (price: number) => {
    return price.toLocaleString('vi-VN') + 'đ';
  };

  const getPlayModeLabel = (modes: string[]) => {
    const rental = modes.includes('RENTAL');
    const byoc = modes.includes('BYOC');
    if (rental && byoc) return 'Thuê xe & Xe riêng';
    if (rental) return 'Thuê xe (RENTAL)';
    if (byoc) return 'Xe riêng (BYOC)';
    return 'Tất cả';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING_PAYMENT':
        return (
          <View className="rounded bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5">
            <Text className="text-[9px] text-amber-500 font-bold">Chờ thanh toán</Text>
          </View>
        );
      case 'ACTIVE':
        return (
          <View className="rounded bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5">
            <Text className="text-[9px] text-emerald-400 font-bold">Hoạt động</Text>
          </View>
        );
      case 'EXHAUSTED':
        return (
          <View className="rounded bg-slate-800 border border-slate-700 px-1.5 py-0.5">
            <Text className="text-[9px] text-slate-400 font-bold">Hết lượt chơi</Text>
          </View>
        );
      case 'EXPIRED':
        return (
          <View className="rounded bg-red-500/10 border border-red-500/20 px-1.5 py-0.5">
            <Text className="text-[9px] text-red-400 font-bold">Hết hạn dùng</Text>
          </View>
        );
    }
  };

  return (
    <SafeAreaView className="flex-grow flex-1 bg-[#f8fafc] dark:bg-[#0b0f19]" edges={['top', 'left', 'right']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-slate-200 dark:border-slate-900 bg-white dark:bg-[#0f172a]/50">
        <Pressable onPress={() => router.back()} className="p-1 rounded-full active:bg-slate-100 dark:active:bg-slate-800 flex-row items-center gap-1">
          <ChevronLeft color="#f97316" size={20} />
          <Text className="text-[12px] text-[#f97316] font-bold">
            Quay lại
          </Text>
        </Pressable>
        <Text className="text-[14px] text-slate-900 dark:text-white flex-1 text-center font-bold mr-10">
          Gói hội viên của tôi
        </Text>
      </View>

      {/* Tabs Selector */}
      <View className="flex-row border-b border-slate-200 dark:border-slate-900/60 bg-white dark:bg-[#0f172a]/20">
        <Pressable
          onPress={() => setActiveTab('ACTIVE')}
          className={`flex-1 py-3 items-center border-b-2 ${
            activeTab === 'ACTIVE' ? 'border-[#f97316]' : 'border-transparent'
          }`}
        >
          <Text
            className={`text-xs ${activeTab === 'ACTIVE' ? 'text-[#f97316] font-bold' : 'text-slate-500 dark:text-slate-400'}`}
          >
            Đang hoạt động ({packages.filter((p) => p.status === 'ACTIVE' || p.status === 'PENDING_PAYMENT').length})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('INACTIVE')}
          className={`flex-1 py-3 items-center border-b-2 ${
            activeTab === 'INACTIVE' ? 'border-[#f97316]' : 'border-transparent'
          }`}
        >
          <Text
            className={`text-xs ${activeTab === 'INACTIVE' ? 'text-[#f97316] font-bold' : 'text-slate-500 dark:text-slate-400'}`}
          >
            Đã hết / Hết hạn ({packages.filter((p) => p.status === 'EXHAUSTED' || p.status === 'EXPIRED').length})
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="px-5 py-5 pb-12"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#f97316']}
              tintColor="#f97316"
            />
          }
        >
          {filteredPackages.length > 0 ? (
            filteredPackages.map((pkg) => {
              const usedPercent = pkg.slots_total > 0 ? ((pkg.slots_total - pkg.slots_remaining) / pkg.slots_total) * 100 : 0;

              return (
                <Pressable
                  key={pkg.id}
                  onPress={() => handleOpenHistory(pkg)}
                  className="mb-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-5 shadow-sm active:bg-slate-100 dark:active:bg-slate-900/60"
                >
                  {/* Tên và Trạng thái */}
                  <View className="flex-row justify-between items-start mb-3">
                    <View className="flex-1 pr-2">
                      <Text className="text-[14px] text-slate-900 dark:text-white" weight="700">
                        {pkg.package_name}
                      </Text>
                      <Text className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-semibold">
                        Sân: {pkg.cafe_name}
                      </Text>
                    </View>
                    {getStatusBadge(pkg.status)}
                  </View>

                  {/* Banner cảnh báo chờ thanh toán */}
                  {pkg.status === 'PENDING_PAYMENT' && (
                    <View className="flex-row items-center gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700/40 rounded-xl px-3 py-2 mb-3">
                      <AlertCircle color="#d97706" size={13} />
                      <Text className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold flex-1 leading-4">
                        {'Gói chưa được kích hoạt. Nhấn "Thanh toán lại" bên dưới để hoàn tất.'}
                      </Text>
                    </View>
                  )}

                  {/* Thanh tiến trình Slot */}
                  <View className="mb-4">
                    <View className="flex-row justify-between items-baseline mb-1.5">
                      <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">Tình trạng sử dụng</Text>
                      <Text className="text-[12px] text-slate-900 dark:text-white" weight="700">
                        Còn {Math.round(Number(pkg.slots_remaining))} / {Math.round(Number(pkg.slots_total))} slots
                      </Text>
                    </View>
                    <View className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <View
                        className="h-full rounded-full bg-[#f97316]"
                        style={{ width: `${100 - usedPercent}%` }}
                      />
                    </View>
                  </View>

                  {/* Divider */}
                  <View className="h-[1px] bg-slate-200 dark:bg-slate-800/80 my-3" />

                  {/* Thông tin phụ */}
                  <View className="flex-row justify-between items-center text-[10px]">
                    <View className="flex-row items-center gap-1">
                      <Tag color="#94a3b8" size={11} />
                      <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                        Giá: {formatPrice(pkg.purchased_price)}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-1">
                      <Clock color="#94a3b8" size={11} />
                      <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                        Hạn dùng: {formatDate(pkg.expires_at)}
                      </Text>
                    </View>
                  </View>

                  {/* Play Mode & Click view history hint */}
                  <View className="flex-row justify-between items-center mt-3 pt-3 border-t border-slate-200 dark:border-slate-900/60">
                    <Text className="text-[9px] text-[#f97316] font-bold uppercase tracking-wider">
                      {getPlayModeLabel(pkg.applicable_play_modes)}
                    </Text>
                    {pkg.status === 'PENDING_PAYMENT' ? (
                      // Nút thanh toán lại — chỉ hiện khi gói đang chờ thanh toán
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          handleRepay(pkg);
                        }}
                        disabled={repayingId === pkg.id}
                        className="flex-row items-center gap-1 bg-amber-500 active:bg-amber-400 rounded-lg px-2.5 py-1.5"
                      >
                        {repayingId === pkg.id ? (
                          <ActivityIndicator size={10} color="#fff" />
                        ) : (
                          <CreditCard color="#fff" size={10} />
                        )}
                        <Text className="text-[9px] text-white font-bold">
                          {repayingId === pkg.id ? 'Đang xử lý...' : 'Thanh toán lại'}
                        </Text>
                      </Pressable>
                    ) : (
                      <View className="flex-row items-center gap-0.5">
                        <Text className="text-[9px] text-slate-500 font-bold">Lịch sử dùng</Text>
                        <History color="#64748b" size={11} />
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })
          ) : (
            <View className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/30 p-8 items-center mt-10">
              <Compass color="#64748b" size={32} className="mb-2" />
              <Text className="text-[13px] text-slate-700 dark:text-slate-300 font-bold">
                {activeTab === 'ACTIVE' ? 'Không có gói đang hoạt động' : 'Không tìm thấy gói đã hết/hết hạn'}
              </Text>
              <Text className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 text-center leading-4 font-semibold">
                {activeTab === 'ACTIVE'
                  ? 'Hãy đăng ký mua các gói lượt chơi hội viên tại mục Khám phá để nhận nhiều ưu đãi slots hơn nhé!'
                  : 'Danh sách lịch sử gói hội viên cũ của bạn sẽ hiển thị tại đây.'}
              </Text>
              {activeTab === 'ACTIVE' && (
                <Pressable
                  onPress={() => router.push('/(tabs)/explore')}
                  className="mt-4 flex-row h-8.5 items-center justify-center rounded-xl bg-[#ea580c] active:bg-[#f97316] px-4 gap-1 shadow-sm"
                >
                  <Text className="text-[11px] text-white" weight="700">
                    Khám phá cơ sở để mua gói
                  </Text>
                  <ArrowRight color="#ffffff" size={12} />
                </Pressable>
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* Modal Lịch sử sử dụng gói */}
      <Modal
        visible={selectedPackage !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCloseHistory}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent} className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-850">
            {/* Modal Header */}
            <View className="flex-row justify-between items-center p-4 border-b border-slate-200 dark:border-slate-800">
              <View className="flex-1 pr-3">
                <Text className="text-slate-900 dark:text-white text-[13px] font-bold" numberOfLines={1}>
                  {selectedPackage?.package_name}
                </Text>
                <Text className="text-slate-500 dark:text-slate-400 text-[9px] mt-0.5" numberOfLines={1}>
                  Chi nhánh: {selectedPackage?.cafe_name}
                </Text>
              </View>
              <Pressable
                onPress={handleCloseHistory}
                className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 active:bg-slate-200 dark:active:bg-slate-800"
              >
                <Text className="text-slate-900 dark:text-white text-xs font-bold">Đóng</Text>
              </Pressable>
            </View>

            {/* Modal Body */}
            <View className="flex-1 p-4">
              <Text className="text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold tracking-wider mb-3">
                Lịch sử sử dụng slots ({usageHistory.length} lần)
              </Text>

              {loadingHistory ? (
                <View className="flex-1 items-center justify-center py-10">
                  <ActivityIndicator size="small" color="#f97316" />
                </View>
              ) : usageHistory.length > 0 ? (
                <ScrollView showsVerticalScrollIndicator={false}>
                  {usageHistory.map((item, index) => {
                    const start = new Date(item.slot_start);
                    const end = new Date(item.slot_end);
                    const timeStr = `${String(start.getHours()).padStart(2, '0')}:${String(
                      start.getMinutes(),
                    ).padStart(2, '0')} - ${String(end.getHours()).padStart(2, '0')}:${String(
                      end.getMinutes(),
                    ).padStart(2, '0')}`;
                    const dateStr = `${String(start.getDate()).padStart(2, '0')}/${String(
                      start.getMonth() + 1,
                    ).padStart(2, '0')}/${start.getFullYear()}`;

                    return (
                      <View
                        key={index}
                        className="mb-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80"
                      >
                        <View className="flex-row justify-between items-start">
                          <View className="flex-row items-center gap-1.5">
                            <Calendar color="#f97316" size={12} />
                            <Text className="text-slate-900 dark:text-white text-[11px] font-bold">
                              {dateStr} • {timeStr}
                            </Text>
                          </View>
                          <View className="rounded-full bg-[#ea580c]/10 border border-[#ea580c]/25 px-2 py-0.5">
                            <Text className="text-[9px] text-[#f97316] font-bold">
                              -{item.slots_used} slots
                            </Text>
                          </View>
                        </View>
                        <View className="mt-2 flex-row justify-between items-center text-[10px]">
                          <Text className="text-slate-500 dark:text-slate-400 text-[10px] font-semibold">
                            Booking ID: {item.booking_id.substring(0, 8).toUpperCase()}
                          </Text>
                          <Text
                            className={`text-[9px] font-bold ${
                              item.booking_status === 'CANCELLED'
                                ? 'text-red-400'
                                : item.booking_status === 'COMPLETED'
                                ? 'text-slate-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {item.booking_status === 'CANCELLED'
                              ? 'Đã hủy (Được hoàn slot)'
                              : item.booking_status === 'COMPLETED'
                              ? 'Đã hoàn thành'
                              : 'Sắp diễn ra'}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              ) : (
                <View className="flex-1 items-center justify-center py-12">
                  <HelpCircle color="#475569" size={24} />
                  <Text className="text-slate-600 dark:text-slate-400 text-[11px] font-bold mt-2">
                    Chưa có lịch sử trừ slots
                  </Text>
                  <Text className="text-slate-500 text-[9px] text-center mt-1 leading-4 font-semibold">
                    Gói chơi của bạn sẽ bị trừ slots khi đặt lịch thành công và áp dụng mã gói này.
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    height: '65%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
});
