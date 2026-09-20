import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text as NativeText,
  TextInput,
  View,
} from 'react-native';
import { useColorScheme } from 'nativewind';
import {
  Car,
  Check,
  CheckCircle2,
  Clock3,
  Coffee,
  Minus,
  Plus,
  Repeat2,
  RefreshCw,
  Search,
} from 'lucide-react-native';

import {
  staffApi,
  type StaffMenuItem,
  type StaffMenuVariant,
  type StaffSessionDetail,
  type StaffVehicleUnit,
} from '@/features/staff/api/staff.api';
import type { SessionOperationalTiming } from '@/features/staff/lib/session-operational-timing';
import { Text } from '@/shared/ui/Text';

function formatCurrency(value?: number | string) {
  return `${Number(value || 0).toLocaleString('vi-VN')}đ`;
}

function formatTime(iso?: string) {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function shortId(value?: string) {
  if (!value) return '--';
  return value.slice(0, 8).toUpperCase();
}

function getUnitName(unit: StaffVehicleUnit) {
  return unit.catalog?.name || unit.identifier || `Xe ${shortId(unit.id)}`;
}

function getMenuImage(item: StaffMenuItem) {
  return item.image || item.imageUrl || item.image_url || null;
}

function getAvailableMenuVariants(item?: StaffMenuItem) {
  return Array.isArray(item?.variants)
    ? item.variants.filter((variant) => variant?.isAvailable !== false)
    : [];
}

const UNCATEGORIZED_LABEL = 'Chưa phân loại';

export function StaffSessionTools({
  session,
  onUpdated,
  operationalTiming,
}: {
  session: StaffSessionDetail;
  onUpdated: () => Promise<void>;
  operationalTiming: SessionOperationalTiming;
}) {
  const { colorScheme } = useColorScheme();
  const canOperate = ['ACTIVE', 'EXTENDING'].includes(session.status);
  const canProposeExtension = session.status === 'ACTIVE';
  const extensionWindowClosed = operationalTiming.state === 'OVERDUE';
  const extensionPending = session.extensionProposal?.status === 'PENDING' || session.status === 'EXTENDING';
  const directExtension =
    session.bookingSource === 'STAFF_MANUAL' ||
    session.bookingSource === 'WALK_IN' ||
    (session as any).source === 'STAFF_MANUAL' ||
    (session as any).source === 'WALK_IN';
  const isWalkIn = directExtension;

  const [loadingResources, setLoadingResources] = useState(false);
  const [menuItems, setMenuItems] = useState<StaffMenuItem[]>([]);
  const [availableVehicles, setAvailableVehicles] = useState<StaffVehicleUnit[]>([]);

  // F&B Filter & Selection State
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [menuSearchQuery, setMenuSearchQuery] = useState('');
  const [fnbSelection, setFnbSelection] = useState({
    itemId: '',
    variantId: '',
    quantity: 1,
  });
  const selectedMenuItemId = fnbSelection.itemId;
  const selectedVariantId = fnbSelection.variantId;
  const selectedQty = fnbSelection.quantity;
  const [selectedFnbNote, setSelectedFnbNote] = useState('');

  // Vehicle Swap State
  const [selectedOldVehicleId, setSelectedOldVehicleId] = useState('');
  const [selectedReplacementId, setSelectedReplacementId] = useState('');
  const [oldVehicleStatus, setOldVehicleStatus] = useState<'MAINTENANCE' | 'AVAILABLE'>('MAINTENANCE');

  const [submitting, setSubmitting] = useState<'extension' | 'fnb' | 'swap' | null>(null);

  const rentalVehicles = useMemo(
    () => session.vehicles?.filter((vehicle) => vehicle.type === 'RENT') ?? [],
    [session.vehicles]
  );

  const extensionOptions = useMemo(() => {
    const quoted = session.extensionPricingOptions ?? [];
    return [15, 30, 60].map((minutes) => {
      const option = quoted.find((item) => item.extraMinutes === minutes);
      return {
        extraMinutes: minutes,
        additionalFee: Number(option?.additionalFee ?? 0),
        newPlannedEnd:
          option?.newPlannedEnd ??
          new Date(new Date(session.plannedEnd).getTime() + minutes * 60000).toISOString(),
        available: option?.available !== false,
        blockedReason: option?.blockedReason,
      };
    });
  }, [session.extensionPricingOptions, session.plannedEnd]);

  const replacementVehicles = useMemo(() => {
    const activeIds = new Set(rentalVehicles.map((vehicle) => vehicle.vehicleId));
    return availableVehicles.filter((vehicle) => vehicle.status === 'AVAILABLE' && !activeIds.has(vehicle.id));
  }, [availableVehicles, rentalVehicles]);

  // Group menu items by category (mirrors web FE menuItemGroups logic)
  const menuItemGroups = useMemo(() => {
    const groups: { label: string; items: StaffMenuItem[] }[] = [];
    const indexByLabel = new Map<string, number>();
    for (const item of menuItems) {
      const label = item.categoryName ?? UNCATEGORIZED_LABEL;
      const existing = indexByLabel.get(label);
      if (existing === undefined) {
        indexByLabel.set(label, groups.length);
        groups.push({ label, items: [item] });
      } else {
        groups[existing].items.push(item);
      }
    }
    return groups;
  }, [menuItems]);

  const categories = useMemo(() => {
    return ['ALL', ...menuItemGroups.map((g) => g.label)];
  }, [menuItemGroups]);

  // Filtered items based on category and search
  const filteredMenuItems = useMemo(() => {
    let list = menuItems;
    if (selectedCategory !== 'ALL') {
      list = list.filter((item) => (item.categoryName ?? UNCATEGORIZED_LABEL) === selectedCategory);
    }
    if (menuSearchQuery.trim()) {
      const q = menuSearchQuery.trim().toLowerCase();
      list = list.filter((item) => item.name.toLowerCase().includes(q));
    }
    return list;
  }, [menuItems, selectedCategory, menuSearchQuery]);

  const selectedMenuItem = useMemo(
    () => menuItems.find((item) => item.id === selectedMenuItemId),
    [menuItems, selectedMenuItemId]
  );

  const availableVariants = useMemo(() => {
    return getAvailableMenuVariants(selectedMenuItem) as StaffMenuVariant[];
  }, [selectedMenuItem]);

  const selectedVariant = useMemo(() => {
    return availableVariants.find((v) => v.id === selectedVariantId) ?? availableVariants[0];
  }, [availableVariants, selectedVariantId]);

  // Calculate unit price and total price for selected item
  const currentUnitPrice = useMemo(() => {
    if (selectedVariant) {
      return Number(selectedVariant.price || 0);
    }
    return Number(selectedMenuItem?.price || 0);
  }, [selectedMenuItem, selectedVariant]);

  const currentTotalPrice = useMemo(() => {
    return currentUnitPrice * selectedQty;
  }, [currentUnitPrice, selectedQty]);

  const loadResources = useCallback(async () => {
    if (!session.cafeId || !canOperate || extensionWindowClosed) return;

    setLoadingResources(true);
    try {
      const [menu, vehicles] = await Promise.all([
        staffApi.getCafeMenu(session.cafeId),
        staffApi.getCafeVehicles(session.cafeId),
      ]);
      setMenuItems(menu);
      setAvailableVehicles(vehicles);
      setFnbSelection((previous) => {
        const selectedItem = menu.find((item) => item.id === previous.itemId) ?? menu[0];
        const availableVariants = getAvailableMenuVariants(selectedItem);
        const variantId = availableVariants.some((variant) => variant.id === previous.variantId)
          ? previous.variantId
          : (availableVariants[0]?.id ?? '');

        return {
          itemId: selectedItem?.id ?? '',
          variantId,
          quantity: previous.quantity,
        };
      });
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Không thể tải menu hoặc danh sách xe khả dụng.';
      Alert.alert('Lỗi', message);
    } finally {
      setLoadingResources(false);
    }
  }, [canOperate, extensionWindowClosed, session.cafeId]);

  useEffect(() => {
    loadResources();
  }, [loadResources]);

  useEffect(() => {
    if (!selectedOldVehicleId && rentalVehicles[0]) {
      setSelectedOldVehicleId(rentalVehicles[0].vehicleId);
    }
  }, [rentalVehicles, selectedOldVehicleId]);

  const handleSelectItem = (item: StaffMenuItem) => {
    setFnbSelection({
      itemId: item.id,
      variantId: getAvailableMenuVariants(item)[0]?.id ?? '',
      quantity: 1,
    });
  };

  const handleExtension = (option: {
    extraMinutes: number;
    additionalFee: number;
    newPlannedEnd: string;
    available: boolean;
    blockedReason?: string;
  }) => {
    if (!option.available) {
      Alert.alert('Không thể gia hạn', option.blockedReason || 'Khung giờ này không khả dụng.');
      return;
    }

    Alert.alert(
      directExtension ? 'Gia hạn trực tiếp' : 'Gửi yêu cầu gia hạn',
      directExtension
        ? `Xác nhận gia hạn +${option.extraMinutes} phút tới ${formatTime(option.newPlannedEnd)} với phí ${formatCurrency(option.additionalFee)}?`
        : `Gửi yêu cầu +${option.extraMinutes} phút tới khách với phí ${formatCurrency(option.additionalFee)}?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: directExtension ? 'Gia hạn ngay' : 'Gửi yêu cầu',
          onPress: async () => {
            setSubmitting('extension');
            try {
              await staffApi.proposeExtension(session.sessionId, {
                extraMinutes: option.extraMinutes,
                additionalFee: option.additionalFee,
                direct: directExtension,
              });
              Alert.alert(
                'Đã xử lý',
                directExtension ? 'Phiên đã được gia hạn trực tiếp.' : 'Đã gửi yêu cầu gia hạn tới khách.'
              );
              await onUpdated();
            } catch (error: any) {
              const message = error?.response?.data?.message || 'Không thể xử lý gia hạn.';
              Alert.alert('Lỗi', message);
            } finally {
              setSubmitting(null);
            }
          },
        },
      ]
    );
  };

  const handleSimulateExtension = async (approved: boolean) => {
    setSubmitting('extension');
    try {
      await staffApi.simulateClientExtension(session.sessionId, { approved });
      Alert.alert(
        'Thành công',
        approved ? 'Đã xác nhận gia hạn ca chơi thành công!' : 'Đã ghi nhận khách từ chối gia hạn.'
      );
      await onUpdated();
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Không thể xử lý phản hồi gia hạn.';
      Alert.alert('Lỗi', message);
    } finally {
      setSubmitting(null);
    }
  };

  const handleAddFnb = async () => {
    if (!selectedMenuItem) {
      Alert.alert('Chưa chọn món', 'Vui lòng chọn món trước khi thêm vào phiên.');
      return;
    }

    if (availableVariants.length > 0 && !selectedVariant) {
      Alert.alert('Chưa chọn size/loại', 'Vui lòng chọn size hoặc lựa chọn cho món này.');
      return;
    }

    const qty = Math.max(1, Math.min(selectedQty, 99));
    setSubmitting('fnb');
    try {
      await staffApi.addSessionFnbOrder(session.sessionId, {
        items: [
          {
            menu_item_id: selectedMenuItem.id,
            variant_id: selectedVariant?.id,
            quantity: qty,
            notes: selectedFnbNote.trim() || undefined,
          },
        ],
      });
      Alert.alert(
        'Thành công',
        `Đã thêm ${qty}x ${selectedMenuItem.name}${selectedVariant ? ` (${selectedVariant.name})` : ''} vào phiên.`
      );
      setSelectedFnbNote('');
      setFnbSelection((previous) => ({ ...previous, quantity: 1 }));
      await onUpdated();
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Không thể thêm món vào phiên.';
      Alert.alert('Lỗi', message);
    } finally {
      setSubmitting(null);
    }
  };

  const handleSwapVehicle = () => {
    if (!selectedOldVehicleId || !selectedReplacementId) {
      Alert.alert('Thiếu thông tin', 'Vui lòng chọn xe đang chạy và xe thay thế khả dụng.');
      return;
    }

    Alert.alert(
      'Xác nhận đổi xe',
      oldVehicleStatus === 'MAINTENANCE'
        ? 'Xe cũ sẽ được chuyển sang trạng thái bảo trì và xe thay thế sẽ được gán vào phiên.'
        : 'Xe cũ sẽ được trả lại kho trống (Sẵn sàng) và xe thay thế sẽ được gán vào phiên.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Đổi xe',
          onPress: async () => {
            setSubmitting('swap');
            try {
              await staffApi.swapSessionVehicle(session.sessionId, {
                oldVehicleId: selectedOldVehicleId,
                newVehicleId: selectedReplacementId,
                oldVehicleNewStatus: oldVehicleStatus,
              });
              Alert.alert('Đã đổi xe', 'Xe thay thế đã được gán vào phiên chạy thành công.');
              setSelectedReplacementId('');
              await loadResources();
              await onUpdated();
            } catch (error: any) {
              const message = error?.response?.data?.message || 'Không thể đổi xe trong phiên.';
              Alert.alert('Lỗi', message);
            } finally {
              setSubmitting(null);
            }
          },
        },
      ]
    );
  };

  if (!canOperate) {
    return null;
  }

  return (
    <View className="mb-5 gap-4">
      {/* 1. GIA HẠN CA CHẠY */}
      <ToolCard
        icon={<Clock3 color="#f97316" size={18} />}
        title={extensionWindowClosed ? 'Phiên quá giờ' : 'Gia hạn ca chạy'}
        subtitle={
          extensionWindowClosed
            ? `Quá giờ ${operationalTiming.minutesPastPlannedEnd} phút · cần xử lý trả xe`
            : `Kết thúc dự kiến ${formatTime(session.plannedEnd)}`
        }
      >
        {extensionWindowClosed ? (
          <View className="rounded-xl border border-red-500/25 bg-red-500/10 p-3">
            <Text className="text-[12px] text-red-500 font-bold">
              Gia hạn đã được khóa
            </Text>
            <Text className="mt-1 text-[11px] leading-4 text-slate-500">
              Không tự tính phí quá giờ theo thời điểm nhân viên thao tác. Hãy dùng mục Thao tác phiên để kiểm tra và xử lý trả xe.
            </Text>
          </View>
        ) : extensionPending ? (
          <View className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3.5">
            <View className="flex-row items-center justify-between gap-2 mb-1">
              <Text className="text-[13px] text-amber-950 dark:text-amber-100 font-bold">
                Đang chờ phản hồi gia hạn +{session.extensionProposal?.extraMinutes || ''} phút
              </Text>
              <View className="bg-amber-200/80 dark:bg-amber-900/60 px-2 py-0.5 rounded-full">
                <Text className="text-[9px] text-amber-900 dark:text-amber-200 font-bold uppercase">
                  Chờ phản hồi
                </Text>
              </View>
            </View>
            <Text className="text-[11px] leading-4 text-amber-900 dark:text-amber-200 font-medium">
              {isWalkIn
                ? '⚡ Khách vãng lai: Nhân viên xác nhận trực tiếp tại quầy theo quyết định của khách.'
                : '📱 Khách đặt trước: Khách có thể xác nhận trên App hoặc nhân viên hỗ trợ xác nhận tại quầy bên dưới.'}
            </Text>
            <View className="mt-3 flex-row gap-2">
              <Pressable
                disabled={submitting === 'extension'}
                onPress={() => handleSimulateExtension(true)}
                className="flex-1 h-10 flex-row items-center justify-center gap-1.5 rounded-xl bg-emerald-600 active:bg-emerald-700 shadow-sm"
              >
                {submitting === 'extension' ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <CheckCircle2 color="#ffffff" size={14} />
                )}
                <Text className="text-[11px] font-bold text-white">
                  Khách đồng ý gia hạn
                </Text>
              </Pressable>

              <Pressable
                disabled={submitting === 'extension'}
                onPress={() => handleSimulateExtension(false)}
                className="h-10 px-3.5 flex-row items-center justify-center rounded-xl bg-slate-200 dark:bg-slate-800 active:bg-slate-300"
              >
                <Text className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Từ chối
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View className="gap-2">
            <View className="flex-row flex-wrap gap-2">
              {extensionOptions.map((option) => (
                <Pressable
                  key={option.extraMinutes}
                  disabled={!canProposeExtension || submitting === 'extension'}
                  onPress={() => handleExtension(option)}
                  className={`min-w-[31%] flex-1 rounded-xl border p-3 ${
                    option.available && canProposeExtension
                      ? 'border-orange-500/30 bg-orange-500/10 active:bg-orange-500/20'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 opacity-60'
                  }`}
                >
                  <Text className="text-center text-[13px] text-[#fb923c] font-bold">
                    +{option.extraMinutes} phút
                  </Text>
                  <Text className="mt-1 text-center text-[10px] text-slate-500">
                    {option.available ? `→ ${formatTime(option.newPlannedEnd)}` : 'Không khả dụng'}
                  </Text>
                  <Text className="mt-1 text-center text-[10px] text-slate-900 dark:text-white font-bold">
                    {option.blockedReason || formatCurrency(option.additionalFee)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text className="text-[10px] leading-4 text-slate-500">
              {isWalkIn
                ? '⚡ Đơn khách vãng lai: nhân viên gia hạn trực tiếp tại quầy và ghi nợ quyết toán.'
                : '📱 Đơn đặt qua app: khách có thể xác nhận gia hạn trên ứng dụng hoặc tại quầy.'}
            </Text>
          </View>
        )}
      </ToolCard>

      {/* 2. GỌI THÊM ĐỒ ĂN, THỨC UỐNG */}
      {!extensionWindowClosed && (
        <ToolCard
          icon={<Coffee color="#f97316" size={18} />}
          title={isWalkIn ? 'Thêm món tại quầy (Khách vãng lai)' : 'Gọi thêm đồ ăn, thức uống'}
          subtitle={
            isWalkIn
              ? '⚡ Tự động ghi nợ vào quyết toán ca chơi tại quầy'
              : loadingResources
                ? 'Đang tải thực đơn...'
                : `${menuItems.length} món khả dụng`
          }
        >
          {loadingResources ? (
            <ActivityIndicator color="#f97316" />
          ) : menuItems.length === 0 ? (
            <EmptyInline text="Chi nhánh chưa có món khả dụng." />
          ) : (
            <View className="gap-3">
              {/* Category Filter Tabs */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
                <View className="flex-row gap-1.5 px-1 py-0.5">
                  {categories.map((cat) => {
                    const active = selectedCategory === cat;
                    const count =
                      cat === 'ALL'
                        ? menuItems.length
                        : menuItems.filter((i) => (i.categoryName ?? UNCATEGORIZED_LABEL) === cat).length;
                    return (
                      <Pressable
                        key={cat}
                        onPress={() => setSelectedCategory(cat)}
                        className={`rounded-full px-3 py-1.5 border ${
                          active
                            ? 'border-orange-500 bg-[#ea580c]'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900'
                        }`}
                      >
                        <Text
                          className={`text-[11px] ${active ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}
                          weight="700"
                        >
                          {cat === 'ALL' ? 'Tất cả' : cat} ({count})
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              {/* Search Box */}
              {menuItems.length > 5 ? (
                <View className="flex-row items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3">
                  <Search color="#94a3b8" size={14} />
                  <TextInput
                    value={menuSearchQuery}
                    onChangeText={setMenuSearchQuery}
                    placeholder="Tìm món ăn, thức uống..."
                    placeholderTextColor="#94a3b8"
                    className="h-9 flex-1 px-2 text-[12px] text-slate-900 dark:text-white"
                  />
                  {menuSearchQuery ? (
                    <Pressable onPress={() => setMenuSearchQuery('')}>
                      <Text className="text-[11px] text-slate-400">Xóa</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {/* Horizontal Menu Items Slider */}
              {filteredMenuItems.length === 0 ? (
                <EmptyInline text="Không tìm thấy món phù hợp." />
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
                  <View className="flex-row gap-2.5 px-1 py-1">
                    {filteredMenuItems.map((item) => {
                      const active = item.id === selectedMenuItemId;
                      const imageUrl = getMenuImage(item);
                      const itemVariants = getAvailableMenuVariants(item);
                      const hasVariants = itemVariants.length > 0;
                      const minPrice = hasVariants
                        ? Math.min(...itemVariants.map((variant) => Number(variant.price || 0)))
                        : Number(item.price || 0);

                      return (
                        // Dynamic shadow classes make NativeWind 4.2 remount this Pressable on selection.
                        <Pressable
                          key={item.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Chọn ${item.name}`}
                          accessibilityState={{ selected: active }}
                          onPress={() => handleSelectItem(item)}
                          style={[
                            styles.menuItem,
                            active
                              ? styles.menuItemSelected
                              : colorScheme === 'dark'
                                ? styles.menuItemDefaultDark
                                : styles.menuItemDefault,
                          ]}
                        >
                          <View className="h-24 bg-slate-100 dark:bg-[#0b0f19] relative">
                            {imageUrl ? (
                              <Image source={{ uri: imageUrl }} className="h-full w-full" resizeMode="cover" />
                            ) : (
                              <View className="h-full w-full items-center justify-center">
                                <Coffee color="#475569" size={24} />
                              </View>
                            )}
                            {active ? (
                              <View className="absolute top-1.5 right-1.5 size-5 items-center justify-center rounded-full bg-[#ea580c]">
                                <Check color="#ffffff" size={12} strokeWidth={3} />
                              </View>
                            ) : null}
                            {item.categoryName ? (
                              <View className="absolute bottom-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5">
                                <Text className="text-[8px] uppercase text-white" weight="700">
                                  {item.categoryName}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <View className="p-2.5">
                            <Text className="text-[12px] text-slate-900 dark:text-white" weight="700" numberOfLines={1}>
                              {item.name}
                            </Text>
                            <Text className="mt-1 text-[11px] text-[#ea580c]" weight="700">
                              {hasVariants ? `Từ ${formatCurrency(minPrice)}` : formatCurrency(item.price)}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              )}

              {/* Selected Item Details & Customization Box */}
              {selectedMenuItem ? (
                <View className="rounded-xl border border-orange-500/20 bg-orange-500/5 dark:bg-orange-950/20 p-3.5 gap-3">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-2">
                      <Text className="text-[13px] text-slate-900 dark:text-white" weight="700" numberOfLines={1}>
                        {selectedMenuItem.name}
                      </Text>
                      {selectedMenuItem.description ? (
                        <Text className="mt-0.5 text-[10px] text-slate-500" numberOfLines={1}>
                          {selectedMenuItem.description}
                        </Text>
                      ) : null}
                    </View>
                    <Text className="text-[13px] text-[#ea580c]" weight="700">
                      {formatCurrency(currentUnitPrice)}
                    </Text>
                  </View>

                  {/* Variants selection (if item has variants) */}
                  {availableVariants.length > 0 ? (
                    <View>
                      <Text className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400" weight="700">
                        Size / Tùy chọn
                      </Text>
                      <View className="flex-row flex-wrap gap-2">
                        {availableVariants.map((variant) => {
                          const active = selectedVariant?.id === variant.id;
                          return (
                            <Pressable
                              key={variant.id}
                              onPress={() =>
                                setFnbSelection((previous) => ({
                                  ...previous,
                                  variantId: variant.id,
                                }))
                              }
                              style={[
                                styles.variant,
                                active
                                  ? styles.variantSelected
                                  : colorScheme === 'dark'
                                    ? styles.variantDefaultDark
                                    : styles.variantDefault,
                              ]}
                            >
                              <NativeText
                                style={[
                                  styles.variantName,
                                  active
                                    ? styles.variantNameSelected
                                    : colorScheme === 'dark'
                                      ? styles.variantNameDefaultDark
                                      : styles.variantNameDefault,
                                ]}
                              >
                                {variant.name}
                              </NativeText>
                              <NativeText
                                style={[
                                  styles.variantPrice,
                                  active
                                    ? styles.variantPriceSelected
                                    : colorScheme === 'dark'
                                      ? styles.variantPriceDefaultDark
                                      : styles.variantPriceDefault,
                                ]}
                              >
                                {formatCurrency(variant.price)}
                              </NativeText>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}

                  {/* Quantity and Notes */}
                  <View className="flex-row items-center gap-3">
                    <View className="flex-1">
                      <Text className="mb-1 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400" weight="700">
                        Ghi chú bếp (tùy chọn)
                      </Text>
                      <TextInput
                        value={selectedFnbNote}
                        onChangeText={setSelectedFnbNote}
                        placeholder="Vd: ít đá, mang bàn số 1..."
                        placeholderTextColor="#94a3b8"
                        maxLength={200}
                        className="h-10 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-[12px] text-slate-900 dark:text-white"
                      />
                    </View>

                    <View>
                      <Text className="mb-1 text-center text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400" weight="700">
                        Số lượng
                      </Text>
                      <View className="flex-row items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 h-10 px-1">
                        <Pressable
                          onPress={() =>
                            setFnbSelection((previous) => ({
                              ...previous,
                              quantity: Math.max(1, previous.quantity - 1),
                            }))
                          }
                          className="h-8 w-8 items-center justify-center rounded active:bg-slate-100 dark:active:bg-slate-800"
                        >
                          <Minus color="#64748b" size={14} />
                        </Pressable>
                        <Text className="w-8 text-center text-[13px] text-slate-900 dark:text-white" weight="700">
                          {selectedQty}
                        </Text>
                        <Pressable
                          onPress={() =>
                            setFnbSelection((previous) => ({
                              ...previous,
                              quantity: Math.min(99, previous.quantity + 1),
                            }))
                          }
                          className="h-8 w-8 items-center justify-center rounded active:bg-slate-100 dark:active:bg-slate-800"
                        >
                          <Plus color="#64748b" size={14} />
                        </Pressable>
                      </View>
                    </View>
                  </View>

                  {/* Add Button & Total Price */}
                  <Pressable
                    disabled={submitting === 'fnb'}
                    onPress={handleAddFnb}
                    className={`h-11 flex-row items-center justify-between rounded-xl bg-[#ea580c] active:bg-[#c2410c] px-4 ${
                      submitting === 'fnb' ? 'opacity-70' : ''
                    }`}
                  >
                    <View className="flex-row items-center gap-2">
                      {submitting === 'fnb' ? (
                        <ActivityIndicator color="#ffffff" size="small" />
                      ) : (
                        <Plus color="#ffffff" size={16} />
                      )}
                      <Text className="text-[12px] text-white" weight="700">
                        Thêm món & Báo chế biến
                      </Text>
                    </View>
                    <Text className="text-[13px] text-white" weight="700">
                      {formatCurrency(currentTotalPrice)}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          )}
        </ToolCard>
      )}

      {/* 3. ĐỔI XE TRONG PHIÊN (Ẩn trên giao diện, giữ nguyên logic) */}
      {false && rentalVehicles.length ? (
        <ToolCard
          icon={<Repeat2 color="#f97316" size={18} />}
          title="Đổi xe trong phiên"
          subtitle={`${replacementVehicles.length} xe thay thế khả dụng`}
        >
          <View className="gap-3">
            <View>
              <Text className="mb-2 text-[10px] uppercase tracking-wider text-slate-500" weight="700">
                Xe đang chạy
              </Text>
              <View className="gap-2">
                {rentalVehicles.map((vehicle) => {
                  const active = selectedOldVehicleId === vehicle.vehicleId;
                  return (
                    <Pressable
                      key={vehicle.vehicleId}
                      onPress={() => setSelectedOldVehicleId(vehicle.vehicleId)}
                      className={`flex-row items-center gap-3 rounded-xl border p-3 ${
                        active
                          ? 'border-orange-500 bg-orange-500/10'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950'
                      }`}
                    >
                      <Car color={active ? '#fb923c' : '#64748b'} size={16} />
                      <View className="flex-1">
                        <Text className="text-[12px] text-slate-900 dark:text-white" weight="700" numberOfLines={1}>
                          {vehicle.name}
                        </Text>
                        <Text className="mt-0.5 text-[10px] text-slate-500">Mã {shortId(vehicle.vehicleId)}</Text>
                      </View>
                      {active ? <CheckCircle2 color="#fb923c" size={15} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
              <View className="flex-row items-center justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-[12px] text-slate-900 dark:text-white" weight="700">
                    Xe cũ cần bảo trì / sửa chữa
                  </Text>
                  <Text className="mt-1 text-[10px] text-slate-500">
                    Tắt nếu xe cũ vẫn hoạt động bình thường và được trả lại kho trống.
                  </Text>
                </View>
                <Switch
                  value={oldVehicleStatus === 'MAINTENANCE'}
                  onValueChange={(value) => setOldVehicleStatus(value ? 'MAINTENANCE' : 'AVAILABLE')}
                  trackColor={{ false: '#1e293b', true: '#f97316' }}
                  thumbColor="#ffffff"
                />
              </View>
            </View>

            <View>
              <Text className="mb-2 text-[10px] uppercase tracking-wider text-slate-500" weight="700">
                Xe thay thế
              </Text>
              {loadingResources ? (
                <ActivityIndicator color="#f97316" />
              ) : replacementVehicles.length === 0 ? (
                <EmptyInline text="Không có xe khả dụng để thay thế." />
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row gap-2">
                    {replacementVehicles.map((vehicle) => {
                      const active = selectedReplacementId === vehicle.id;
                      return (
                        <Pressable
                          key={vehicle.id}
                          onPress={() => setSelectedReplacementId(vehicle.id)}
                          className={`w-40 rounded-xl border p-3 ${
                            active
                              ? 'border-orange-500 bg-orange-500/10'
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950'
                          }`}
                        >
                          <Text className="text-[12px] text-slate-900 dark:text-white" weight="700" numberOfLines={1}>
                            {getUnitName(vehicle)}
                          </Text>
                          <Text className="mt-1 text-[10px] text-slate-500" numberOfLines={1}>
                            {vehicle.identifier || shortId(vehicle.id)}
                            {vehicle.color ? ` • ${vehicle.color}` : ''}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              )}
            </View>

            <Pressable
              disabled={submitting === 'swap' || !selectedReplacementId}
              onPress={handleSwapVehicle}
              className={`h-11 flex-row items-center justify-center gap-2 rounded-xl bg-[#ea580c] active:bg-[#c2410c] ${
                submitting === 'swap' || !selectedReplacementId ? 'opacity-60' : ''
              }`}
            >
              {submitting === 'swap' ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <RefreshCw color="#ffffff" size={15} />
              )}
              <Text className="text-[12px] text-white" weight="700">
                Xác nhận đổi xe
              </Text>
            </Pressable>
          </View>
        </ToolCard>
      ) : null}
    </View>
  );
}

function ToolCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const { colorScheme } = useColorScheme();

  return (
    <View
      style={[styles.toolCard, colorScheme === 'dark' ? styles.toolCardDark : styles.toolCardLight]}
    >
      <View style={styles.toolCardHeader}>
        <View style={styles.toolCardTitleRow}>
          <View style={styles.toolCardIcon}>
            {icon}
          </View>
          <View>
            <NativeText
              style={[styles.toolCardTitle, colorScheme === 'dark' && styles.toolCardTitleDark]}
            >
              {title}
            </NativeText>
            <NativeText style={styles.toolCardSubtitle}>
              {subtitle}
            </NativeText>
          </View>
        </View>
      </View>
      {children}
    </View>
  );
}

function EmptyInline({ text }: { text: string }) {
  return (
    <View className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
      <Text className="text-center text-[11px] text-slate-500">{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toolCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    elevation: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  toolCardLight: {
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  toolCardDark: {
    borderColor: '#1e293b',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  toolCardHeader: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toolCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toolCardIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 22, 0.2)',
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
  },
  toolCardTitle: {
    color: '#0f172a',
    fontFamily: 'BeVietnamPro_700Bold',
    fontSize: 13,
  },
  toolCardTitleDark: {
    color: '#ffffff',
  },
  toolCardSubtitle: {
    marginTop: 4,
    color: '#64748b',
    fontFamily: 'BeVietnamPro_400Regular',
    fontSize: 10,
  },
  menuItem: {
    width: 144,
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
  },
  menuItemDefault: {
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  menuItemDefaultDark: {
    borderColor: '#1e293b',
    backgroundColor: '#020617',
  },
  menuItemSelected: {
    borderColor: '#f97316',
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
  },
  variant: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  variantDefault: {
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  variantDefaultDark: {
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
  },
  variantSelected: {
    borderColor: '#f97316',
    backgroundColor: '#ea580c',
  },
  variantNameDefault: {
    color: '#1e293b',
  },
  variantName: {
    fontFamily: 'BeVietnamPro_700Bold',
    fontSize: 11,
  },
  variantNameDefaultDark: {
    color: '#e2e8f0',
  },
  variantNameSelected: {
    color: '#ffffff',
  },
  variantPriceDefault: {
    color: '#64748b',
  },
  variantPrice: {
    fontFamily: 'BeVietnamPro_400Regular',
    fontSize: 10,
  },
  variantPriceDefaultDark: {
    color: '#94a3b8',
  },
  variantPriceSelected: {
    color: '#ffedd5',
  },
});
