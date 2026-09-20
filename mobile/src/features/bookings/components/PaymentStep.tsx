import React, { useEffect, useState, useMemo } from 'react';
import { View, TextInput, Pressable, ActivityIndicator, Alert, Image } from 'react-native';
import {
  Ticket,
  CreditCard,
  Package,
  Info,
  CheckCircle2,
  MapPin,
  Layers,
  Building2,
  Sparkles,
} from 'lucide-react-native';

import { Text } from '@/shared/ui/Text';
import { getMyPackages, type MyPackageResponse } from '@/features/packages/api/package.api';
import {
  bookingWizardApi,
  type PromoValidationResult,
  type RentalVehicleUnit,
} from '../api/booking-wizard.api';

export type PaymentMethodType = 'vnpay' | 'bank_transfer' | 'pay_later';

interface PaymentStepProps {
  cafeId: string;
  playMode: 'RENTAL' | 'BYOC';
  slotStart: string;
  slotEnd: string;
  durationHours: number;
  slotFeeRate: number;
  participants: number;
  selectedVehicleIds: string[];
  vehiclePriceTotal: number;
  fnbPriceTotal: number;
  fnbDetailsList: { name: string; qty: number; price: number; note?: string }[];
  selectedPackageId: string | null;
  setSelectedPackageId: (id: string | null) => void;
  appliedPromo: PromoValidationResult | null;
  setAppliedPromo: (promo: PromoValidationResult | null) => void;
  selectedPaymentMethod: PaymentMethodType;
  setSelectedPaymentMethod: (method: PaymentMethodType) => void;
  availablePaymentMethods?: string[];
  onMockPayment: () => void;
  isMockSubmitting: boolean;

  // Detail props for summary card
  cafeName: string;
  cafeAddress: string;
  cafeImage: string | null;
  trackConfigName: string;
  vehicleUnits: RentalVehicleUnit[];
  slotDurationMinutes?: number;
}

export function PaymentStep({
  cafeId,
  playMode,
  slotStart,
  slotEnd,
  durationHours,
  slotFeeRate,
  participants,
  selectedVehicleIds,
  vehiclePriceTotal,
  fnbPriceTotal,
  fnbDetailsList,
  selectedPackageId,
  setSelectedPackageId,
  appliedPromo,
  setAppliedPromo,
  selectedPaymentMethod,
  setSelectedPaymentMethod,
  availablePaymentMethods = ['vnpay', 'bank_transfer'],
  onMockPayment,
  isMockSubmitting,
  cafeName,
  cafeAddress,
  cafeImage,
  trackConfigName,
  vehicleUnits,
  slotDurationMinutes,
}: PaymentStepProps) {
  const [packages, setPackages] = useState<MyPackageResponse[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [validatingPromo, setValidatingPromo] = useState(false);
  const [promoError, setPromoError] = useState('');

  // 1. Fetch active packages compatible with cafe and playMode
  useEffect(() => {
    const fetchPackages = async () => {
      setLoadingPackages(true);
      const data = await getMyPackages('ACTIVE');
      // Filter packages for this cafe and playMode
      const filtered = data.filter(
        (pkg) =>
          pkg.cafe_id === cafeId &&
          pkg.slots_remaining > 0 &&
          pkg.applicable_play_modes.includes(playMode)
      );
      setPackages(filtered);
      setLoadingPackages(false);
    };
    fetchPackages();
  }, [cafeId, playMode]);

  // 2. Validate Promo Code
  const handleApplyPromo = async () => {
    if (!promoCodeInput.trim()) return;
    setValidatingPromo(true);
    setPromoError('');
    try {
      const res = await bookingWizardApi.validatePromoCode(
        promoCodeInput.trim().toUpperCase(),
        cafeId,
        slotStart
      );
      setAppliedPromo(res);
      setPromoCodeInput('');
      Alert.alert('Thành công', 'Đã áp dụng mã giảm giá thành công!');
    } catch (err: any) {
      console.error('[PaymentStep] Error validating promo:', err);
      const msg = err?.response?.data?.message || 'Mã giảm giá không hợp lệ!';
      setPromoError(msg);
      setAppliedPromo(null);
    } finally {
      setValidatingPromo(false);
    }
  };

  // 3. Billing Calculations
  // Base Slot Fee = slotFeeRate * participants * durationHours
  const baseSlotFee = slotFeeRate * participants * durationHours;

  // If package is applied, user gets 1 slot free (their own slot) for the booking duration
  const isPackageApplied = selectedPackageId !== null;
  const slotFeeDiscount = isPackageApplied ? slotFeeRate * durationHours : 0;
  const finalSlotFee = Math.max(0, baseSlotFee - slotFeeDiscount);

  // Promo Discount
  let promoDiscount = 0;
  const subtotalBeforePromo = finalSlotFee + vehiclePriceTotal + fnbPriceTotal;
  if (appliedPromo) {
    if (appliedPromo.discount_type === 'PERCENTAGE') {
      promoDiscount = Math.round((subtotalBeforePromo * appliedPromo.value) / 100);
    } else {
      promoDiscount = appliedPromo.value;
    }
    // Limit discount to subtotal
    promoDiscount = Math.min(subtotalBeforePromo, promoDiscount);
  }

  const totalAmount = Math.max(0, subtotalBeforePromo - promoDiscount);

  // Formatting utils
  const formattedDate = useMemo(() => {
    if (!slotStart) return '';
    const [datePart] = slotStart.split('T');
    const [y, m, d] = datePart.split('-');
    return `${Number(d)}/${Number(m)}/${y}`;
  }, [slotStart]);

  const formattedTimeRange = useMemo(() => {
    if (!slotStart || !slotEnd) return '';
    const startT = slotStart.split('T')[1].substring(0, 5);
    const endT = slotEnd.split('T')[1].substring(0, 5);
    return `${startT} - ${endT}`;
  }, [slotStart, slotEnd]);

  // Clean vehicle name formatting without redundant words
  const selectedVehicleNamesList = useMemo(() => {
    return selectedVehicleIds
      .map((id) => {
        const vehicle = vehicleUnits.find((unit) => unit.id === id);
        if (!vehicle) return null;
        const name = vehicle.catalog?.name || 'Xe';
        return vehicle.identifier ? `${name} (${vehicle.identifier})` : name;
      })
      .filter((n): n is string => Boolean(n));
  }, [selectedVehicleIds, vehicleUnits]);

  const selectedVehicleNames = useMemo(() => {
    if (selectedVehicleNamesList.length === 0) return 'Không có';
    return selectedVehicleNamesList.join(', ');
  }, [selectedVehicleNamesList]);

  const isBankTransferSupported = availablePaymentMethods.includes('bank_transfer');
  const isVnpaySupported = availablePaymentMethods.includes('vnpay');

  return (
    <View className="space-y-6">
      {/* 1. Tóm tắt đơn đặt */}
      <View className="bg-white dark:bg-[#0f172a]/70 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm">
        <View className="flex-row items-center justify-between mb-3.5">
          <Text className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">
            Tóm tắt đơn đặt
          </Text>
          <View className="bg-orange-50 dark:bg-orange-950/40 px-2.5 py-0.5 rounded-full border border-orange-200 dark:border-orange-800/40">
            <Text className="text-[10px] text-[#ea580c] font-bold">
              {playMode === 'RENTAL' ? 'Thuê xe' : 'Xe cá nhân'}
            </Text>
          </View>
        </View>

        {/* Cafe Info block */}
        <View className="flex-row gap-3.5 items-center mb-4 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-2xl border border-slate-100 dark:border-slate-800/60">
          {cafeImage ? (
            <Image
              source={{ uri: cafeImage }}
              className="h-12 w-12 rounded-xl bg-slate-100 dark:bg-slate-800 object-cover"
            />
          ) : (
            <View className="h-12 w-12 rounded-xl bg-[#ea580c]/10 border border-[#ea580c]/20 items-center justify-center">
              <MapPin color="#f97316" size={20} />
            </View>
          )}
          <View className="flex-1 pr-1">
            <Text className="text-[14px] text-slate-900 dark:text-white" weight="700" numberOfLines={1}>
              {cafeName}
            </Text>
            <Text className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5" numberOfLines={1}>
              {cafeAddress}
            </Text>
          </View>
        </View>

        {/* Track Config Badge */}
        <View className="flex-row mb-4">
          <View className="bg-[#ea580c]/10 border border-[#ea580c]/25 px-3 py-1.5 rounded-xl flex-row items-center gap-1.5">
            <Layers color="#f97316" size={14} />
            <Text className="text-[12px] text-[#ea580c]" weight="700">
              {trackConfigName}
            </Text>
          </View>
        </View>

        {/* Details Table */}
        <View className="space-y-2.5 border-t border-slate-100 dark:border-slate-800/80 pt-3">
          <View className="flex-row justify-between items-center">
            <Text className="text-[12px] text-slate-500 dark:text-slate-400 font-semibold w-24 shrink-0">
              Loại đặt lịch
            </Text>
            <Text className="text-[12px] text-slate-900 dark:text-white font-bold text-right flex-1 ml-2">
              {isPackageApplied ? 'Áp dụng gói hội viên' : 'Đặt lịch đơn lẻ'}
            </Text>
          </View>

          <View className="flex-row justify-between items-center">
            <Text className="text-[12px] text-slate-500 dark:text-slate-400 font-semibold w-24 shrink-0">
              Ngày & Giờ
            </Text>
            <Text className="text-[12px] text-slate-900 dark:text-white font-bold text-right flex-1 ml-2">
              {formattedDate} • {formattedTimeRange} ({durationHours}h)
            </Text>
          </View>

          <View className="flex-row justify-between items-center">
            <Text className="text-[12px] text-slate-500 dark:text-slate-400 font-semibold w-24 shrink-0">
              Số người chơi
            </Text>
            <Text className="text-[12px] text-slate-900 dark:text-white font-bold text-right flex-1 ml-2">
              {participants} người
            </Text>
          </View>

          {playMode === 'RENTAL' && (
            <View className="flex-row justify-between items-start pt-0.5">
              <Text className="text-[12px] text-slate-500 dark:text-slate-400 font-semibold w-24 shrink-0 mt-0.5">
                Xe thuê ({selectedVehicleIds.length})
              </Text>
              <Text
                className="text-[12px] text-slate-900 dark:text-white font-bold text-right flex-1 ml-2 leading-4"
                numberOfLines={2}
              >
                {selectedVehicleNames}
              </Text>
            </View>
          )}

          {fnbPriceTotal > 0 && (
            <View className="flex-row justify-between items-center">
              <Text className="text-[12px] text-slate-500 dark:text-slate-400 font-semibold w-24 shrink-0">
                F&B Đặt trước
              </Text>
              <Text className="text-[12px] text-slate-900 dark:text-white font-bold text-right flex-1 ml-2">
                {fnbPriceTotal.toLocaleString('vi-VN')}đ
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* 2. Gói slot hội viên */}
      <View className="mt-5">
        <View className="flex-row items-center gap-1.5 mb-3">
          <Package color="#f97316" size={16} />
          <Text className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">
            Áp dụng gói slot hội viên
          </Text>
        </View>

        {loadingPackages ? (
          <ActivityIndicator size="small" color="#f97316" className="py-3" />
        ) : packages.length > 0 ? (
          <View className="gap-2.5">
            {packages.map((pkg) => {
              const isSelected = selectedPackageId === pkg.id;
              return (
                <Pressable
                  key={pkg.id}
                  onPress={() => setSelectedPackageId(isSelected ? null : pkg.id)}
                  className={`p-3.5 rounded-2xl border flex-row gap-3 items-center justify-between ${
                    selectedPackageId === pkg.id
                      ? 'bg-[#ea580c]/10 border-[#ea580c] border-2'
                      : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <View className="flex-1 pr-2">
                    <Text className="text-[13px] text-slate-900 dark:text-white" weight="700">
                      {pkg.package_name}
                    </Text>
                    <Text className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-semibold">
                      Còn {Math.round(Number(pkg.slots_remaining))} / {Math.round(Number(pkg.slots_total))} slots • Hạn:{' '}
                      {new Date(pkg.expires_at).toLocaleDateString('vi-VN')}
                    </Text>
                  </View>
                  <View
                    className={`h-6 w-6 rounded-full border items-center justify-center ${
                      isSelected
                        ? 'bg-[#ea580c] border-[#ea580c]'
                        : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900'
                    }`}
                  >
                    {isSelected && <CheckCircle2 color="#ffffff" size={14} strokeWidth={3} />}
                  </View>
                </Pressable>
              );
            })}
            {isPackageApplied && (
              <View className="flex-row items-start gap-2 bg-[#ea580c]/10 border border-[#ea580c]/20 rounded-2xl p-3.5 mt-1">
                <Info color="#f97316" size={15} className="mt-0.5 shrink-0" />
                <Text className="text-[11px] text-slate-800 dark:text-slate-300 leading-4 font-semibold flex-1">
                  Đã áp dụng gói: Miễn phí tiền sân cho bản thân trong suốt{' '}
                  {(durationHours * (slotDurationMinutes || 60)) / 60} giờ chơi. Người đi cùng (nếu
                  có) vẫn tính phí bình thường.
                </Text>
              </View>
            )}
          </View>
        ) : (
          <View className="bg-slate-50 dark:bg-slate-900/30 rounded-2xl p-4 border border-dashed border-slate-200 dark:border-slate-800 items-center justify-center">
            <Text className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
              Bạn không có gói hội viên nào khả dụng tại cơ sở này.
            </Text>
          </View>
        )}
      </View>

      {/* 3. Mã ưu đãi */}
      <View className="mt-5">
        <View className="flex-row items-center gap-1.5 mb-3">
          <Ticket color="#f97316" size={16} />
          <Text className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">
            Mã ưu đãi (Voucher)
          </Text>
        </View>

        <View className="flex-row gap-2">
          <TextInput
            value={promoCodeInput}
            onChangeText={(t) => {
              setPromoCodeInput(t);
              if (promoError) setPromoError('');
            }}
            autoCapitalize="characters"
            placeholder={appliedPromo ? `Đang áp dụng: ${appliedPromo.code}` : 'Nhập mã voucher'}
            placeholderTextColor="#94a3b8"
            className="flex-1 h-11 px-3.5 bg-slate-50 dark:bg-[#0b0f19] border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-[13px] rounded-xl font-medium"
          />
          <Pressable
            disabled={validatingPromo || !promoCodeInput.trim()}
            onPress={handleApplyPromo}
            className={`h-11 px-5 rounded-xl items-center justify-center ${
              promoCodeInput.trim()
                ? 'bg-[#ea580c] active:bg-[#f97316]'
                : 'bg-slate-200 dark:bg-slate-800'
            }`}
          >
            {validatingPromo ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text
                className={`text-[12px] font-bold ${
                  promoCodeInput.trim() ? 'text-white' : 'text-slate-400'
                }`}
              >
                Áp dụng
              </Text>
            )}
          </Pressable>
        </View>

        {promoError !== '' && (
          <Text className="text-[10px] text-[#ef4444] font-semibold mt-1.5 pl-1">{promoError}</Text>
        )}

        {appliedPromo && (
          <View className="flex-row items-center justify-between bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-2xl p-3.5 mt-3">
            <View className="flex-1 pr-2">
              <View className="flex-row items-center gap-1.5">
                <Sparkles color="#10b981" size={14} />
                <Text className="text-[12px] text-emerald-700 dark:text-emerald-300 font-bold">
                  Voucher: {appliedPromo.code}
                </Text>
              </View>
              <Text className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 font-semibold">
                Đã giảm -{promoDiscount.toLocaleString('vi-VN')}đ vào tổng đơn
              </Text>
            </View>
            <Pressable
              onPress={() => setAppliedPromo(null)}
              className="px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-emerald-950/50 active:bg-emerald-100"
            >
              <Text className="text-[10px] text-emerald-700 dark:text-emerald-300 font-bold">
                Gỡ bỏ
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* 4. Chi tiết hoá đơn */}
      <View className="mt-5 bg-white dark:bg-[#0f172a]/70 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm">
        <Text className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold mb-3.5">
          Chi tiết hoá đơn
        </Text>

        <View className="space-y-3">
          {/* Tiền sân */}
          <View className="flex-row justify-between items-center">
            <View className="flex-1 pr-3">
              <Text className="text-[12px] text-slate-700 dark:text-slate-300 font-semibold">
                Phí sân ({participants} người × {durationHours}h)
              </Text>
              {isPackageApplied && (
                <Text className="text-[10px] text-[#ea580c] font-semibold">
                  (Đã khấu trừ 1 slot hội viên)
                </Text>
              )}
            </View>
            <Text className="text-[12px] text-slate-900 dark:text-white font-bold shrink-0 text-right">
              {finalSlotFee.toLocaleString('vi-VN')}đ
            </Text>
          </View>

          {/* Tiền thuê xe */}
          {playMode === 'RENTAL' && (
            <View className="flex-row justify-between items-start">
              <View className="flex-1 pr-3">
                <Text className="text-[12px] text-slate-700 dark:text-slate-300 font-semibold">
                  Phí thuê xe ({selectedVehicleIds.length} xe)
                </Text>
                {selectedVehicleNamesList.map((name, idx) => (
                  <Text
                    key={idx}
                    className="text-[10px] text-slate-500 dark:text-slate-400 font-medium pl-1 mt-0.5"
                    numberOfLines={1}
                  >
                    • {name}
                  </Text>
                ))}
              </View>
              <Text className="text-[12px] text-slate-900 dark:text-white font-bold shrink-0 text-right mt-0.5">
                {vehiclePriceTotal.toLocaleString('vi-VN')}đ
              </Text>
            </View>
          )}

          {/* Tiền F&B đặt trước */}
          {fnbPriceTotal > 0 && (
            <View className="space-y-1.5">
              <View className="flex-row justify-between items-center">
                <Text className="text-[12px] text-slate-700 dark:text-slate-300 font-semibold flex-1 pr-3">
                  F&B Đặt trước ({fnbDetailsList.length} món)
                </Text>
                <Text className="text-[12px] text-slate-900 dark:text-white font-bold shrink-0 text-right">
                  {fnbPriceTotal.toLocaleString('vi-VN')}đ
                </Text>
              </View>
              {fnbDetailsList.map((m, idx) => (
                <View key={idx} className="pl-2 mb-1">
                  <View className="flex-row justify-between items-center">
                    <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-medium flex-1 pr-2" numberOfLines={1}>
                      • {m.name} (x{m.qty})
                    </Text>
                    <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold shrink-0">
                      {(m.qty * m.price).toLocaleString('vi-VN')}đ
                    </Text>
                  </View>
                  {m.note ? (
                    <Text className="text-[9px] text-amber-600 dark:text-amber-400 italic pl-2.5 mt-0.5" numberOfLines={1}>
                      Ghi chú: {m.note}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}

          {/* Giảm giá voucher */}
          {promoDiscount > 0 && (
            <View className="flex-row justify-between items-center">
              <Text className="text-[12px] text-emerald-600 dark:text-emerald-400 font-semibold flex-1 pr-3">
                Ưu đãi voucher ({appliedPromo?.code})
              </Text>
              <Text className="text-[12px] text-emerald-600 dark:text-emerald-400 font-bold shrink-0 text-right">
                -{promoDiscount.toLocaleString('vi-VN')}đ
              </Text>
            </View>
          )}

          {/* Divider */}
          <View className="h-[1px] bg-slate-200 dark:bg-slate-800 my-1" />

          {/* Tổng thanh toán */}
          <View className="flex-row justify-between items-center">
            <Text className="text-[14px] text-slate-900 dark:text-white font-bold">
              Tổng thanh toán
            </Text>
            <Text className="text-[18px] text-[#ea580c] font-black shrink-0 text-right">
              {totalAmount.toLocaleString('vi-VN')}đ
            </Text>
          </View>
        </View>
      </View>

      {/* 5. Chọn phương thức thanh toán */}
      <View className="mt-5">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-1.5">
            <CreditCard color="#f97316" size={16} />
            <Text className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">
              Phương thức thanh toán
            </Text>
          </View>
        </View>

        <View className="gap-3">
          {/* Cổng VNPay */}
          {isVnpaySupported && (
            <Pressable
              onPress={() => setSelectedPaymentMethod('vnpay')}
              className={`p-4 rounded-2xl border flex-row justify-between items-center ${
                selectedPaymentMethod === 'vnpay'
                  ? 'bg-orange-500/10 border-[#ea580c] border-2'
                  : 'bg-white dark:bg-[#0f172a]/60 border-slate-200 dark:border-slate-800'
              }`}
            >
              <View className="flex-row gap-3.5 items-center flex-1 pr-3">
                <View className="h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 border border-blue-500/20">
                  <CreditCard color="#3b82f6" size={20} />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-[13px] text-slate-900 dark:text-white font-bold">
                      Cổng thanh toán VNPay
                    </Text>
                  </View>
                  <Text className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium leading-4">
                    Thẻ ATM, Visa, Master, Ví VNPay hoặc quét QR VNPay
                  </Text>
                </View>
              </View>

              <View
                className={`h-6 w-6 rounded-full border items-center justify-center ${
                  selectedPaymentMethod === 'vnpay'
                    ? 'bg-[#ea580c] border-[#ea580c]'
                    : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900'
                }`}
              >
                {selectedPaymentMethod === 'vnpay' && (
                  <CheckCircle2 color="#ffffff" size={14} strokeWidth={3} />
                )}
              </View>
            </Pressable>
          )}

          {/* Chuyển khoản ngân hàng (VietQR) */}
          {isBankTransferSupported && (
            <Pressable
              onPress={() => setSelectedPaymentMethod('bank_transfer')}
              className={`p-4 rounded-2xl border flex-row justify-between items-center ${
                selectedPaymentMethod === 'bank_transfer'
                  ? 'bg-orange-500/10 border-[#ea580c] border-2'
                  : 'bg-white dark:bg-[#0f172a]/60 border-slate-200 dark:border-slate-800'
              }`}
            >
              <View className="flex-row gap-3.5 items-center flex-1 pr-3">
                <View className="h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 border border-orange-500/20">
                  <Building2 color="#f97316" size={20} />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-1.5 flex-wrap">
                    <Text className="text-[13px] text-slate-900 dark:text-white font-bold">
                      Chuyển khoản VietQR
                    </Text>
                    <View className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.2 rounded-md">
                      <Text className="text-[9px] text-emerald-600 dark:text-emerald-400 font-extrabold">
                        24/7
                      </Text>
                    </View>
                  </View>
                  <Text className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium leading-4">
                    Quét mã VietQR bằng app ngân hàng, tự động xác nhận đơn
                  </Text>
                </View>
              </View>

              <View
                className={`h-6 w-6 rounded-full border items-center justify-center ${
                  selectedPaymentMethod === 'bank_transfer'
                    ? 'bg-[#ea580c] border-[#ea580c]'
                    : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900'
                }`}
              >
                {selectedPaymentMethod === 'bank_transfer' && (
                  <CheckCircle2 color="#ffffff" size={14} strokeWidth={3} />
                )}
              </View>
            </Pressable>
          )}
        </View>

        {/* Mock Payment button for Dev (Hidden on UI) */}
        {/*
        <Pressable
          disabled={isMockSubmitting}
          onPress={onMockPayment}
          className="mt-4 border border-dashed border-[#ea580c]/40 bg-orange-50 dark:bg-[#ea580c]/5 py-3 rounded-2xl items-center justify-center active:bg-orange-100 dark:active:bg-[#ea580c]/10"
        >
          {isMockSubmitting ? (
            <ActivityIndicator size="small" color="#f97316" />
          ) : (
            <View className="flex-row items-center gap-1.5">
              <Zap color="#f97316" size={14} />
              <Text className="text-[11px] text-[#ea580c] font-bold">
                [DEV Sandbox] Giả lập thanh toán tức thì
              </Text>
            </View>
          )}
        </Pressable>
        */}
      </View>
    </View>
  );
}
