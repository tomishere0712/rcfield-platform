import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, CheckCircle2, Clock, Star, XCircle } from 'lucide-react-native';

import { bookingWizardApi } from '@/features/bookings/api/booking-wizard.api';
import { dismissReview, submitReview } from '@/features/reviews/api/review.api';
import { Text } from '@/shared/ui/Text';
import { useColorScheme } from 'nativewind';

function shortId(value?: string) {
  if (!value) return '--';
  return value.slice(0, 8).toUpperCase();
}

export default function CustomerReviewScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { bookingId } = useLocalSearchParams<{ bookingId?: string | string[] }>();
  const normalizedBookingId = Array.isArray(bookingId) ? bookingId[0] : bookingId;

  const scrollViewRef = useRef<ScrollView>(null);
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<'submit' | 'dismiss' | null>(null);
  const [overallScore, setOverallScore] = useState(0);
  const [vehicleScore, setVehicleScore] = useState(0);
  const [staffScore, setStaffScore] = useState(0);
  const [facilityScore, setFacilityScore] = useState(0);
  const [note, setNote] = useState('');

  const isAlreadyReviewed = !!booking?.review;
  const isBookingOrSessionDone = booking?.status === 'COMPLETED' || booking?.session?.status === 'COMPLETED';
  const completionTime =
    booking?.completedAt ||
    booking?.completed_at ||
    booking?.session?.actualEndAt ||
    (isBookingOrSessionDone ? booking?.slotEnd : null);
  const isReviewExpired =
    booking?.is_review_expired ??
    (completionTime
      ? Date.now() - new Date(completionTime).getTime() > 5 * 24 * 60 * 60 * 1000
      : false);

  const loadBooking = useCallback(async () => {
    if (!normalizedBookingId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await bookingWizardApi.getBooking(normalizedBookingId);
      setBooking(data);
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Không thể tải thông tin booking để đánh giá.';
      Alert.alert('Lỗi', message);
    } finally {
      setLoading(false);
    }
  }, [normalizedBookingId]);

  useEffect(() => {
    loadBooking();
  }, [loadBooking]);

  const handleSubmit = async () => {
    if (!normalizedBookingId) return;

    // Yêu cầu đánh giá đầy đủ trước khi gửi (không để điểm số bằng 0)
    const isRental = booking?.playMode !== 'BYOC';
    if (
      overallScore === 0 ||
      (isRental && vehicleScore === 0) ||
      staffScore === 0 ||
      facilityScore === 0
    ) {
      Alert.alert('Chưa hoàn tất', 'Vui lòng chọn số sao đánh giá (từ 1 đến 5 sao) cho tất cả các hạng mục.');
      return;
    }

    setSubmitting('submit');
    try {
      await submitReview({
        booking_id: normalizedBookingId,
        overall_score: overallScore,
        vehicle_score: booking?.playMode === 'BYOC' ? null : vehicleScore,
        staff_score: staffScore,
        facility_score: facilityScore,
        note: note.trim() || null,
      });
      Alert.alert('Cảm ơn bạn', 'Đánh giá đã được ghi nhận.');
      router.back();
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Không thể gửi đánh giá.';
      Alert.alert('Lỗi', message);
    } finally {
      setSubmitting(null);
    }
  };

  const handleDismiss = () => {
    if (!normalizedBookingId) return;

    Alert.alert('Bỏ qua đánh giá', 'Bạn có chắc muốn ẩn nhắc đánh giá cho booking này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Bỏ qua',
        style: 'destructive',
        onPress: async () => {
          setSubmitting('dismiss');
          try {
            await dismissReview(normalizedBookingId);
            router.back();
          } catch (error: any) {
            const message = error?.response?.data?.message || 'Không thể bỏ qua nhắc đánh giá.';
            Alert.alert('Lỗi', message);
          } finally {
            setSubmitting(null);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#f8fafc] dark:bg-[#0b0f19]">
        <ActivityIndicator size="large" color="#f97316" />
        <Text className="mt-3 text-[12px] text-slate-500 dark:text-slate-400 font-semibold">Đang tải đánh giá...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#f8fafc] dark:bg-[#0b0f19]" edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Header */}
        <View className="flex-row items-center gap-3 border-b border-slate-200 dark:border-slate-900 bg-white dark:bg-[#0b0f19] px-5 py-4">
          <Pressable
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0f172a] active:bg-slate-100 dark:active:bg-slate-800"
          >
            <ArrowLeft color={isDark ? '#e2e8f0' : '#1e293b'} size={19} />
          </Pressable>
          <View className="flex-1">
            <Text className="text-[12px] uppercase tracking-wider text-slate-500 dark:text-slate-450" weight="700">
              Đánh giá trải nghiệm
            </Text>
            <Text className="mt-1 text-[19px] text-slate-900 dark:text-white" weight="700" numberOfLines={1}>
              Booking #{shortId(normalizedBookingId)}
            </Text>
          </View>
        </View>

        <ScrollView
          ref={scrollViewRef}
          contentContainerClassName="px-5 py-5 pb-12"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Cafe Information */}
          <View className="mb-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/70 p-4 shadow-sm">
            <Text className="text-[16px] text-slate-900 dark:text-white" weight="700">
              {booking?.cafe?.name || booking?.cafeName || 'RCField'}
            </Text>
            <Text className="mt-1 text-[12px] leading-5 text-slate-500 dark:text-slate-400 font-medium">
              Đánh giá của bạn giúp RCField cải thiện chất lượng sân, xe và phục vụ.
            </Text>
          </View>

          {isAlreadyReviewed ? (
            <View className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5 shadow-sm">
              <View className="flex-row items-center gap-2">
                <CheckCircle2 color="#10b981" size={20} />
                <Text className="text-[15px] font-bold text-emerald-800 dark:text-emerald-300">
                  Bạn đã gửi đánh giá cho đơn đặt này
                </Text>
              </View>
              <View className="flex-row items-center gap-1 mt-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    color="#eab308"
                    fill={i < (booking.review.overallScore || booking.review.rating || 5) ? '#eab308' : 'transparent'}
                    size={18}
                  />
                ))}
                <Text className="ml-2 text-sm font-bold text-slate-700 dark:text-slate-300">
                  {booking.review.overallScore || booking.review.rating || 5}/5 sao
                </Text>
              </View>
              {booking.review.note ? (
                <Text className="mt-2.5 text-xs italic text-slate-600 dark:text-slate-400">
                  {`"${booking.review.note}"`}
                </Text>
              ) : null}
              <Pressable
                onPress={() => router.back()}
                className="mt-5 h-11 flex-row items-center justify-center rounded-xl bg-emerald-600 active:bg-emerald-700"
              >
                <Text className="text-xs font-bold text-white">Quay lại chi tiết đặt sân</Text>
              </Pressable>
            </View>
          ) : isReviewExpired ? (
            <View className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-5 shadow-sm">
              <View className="flex-row items-center gap-2">
                <Clock color="#d97706" size={20} />
                <Text className="text-[15px] font-bold text-amber-900 dark:text-amber-200">
                  Thời hạn đánh giá đã kết thúc
                </Text>
              </View>
              <Text className="mt-2 text-xs leading-5 text-amber-800 dark:text-amber-300">
                Đơn đặt này đã hoàn thành hơn 5 ngày trước nên hệ thống đã đóng cổng gửi đánh giá trải nghiệm.
              </Text>
              <Pressable
                onPress={() => router.back()}
                className="mt-5 h-11 flex-row items-center justify-center rounded-xl bg-[#d97706] active:bg-[#b45309]"
              >
                <Text className="text-xs font-bold text-white">Quay lại chi tiết đặt sân</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Rating Rows */}
              <View className="gap-3">
                <RatingRow label="Tổng thể" value={overallScore} onChange={setOverallScore} isDark={isDark} />
                {booking?.playMode === 'BYOC' ? null : (
                  <RatingRow label="Xe thuê" value={vehicleScore} onChange={setVehicleScore} isDark={isDark} />
                )}
                <RatingRow label="Nhân viên" value={staffScore} onChange={setStaffScore} isDark={isDark} />
                <RatingRow label="Cơ sở/sân" value={facilityScore} onChange={setFacilityScore} isDark={isDark} />
              </View>

              {/* Ghi chú */}
              <View className="mt-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-4 shadow-sm">
                <Text className="mb-2 text-[12px] uppercase tracking-wider text-slate-500 dark:text-slate-450" weight="700">
                  Ghi chú
                </Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  multiline
                  placeholder="Chia sẻ điểm tốt hoặc điều cần cải thiện..."
                  placeholderTextColor={isDark ? '#475569' : '#94a3b8'}
                  className="min-h-[112px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-3 text-[12px] text-slate-900 dark:text-white"
                  style={{ textAlignVertical: 'top' }}
                  onFocus={() => {
                    setTimeout(() => {
                      scrollViewRef.current?.scrollToEnd({ animated: true });
                    }, 100);
                  }}
                />
              </View>

              {/* Actions */}
              <View className="mt-6 gap-3">
                <Pressable
                  disabled={!!submitting}
                  onPress={handleSubmit}
                  className={`h-12 flex-row items-center justify-center gap-2 rounded-xl bg-[#ea580c] active:bg-[#f97316] shadow-md ${
                    submitting ? 'opacity-70' : ''
                  }`}
                >
                  {submitting === 'submit' ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <CheckCircle2 color="#ffffff" size={17} />
                  )}
                  <Text className="text-[13px] text-white font-bold">
                    Gửi đánh giá
                  </Text>
                </Pressable>

                <Pressable
                  disabled={!!submitting}
                  onPress={handleDismiss}
                  className={`h-12 flex-row items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 active:bg-slate-100 dark:active:bg-slate-800 ${
                    submitting ? 'opacity-70' : ''
                  }`}
                >
                  {submitting === 'dismiss' ? (
                    <ActivityIndicator color={isDark ? '#94a3b8' : '#475569'} size="small" />
                  ) : (
                    <XCircle color={isDark ? '#94a3b8' : '#475569'} size={17} />
                  )}
                  <Text className="text-[13px] text-slate-700 dark:text-slate-300 font-bold">
                    Bỏ qua
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RatingRow({
  label,
  value,
  onChange,
  isDark,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  isDark: boolean;
}) {
  const containerRef = useRef<View>(null);
  const layoutRef = useRef<{ pageX: number; width: number } | null>(null);

  const handleTouch = (pageX: number) => {
    if (layoutRef.current) {
      const { pageX: startX, width } = layoutRef.current;
      const relativeX = pageX - startX;
      const score = Math.min(5, Math.max(1, Math.ceil((relativeX / width) * 5)));
      onChange(score);
    } else {
      containerRef.current?.measure((x, y, width, height, pageXOffset, pageYOffset) => {
        if (width > 0) {
          layoutRef.current = { pageX: pageXOffset, width };
          const relativeX = pageX - pageXOffset;
          const score = Math.min(5, Math.max(1, Math.ceil((relativeX / width) * 5)));
          onChange(score);
        }
      });
    }
  };

  return (
    <View className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-4 shadow-sm">
      <Text className="text-[13px] text-slate-900 dark:text-white" weight="700">
        {label}
      </Text>
      <View
        ref={containerRef}
        collapsable={false}
        onTouchStart={(evt) => {
          const pageX = evt.nativeEvent.pageX;
          containerRef.current?.measure((x, y, width, height, pageXOffset, pageYOffset) => {
            if (width > 0) {
              layoutRef.current = { pageX: pageXOffset, width };
              const relativeX = pageX - pageXOffset;
              const score = Math.min(5, Math.max(1, Math.ceil((relativeX / width) * 5)));
              onChange(score);
            }
          });
        }}
        onTouchMove={(evt) => {
          handleTouch(evt.nativeEvent.pageX);
        }}
        className="mt-3 flex-row gap-2 py-1"
        style={{ alignSelf: 'flex-start' }}
      >
        {[1, 2, 3, 4, 5].map((score) => {
          const active = score <= value;
          return (
            <View
              key={`${label}-${score}`}
              pointerEvents="none"
              className="h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
            >
              <Star
                color={active ? '#f59e0b' : (isDark ? '#475569' : '#cbd5e1')}
                fill={active ? '#f59e0b' : 'transparent'}
                size={20}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}
