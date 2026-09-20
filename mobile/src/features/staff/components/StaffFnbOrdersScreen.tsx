import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CheckCircle2,
  Clock,
  Coffee,
  PackageCheck,
  ReceiptText,
  XCircle,
  type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  staffApi,
  type StaffFnbOrderStatus,
  type TodayFnbOrderItem,
} from '@/features/staff/api/staff.api';
import { Text } from '@/shared/ui/Text';

type FilterKey = 'ALL' | StaffFnbOrderStatus;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'PENDING', label: 'Chờ xác nhận' },
  { key: 'CONFIRMED', label: 'Đang chuẩn bị' },
  { key: 'DELIVERED', label: 'Đã giao' },
  { key: 'CANCELLED', label: 'Đã hủy' },
];

const STATUS_META: Record<StaffFnbOrderStatus, { label: string; color: string; Icon: LucideIcon }> = {
  PENDING: { label: 'Chờ xác nhận', color: '#f59e0b', Icon: Clock },
  CONFIRMED: { label: 'Đang chuẩn bị', color: '#38bdf8', Icon: Coffee },
  DELIVERED: { label: 'Đã giao', color: '#10b981', Icon: PackageCheck },
  CANCELLED: { label: 'Đã hủy', color: '#ef4444', Icon: XCircle },
};

function formatCurrency(value: number) {
  return `${Number(value || 0).toLocaleString('vi-VN')}đ`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function shortId(value: string) {
  return value.slice(0, 8).toUpperCase();
}

export function StaffFnbOrdersScreen() {
  const [orders, setOrders] = useState<TodayFnbOrderItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadOrders = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const data = await staffApi.getFnbOrders();
      setOrders(data);
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Không thể tải đơn đồ ăn, thức uống hôm nay.';
      Alert.alert('Lỗi', message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const filteredOrders = useMemo(() => {
    const sorted = [...orders].sort(
      (a, b) => new Date(a.slotStart).getTime() - new Date(b.slotStart).getTime()
    );
    if (activeFilter === 'ALL') return sorted;
    return sorted.filter((order) => order.status === activeFilter);
  }, [activeFilter, orders]);

  const handleUpdateStatus = async (orderId: string, status: StaffFnbOrderStatus) => {
    setUpdatingId(orderId);
    try {
      await staffApi.updateFnbOrder(orderId, status);
      await loadOrders(true);
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Không thể cập nhật đơn đồ ăn, thức uống.';
      Alert.alert('Lỗi', message);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#f8fafc] dark:bg-[#0b0f19]" edges={['top', 'left', 'right']}>
      <View className="border-b border-slate-200 dark:border-slate-900 px-5 py-4">
        <Text className="text-[12px] uppercase tracking-wider text-slate-500 dark:text-slate-400" weight="700">
          Nhân viên trực ca
        </Text>
        <Text className="mt-1 text-[22px] text-slate-900 dark:text-white" weight="700">
          Đơn đồ ăn, thức uống hôm nay
        </Text>
      </View>

      <View className="py-3">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 px-5"
        >
          {FILTERS.map((filter) => {
            const active = activeFilter === filter.key;
            return (
              <Pressable
                key={filter.key}
                onPress={() => setActiveFilter(filter.key)}
                className={`rounded-xl border px-3 py-2 ${
                  active
                    ? 'border-orange-500 bg-orange-500/10'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60'
                }`}
              >
                <Text className={`text-[11px] ${active ? 'text-[#f97316]' : 'text-slate-500 dark:text-slate-400'}`} weight="700">
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.id}
          contentContainerClassName="px-5 pb-24 pt-1"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadOrders(true)}
              colors={['#f97316']}
              tintColor="#f97316"
            />
          }
          renderItem={({ item }) => (
            <FnbOrderCard
              order={item}
              updating={updatingId === item.id}
              onUpdateStatus={handleUpdateStatus}
            />
          )}
          ListEmptyComponent={
            <View className="mt-10 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/40 p-6">
              <Text className="text-center text-[14px] text-slate-800 dark:text-slate-300" weight="700">
                Không có đơn đồ ăn, thức uống phù hợp
              </Text>
              <Text className="mt-1 text-center text-[11px] text-slate-500">
                Đơn đặt trước trong ngày sẽ xuất hiện tại đây.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function FnbOrderCard({
  order,
  updating,
  onUpdateStatus,
}: {
  order: TodayFnbOrderItem;
  updating: boolean;
  onUpdateStatus: (orderId: string, status: StaffFnbOrderStatus) => void;
}) {
  const meta = STATUS_META[order.status];
  const StatusIcon = meta.Icon;

  return (
    <View className="mb-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-4 shadow-sm">
      <View className="mb-3 flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-[15px] text-slate-900 dark:text-white" weight="700" numberOfLines={1}>
            {order.customerName || 'Khách hàng'}
          </Text>
          <Text className="mt-1 text-[11px] text-slate-500">
            #{shortId(order.bookingId)} • {formatTime(order.slotStart)}
          </Text>
        </View>
        <View className="flex-row items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 px-2 py-1">
          <StatusIcon color={meta.color} size={12} />
          <Text className="text-[9px] uppercase" weight="700" style={{ color: meta.color }}>
            {meta.label}
          </Text>
        </View>
      </View>

      <View className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-[#0b0f19] p-3">
        {order.items.map((item, index) => (
          <View
            key={`${order.id}-${item.name}-${index}`}
            className="mb-2 flex-row items-start justify-between gap-3 last:mb-0"
          >
            <View className="flex-1">
              <Text className="text-[12px] text-slate-800 dark:text-slate-200" weight="700" numberOfLines={1}>
                {item.quantity}x {item.name}
              </Text>
              {item.notes ? (
                <Text className="mt-0.5 text-[10px] text-slate-500" numberOfLines={2}>
                  {item.notes}
                </Text>
              ) : null}
            </View>
            <Text className="text-[11px] text-slate-500 dark:text-slate-400" weight="700">
              {formatCurrency(item.subtotal)}
            </Text>
          </View>
        ))}
        {order.items.length === 0 ? (
          <Text className="text-[11px] text-slate-500">Chưa có chi tiết món.</Text>
        ) : null}
      </View>

      <View className="mt-4 flex-row items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-3">
        <View className="flex-row items-center gap-2">
          <ReceiptText color="#f97316" size={15} />
          <Text className="text-[12px] text-[#f97316]" weight="700">
            {formatCurrency(order.totalAmount)}
          </Text>
        </View>
        <OrderActions order={order} updating={updating} onUpdateStatus={onUpdateStatus} />
      </View>
    </View>
  );
}

function OrderActions({
  order,
  updating,
  onUpdateStatus,
}: {
  order: TodayFnbOrderItem;
  updating: boolean;
  onUpdateStatus: (orderId: string, status: StaffFnbOrderStatus) => void;
}) {
  if (updating) {
    return <ActivityIndicator size="small" color="#f97316" />;
  }

  if (order.status === 'PENDING') {
    return (
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={() => onUpdateStatus(order.id, 'CANCELLED')}
          className="h-9 w-9 items-center justify-center rounded-xl border border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-950/20"
        >
          <XCircle color="#ef4444" size={16} />
        </Pressable>
        <Pressable
          onPress={() => onUpdateStatus(order.id, 'CONFIRMED')}
          className="h-9 flex-row items-center gap-1 rounded-xl bg-[#ea580c] px-3"
        >
          <CheckCircle2 color="#ffffff" size={15} />
          <Text className="text-[11px] text-white" weight="700">
            Nhận đơn
          </Text>
        </Pressable>
      </View>
    );
  }

  if (order.status === 'CONFIRMED') {
    return (
      <Pressable
        onPress={() => onUpdateStatus(order.id, 'DELIVERED')}
        className="h-9 flex-row items-center gap-1 rounded-xl bg-emerald-600 px-3"
      >
        <PackageCheck color="#ffffff" size={15} />
        <Text className="text-[11px] text-white" weight="700">
          Đã giao
        </Text>
      </Pressable>
    );
  }

  return (
    <Text className="text-[11px] text-slate-500" weight="700">
      Không còn thao tác
    </Text>
  );
}
