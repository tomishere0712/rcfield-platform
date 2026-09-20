import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Car,
  CheckCircle2,
  Clock,
  Coffee,
  FileText,
  Pencil,
  QrCode,
  ReceiptText,
  ShieldCheck,
  Smartphone,
  UserRound,
  WalletCards,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  staffApi,
  type BankTransferCheckout,
  type StaffInspectionType,
  type StaffSessionDetail,
} from '@/features/staff/api/staff.api';
import { getStatusLabel } from '@/features/bookings/lib/status-label';
import { StaffSessionTools } from '@/features/staff/components/StaffSessionTools';
import { WalkInBankTransferModal } from '@/features/staff/components/WalkInBankTransferModal';
import {
  getSessionOperationalTiming,
  type SessionOperationalTiming,
} from '@/features/staff/lib/session-operational-timing';
import { wsClient } from '@/shared/lib/websocket';
import { ImageZoomModal } from '@/shared/ui/ImageZoomModal';
import { Text } from '@/shared/ui/Text';

function formatDateTime(iso?: string) {
  if (!iso) return '--';
  const date = new Date(iso);
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCurrency(value?: number) {
  return `${Number(value || 0).toLocaleString('vi-VN')}đ`;
}

function shortId(value?: string) {
  if (!value) return '--';
  return value.slice(0, 8).toUpperCase();
}

function getStatusColor(status?: string) {
  if (status === 'ACTIVE' || status === 'CHECKED_IN') return '#10b981';
  if (status === 'CHECKING_OUT' || status === 'EXTENDING') return '#f59e0b';
  if (status === 'COMPLETED') return '#38bdf8';
  if (status === 'CANCELLED') return '#ef4444';
  return '#94a3b8';
}

const PHOTO_ANGLE_LABELS: Record<string, string> = {
  FRONT: 'Phía trước',
  BACK: 'Phía sau',
  LEFT: 'Bên trái',
  RIGHT: 'Bên phải',
  TOP: 'Từ trên',
  BOTTOM: 'Phía dưới',
  DETAIL: 'Cận cảnh',
};

const PART_TYPE_LABELS: Record<string, string> = {
  TIRE_WHEEL: 'Bánh xe / Lốp',
  SPOILER: 'Cánh gió',
  CHASSIS: 'Khung gầm',
  MOTOR: 'Motor / Động cơ',
  SHELL: 'Vỏ nhựa (Shell)',
  SERVO: 'Servo / Tay lái',
  REMOTE: 'Remote / Điều khiển',
  OTHER: 'Khác',
};

function getPhotoAngleLabel(angle?: string) {
  return angle ? PHOTO_ANGLE_LABELS[angle] : undefined;
}

function getPartTypeLabel(type?: string) {
  return type ? PART_TYPE_LABELS[type] || type : 'Hư hỏng';
}

function getFnbOrderStatusLabel(status?: string) {
  const labels: Record<string, string> = {
    PENDING: 'Chờ xử lý',
    CONFIRMED: 'Đang làm',
    DELIVERED: 'Đã phục vụ',
    CANCELLED: 'Đã hủy',
  };
  return labels[status || ''] || getStatusLabel(status);
}

function getVehicleSourceLabel(type?: string) {
  return type === 'BYOC' ? 'Khách tự mang xe' : 'Xe thuê của cơ sở';
}

const FALLBACK_VEHICLE_IMAGE_URL =
  'https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&q=80&w=400';

function getVehicleImageUrl(imageUrl?: string) {
  return imageUrl && !imageUrl.includes('cdn.rcfield.vn') ? imageUrl : FALLBACK_VEHICLE_IMAGE_URL;
}

export function StaffSessionDetailScreen({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<StaffSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settling, setSettling] = useState(false);
  const [confirmingCheckout, setConfirmingCheckout] = useState(false);
  const [confirmSettleModalVisible, setConfirmSettleModalVisible] = useState(false);
  const [settleQrModalVisible, setSettleQrModalVisible] = useState(false);
  const [settleBankTransferData, setSettleBankTransferData] = useState<BankTransferCheckout | null>(null);
  const [generatingQr, setGeneratingQr] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; title: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const loadSession = useCallback(async (isRefresh = false) => {
    if (!sessionId) {
      setLoading(false);
      return;
    }

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const data = await staffApi.getSessionDetail(sessionId);
      setSession(data);
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Không thể tải chi tiết phiên chạy.';
      Alert.alert('Lỗi', message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsubscribe = wsClient.subscribe((event, data) => {
      if (
        ![
          'CUSTOMER_CHECKOUT_CONFIRMED',
          'CUSTOMER_CHECKIN_CONFIRMED',
          'CUSTOMER_INSPECTION_DISPUTED',
          'CUSTOMER_PAYMENT_CONFIRMED',
          'CUSTOMER_EXTENSION_APPROVED',
          'CUSTOMER_EXTENSION_REJECTED',
          'SESSION_EXTENSION_EXPIRED',
          'SESSION_FNB_ORDER_ADDED',
          'INSPECTION_UPDATED',
          'SESSION_UPDATED',
          'BOOKING_UPDATED',
        ].includes(event)
      ) {
        return;
      }

      const eventSessionId = data?.sessionId || data?.session_id;
      if (eventSessionId && eventSessionId !== sessionId) {
        return;
      }

      loadSession(true);
    });

    return unsubscribe;
  }, [loadSession, sessionId]);

  const allFnbOrders = useMemo(() => session?.fnbOrders || [], [session?.fnbOrders]);
  const preorderFnbOrders = useMemo(
    () => allFnbOrders.filter((o) => o.orderType === 'PRE_ORDER' && o.status !== 'CANCELLED'),
    [allFnbOrders]
  );
  const onsiteFnbOrders = useMemo(
    () => allFnbOrders.filter((o) => o.orderType !== 'PRE_ORDER' && o.status !== 'CANCELLED'),
    [allFnbOrders]
  );
  const onsiteFnbTotal = useMemo(
    () => onsiteFnbOrders.reduce((sum, o) => sum + Number(o.total || 0), 0),
    [onsiteFnbOrders]
  );

  const totals = useMemo(() => {
    const photoTotal =
      session?.inspections?.reduce((sum, inspection) => sum + (inspection.photos?.length || 0), 0) ?? 0;
    return { fnbTotal: onsiteFnbTotal, photoTotal };
  }, [onsiteFnbTotal, session?.inspections]);

  const checkInInspection = useMemo(
    () => session?.inspections?.find((inspection) => inspection.type === 'CHECK_IN') ?? null,
    [session?.inspections]
  );

  const checkOutInspection = useMemo(
    () => session?.inspections?.find((inspection) => inspection.type === 'CHECK_OUT') ?? null,
    [session?.inspections]
  );

  const checkOutDisputed = Boolean(
    checkOutInspection &&
      !checkOutInspection.customerConfirmed &&
      checkOutInspection.customerConfirmedAt &&
      ['ACTIVE', 'EXTENDING'].includes(session?.status || '')
  );

  const isByoc = useMemo(
    () =>
      session?.playMode === 'BYOC' ||
      (!!session?.vehicles?.length && session.vehicles.every((vehicle) => vehicle.type === 'BYOC')),
    [session?.playMode, session?.vehicles]
  );

  const isWalkIn =
    session?.bookingSource === 'STAFF_MANUAL' ||
    session?.bookingSource === 'WALK_IN' ||
    (session as any)?.source === 'STAFF_MANUAL' ||
    (session as any)?.source === 'WALK_IN';
  const paymentSummary = session?.paymentSummary;
  const financialSummary = session?.financialSummary;
  const operationalTiming = getSessionOperationalTiming(session?.plannedEnd, session?.status, now);
  const isCheckoutPending = ['ACTIVE', 'EXTENDING'].includes(session?.status || '');
  const hasOutstandingPayment = !!paymentSummary?.requiresSettlement;
  const canSettlePayments = hasOutstandingPayment && !isCheckoutPending;

  const prepaidLines = useMemo(() => {
    const raw = financialSummary?.prepaidLines ?? [];
    const seen = new Set<string>();
    return raw.filter((line) => {
      const key = `${line.componentId || ''}_${line.label}_${line.amount}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [financialSummary?.prepaidLines]);
  const additionalLines = useMemo(() => financialSummary?.additionalLines ?? [], [financialSummary?.additionalLines]);

  const onsiteFnbComponents = useMemo(
    () => additionalLines.filter((l) => l.type === 'FNB_ON_SITE' || l.label.includes('Đồ ăn & thức uống')),
    [additionalLines]
  );
  const pendingOnsiteFnbAmount = useMemo(
    () => onsiteFnbComponents.filter((l) => l.status === 'PENDING').reduce((sum, l) => sum + Number(l.amount), 0),
    [onsiteFnbComponents]
  );
  const paidOnsiteFnbAmount = useMemo(
    () =>
      onsiteFnbComponents
        .filter((l) => l.status === 'DISBURSED' || l.status === 'CAPTURED')
        .reduce((sum, l) => sum + Number(l.amount), 0),
    [onsiteFnbComponents]
  );

  const onsiteOrderPaidMap = useMemo(() => {
    const map = new Map<string, boolean>();
    if (onsiteFnbOrders.length === 0) return map;

    if (pendingOnsiteFnbAmount === 0) {
      onsiteFnbOrders.forEach((o) => map.set(o.orderId, true));
      return map;
    }
    if (paidOnsiteFnbAmount === 0) {
      onsiteFnbOrders.forEach((o) => map.set(o.orderId, false));
      return map;
    }

    const exactPendingMatch = onsiteFnbOrders.find((o) => Number(o.total) === pendingOnsiteFnbAmount);
    if (exactPendingMatch) {
      onsiteFnbOrders.forEach((o) => {
        map.set(o.orderId, o.orderId !== exactPendingMatch.orderId);
      });
      return map;
    }

    let remainingPending = pendingOnsiteFnbAmount;
    const reversed = [...onsiteFnbOrders].reverse();
    for (const order of reversed) {
      const orderTotal = Number(order.total);
      if (remainingPending >= orderTotal && orderTotal > 0) {
        map.set(order.orderId, false);
        remainingPending -= orderTotal;
      } else {
        map.set(order.orderId, true);
      }
    }
    return map;
  }, [onsiteFnbOrders, paidOnsiteFnbAmount, pendingOnsiteFnbAmount]);

  const groupedAdditionalLines = useMemo(() => {
    const fnbLines = additionalLines.filter(
      (l) => l.type === 'FNB_ON_SITE' || l.label.includes('Đồ ăn & thức uống')
    );
    const otherLines = additionalLines.filter(
      (l) => l.type !== 'FNB_ON_SITE' && !l.label.includes('Đồ ăn & thức uống')
    );

    const paidFnb = fnbLines.filter((l) => l.status === 'DISBURSED' || l.status === 'CAPTURED');
    const pendingFnb = fnbLines.filter((l) => l.status !== 'DISBURSED' && l.status !== 'CAPTURED');

    const paidFnbTotal = paidFnb.reduce((sum, l) => sum + Number(l.amount), 0);
    const pendingFnbTotal = pendingFnb.reduce((sum, l) => sum + Number(l.amount), 0);

    const result: {
      id: string;
      label: string;
      amount: number;
      paid: boolean;
    }[] = [];

    if (paidFnbTotal > 0 && pendingFnbTotal > 0) {
      result.push({
        id: 'fnb-paid-aggregate',
        label: 'Đồ ăn & thức uống gọi tại quầy',
        amount: paidFnbTotal,
        paid: true,
      });
      result.push({
        id: 'fnb-pending-aggregate',
        label: 'Đồ ăn & thức uống gọi tại quầy',
        amount: pendingFnbTotal,
        paid: false,
      });
    } else if (paidFnbTotal > 0) {
      result.push({
        id: 'fnb-paid-aggregate',
        label: 'Đồ ăn & thức uống gọi tại quầy',
        amount: paidFnbTotal,
        paid: true,
      });
    } else if (pendingFnbTotal > 0) {
      result.push({
        id: 'fnb-pending-aggregate',
        label: 'Đồ ăn & thức uống gọi tại quầy',
        amount: pendingFnbTotal,
        paid: false,
      });
    }

    for (const line of otherLines) {
      const isPaid = line.status === 'DISBURSED' || line.status === 'CAPTURED';
      result.push({
        id: line.componentId || line.label,
        label: line.label,
        amount: Number(line.amount),
        paid: isPaid,
      });
    }

    return result;
  }, [additionalLines]);

  const prepaidDiscountAmount = financialSummary?.prepaidDiscountAmount ?? 0;
  const prepaidPaidAmount = financialSummary?.prepaidPaidAmount ?? 0;
  const additionalTotal = financialSummary?.additionalTotal ?? 0;
  const additionalOutstandingAmount =
    financialSummary?.additionalOutstandingAmount ?? paymentSummary?.outstandingAmount ?? 0;
  const totalPaidAmount = financialSummary?.totalPaidAmount ?? prepaidPaidAmount;

  const handleStartInspection = (type: StaffInspectionType) => {
    router.push({
      pathname: '/staff/inspection/[sessionId]',
      params: { sessionId, type },
    } as any);
  };

  const handleSettlePayments = async () => {
    if (!session?.bookingId || !canSettlePayments) return;

    setSettling(true);
    try {
      await staffApi.settlePendingPayments(session.bookingId);
      Alert.alert('Thành công', 'Đã xác nhận thu đủ tiền mặt và quyết toán phiên chơi.');
      await loadSession(true);
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Không thể xử lý thanh toán tồn đọng.';
      Alert.alert('Lỗi', message);
    } finally {
      setSettling(false);
    }
  };

  const handleOpenSettleQr = async () => {
    if (!session?.bookingId) return;
    setGeneratingQr(true);
    try {
      const result = await staffApi.initiateWalkInSettleBankTransfer(session.bookingId);
      if (result?.bankTransfer) {
        setSettleBankTransferData(result.bankTransfer);
        setSettleQrModalVisible(true);
      } else {
        Alert.alert('Thông báo', 'Không tìm thấy thông tin chuyển khoản cho đơn này.');
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        'Không thể tạo mã QR chuyển khoản.';
      Alert.alert('Lỗi', message);
    } finally {
      setGeneratingQr(false);
    }
  };

  const handleConfirmCheckout = () => {
    if (!checkOutInspection) return;

    Alert.alert(
      'Xác nhận checkout',
      'Xác nhận khách đã xem biên bản và hoàn tất trả xe tại quầy? Nếu còn phí phát sinh, đơn sẽ chuyển sang chờ thanh toán.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xác nhận hoàn tất',
          onPress: async () => {
            setConfirmingCheckout(true);
            try {
              const result = await staffApi.confirmCheckout(sessionId, checkOutInspection.inspectionId);
              Alert.alert(
                'Đã xác nhận',
                result?.alreadyCompleted
                  ? 'Khách đã xác nhận trước đó. Phiên đã hoàn tất.'
                  : 'Checkout đã hoàn tất. Vui lòng quyết toán chi phí phát sinh nếu có bên dưới.'
              );
              await loadSession(true);
            } catch (error: any) {
              const message = error?.response?.data?.message || 'Không thể xác nhận checkout.';
              Alert.alert('Lỗi', message);
            } finally {
              setConfirmingCheckout(false);
            }
          },
        },
      ]
    );
  };

  const handleCompleteByoc = () => {
    if (!sessionId) return;

    Alert.alert(
      'Xác nhận kết thúc phiên',
      'Khách mang xe cá nhân (BYOC) đã hoàn thành ca chơi và thanh toán đủ các khoản phát sinh. Bạn có chắc chắn muốn kết thúc phiên chơi ngay?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Kết thúc ngay',
          onPress: async () => {
            setConfirmingCheckout(true);
            try {
              await staffApi.completeByocSession(sessionId);
              Alert.alert('Thành công', 'Đã kết thúc phiên chơi xe cá nhân (BYOC) thành công.');
              await loadSession(true);
            } catch (error: any) {
              const message = error?.response?.data?.message || 'Không thể kết thúc phiên chơi.';
              Alert.alert('Lỗi', message);
            } finally {
              setConfirmingCheckout(false);
            }
          },
        },
      ]
    );
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/bookings');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#f8fafc] dark:bg-[#0b0f19]" edges={['top', 'left', 'right']}>
      <View className="flex-row items-center gap-3 border-b border-slate-200 dark:border-slate-900 px-5 py-4">
        <Pressable
          onPress={handleBack}
          className="h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] active:bg-slate-100 dark:active:bg-slate-800"
        >
          <ArrowLeft color="#64748b" size={19} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-[12px] uppercase tracking-wider text-slate-500 dark:text-slate-400" weight="700">
            Chi tiết phiên
          </Text>
          <Text className="mt-0.5 text-[19px] text-slate-900 dark:text-white" weight="700" numberOfLines={1}>
            #{shortId(sessionId)}
          </Text>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      ) : !session ? (
        <View className="flex-1 items-center justify-center px-5">
          <Text className="text-[13px] text-slate-400">Không tìm thấy thông tin phiên chạy.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="px-5 py-5 pb-16"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadSession(true)}
              tintColor="#f97316"
              colors={['#f97316']}
            />
          }
        >
          <View className="mb-5 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-5 shadow-sm">
            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-row items-center gap-2 flex-wrap flex-1">
                <View
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: getStatusColor(session.status) }}
                />
                <Text className="text-[13px] text-slate-900 dark:text-white" weight="700">
                  {getStatusLabel(session.status)}
                </Text>
                {isWalkIn ? (
                  <View className="flex-row items-center gap-1 rounded-full border border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/60 px-2 py-0.5">
                    <Zap color="#ea580c" size={10} />
                    <Text className="text-[9px] text-[#ea580c] font-black uppercase">
                      Khách vãng lai
                    </Text>
                  </View>
                ) : (
                  <View className="flex-row items-center gap-1 rounded-full border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/60 px-2 py-0.5">
                    <Smartphone color="#0284c7" size={10} />
                    <Text className="text-[9px] text-sky-700 dark:text-sky-300 font-bold">
                      Đặt qua Web/App
                    </Text>
                  </View>
                )}
              </View>
              <Text className="text-[10px] text-slate-400">
                Bắt đầu: {formatDateTime(session.actualStart || session.plannedEnd)}
              </Text>
            </View>

            <View className="mt-4 gap-2.5 border-t border-slate-100 dark:border-slate-800 pt-4">
              <InfoRow Icon={Clock} label="Kết thúc dự kiến" value={formatDateTime(session.plannedEnd)} />
              {session.actualEnd ? (
                <InfoRow Icon={Clock} label="Kết thúc thực tế" value={formatDateTime(session.actualEnd)} />
              ) : null}
              <InfoRow Icon={UserRound} label="Nhân viên phụ trách" value={session.staffName || 'Nhân viên trực ca'} />
            </View>

            <View className="mt-4 flex-row flex-wrap gap-2">
              <Metric Icon={UserRound} label="Người chơi" value={session.participants?.length || 0} />
              <Metric Icon={Car} label="Xe" value={session.vehicles?.length || 0} />
              <Metric Icon={ShieldCheck} label="Kiểm tra" value={session.inspections?.length || 0} />
              <Metric Icon={ReceiptText} label="Ảnh" value={totals.photoTotal} />
            </View>
          </View>

          {(session.status === 'ACTIVE' || session.status === 'EXTENDING') &&
            (operationalTiming.state === 'DUE_FOR_CHECKOUT' || operationalTiming.state === 'OVERDUE') && (
            <View
              className={`mb-5 rounded-2xl border p-4 ${
                operationalTiming.state === 'OVERDUE'
                  ? 'border-red-500/20 bg-red-500/10'
                  : 'border-amber-500/20 bg-amber-500/10'
              }`}
            >
              <Text
                className={`text-[12px] ${
                  operationalTiming.state === 'OVERDUE' ? 'text-red-400' : 'text-amber-400'
                }`}
                weight="700"
              >
                {operationalTiming.state === 'OVERDUE'
                  ? `Phiên đã quá giờ ${operationalTiming.minutesPastPlannedEnd} phút`
                  : isByoc
                    ? 'Đã hết giờ chơi'
                    : 'Đã đến giờ trả xe'}
              </Text>
              <Text className="mt-1 text-[11px] leading-4 text-slate-500">
                {isByoc
                  ? 'Phiên chơi xe cá nhân (BYOC) đã đến giờ kết thúc. Vui lòng thanh toán phát sinh và hoàn tất phiên.'
                  : 'Xe vẫn được giữ trong phiên cho đến khi hoàn tất biên bản trả xe và xác nhận checkout.'}
              </Text>
            </View>
          )}

          <SessionOperations
            status={session.status}
            isByoc={isByoc}
            hasCheckInInspection={!!checkInInspection}
            hasCheckOutInspection={!!checkOutInspection}
            checkOutConfirmed={!!checkOutInspection?.customerConfirmed}
            checkOutDisputed={checkOutDisputed}
            disputedNote={checkOutInspection?.staffNotes}
            onStartInspection={handleStartInspection}
            onConfirmCheckout={handleConfirmCheckout}
            onCompleteByoc={handleCompleteByoc}
            confirmingCheckout={confirmingCheckout}
            operationalTiming={operationalTiming}
            additionalOutstandingAmount={additionalOutstandingAmount}
          />

          <StaffSessionTools
            session={session}
            onUpdated={() => loadSession(true)}
            operationalTiming={operationalTiming}
          />

          <SectionTitle title="Người chơi" />
          <View className="mb-5 gap-3">
            {session.participants?.map((participant, index) => (
              <ParticipantRow
                key={`${participant.name}-${index}`}
                participant={participant}
                index={index}
                isWalkIn={isWalkIn}
              />
            ))}
            {session.participants?.length === 0 ? <EmptyText text="Chưa có người chơi trong phiên." /> : null}
          </View>

          <SectionTitle title="Xe trong phiên" />
          <View className="mb-5 gap-3">
            {session.vehicles?.map((vehicle) => (
              <View
                key={vehicle.vehicleId}
                className="flex-row items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-3 shadow-sm"
              >
                <VehicleThumbnail imageUrl={vehicle.imageUrl} name={vehicle.name} />
                <View className="flex-1">
                  <Text className="text-[13px] text-slate-900 dark:text-white" weight="700" numberOfLines={1}>
                    {vehicle.name}
                  </Text>
                  <Text className="mt-1 text-[11px] text-slate-500">{getVehicleSourceLabel(vehicle.type)}</Text>
                </View>
              </View>
            ))}
            {session.vehicles?.length === 0 ? <EmptyText text="Chưa gán xe cho phiên." /> : null}
          </View>

          <SectionTitle title="Kiểm tra xe" />
          <View className="mb-5 gap-3">
            {session.inspections?.map((inspection) => (
              <View
                key={inspection.inspectionId}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-4 shadow-sm"
              >
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-row items-center gap-2">
                    <ShieldCheck color="#f97316" size={16} />
                    <Text className="text-[13px] text-slate-900 dark:text-white" weight="700">
                      {inspection.type === 'CHECK_IN' ? 'Nhận xe' : 'Trả xe'}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    {inspection.type === 'CHECK_OUT' && session.status === 'CHECKING_OUT' && (
                      <Pressable
                        onPress={() => handleStartInspection('CHECK_OUT')}
                        className="flex-row items-center gap-1 bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 px-2 py-1 rounded-lg"
                      >
                        <Pencil color="#b45309" size={11} />
                        <Text className="text-[10px] text-amber-950 dark:text-amber-200 font-bold">
                          Sửa biên bản
                        </Text>
                      </Pressable>
                    )}
                    <Text className="text-[10px] text-slate-500" weight="700">
                      {inspection.photos?.length || 0} ảnh
                    </Text>
                  </View>
                </View>
                <Text className="mt-2 text-[11px] text-slate-400">
                  Checklist: {inspection.checklist?.length || 0} mục
                  {inspection.damageFlagged ? ' • Có ghi nhận hư hỏng' : ''}
                </Text>

                {inspection.damageFlagged ? (
                  <View className="mt-3 rounded-xl border border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-950/40 p-3.5">
                    <Text className="text-[12px] text-red-900 dark:text-red-300 font-extrabold">
                      Hư hỏng / Phí bồi thường phát sinh
                    </Text>
                    {inspection.damageLineItems?.map((item, index) => (
                      <View key={item.id || `${item.partType}-${index}`} className="mt-2 flex-row justify-between gap-3">
                        <Text className="flex-1 text-[11px] text-slate-800 dark:text-slate-200 font-medium" numberOfLines={1}>
                          • {item.customPartName || getPartTypeLabel(item.partType)}
                        </Text>
                        <Text className="text-[11px] text-rose-700 dark:text-rose-400 font-black">
                          {formatCurrency(item.lineTotal)}
                        </Text>
                      </View>
                    ))}
                    <View className="mt-2.5 flex-row justify-between gap-3 border-t border-red-200 dark:border-red-500/30 pt-2">
                      <Text className="text-[11px] text-red-900 dark:text-red-200 font-bold">Tổng phí bồi thường hư hại:</Text>
                      <Text className="text-[12px] text-rose-700 dark:text-rose-400 font-black">
                        {formatCurrency(inspection.totalDamageCharge)}
                      </Text>
                    </View>
                  </View>
                ) : null}

                {inspection.type === 'CHECK_OUT' ? (
                  <View
                    className={`mt-3 rounded-xl border p-3 ${
                      session.status === 'COMPLETED'
                        ? 'border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10'
                        : 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40'
                    }`}
                  >
                    <Text
                      className={`text-[11px] ${
                        session.status === 'COMPLETED' 
                          ? 'text-emerald-800 dark:text-emerald-300' 
                          : 'text-amber-950 dark:text-amber-200'
                      }`}
                      weight="700"
                    >
                      {session.status === 'COMPLETED'
                        ? '✓ Đã hoàn tất kiểm tra trả xe'
                        : 'Biên bản trả xe đã lập — Sẵn sàng quyết toán'}
                    </Text>
                  </View>
                ) : null}

                {inspection.photos?.length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3">
                    <View className="flex-row gap-2">
                      {inspection.photos.map((photo, photoIndex) => (
                        <Pressable
                          key={`${inspection.inspectionId}-${photo.angle}-${photoIndex}`}
                          onPress={() =>
                            setPreviewPhoto({
                              url: photo.url,
                              title: `${inspection.type === 'CHECK_IN' ? 'Nhận xe' : 'Trả xe'} • ${
                                getPhotoAngleLabel(photo.angle) || `Ảnh ${photoIndex + 1}`
                              }`,
                            })
                          }
                          className="relative h-20 w-28 overflow-hidden rounded-xl border border-slate-700 bg-slate-950"
                        >
                          <Image source={{ uri: photo.url }} className="h-full w-full" resizeMode="cover" />
                          <View className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-0.5">
                            <Text className="text-[9px] text-white" weight="700" numberOfLines={1}>
                              {getPhotoAngleLabel(photo.angle) || `Ảnh ${photoIndex + 1}`}
                            </Text>
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                ) : null}

                {inspection.checklist?.length ? (
                  <View className="mt-3 gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                    {inspection.checklist.map((item) => (
                      <View key={`${inspection.inspectionId}-${item.itemKey}`} className="flex-row items-center gap-2">
                        <CheckCircle2
                          color={item.status === 'OK' ? '#10b981' : '#f59e0b'}
                          size={14}
                        />
                        <View className="flex-1">
                          <Text className="text-[11px] text-slate-700 dark:text-slate-300" numberOfLines={2}>
                            {item.itemLabel}
                          </Text>
                          {item.status !== 'OK' && item.note ? (
                            <Text className="mt-0.5 text-[9px] text-amber-700 dark:text-amber-400" numberOfLines={2}>
                              Ghi chú: {item.note}
                            </Text>
                          ) : null}
                        </View>
                        <Text
                          className={`text-[10px] font-bold ${item.status === 'OK' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-800 dark:text-amber-400'}`}
                        >
                          {item.status === 'OK' ? 'Đạt' : 'Cần xử lý'}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {inspection.staffNotes ? (
                  <Text className="mt-2.5 text-[11px] text-slate-600 dark:text-slate-400 italic" numberOfLines={3}>
                    Ghi chú: {inspection.staffNotes}
                  </Text>
                ) : null}
              </View>
            ))}
            {session.inspections?.length === 0 ? <EmptyText text="Chưa có biên bản kiểm tra xe." /> : null}
          </View>

          <SectionTitle title="Đồ ăn, thức uống của phiên" />
          <View className="mb-5 gap-3">
            {preorderFnbOrders.length > 0 && (
              <View className="rounded-2xl border border-orange-200 dark:border-orange-900/60 bg-orange-50/40 dark:bg-orange-950/20 p-4 shadow-sm">
                <View className="mb-3 flex-row items-center justify-between gap-3">
                  <View className="flex-row items-center gap-2">
                    <Coffee color="#ea580c" size={17} />
                    <Text className="text-[13px] text-slate-900 dark:text-white" weight="700">
                      Đồ ăn & thức uống đặt trước
                    </Text>
                  </View>
                  <View className="bg-orange-100 dark:bg-orange-900/60 px-2 py-0.5 rounded-full border border-orange-200 dark:border-orange-800">
                    <Text className="text-[10px] text-orange-800 dark:text-orange-300 font-bold">
                      Đã thanh toán trước
                    </Text>
                  </View>
                </View>
                <View className="gap-2 border-t border-orange-200/60 dark:border-orange-900/60 pt-3">
                  {preorderFnbOrders.map((order) => (
                    <View key={order.orderId} className="gap-1.5 rounded-xl bg-white dark:bg-slate-900/80 p-3 border border-orange-200/60 dark:border-orange-900/40">
                      {order.items.map((item, idx) => (
                        <View key={idx} className="flex-row justify-between items-start gap-2">
                          <View className="flex-1">
                            <Text className="text-[12px] text-slate-900 dark:text-white font-semibold">
                              {item.qty}x {item.name}
                            </Text>
                          </View>
                          <Text className="text-[12px] text-orange-600 dark:text-orange-400 font-bold">
                            {formatCurrency(item.price * item.qty)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-4 shadow-sm">
              <View className="mb-3 flex-row items-center justify-between gap-3">
                <View className="flex-row items-center gap-2">
                  <Coffee color="#ea580c" size={17} />
                  <Text className="text-[13px] text-slate-900 dark:text-white" weight="700">
                    Đồ ăn & thức uống gọi trong phiên
                  </Text>
                </View>
                {onsiteFnbTotal > 0 && (
                  <Text className="text-[12px] text-orange-600 dark:text-orange-400 font-bold">
                    {formatCurrency(onsiteFnbTotal)}
                  </Text>
                )}
              </View>
              {onsiteFnbOrders.length > 0 ? (
                <View className="gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                  {onsiteFnbOrders.map((order) => {
                    const isOrderPaid = onsiteOrderPaidMap.get(order.orderId) ?? true;
                    return (
                      <View
                        key={order.orderId}
                        className={`gap-1.5 rounded-xl p-3 border ${
                          isOrderPaid
                            ? 'bg-slate-50 dark:bg-slate-900 border-slate-200/60 dark:border-slate-800'
                            : 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800'
                        }`}
                      >
                        {order.items.map((item, idx) => (
                          <View key={idx} className="flex-row justify-between items-start gap-2">
                            <View className="flex-1">
                              <Text className="text-[12px] text-slate-900 dark:text-white font-semibold">
                                {item.qty}x {item.name}
                              </Text>
                            </View>
                            <View className="items-end">
                              <Text className="text-[12px] text-slate-900 dark:text-white font-bold">
                                {formatCurrency(item.price * item.qty)}
                              </Text>
                              <View className="flex-row items-center gap-1 mt-0.5">
                                <Text className="text-[9px] text-amber-700 dark:text-amber-400 font-semibold">
                                  {getFnbOrderStatusLabel(order.status)}
                                </Text>
                                <Text
                                  className={`text-[9px] font-bold ${
                                    isOrderPaid
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : 'text-amber-800 dark:text-amber-300 font-extrabold'
                                  }`}
                                >
                                  · {isOrderPaid ? 'Đã thanh toán' : 'Chờ thanh toán'}
                                </Text>
                              </View>
                            </View>
                          </View>
                        ))}
                      </View>
                    );
                  })}
                  {onsiteFnbOrders.length > 0 && pendingOnsiteFnbAmount > 0 && paidOnsiteFnbAmount > 0 && (
                    <View className="flex-row justify-between items-center rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-2.5 mt-1">
                      <Text className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold">
                        Đã thanh toán: {formatCurrency(paidOnsiteFnbAmount)}
                      </Text>
                      <Text className="text-[10px] text-amber-800 dark:text-amber-300 font-bold">
                        Chờ thanh toán: {formatCurrency(pendingOnsiteFnbAmount)}
                      </Text>
                    </View>
                  )}
                </View>
              ) : (
                <Text className="text-[11px] text-slate-400 italic text-center py-2">
                  Chưa có món gọi thêm tại ca.
                </Text>
              )}
            </View>
          </View>

          <View className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-4 shadow-sm mb-6">
            <View className="mb-3 flex-row items-center justify-between gap-3">
              <View className="flex-row items-center gap-2">
                <FileText color="#ea580c" size={18} />
                <Text className="text-[14px] text-slate-900 dark:text-white font-extrabold uppercase tracking-wide">
                  Quyết toán phiên chơi
                </Text>
              </View>
              {canSettlePayments ? (
                <Banknote color="#f97316" size={20} />
              ) : (
                <CheckCircle2 color="#10b981" size={20} />
              )}
            </View>

            {hasOutstandingPayment && (
              <View
                className={`mb-3 flex-row items-start gap-2.5 rounded-xl border p-3 ${
                  isCheckoutPending
                    ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800'
                    : 'border-orange-200 bg-orange-50 dark:bg-orange-950/40 dark:border-orange-800'
                }`}
              >
                {isCheckoutPending ? (
                  <AlertTriangle color="#b45309" size={16} style={{ marginTop: 2 }} />
                ) : (
                  <Banknote color="#ea580c" size={16} style={{ marginTop: 2 }} />
                )}
                <View className="flex-1">
                  <Text
                    className={`text-[12px] font-extrabold ${
                      isCheckoutPending ? 'text-amber-950 dark:text-amber-200' : 'text-orange-950 dark:text-orange-200'
                    }`}
                  >
                    {isCheckoutPending
                      ? 'BƯỚC 1: Cần kiểm tra trả xe trước'
                      : 'Còn khoản phát sinh cần thanh toán'}
                  </Text>
                  <Text
                    className={`mt-0.5 text-[11px] leading-4 ${
                      isCheckoutPending ? 'text-amber-900 dark:text-amber-300' : 'text-orange-900 dark:text-orange-300'
                    }`}
                  >
                    {isCheckoutPending
                      ? `Khách còn ${formatCurrency(additionalOutstandingAmount)} phí phát sinh. Vui lòng thực hiện BƯỚC 1: KIỂM TRA TRẢ XE ở thẻ phía trên trước khi thu tiền mặt.`
                      : `Khách cần thanh toán ${formatCurrency(additionalOutstandingAmount)} cho các khoản dưới đây.`}
                  </Text>
                </View>
              </View>
            )}

            <View className="border-t border-slate-100 dark:border-slate-800 pt-3 pb-3">
              <Text className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                Đã thanh toán khi đặt lịch
              </Text>
              <View className="gap-1.5">
                {prepaidLines.map((line) => (
                  <View key={line.componentId} className="flex-row justify-between items-center">
                    <Text className="text-[11px] text-slate-600 dark:text-slate-400">{line.label}:</Text>
                    <Text className="text-[11px] font-bold text-slate-900 dark:text-white">
                      {formatCurrency(line.amount)}
                    </Text>
                  </View>
                ))}
                {prepaidDiscountAmount > 0 && (
                  <View className="flex-row justify-between items-center">
                    <Text className="text-[11px] text-emerald-600 dark:text-emerald-400">Ưu đãi áp dụng:</Text>
                    <Text className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                      -{formatCurrency(prepaidDiscountAmount)}
                    </Text>
                  </View>
                )}
                <View className="flex-row justify-between items-center pt-1.5 border-t border-slate-100 dark:border-slate-800/60 mt-0.5">
                  <Text className="text-[11px] font-bold text-slate-800 dark:text-slate-200">Đã thanh toán trước:</Text>
                  <Text className="text-[12px] font-extrabold text-slate-900 dark:text-white">
                    {formatCurrency(prepaidPaidAmount)}
                  </Text>
                </View>
              </View>
            </View>

            <View className="border-t border-slate-100 dark:border-slate-800 pt-3 pb-3">
              <Text className="text-[10px] font-extrabold text-orange-600 dark:text-orange-400 uppercase tracking-wider mb-2">
                Chi phí phát sinh tại quầy
              </Text>
              <View className="gap-2">
                {groupedAdditionalLines.length > 0 ? (
                  groupedAdditionalLines.map((line) => (
                    <View key={line.id} className="rounded-xl bg-slate-50 dark:bg-slate-900/80 p-2.5 border border-slate-200/60 dark:border-slate-800">
                      <View className="flex-row justify-between items-center">
                        <Text className="text-[11px] text-slate-700 dark:text-slate-300 font-semibold">{line.label}</Text>
                        <Text className="text-[12px] font-extrabold text-orange-600 dark:text-orange-400">
                          +{formatCurrency(line.amount)}
                        </Text>
                      </View>
                      <Text className={`text-[10px] font-bold mt-0.5 ${line.paid ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                        {line.paid ? '✓ Đã thanh toán' : '⏳ Chờ thanh toán'}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text className="text-[11px] text-slate-400 italic">Không phát sinh chi phí tại quầy.</Text>
                )}
                {additionalTotal > 0 && (
                  <View className="flex-row justify-between items-center pt-1.5 border-t border-slate-100 dark:border-slate-800/60">
                    <Text className="text-[11px] font-bold text-slate-800 dark:text-slate-200">Tổng phí phát sinh:</Text>
                    <Text className="text-[12px] font-extrabold text-orange-600 dark:text-orange-400">
                      +{formatCurrency(additionalTotal)}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <View className="rounded-xl bg-slate-50 dark:bg-slate-900/90 p-3.5 border border-slate-200 dark:border-slate-800 gap-2 mb-3">
              <View className="flex-row justify-between items-center">
                <Text className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Tổng khách đã trả:</Text>
                <Text className="text-[13px] font-extrabold text-slate-900 dark:text-white">
                  {formatCurrency(totalPaidAmount)}
                </Text>
              </View>
              {additionalOutstandingAmount > 0 && (
                <View className="flex-row justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-800">
                  <Text className="text-[12px] font-black text-orange-700 dark:text-orange-400">Tổng tiền cần thu thêm:</Text>
                  <Text className="text-[15px] font-black text-orange-600 dark:text-orange-400">
                    {formatCurrency(additionalOutstandingAmount)}
                  </Text>
                </View>
              )}
              {Number(paymentSummary?.pendingRefundAmount || 0) > 0 && (
                <View className="flex-row justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-800">
                  <Text className="text-[12px] font-black text-emerald-700 dark:text-emerald-400">Tiền cần hoàn cọc lại:</Text>
                  <Text className="text-[15px] font-black text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(paymentSummary?.pendingRefundAmount)}
                  </Text>
                </View>
              )}
            </View>

            {isCheckoutPending ? (
              <View className="h-12 flex-row items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-100/90 dark:bg-amber-950/40 dark:border-amber-800">
                <WalletCards color="#b45309" size={16} />
                <Text className="text-[12px] font-bold text-amber-950 dark:text-amber-200">
                  🔒 Cần kiểm tra trả xe trước
                </Text>
              </View>
            ) : canSettlePayments ? (
              <View className="gap-2">
                <View className="flex-row gap-2">
                  <Pressable
                    disabled={settling || generatingQr}
                    onPress={() => setConfirmSettleModalVisible(true)}
                    className="flex-1 h-12 flex-row items-center justify-center gap-2 rounded-xl bg-[#ea580c] active:bg-[#c2410c] shadow-sm"
                  >
                    {settling ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <Banknote color="#ffffff" size={16} />
                    )}
                    <Text className="text-[12px] font-bold text-white">
                      Thu tiền mặt
                    </Text>
                  </Pressable>

                  <Pressable
                    disabled={settling || generatingQr}
                    onPress={handleOpenSettleQr}
                    className="flex-1 h-12 flex-row items-center justify-center gap-2 rounded-xl border border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/40 active:bg-orange-100 shadow-sm"
                  >
                    {generatingQr ? (
                      <ActivityIndicator color="#ea580c" size="small" />
                    ) : (
                      <QrCode color="#ea580c" size={16} />
                    )}
                    <Text className="text-[12px] font-bold text-[#ea580c]">
                      Chuyển khoản QR
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View className="h-12 flex-row items-center justify-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <CheckCircle2 color="#10b981" size={16} />
                <Text className="text-[12px] font-bold text-slate-600 dark:text-slate-300">
                  Đã thanh toán đầy đủ
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      <Modal visible={confirmSettleModalVisible} transparent animationType="fade">
        <View className="flex-1 bg-black/70 justify-center items-center px-5">
          <View className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl">
            <View className="flex-row items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <View className="flex-row items-center gap-2">
                <Banknote color="#ea580c" size={20} />
                <Text className="text-[15px] font-bold text-slate-900 dark:text-white">
                  Xác nhận thu tiền mặt
                </Text>
              </View>
              <Pressable onPress={() => setConfirmSettleModalVisible(false)} className="p-1">
                <X color="#94a3b8" size={18} />
              </Pressable>
            </View>

            <View className="py-4 items-center">
              <Text className="text-[11px] text-slate-500 uppercase tracking-wider font-bold">
                Số tiền cần thu từ khách
              </Text>
              <Text className="text-[24px] font-black text-[#ea580c] mt-1">
                {formatCurrency(additionalOutstandingAmount)}
              </Text>
            </View>

            <View className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3 mb-4">
              <Text className="text-[11px] text-amber-900 dark:text-amber-200 leading-4 font-semibold">
                ⚠️ Vui lòng đảm bảo bạn đã thu đủ số tiền mặt trực tiếp từ khách hàng tại quầy trước khi xác nhận.
              </Text>
            </View>

            <View className="gap-2">
              <Pressable
                disabled={settling}
                onPress={async () => {
                  setConfirmSettleModalVisible(false);
                  await handleSettlePayments();
                }}
                className="h-11 flex-row items-center justify-center gap-2 rounded-xl bg-[#ea580c] active:bg-[#c2410c]"
              >
                {settling ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <CheckCircle2 color="#ffffff" size={16} />
                )}
                <Text className="text-[12px] font-bold text-white">
                  Tôi đã thu đủ tiền mặt & Xác nhận
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setConfirmSettleModalVisible(false)}
                className="h-10 flex-row items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 active:bg-slate-200"
              >
                <Text className="text-[12px] font-bold text-slate-700 dark:text-slate-300">
                  Hủy bỏ
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <WalkInBankTransferModal
        visible={settleQrModalVisible}
        bookingId={session?.bookingId || ''}
        bookingCode={(session as any)?.shortCode || (session as any)?.bookingCode || session?.bookingId?.slice(0, 8)?.toUpperCase()}
        bankTransfer={settleBankTransferData}
        onClose={() => setSettleQrModalVisible(false)}
        onSuccess={async () => {
          setSettleQrModalVisible(false);
          await loadSession(true);
        }}
        onSwitchToCash={() => setConfirmSettleModalVisible(true)}
      />

      <ImageZoomModal
        visible={!!previewPhoto}
        imageUrl={previewPhoto?.url}
        title={previewPhoto?.title}
        onClose={() => setPreviewPhoto(null)}
      />
    </SafeAreaView>
  );
}

function InfoRow({ Icon, label, value }: { Icon: LucideIcon; label: string; value: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <Icon color="#94a3b8" size={14} />
      <Text className="w-32 text-[11px] text-slate-500">{label}</Text>
      <Text className="flex-1 text-right text-[11px] text-slate-900 dark:text-white" weight="700">
        {value}
      </Text>
    </View>
  );
}

function Metric({ Icon, label, value }: { Icon: LucideIcon; label: string; value: number }) {
  return (
    <View className="min-w-[47%] flex-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#0b0f19] p-3">
      <Icon color="#f97316" size={16} />
      <Text className="mt-2 text-[18px] text-slate-900 dark:text-white" weight="700">
        {value}
      </Text>
      <Text className="mt-0.5 text-[10px] text-slate-500">{label}</Text>
    </View>
  );
}

function SessionOperations({
  status,
  isByoc,
  hasCheckInInspection,
  hasCheckOutInspection,
  checkOutConfirmed,
  checkOutDisputed,
  disputedNote,
  onStartInspection,
  onConfirmCheckout,
  onCompleteByoc,
  confirmingCheckout,
  operationalTiming,
  additionalOutstandingAmount = 0,
}: {
  status: string;
  isByoc: boolean;
  hasCheckInInspection: boolean;
  hasCheckOutInspection: boolean;
  checkOutConfirmed: boolean;
  checkOutDisputed?: boolean;
  disputedNote?: string;
  onStartInspection: (type: StaffInspectionType) => void;
  onConfirmCheckout: () => void;
  onCompleteByoc?: () => void;
  confirmingCheckout: boolean;
  operationalTiming: SessionOperationalTiming;
  additionalOutstandingAmount?: number;
}) {
  const canSubmitCheckIn = status === 'CHECKED_IN' && !hasCheckInInspection;
  const canSubmitCheckOut =
    !isByoc && ['ACTIVE', 'EXTENDING'].includes(status) && (!hasCheckOutInspection || checkOutDisputed);

  return (
    <View className="mb-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-4 shadow-sm">
      <View className="mb-3 flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Text className="text-[13px] text-slate-900 dark:text-white" weight="700">
            Thao tác phiên
          </Text>
          <Text className="mt-1 text-[11px] leading-4 text-slate-500">
            Tạo biên bản kiểm xe để đi tiếp qua nhận xe, trả xe và hoàn tất phiên.
          </Text>
        </View>
        <ShieldCheck color="#f97316" size={20} />
      </View>

      <View className="gap-3">
        {checkOutDisputed ? (
          <View className="rounded-xl border border-red-500/30 bg-red-500/10 p-3">
            <View className="flex-row items-center gap-2">
              <AlertTriangle color="#ef4444" size={15} />
              <Text className="flex-1 text-[12px] text-red-400" weight="700">
                Khách phản hồi sai lệch biên bản trả xe
              </Text>
            </View>
            {disputedNote ? (
              <Text className="mt-1.5 text-[11px] leading-4 text-red-300/90">
                {disputedNote}
              </Text>
            ) : null}
            <Text className="mt-1 text-[10px] text-slate-400">
              Cần đối chiếu lại ảnh, tình trạng xe và lập lại biên bản trả xe mới trước khi đóng phiên.
            </Text>
          </View>
        ) : null}

        {canSubmitCheckIn ? (
          <Pressable
            onPress={() => onStartInspection('CHECK_IN')}
            className="h-11 flex-row items-center justify-center gap-2 rounded-xl bg-emerald-600 active:bg-emerald-700"
          >
            <CheckCircle2 color="#ffffff" size={16} />
            <Text className="text-[12px] text-white" weight="700">
              {isByoc ? 'Chụp ảnh xe vào sân' : 'Tạo biên bản nhận xe'}
            </Text>
          </Pressable>
        ) : null}

        {canSubmitCheckOut ? (
          <Pressable
            onPress={() => onStartInspection('CHECK_OUT')}
            className="h-11 flex-row items-center justify-center gap-2 rounded-xl bg-[#ea580c] active:bg-[#c2410c]"
          >
            <ReceiptText color="#ffffff" size={16} />
            <Text className="text-[12px] text-white" weight="700">
              {checkOutDisputed
                ? 'Lập lại biên bản trả xe'
                : operationalTiming.state === 'ON_TIME'
                  ? 'Tạo biên bản trả xe'
                  : 'Xử lý trả xe'}
            </Text>
          </Pressable>
        ) : null}

        {status === 'CHECKING_OUT' && hasCheckOutInspection && !checkOutConfirmed ? (
          <View className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3.5">
            <View className="flex-row items-center justify-between gap-2 mb-1">
              <Text className="text-[13px] text-amber-950 dark:text-amber-100" weight="700">
                Biên bản trả xe đã sẵn sàng
              </Text>
              <View className="bg-amber-200/80 dark:bg-amber-900/60 px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-800">
                <Text className="text-[10px] text-amber-900 dark:text-amber-200 font-bold">
                  Chờ đóng ca
                </Text>
              </View>
            </View>
            <Text className="text-[11px] leading-4 text-amber-900 dark:text-amber-200 font-medium">
              Đã lập biên bản kiểm tra trả xe. Bạn có thể xem lại, chỉnh sửa nếu cần hoặc xác nhận trả xe để đóng phiên và quyết toán.
            </Text>
            <View className="mt-3 gap-2">
              <Pressable
                disabled={confirmingCheckout}
                onPress={onConfirmCheckout}
                className={`h-11 flex-row items-center justify-center gap-2 rounded-xl bg-[#ea580c] active:bg-[#c2410c] shadow-sm ${
                  confirmingCheckout ? 'opacity-70' : ''
                }`}
              >
                {confirmingCheckout ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <CheckCircle2 color="#ffffff" size={16} />
                )}
                <Text className="text-[12px] text-white" weight="700">
                  Xác nhận trả xe tại quầy
                </Text>
              </Pressable>

              <Pressable
                onPress={() => onStartInspection('CHECK_OUT')}
                className="h-10 flex-row items-center justify-center gap-2 rounded-xl border border-amber-400/60 dark:border-amber-700/60 bg-amber-100/60 dark:bg-amber-900/30 active:bg-amber-200/60"
              >
                <Pencil color="#b45309" size={13} />
                <Text className="text-[11px] text-amber-950 dark:text-amber-200 font-bold">
                  Sửa / Lập lại biên bản trả xe
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {isByoc && ['ACTIVE', 'EXTENDING'].includes(status) ? (
          additionalOutstandingAmount === 0 ? (
            <Pressable
              disabled={confirmingCheckout}
              onPress={onCompleteByoc}
              className="h-11 flex-row items-center justify-center gap-2 rounded-xl bg-emerald-600 active:bg-emerald-700 shadow-sm"
            >
              {confirmingCheckout ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <CheckCircle2 color="#ffffff" size={16} />
              )}
              <Text className="text-[12px] text-white" weight="700">
                Kết thúc phiên chơi (BYOC)
              </Text>
            </Pressable>
          ) : (
            <View className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 flex-row items-center gap-2">
              <AlertTriangle color="#f59e0b" size={15} />
              <Text className="flex-1 text-[11px] text-amber-900 dark:text-amber-200 font-semibold leading-4">
                Còn {additionalOutstandingAmount.toLocaleString('vi-VN')}đ phí phát sinh. Vui lòng quyết toán trước khi kết thúc phiên.
              </Text>
            </View>
          )
        ) : null}

        {!canSubmitCheckIn && !canSubmitCheckOut && status !== 'CHECKING_OUT' && !isByoc ? (
          <Text className="text-[11px] leading-4 text-slate-500">
            Không có thao tác kiểm xe cần xử lý ở trạng thái hiện tại.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <Text className="mb-3 text-[12px] uppercase tracking-wider text-slate-400" weight="700">
      {title}
    </Text>
  );
}

function ParticipantRow({
  participant,
  index,
  isWalkIn,
}: {
  participant: { name: string; type: string; avatarUrl?: string };
  index: number;
  isWalkIn?: boolean;
}) {
  const initials = participant.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    setAvatarFailed(false);
  }, [participant.avatarUrl]);

  return (
    <View className="flex-row items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-4 shadow-sm">
      <View className="h-10 w-10 overflow-hidden rounded-full border border-orange-500/20 bg-orange-500/10">
        {participant.avatarUrl && !avatarFailed ? (
          <Image
            source={{ uri: participant.avatarUrl }}
            className="h-full w-full"
            resizeMode="cover"
            accessibilityLabel={`Ảnh ${participant.name}`}
            onError={() => setAvatarFailed(true)}
          />
        ) : (
          <View className="h-full w-full items-center justify-center">
            <Text className="text-[11px] text-[#f97316]" weight="700">
              {initials || String(index + 1)}
            </Text>
          </View>
        )}
      </View>
      <View className="flex-1">
        <Text className="text-[13px] text-slate-900 dark:text-white" weight="700" numberOfLines={1}>
          {participant.name || `Người chơi ${index + 1}`}
        </Text>
        <Text className="mt-1 text-[11px] text-slate-500">
          {isWalkIn ? 'Khách vãng lai (Tại quầy)' : 'Người chơi'}
        </Text>
      </View>
    </View>
  );
}

function VehicleThumbnail({ imageUrl, name }: { imageUrl?: string; name: string }) {
  const [source, setSource] = useState(() => getVehicleImageUrl(imageUrl));

  useEffect(() => {
    setSource(getVehicleImageUrl(imageUrl));
  }, [imageUrl]);

  return (
    <View className="h-14 w-14 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950">
      {source ? (
        <Image
          source={{ uri: source }}
          className="h-full w-full"
          resizeMode="cover"
          accessibilityLabel={`Ảnh ${name}`}
          onError={() => {
            if (source !== FALLBACK_VEHICLE_IMAGE_URL) {
              setSource(FALLBACK_VEHICLE_IMAGE_URL);
            } else {
              setSource('');
            }
          }}
        />
      ) : (
        <View className="h-full w-full items-center justify-center">
          <Car color="#64748b" size={22} />
        </View>
      )}
    </View>
  );
}

function EmptyText({ text }: { text: string }) {
  return (
    <View className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/40 p-4">
      <Text className="text-center text-[11px] text-slate-500">{text}</Text>
    </View>
  );
}
