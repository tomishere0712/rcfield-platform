import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  DeviceEventEmitter,
  BackHandler,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { Text } from '@/shared/ui/Text';
import { getCafes } from '@/features/explore/api/explore.api';
import type { Cafe } from '@/features/explore/types/explore.types';
import { getVnpayReturnUrl } from '@/shared/lib/vnpay-return-url';
import { openVnpayPaymentSession } from '@/shared/lib/vnpay-browser';

import { StepperBar } from './StepperBar';
import { TrackSelectionStep } from './TrackSelectionStep';
import { ParticipantsStep } from './ParticipantsStep';
import { FnbStep } from './FnbStep';
import { PaymentStep, type PaymentMethodType } from './PaymentStep';
import { BankTransferModal } from './BankTransferModal';
import {
  bookingWizardApi,
  type TrackConfig,
  type VehicleCatalog,
  type RentalVehicleUnit,
  type MenuItem,
  type PromoValidationResult,
  type Companion,
  type BankTransferCheckout,
} from '../api/booking-wizard.api';

function vietnamDateString() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

interface BookingWizardScreenProps {
  cafeId: string;
  preselectedVehicleId?: string;
  preselectedFnb?: Record<string, number>;
}

export function BookingWizardScreen({
  cafeId,
  preselectedVehicleId,
  preselectedFnb,
}: BookingWizardScreenProps) {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const insets = useSafeAreaInsets();

  // Wizard state
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [cafe, setCafe] = useState<Cafe | null>(null);
  const [loadingCafe, setLoadingCafe] = useState(true);

  // Form states
  const [selectedTrackConfig, setSelectedTrackConfig] = useState<TrackConfig | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(vietnamDateString);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [playMode, setPlayMode] = useState<'RENTAL' | 'BYOC'>('RENTAL');
  const [participants, setParticipants] = useState<number>(1);
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
  const [fnbQuantities, setFnbQuantities] = useState<Record<string, number>>(() => preselectedFnb ?? {});
  const [fnbNotes, setFnbNotes] = useState<Record<string, string>>({});

  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [appliedPromo, setAppliedPromo] = useState<PromoValidationResult | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethodType>('vnpay');
  const [availablePaymentMethods, setAvailablePaymentMethods] = useState<string[]>([
    'vnpay',
    'bank_transfer',
  ]);

  // Bank Transfer Modal State
  const [bankTransferModalData, setBankTransferModalData] = useState<{
    bookingId: string;
    checkout: BankTransferCheckout;
  } | null>(null);

  // Submit states
  const [submitting, setSubmitting] = useState(false);
  const [mockSubmitting, setMockSubmitting] = useState(false);

  // Data details lists (for calculation & labels)
  const [catalogs, setCatalogs] = useState<VehicleCatalog[]>([]);
  const [vehicleUnits, setVehicleUnits] = useState<RentalVehicleUnit[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);

  // 1. Fetch Cafe Details & catalogs/menus/payment methods
  useEffect(() => {
    const fetchCafeData = async () => {
      setLoadingCafe(true);
      try {
        const cafes = await getCafes();
        const found = cafes.find((c) => c.id === cafeId);
        if (found) {
          setCafe(found);
        } else {
          Alert.alert('Lỗi', 'Không tìm thấy thông tin cơ sở này!');
          router.back();
          return;
        }

        // Preload vehicle catalogs & menu items & payment methods for breakdown calculations
        const [vehiclesData, unitsData, menuData, methods] = await Promise.all([
          bookingWizardApi.getCafeCatalogs(cafeId),
          bookingWizardApi.getCafeVehicleUnits(cafeId),
          bookingWizardApi.getCafeMenu(cafeId),
          bookingWizardApi.getCafePaymentMethods(cafeId),
        ]);
        setCatalogs(vehiclesData);
        setVehicleUnits(unitsData);
        setMenuItems(menuData);
        if (methods && methods.length > 0) {
          setAvailablePaymentMethods(methods);
          if (!methods.includes('vnpay') && methods.includes('bank_transfer')) {
            setSelectedPaymentMethod('bank_transfer');
          }
        }

        // Preselect vehicle if provided
        if (preselectedVehicleId && unitsData.some((unit) => unit.id === preselectedVehicleId)) {
          setSelectedVehicleIds([preselectedVehicleId]);
        }
      } catch (err) {
        console.error('[BookingWizardScreen] Error loading cafe data:', err);
      } finally {
        setLoadingCafe(false);
      }
    };

    fetchCafeData();
  }, [cafeId, preselectedVehicleId, router]);

  // Reset vehicles if switched to BYOC
  useEffect(() => {
    if (playMode === 'BYOC') {
      setSelectedVehicleIds([]);
    }
  }, [playMode]);

  // 2. Calculations
  const sortedSlots = useMemo(() => {
    return selectedSlots;
  }, [selectedSlots]);

  const durationHours = sortedSlots.length || 1;
  const slotFeeRate = cafe?.slotFeeRate || 0;

  // Rental vehicle prices calculation
  const vehiclePriceTotal = useMemo(() => {
    return selectedVehicleIds.reduce((sum, id) => {
      const match = vehicleUnits.find((unit) => unit.id === id);
      const rate = Number(match?.catalog?.hourlyRate || 0);
      const durationHoursActual = (durationHours * Number(cafe?.slotDurationMinutes || 0)) / 60;
      return sum + rate * durationHoursActual;
    }, 0);
  }, [selectedVehicleIds, vehicleUnits, durationHours, cafe?.slotDurationMinutes]);

  // Fnb preorder price total
  const fnbPriceTotal = useMemo(() => {
    return Object.entries(fnbQuantities).reduce((sum, [key, qty]) => {
      const [itemId, variantId] = key.split('__');
      const item = menuItems.find((m) => m.id === itemId);
      if (!item) return sum;
      let unitPrice = Number(item.price);
      if (variantId && item.variants) {
        const variant = item.variants.find((v) => v.id === variantId);
        if (variant) unitPrice = Number(variant.price);
      }
      return sum + unitPrice * qty;
    }, 0);
  }, [fnbQuantities, menuItems]);

  const fnbDetailsList = useMemo(() => {
    return Object.entries(fnbQuantities)
      .map(([key, qty]) => {
        const [itemId, variantId] = key.split('__');
        const item = menuItems.find((m) => m.id === itemId);
        let name = 'Món F&B';
        let unitPrice = 0;
        if (item) {
          name = item.name;
          unitPrice = Number(item.price);
          if (variantId && item.variants) {
            const variant = item.variants.find((v) => v.id === variantId);
            if (variant) {
              name = `${item.name} (${variant.name})`;
              unitPrice = Number(variant.price);
            }
          }
        }
        const note = fnbNotes[key]?.trim();
        return { name, qty, price: unitPrice, note };
      })
      .filter((m) => m.qty > 0);
  }, [fnbQuantities, fnbNotes, menuItems]);

  // Final Total calculation for Step 4 Preview
  const finalTotalAmount = useMemo(() => {
    const baseSlotFee = slotFeeRate * participants * durationHours;
    const slotFeeDiscount = selectedPackageId !== null ? slotFeeRate * durationHours : 0;
    const finalSlotFee = Math.max(0, baseSlotFee - slotFeeDiscount);

    const subtotal = finalSlotFee + vehiclePriceTotal + fnbPriceTotal;
    let promoDiscount = 0;
    if (appliedPromo) {
      if (appliedPromo.discount_type === 'PERCENTAGE') {
        promoDiscount = Math.round((subtotal * appliedPromo.value) / 100);
      } else {
        promoDiscount = appliedPromo.value;
      }
      promoDiscount = Math.min(subtotal, promoDiscount);
    }

    return Math.max(0, subtotal - promoDiscount);
  }, [
    slotFeeRate,
    participants,
    durationHours,
    selectedPackageId,
    vehiclePriceTotal,
    fnbPriceTotal,
    appliedPromo,
  ]);

  // 3. Navigation Controls
  const slotStartIso = useMemo(() => {
    if (sortedSlots.length === 0) return '';
    return `${selectedDate}T${sortedSlots[0]}:00+07:00`;
  }, [selectedDate, sortedSlots]);

  const slotEndIso = useMemo(() => {
    if (sortedSlots.length === 0) return '';
    const lastSlot = sortedSlots[sortedSlots.length - 1];
    const duration = Number(cafe?.slotDurationMinutes || 0);
    if (!duration) return '';
    const [lastH, lastM] = lastSlot.split(':').map(Number);
    const endMinutes = lastH * 60 + lastM + duration;

    const endH = String(Math.floor(endMinutes / 60) % 24).padStart(2, '0');
    const endM = String(endMinutes % 60).padStart(2, '0');

    let endDateStr = selectedDate;
    if (endMinutes >= 24 * 60) {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + 1);
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      endDateStr = `${y}-${mo}-${da}`;
    }

    return `${endDateStr}T${endH}:${endM}:00+07:00`;
  }, [selectedDate, sortedSlots, cafe?.slotDurationMinutes]);

  const isNextDisabled = useMemo(() => {
    if (currentStep === 1) {
      return !selectedTrackConfig || selectedSlots.length === 0 || !cafe?.slotDurationMinutes;
    }
    if (currentStep === 2) {
      const phoneRegex = /^(0|84)(3|5|7|8|9)[0-9]{8}$/;
      const companionPhoneInvalid = companions.some(
        (c) => c.phone.trim() !== '' && !phoneRegex.test(c.phone)
      );
      const companionNameEmpty = companions.some((c) => c.name.trim() === '');

      if (companionNameEmpty || companionPhoneInvalid) return true;

      if (playMode === 'RENTAL') {
        return selectedVehicleIds.length === 0;
      }
      return false;
    }
    return false;
  }, [
    currentStep,
    selectedTrackConfig,
    selectedSlots.length,
    playMode,
    selectedVehicleIds.length,
    companions,
    cafe?.slotDurationMinutes,
  ]);

  const handleNext = async () => {
    if (currentStep === 4) return;

    if (currentStep === 1) {
      const duration = Number(cafe?.slotDurationMinutes || 0);
      if (!duration) {
        Alert.alert('Thiếu cấu hình', 'Cơ sở chưa cấu hình thời lượng slot hợp lệ.');
        return;
      }
      let isSequential = true;

      const timeToMinutes = (timeStr: string): number => {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
      };

      for (let i = 0; i < sortedSlots.length - 1; i++) {
        const currentMin = timeToMinutes(sortedSlots[i]);
        const nextMin = timeToMinutes(sortedSlots[i + 1]);
        const expectedNextMin = (currentMin + duration) % (24 * 60);
        if (nextMin !== expectedNextMin) {
          isSequential = false;
          break;
        }
      }
      if (!isSequential) {
        Alert.alert('Khung giờ không hợp lệ', 'Các khung giờ được chọn phải liên tiếp nhau!');
        return;
      }
    }

    if (currentStep === 2 && selectedTrackConfig && slotStartIso && slotEndIso) {
      try {
        const availability = await bookingWizardApi.checkAvailability(cafeId, {
          slot_start: slotStartIso,
          slot_end: slotEndIso,
          play_mode: playMode,
          track_config_id: selectedTrackConfig.id,
        });

        if (playMode === 'BYOC') {
          const remaining = Number(availability.byoc_remaining || 0);
          if (participants > remaining) {
            Alert.alert(
              'Không đủ chỗ xe cá nhân',
              `Khung giờ này chỉ còn ${remaining} chỗ cho xe cá nhân. Vui lòng giảm số người chơi hoặc chọn giờ khác.`
            );
            return;
          }
        } else {
          const availableIds = new Set(availability.vehicles?.map((v) => v.vehicle_id) ?? []);
          if (selectedVehicleIds.length === 0 || selectedVehicleIds.some((id) => !availableIds.has(id))) {
            setSelectedVehicleIds((current) => current.filter((id) => availableIds.has(id)));
            Alert.alert(
              'Xe không còn khả dụng',
              'Một hoặc nhiều xe đã được đặt trong khung giờ đã chọn. Vui lòng chọn lại xe.'
            );
            return;
          }
        }
      } catch (error: any) {
        const message =
          error?.response?.data?.message || 'Không thể kiểm tra availability. Vui lòng thử lại.';
        Alert.alert('Không thể tiếp tục', message);
        return;
      }
    }

    setCurrentStep((prev) => prev + 1);
  };

  const handleBack = useCallback(() => {
    if (currentStep === 1) {
      router.back();
    } else {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep, router]);

  const handleBackRef = React.useRef(handleBack);
  handleBackRef.current = handleBack;

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('WIZARD_SWIPE_BACK', () => {
      handleBackRef.current();
    });

    const onBackPress = () => {
      handleBackRef.current();
      return true;
    };

    const backHandlerSub = BackHandler.addEventListener('hardwareBackPress', onBackPress);

    return () => {
      sub.remove();
      backHandlerSub.remove();
    };
  }, []);

  // 4. Booking submission
  const getBookingPayload = () => {
    return {
      cafe_id: cafeId,
      play_mode: playMode,
      slot_start: slotStartIso,
      slot_end: slotEndIso,
      vehicle_ids: playMode === 'RENTAL' ? selectedVehicleIds : [],
      participants: companions.map((c) => ({
        participant_type: 'WALK_IN_GUEST' as const,
        guest_name: c.name.trim(),
        guest_phone: c.phone.trim(),
      })),
      fnb_items: Object.entries(fnbQuantities)
        .filter(([, qty]) => qty > 0)
        .map(([key, quantity]) => {
          const [menu_item_id, variant_id] = key.split('__');
          const notes = fnbNotes[key]?.trim();
          return {
            menu_item_id,
            ...(variant_id ? { variant_id } : {}),
            quantity,
            ...(notes ? { notes } : {}),
          };
        }),
      track_type_id: selectedTrackConfig?.track_type_id,
      track_config_id: selectedTrackConfig?.id,
      customer_package_id: selectedPackageId || undefined,
      promotion_code: appliedPromo?.code || undefined,
    };
  };

  const navigateToDetail = useCallback(
    (bookingId: string) => {
      if (!bookingId) {
        console.warn('[BookingWizard] navigateToDetail called without bookingId, redirecting to /bookings');
        router.push('/(tabs)/bookings');
        return;
      }
      router.push({
        pathname: '/booking/[id]',
        params: { id: bookingId },
      } as any);
    },
    [router]
  );

  const handleConfirmPayment = async () => {
    setSubmitting(true);
    try {
      const payload = getBookingPayload();
      const booking = await bookingWizardApi.createBooking(payload);

      // Pay Later Flow (30 min Hold)
      if (selectedPaymentMethod === 'pay_later') {
        Alert.alert(
          'Giữ chỗ thành công',
          'Lịch đặt của bạn đã được giữ chỗ trong 30 phút! Bạn có thể thanh toán online sau hoặc thanh toán tại quầy khi đến sân.',
          [{ text: 'Xem lịch đặt', onPress: () => navigateToDetail(booking.booking_id) }]
        );
        return;
      }

      const customReturnUrl = getVnpayReturnUrl();

      // Create checkout with selected payment method
      const checkout = await bookingWizardApi.createCheckout(
        booking.booking_id,
        customReturnUrl,
        selectedPaymentMethod
      );

      // Package full-coverage
      if (checkout.confirmed) {
        Alert.alert(
          'Thành công',
          'Đặt lịch thành công! Slot đã được thanh toán thông qua Gói hội viên.',
          [{ text: 'Đóng', onPress: () => navigateToDetail(booking.booking_id) }]
        );
        return;
      }

      // Bank Transfer VietQR flow
      if (checkout.flow === 'bank_transfer' && checkout.bank_transfer) {
        setBankTransferModalData({
          bookingId: booking.booking_id,
          checkout: checkout.bank_transfer,
        });
        return;
      }

      // VNPay Redirect Flow
      if (checkout.payment_url) {
        await openVnpayPaymentSession(checkout.payment_url);

        // After browser is closed, check the latest status of this booking from backend
        setSubmitting(true);
        try {
          const latestBooking = await bookingWizardApi.getBooking(booking.booking_id);
          if (
            latestBooking.status === 'PAYMENT_CONFIRMED' ||
            latestBooking.status === 'CONFIRMED'
          ) {
            Alert.alert(
              'Thành công',
              'Thanh toán thành công! Lịch đặt của bạn đã được xác nhận.',
              [{ text: 'Xem lịch đặt', onPress: () => navigateToDetail(booking.booking_id) }]
            );
          } else {
            Alert.alert(
              'Chưa hoàn tất',
              'Giao dịch thanh toán chưa được xác nhận hoặc đã bị hủy. Bạn có thể kiểm tra lại trong mục Lịch đặt.',
              [{ text: 'Xem lịch đặt', onPress: () => navigateToDetail(booking.booking_id) }]
            );
          }
        } catch {
          navigateToDetail(booking.booking_id);
        }
      } else {
        throw new Error('Không nhận được URL hoặc thông tin thanh toán từ hệ thống!');
      }
    } catch (err: any) {
      console.error('[BookingWizard] Submit payment error:', err);
      const msg = err?.response?.data?.message || 'Có lỗi xảy ra, vui lòng thử lại!';
      Alert.alert('Lỗi đặt lịch', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMockPayment = async () => {
    setMockSubmitting(true);
    try {
      const payload = getBookingPayload();
      const booking = await bookingWizardApi.createBooking(payload);

      // Perform mock checkout
      await bookingWizardApi.mockCheckout(booking.booking_id);

      Alert.alert('Thành công', 'Mock thanh toán thành công! Lịch đặt đã được xác nhận.', [
        { text: 'Xem lịch đặt', onPress: () => navigateToDetail(booking.booking_id) },
      ]);
    } catch (err: any) {
      console.error('[BookingWizard] Mock payment error:', err);
      const msg = err?.response?.data?.message || 'Mock thanh toán thất bại!';
      Alert.alert('Lỗi thanh toán', msg);
    } finally {
      setMockSubmitting(false);
    }
  };

  const confirmButtonLabel = useMemo(() => {
    if (finalTotalAmount === 0 || selectedPackageId) return 'Xác nhận đặt lịch';
    if (selectedPaymentMethod === 'pay_later') return 'Xác nhận giữ chỗ (Thanh toán sau)';
    if (selectedPaymentMethod === 'bank_transfer') return 'Chuyển khoản VietQR';
    return 'Thanh toán VNPay';
  }, [finalTotalAmount, selectedPackageId, selectedPaymentMethod]);

  const handleBankTransferClose = useCallback(() => {
    const bookingId = bankTransferModalData?.bookingId;
    setBankTransferModalData(null);
    if (bookingId) {
      setTimeout(() => {
        navigateToDetail(bookingId);
      }, 100);
    }
  }, [bankTransferModalData?.bookingId, navigateToDetail]);

  const handleBankTransferSuccess = useCallback(
    (bookingId: string) => {
      setBankTransferModalData(null);
      setTimeout(() => {
        navigateToDetail(bookingId);
      }, 100);
    },
    [navigateToDetail]
  );

  return (
    <SafeAreaView
      className="flex-grow flex-1 bg-[#f8fafc] dark:bg-[#0b0f19]"
      edges={['top', 'left', 'right']}
    >
      {/* Header Back Button */}
      <View className="flex-row items-center px-4 py-3 border-b border-slate-200 dark:border-slate-900 bg-white dark:bg-[#0f172a]/50">
        <Pressable
          onPress={handleBack}
          className="p-1 rounded-full active:bg-slate-100 dark:active:bg-slate-800 flex-row items-center gap-1"
        >
          <ChevronLeft color={colorScheme === 'dark' ? '#f97316' : '#ea580c'} size={20} />
          <Text className="text-[12px] text-[#f97316] font-bold">Quay lại</Text>
        </Pressable>
        {cafe && (
          <Text
            className="text-[13px] text-slate-900 dark:text-white flex-1 text-center font-bold mr-10"
            numberOfLines={1}
          >
            Đặt sân {cafe.name}
          </Text>
        )}
      </View>

      {loadingCafe ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
          className="flex-1"
        >
          <View className="flex-1">
            <ScrollView
              className="flex-1"
              contentContainerClassName="px-5 py-5 pb-6"
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Stepper progress */}
              <StepperBar currentStep={currentStep} />



              {/* Steps Container */}
              {currentStep === 1 && (
                <TrackSelectionStep
                  cafeId={cafeId}
                  selectedTrackConfig={selectedTrackConfig}
                  setSelectedTrackConfig={setSelectedTrackConfig}
                  selectedDate={selectedDate}
                  setSelectedDate={setSelectedDate}
                  selectedSlots={selectedSlots}
                  setSelectedSlots={setSelectedSlots}
                  playMode={playMode}
                  setPlayMode={setPlayMode}
                  selectedVehicleIds={selectedVehicleIds}
                  setSelectedVehicleIds={setSelectedVehicleIds}
                  catalogs={catalogs}
                  cafe={cafe}
                />
              )}

              {currentStep === 2 && (
                <ParticipantsStep
                  cafeId={cafeId}
                  playMode={playMode}
                  participants={participants}
                  setParticipants={setParticipants}
                  companions={companions}
                  setCompanions={setCompanions}
                  selectedVehicleIds={selectedVehicleIds}
                  setSelectedVehicleIds={setSelectedVehicleIds}
                  slotStart={slotStartIso}
                  slotEnd={slotEndIso}
                  trackConfigId={selectedTrackConfig?.id}
                  vehicleUnits={vehicleUnits}
                />
              )}

              {currentStep === 3 && (
                <FnbStep
                  cafeId={cafeId}
                  fnbQuantities={fnbQuantities}
                  setFnbQuantities={setFnbQuantities}
                  fnbNotes={fnbNotes}
                  setFnbNotes={setFnbNotes}
                />
              )}

              {currentStep === 4 && (
                <PaymentStep
                  cafeId={cafeId}
                  playMode={playMode}
                  slotStart={slotStartIso}
                  slotEnd={slotEndIso}
                  durationHours={durationHours}
                  slotFeeRate={slotFeeRate}
                  participants={participants}
                  selectedVehicleIds={selectedVehicleIds}
                  vehiclePriceTotal={vehiclePriceTotal}
                  fnbPriceTotal={fnbPriceTotal}
                  fnbDetailsList={fnbDetailsList}
                  selectedPackageId={selectedPackageId}
                  setSelectedPackageId={setSelectedPackageId}
                  appliedPromo={appliedPromo}
                  setAppliedPromo={setAppliedPromo}
                  selectedPaymentMethod={selectedPaymentMethod}
                  setSelectedPaymentMethod={setSelectedPaymentMethod}
                  availablePaymentMethods={availablePaymentMethods}
                  onMockPayment={handleMockPayment}
                  isMockSubmitting={mockSubmitting}
                  cafeName={cafe?.name || 'Chi nhánh'}
                  cafeAddress={`${cafe?.district || ''}, ${cafe?.city || ''}`}
                  cafeImage={cafe?.image || null}
                  trackConfigName={selectedTrackConfig?.track_type?.name || 'Sân đua'}
                  vehicleUnits={vehicleUnits}
                  slotDurationMinutes={cafe?.slotDurationMinutes}
                />
              )}
            </ScrollView>

            {/* Action Bottom Bar */}
            <View
              style={{ paddingBottom: Math.max(insets.bottom, 16), paddingTop: 14 }}
              className="border-t border-slate-200 dark:border-slate-900 bg-white/95 dark:bg-[#0f172a]/95 px-5 flex-row justify-between items-center shadow-lg"
            >
              <View>
                <Text className="text-[10px] text-slate-550 dark:text-slate-400 font-semibold">
                  Tạm tính
                </Text>
                <Text className="text-[16px] text-[#f97316]" weight="700">
                  {finalTotalAmount.toLocaleString('vi-VN')}đ
                </Text>
              </View>

              {currentStep === 4 ? (
                <Pressable
                  disabled={submitting}
                  onPress={handleConfirmPayment}
                  className="flex-row items-center justify-center bg-[#ea580c] py-2.5 px-6 rounded-xl active:bg-[#f97316] gap-1"
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Text className="text-[12px] text-white font-bold">{confirmButtonLabel}</Text>
                      <ChevronRight color="#ffffff" size={14} strokeWidth={2.5} />
                    </>
                  )}
                </Pressable>
              ) : (
                <Pressable
                  disabled={isNextDisabled}
                  onPress={handleNext}
                  className={`flex-row items-center justify-center py-2.5 px-6 rounded-xl gap-1 ${
                    isNextDisabled
                      ? 'bg-slate-200 dark:bg-slate-800 opacity-50'
                      : 'bg-[#ea580c] active:bg-[#f97316]'
                  }`}
                >
                  <Text
                    className={`text-[12px] font-bold ${
                      isNextDisabled ? 'text-slate-400 dark:text-slate-500' : 'text-white'
                    }`}
                  >
                    Tiếp theo
                  </Text>
                  <ChevronRight
                    color={
                      isNextDisabled
                        ? colorScheme === 'dark'
                          ? '#64748b'
                          : '#94a3b8'
                        : '#ffffff'
                    }
                    size={14}
                    strokeWidth={2.5}
                  />
                </Pressable>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Bank Transfer VietQR Modal */}
      <BankTransferModal
        visible={bankTransferModalData !== null}
        bookingId={bankTransferModalData?.bookingId || ''}
        checkout={bankTransferModalData?.checkout || null}
        onClose={handleBankTransferClose}
        onSuccess={handleBankTransferSuccess}
      />
    </SafeAreaView>
  );
}
