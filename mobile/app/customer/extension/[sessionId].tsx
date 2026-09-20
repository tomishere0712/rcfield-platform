import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, CheckCircle2, Clock3, CreditCard, XCircle } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';

import { bookingWizardApi } from '@/features/bookings/api/booking-wizard.api';
import { getSessionOperationalTiming } from '@/features/staff/lib/session-operational-timing';
import { getStatusLabel } from '@/features/bookings/lib/status-label';
import { Text } from '@/shared/ui/Text';

function formatCurrency(value?: number | string) {
  return `${Number(value || 0).toLocaleString('vi-VN')}đ`;
}

function formatDateTime(iso?: string) {
  if (!iso) return '--';
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shortId(value?: string) {
  if (!value) return '--';
  return value.slice(0, 8).toUpperCase();
}

export default function CustomerExtensionResponseScreen() {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const { sessionId } = useLocalSearchParams<{ sessionId?: string | string[] }>();
  const normalizedSessionId = Array.isArray(sessionId) ? sessionId[0] : sessionId;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState<'approve' | 'reject' | null>(null);
  const [sessionDetail, setSessionDetail] = useState<any>(null);
  const [now, setNow] = useState(() => Date.now());

  const extensionProposal = sessionDetail?.extensionProposal;
  const extensionWindowClosed =
    getSessionOperationalTiming(sessionDetail?.plannedEnd, sessionDetail?.status, now).state === 'OVERDUE';
  const canRespond = extensionProposal?.status === 'PENDING' && !extensionWindowClosed;

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    if (!extensionProposal?.expiresAt) return;
    const updateCountdown = () => {
      const ms = new Date(extensionProposal.expiresAt).getTime() - Date.now();
      setTimeLeft(Math.max(0, ms));
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [extensionProposal?.expiresAt]);

  const expiresInText = useMemo(() => {
    if (!extensionProposal?.expiresAt) return '';
    if (timeLeft <= 0) return 'Đã hết hạn';
    const minutes = Math.floor(timeLeft / 60000);
    const seconds = Math.floor((timeLeft % 60000) / 1000);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, [timeLeft, extensionProposal?.expiresAt]);

  const loadSession = useCallback(async (isRefresh = false) => {
    if (!normalizedSessionId) {
      setLoading(false);
      return;
    }

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const data = await bookingWizardApi.getSessionDetail(normalizedSessionId);
      setSessionDetail(data);
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Không thể tải yêu cầu gia hạn.';
      Alert.alert('Lỗi', message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [normalizedSessionId]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const handleRespond = (approved: boolean) => {
    if (!normalizedSessionId || !canRespond) return;

    Alert.alert(
      approved ? 'Đồng ý gia hạn' : 'Từ chối gia hạn',
      approved
        ? 'Xác nhận đồng ý gia hạn phiên chơi và ghi nhận phí phát sinh?'
        : 'Bạn chắc chắn muốn từ chối yêu cầu gia hạn này?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: approved ? 'Đồng ý' : 'Từ chối',
          style: approved ? 'default' : 'destructive',
          onPress: async () => {
            setSubmitting(approved ? 'approve' : 'reject');
            try {
              await bookingWizardApi.respondExtension(normalizedSessionId, approved);
              Alert.alert(
                'Đã phản hồi',
                approved ? 'Phiên chơi đã được gia hạn.' : 'Bạn đã từ chối yêu cầu gia hạn.'
              );
              router.back();
            } catch (error: any) {
              const message = error?.response?.data?.message || 'Không thể gửi phản hồi gia hạn.';
              Alert.alert('Lỗi', message);
            } finally {
              setSubmitting(null);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#f8fafc] dark:bg-[#0b0f19]">
        <ActivityIndicator size="large" color="#f97316" />
        <Text className="mt-3 text-[12px] text-slate-500 dark:text-slate-400 font-semibold">Đang tải yêu cầu gia hạn...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#f8fafc] dark:bg-[#0b0f19]" edges={['top', 'left', 'right']}>
      {/* Header */}
      <View className="flex-row items-center gap-3 border-b border-slate-200 dark:border-slate-900 bg-white dark:bg-[#0b0f19] px-5 py-4">
        <Pressable
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0f172a] active:bg-slate-100 dark:active:bg-slate-800"
        >
          <ArrowLeft color={colorScheme === 'dark' ? '#ffffff' : '#1e293b'} size={19} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-[12px] uppercase tracking-wider text-slate-500 dark:text-slate-400" weight="700">
            Gia hạn phiên
          </Text>
          <Text className="mt-0.5 text-[18px] text-slate-900 dark:text-white font-bold" numberOfLines={1}>
            Phiên #{shortId(normalizedSessionId)}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerClassName="px-5 py-5 pb-12"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadSession(true)}
            colors={['#f97316']}
            tintColor="#f97316"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {!extensionProposal ? (
          <View className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-6 shadow-sm">
            <Text className="text-center text-[14px] text-slate-900 dark:text-white" weight="700">
              Không có yêu cầu gia hạn đang chờ
            </Text>
            <Text className="mt-2 text-center text-[12px] leading-5 text-slate-500 dark:text-slate-400 font-medium">
              Yêu cầu có thể đã được xử lý hoặc đã hết hạn.
            </Text>
          </View>
        ) : extensionWindowClosed ? (
          <View className="rounded-2xl border border-red-500/25 bg-red-500/10 p-5">
            <Text className="text-center text-[14px] text-red-500" weight="700">
              Không thể gia hạn sau khi phiên đã quá giờ
            </Text>
            <Text className="mt-2 text-center text-[12px] leading-5 text-slate-500">
              Nhân viên sẽ kiểm tra và xử lý trả xe. Hệ thống không tự tính phí quá giờ theo thời điểm checkout.
            </Text>
          </View>
        ) : (
          <View className="gap-4">
            <View className="rounded-2xl border border-orange-500/20 bg-orange-500/10 p-4 shadow-sm">
              <View className="flex-row items-start gap-3">
                <View className="h-11 w-11 items-center justify-center rounded-xl bg-orange-500/15">
                  <Clock3 color="#fb923c" size={21} />
                </View>
                <View className="flex-1">
                  <Text className="text-[16px] text-slate-900 dark:text-white" weight="700">
                    Nhân viên đề xuất gia hạn +{extensionProposal.extraMinutes} phút
                  </Text>
                  <Text className="mt-1 text-[12px] leading-5 text-orange-700 dark:text-orange-100/80 font-semibold">
                    Kết thúc mới: {formatDateTime(extensionProposal.newPlannedEnd)}
                  </Text>
                </View>
              </View>
            </View>

            <View className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-4 shadow-sm">
              <InfoRow
                icon={<Clock3 color="#94a3b8" size={15} />}
                label="Thời lượng"
                value={`+${extensionProposal.extraMinutes} phút`}
              />
              <InfoRow
                icon={<CreditCard color="#94a3b8" size={15} />}
                label="Phí phát sinh"
                value={formatCurrency(extensionProposal.additionalFee)}
              />
              <InfoRow
                icon={<Clock3 color="#94a3b8" size={15} />}
                label="Hết hạn sau"
                value={expiresInText || '10 phút'}
              />
              <View className="mt-3 border-t border-slate-200 dark:border-slate-800/80 pt-2.5">
                <Text className="text-[11px] leading-4 text-slate-600 dark:text-slate-400 font-medium">
                  💡 Phí gia hạn giờ sẽ được ghi nhận vào mục quyết toán. Bạn có thể thanh toán qua VNPAY trực tuyến hoặc tại quầy sau khi kết thúc phiên.
                </Text>
              </View>
            </View>

            {canRespond ? (
              <View className="gap-3">
                <Pressable
                  disabled={!!submitting}
                  onPress={() => handleRespond(true)}
                  className={`h-12 flex-row items-center justify-center gap-2 rounded-xl bg-emerald-600 active:bg-emerald-500 shadow-md ${
                    submitting ? 'opacity-70' : ''
                  }`}
                >
                  {submitting === 'approve' ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <CheckCircle2 color="#ffffff" size={17} />
                  )}
                  <Text className="text-[13px] text-white" weight="700">
                    Đồng ý gia hạn
                  </Text>
                </Pressable>

                <Pressable
                  disabled={!!submitting}
                  onPress={() => handleRespond(false)}
                  className={`h-12 flex-row items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 active:bg-red-500/20 ${
                    submitting ? 'opacity-70' : ''
                  }`}
                >
                  {submitting === 'reject' ? (
                    <ActivityIndicator color="#ef4444" size="small" />
                  ) : (
                    <XCircle color="#ef4444" size={17} />
                  )}
                  <Text className="text-[13px] text-red-600 dark:text-red-400" weight="700">
                    Từ chối gia hạn
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                <Text className="text-[12px] text-emerald-600 dark:text-emerald-300" weight="700">
                  Yêu cầu đã được xử lý: {getStatusLabel(extensionProposal.status)}
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <View className="flex-row items-center gap-2 border-b border-slate-100 dark:border-slate-800 py-3 last:border-b-0">
      {icon}
      <Text className="flex-1 text-[12px] text-slate-600 dark:text-slate-400 font-semibold">{label}</Text>
      <Text className="text-[12px] text-slate-900 dark:text-white font-bold">
        {value}
      </Text>
    </View>
  );
}
