import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Pressable,
  Image,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from 'react-native';
import {
  Plus,
  Minus,
  Coffee,
  Flame,
  Search,
  X,
  ShoppingBag,
} from 'lucide-react-native';
import { Text } from '@/shared/ui/Text';
import { useColorScheme } from 'nativewind';
import {
  bookingWizardApi,
  type MenuItem,
  type PopularMenuItemEntry,
} from '../api/booking-wizard.api';

// Key được encode dưới dạng "itemId" hoặc "itemId__variantId"
function encodeKey(itemId: string, variantId?: string): string {
  return variantId ? `${itemId}__${variantId}` : itemId;
}

interface FnbStepProps {
  cafeId: string;
  fnbQuantities: Record<string, number>;
  setFnbQuantities: (quantities: Record<string, number>) => void;
  fnbNotes: Record<string, string>;
  setFnbNotes: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

// ─── Sub-component: Item Card ──────────────────────────────────────────────────

interface MenuItemCardProps {
  item: MenuItem;
  fnbQuantities: Record<string, number>;
  onChangeQty: (key: string, delta: number) => void;
  fnbNotes: Record<string, string>;
  onNoteChange: (key: string, note: string) => void;
  /** Hiển thị compact (dạng ngang) hay full (dạng dọc có variants) */
  compact?: boolean;
  orderCount?: number;
}

function MenuItemCard({
  item,
  fnbQuantities,
  onChangeQty,
  fnbNotes,
  onNoteChange,
  compact,
  orderCount,
}: MenuItemCardProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  const availableVariants = useMemo(() => {
    return item.variants?.filter((v) => v.isAvailable) ?? [];
  }, [item.variants]);

  const hasVariants = availableVariants.length > 0;

  // Tổng số lượng của món này (tất cả variants)
  const totalQty = useMemo(() => {
    let total = 0;
    // Cộng qty của món không variant
    total += fnbQuantities[item.id] ?? 0;
    // Cộng qty của tất cả variants
    for (const v of availableVariants) {
      total += fnbQuantities[encodeKey(item.id, v.id)] ?? 0;
    }
    return total;
  }, [fnbQuantities, item.id, availableVariants]);

  const formatPrice = (price: number | string) =>
    Number(price).toLocaleString('vi-VN') + 'đ';

  if (compact) {
    // ── Compact card: dùng cho section "Khách hay gọi" ──
    const qty = fnbQuantities[item.id] ?? 0;
    const basePrice = hasVariants
      ? `Từ ${formatPrice(availableVariants[0]?.price ?? item.price)}`
      : formatPrice(item.price);

    return (
      <View
        className={`border rounded-2xl p-3 w-44 shadow-sm ${
          totalQty > 0
            ? 'bg-orange-50/40 dark:bg-[#1a1612] border-[#ea580c]/50'
            : 'bg-white dark:bg-[#0f172a]/60 border-slate-200 dark:border-slate-800'
        }`}
      >
        {/* Ảnh + Badge số lượng đã chọn */}
        <View className="relative h-24 w-full rounded-xl bg-slate-100 dark:bg-slate-900 mb-2.5 overflow-hidden items-center justify-center">
          {item.image || item.imageUrl ? (
            <Image
              source={{ uri: (item.image || item.imageUrl)! }}
              className="h-full w-full"
              resizeMode="cover"
            />
          ) : (
            <Coffee color="#475569" size={28} />
          )}
          {totalQty > 0 && (
            <View className="absolute top-1.5 left-1.5 bg-[#ea580c] px-2 py-0.5 rounded-full shadow">
              <Text className="text-[10px] text-white font-black">
                {totalQty}
              </Text>
            </View>
          )}
        </View>

        {/* Tên & giá */}
        <Text
          className="text-[12px] text-slate-900 dark:text-white font-bold leading-4"
          numberOfLines={2}
        >
          {item.name}
        </Text>
        <Text className="text-[11px] text-[#f97316] font-bold mt-1">
          {basePrice}
        </Text>

        {/* Social proof */}
        {orderCount !== undefined && orderCount > 0 && (
          <View className="flex-row items-center gap-0.5 mt-1">
            <Flame color="#f97316" size={10} />
            <Text className="text-[9px] text-slate-500 dark:text-slate-400 font-semibold">
              {orderCount} lượt đặt gần đây
            </Text>
          </View>
        )}

        {/* Nút thêm */}
        <View className="flex-row items-center justify-end mt-2 gap-2">
          {qty > 0 && !hasVariants && (
            <>
              <Pressable
                onPress={() => onChangeQty(item.id, -1)}
                className="h-6 w-6 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center active:bg-slate-200"
              >
                <Minus color={isDark ? '#fff' : '#475569'} size={12} />
              </Pressable>
              <Text className="text-[12px] text-slate-900 dark:text-white font-bold">
                {qty}
              </Text>
            </>
          )}
          {!hasVariants ? (
            <Pressable
              onPress={() => onChangeQty(item.id, 1)}
              className="h-6 w-6 rounded-full bg-[#ea580c] items-center justify-center active:bg-[#f97316]"
            >
              <Plus color="#ffffff" size={11} />
            </Pressable>
          ) : (
            <Text className="text-[9px] text-slate-400 font-semibold italic">
              Chọn size bên dưới ↓
            </Text>
          )}
        </View>

        {/* Ghi chú cho compact món không có variant */}
        {qty > 0 && !hasVariants && (
          <View className="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800/80">
            <TextInput
              value={fnbNotes[item.id] ?? ''}
              onChangeText={(text) => onNoteChange(item.id, text)}
              placeholder="Ghi chú (ít ngọt, nóng...)"
              placeholderTextColor="#94a3b8"
              maxLength={200}
              className="h-7 rounded-lg border border-orange-200 dark:border-orange-900/60 bg-white dark:bg-slate-900 px-2 text-[10px] text-slate-800 dark:text-slate-100"
            />
          </View>
        )}
      </View>
    );
  }

  // ── Full card: dạng danh sách dọc với variant rows ──
  return (
    <View
      className={`border rounded-2xl overflow-hidden shadow-sm transition-all ${
        totalQty > 0
          ? 'bg-orange-50/25 dark:bg-[#1a1612] border-orange-300 dark:border-orange-900/50'
          : 'bg-white dark:bg-[#0f172a]/60 border-slate-200 dark:border-slate-800'
      }`}
    >
      {/* Row đầu: ảnh + tên + giá base */}
      <View className="flex-row gap-3 items-center p-3">
        <View className="relative h-16 w-16 rounded-xl bg-slate-100 dark:bg-slate-900 overflow-hidden items-center justify-center flex-shrink-0">
          {item.image || item.imageUrl ? (
            <Image
              source={{ uri: (item.image || item.imageUrl)! }}
              className="h-full w-full"
              resizeMode="cover"
            />
          ) : (
            <Coffee color="#475569" size={22} />
          )}
          {totalQty > 0 && (
            <View className="absolute top-1 left-1 bg-[#ea580c] px-1.5 py-0.2 rounded-full shadow">
              <Text className="text-[9px] text-white font-black">
                {totalQty}
              </Text>
            </View>
          )}
        </View>

        <View className="flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text
              className="text-[13px] text-slate-900 dark:text-white font-bold flex-1"
              numberOfLines={2}
            >
              {item.name}
            </Text>
            {item.categoryName ? (
              <View className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                <Text className="text-[9px] text-slate-500 dark:text-slate-400 font-semibold">
                  {item.categoryName}
                </Text>
              </View>
            ) : null}
          </View>

          {hasVariants ? (
            <Text className="text-[11px] text-[#f97316] mt-0.5 font-bold">
              Từ {formatPrice(availableVariants[0]?.price ?? item.price)}
            </Text>
          ) : (
            <Text className="text-[12px] text-[#f97316] mt-0.5 font-bold">
              {formatPrice(item.price)}
            </Text>
          )}
        </View>

        {/* Qty adjuster cho món không có variant */}
        {!hasVariants && (
          <View className="flex-row items-center gap-2">
            {(fnbQuantities[item.id] ?? 0) > 0 && (
              <>
                <Pressable
                  onPress={() => onChangeQty(item.id, -1)}
                  className="h-7 w-7 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center active:bg-slate-200 dark:active:bg-slate-700"
                >
                  <Minus color={isDark ? '#fff' : '#475569'} size={14} />
                </Pressable>
                <Text className="text-[13px] text-slate-900 dark:text-white font-bold w-5 text-center">
                  {fnbQuantities[item.id] ?? 0}
                </Text>
              </>
            )}
            <Pressable
              onPress={() => onChangeQty(item.id, 1)}
              className="h-7 w-7 rounded-full bg-[#ea580c] items-center justify-center active:bg-[#f97316]"
            >
              <Plus color="#ffffff" size={14} />
            </Pressable>
          </View>
        )}
      </View>

      {/* Ghi chú cho món không có variant */}
      {!hasVariants && (fnbQuantities[item.id] ?? 0) > 0 && (
        <View className="border-t border-slate-100 dark:border-slate-800/80 px-3 pb-3 pt-1.5">
          <TextInput
            value={fnbNotes[item.id] ?? ''}
            onChangeText={(text) => onNoteChange(item.id, text)}
            placeholder="Ghi chú (ví dụ: ít ngọt, không hành, nóng...)"
            placeholderTextColor="#94a3b8"
            maxLength={200}
            className="h-8 rounded-lg border border-orange-200 dark:border-orange-900/60 bg-white dark:bg-slate-900 px-2.5 text-[11px] text-slate-800 dark:text-slate-100"
          />
        </View>
      )}

      {/* Variant rows (size M / L / ...) */}
      {hasVariants && (
        <View className="border-t border-slate-100 dark:border-slate-800/80 px-3 pb-3">
          {availableVariants.map((variant) => {
            const key = encodeKey(item.id, variant.id);
            const qty = fnbQuantities[key] ?? 0;
            return (
              <View key={variant.id} className="mt-2.5">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <View className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-600" />
                    <Text className="text-[12px] text-slate-600 dark:text-slate-300 font-semibold">
                      {variant.name} · {formatPrice(variant.price)}
                    </Text>
                  </View>
                  {/* Wrapper cố định h-6 để card không bị co giãn khi đổi trạng thái */}
                  <View className="flex-row items-center justify-end gap-2 h-6">
                    {qty > 0 ? (
                      <>
                        <Pressable
                          onPress={() => onChangeQty(key, -1)}
                          className="h-6 w-6 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center active:bg-slate-200 dark:active:bg-slate-700"
                        >
                          <Minus color={isDark ? '#fff' : '#475569'} size={12} />
                        </Pressable>
                        <Text className="text-[12px] text-slate-900 dark:text-white font-bold w-4 text-center">
                          {qty}
                        </Text>
                      </>
                    ) : null}
                    <Pressable
                      onPress={() => onChangeQty(key, 1)}
                      className="h-6 w-6 rounded-full bg-[#ea580c] items-center justify-center active:bg-[#f97316]"
                    >
                      <Plus color="#ffffff" size={12} />
                    </Pressable>
                  </View>
                </View>

                {/* Ghi chú cho từng variant khi đã chọn */}
                {qty > 0 && (
                  <View className="mt-1.5">
                    <TextInput
                      value={fnbNotes[key] ?? ''}
                      onChangeText={(text) => onNoteChange(key, text)}
                      placeholder={`Ghi chú cho ${variant.name} (ví dụ: ít đá, ít ngọt...)`}
                      placeholderTextColor="#94a3b8"
                      maxLength={200}
                      className="h-7 rounded-lg border border-orange-200 dark:border-orange-900/60 bg-white dark:bg-slate-900 px-2 text-[10px] text-slate-800 dark:text-slate-100"
                    />
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ─── Main FnbStep ──────────────────────────────────────────────────────────────

export function FnbStep({
  cafeId,
  fnbQuantities,
  setFnbQuantities,
  fnbNotes,
  setFnbNotes,
}: FnbStepProps) {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [popularEntries, setPopularEntries] = useState<PopularMenuItemEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const [items, popular] = await Promise.all([
        bookingWizardApi.getCafeMenu(cafeId),
        bookingWizardApi.getCafeMenuPopular(cafeId),
      ]);
      setMenuItems(items);
      setPopularEntries(popular);
      setLoading(false);
    };
    fetchAll();
  }, [cafeId]);

  const handleQuantityChange = (key: string, delta: number) => {
    const currentQty = fnbQuantities[key] || 0;
    const newQty = Math.max(0, currentQty + delta);
    const updated = { ...fnbQuantities };
    if (newQty === 0) {
      delete updated[key];
      setFnbNotes((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } else {
      updated[key] = newQty;
    }
    setFnbQuantities(updated);
  };

  const handleNoteChange = (key: string, note: string) => {
    setFnbNotes((prev) => ({
      ...prev,
      [key]: note,
    }));
  };

  // Danh sách categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of menuItems) {
      if (item.categoryName) set.add(item.categoryName);
    }
    return ['ALL', ...Array.from(set)];
  }, [menuItems]);

  // Đếm số lượng món theo category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: menuItems.length };
    for (const item of menuItems) {
      const cat = item.categoryName ?? 'Chưa phân loại';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [menuItems]);

  // Danh sách popular items đã khớp với data menu
  const popularItems = useMemo(() => {
    const byId = new Map(menuItems.map((m) => [m.id, m]));
    return popularEntries
      .map((e) => ({ item: byId.get(e.menuItemId), orderCount: e.orderCount }))
      .filter((e): e is { item: MenuItem; orderCount: number } => e.item !== undefined);
  }, [menuItems, popularEntries]);

  // Thống kê giỏ món F&B đã chọn
  const totalSelectedStats = useMemo(() => {
    let count = 0;
    let price = 0;
    for (const [key, qty] of Object.entries(fnbQuantities)) {
      if (qty > 0) {
        count += qty;
        const [itemId, variantId] = key.split('__');
        const item = menuItems.find((m) => m.id === itemId);
        if (item) {
          let unitPrice = Number(item.price);
          if (variantId && item.variants) {
            const v = item.variants.find((v) => v.id === variantId);
            if (v) unitPrice = Number(v.price);
          }
          price += unitPrice * qty;
        }
      }
    }
    return { count, price };
  }, [fnbQuantities, menuItems]);

  // Lọc danh sách món theo Category & Search
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return menuItems.filter((item) => {
      if (selectedCategory !== 'ALL') {
        const itemCat = item.categoryName ?? 'Chưa phân loại';
        if (itemCat !== selectedCategory) return false;
      }
      if (q) {
        const nameMatch = item.name.toLowerCase().includes(q);
        const catMatch = (item.categoryName ?? '').toLowerCase().includes(q);
        const variantMatch = (item.variants ?? []).some((v) =>
          v.name.toLowerCase().includes(q)
        );
        return nameMatch || catMatch || variantMatch;
      }
      return true;
    });
  }, [menuItems, selectedCategory, searchQuery]);

  // Nhóm menu đã lọc theo categoryName
  const groupedMenu = useMemo(() => {
    const groups = new Map<string, MenuItem[]>();
    for (const item of filteredItems) {
      const cat = item.categoryName ?? 'Chưa phân loại';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(item);
    }
    return groups;
  }, [filteredItems]);

  const isFiltering = searchQuery.trim().length > 0 || selectedCategory !== 'ALL';

  return (
    <View className="space-y-3">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-0.5">
        <View className="flex-row items-center gap-1.5">
          <Coffee color="#f97316" size={15} />
          <Text className="text-[13px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold">
            Đặt trước F&B
          </Text>
        </View>
        <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
          Không bắt buộc
        </Text>
      </View>

      {/* Tóm tắt giỏ món đã chọn (Floating summary banner) */}
      {totalSelectedStats.count > 0 && (
        <View className="flex-row items-center justify-between bg-orange-500/10 dark:bg-orange-950/30 border border-orange-500/30 rounded-2xl px-3.5 py-2.5 mb-1 shadow-sm">
          <View className="flex-row items-center gap-2">
            <View className="h-6 w-6 rounded-full bg-[#ea580c] items-center justify-center">
              <ShoppingBag color="#ffffff" size={12} />
            </View>
            <Text className="text-[12px] font-bold text-orange-950 dark:text-orange-200">
              Đã chọn: <Text className="text-[#ea580c] font-black">{totalSelectedStats.count} món</Text>
            </Text>
          </View>
          <Text className="text-[13px] font-black text-[#ea580c]">
            {totalSelectedStats.price.toLocaleString('vi-VN')}đ
          </Text>
        </View>
      )}

      {/* Thanh tìm kiếm món */}
      {menuItems.length > 3 && (
        <View className="flex-row items-center rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] px-3 h-10 shadow-sm">
          <Search color="#94a3b8" size={15} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Tìm món ăn, đồ uống..."
            placeholderTextColor="#94a3b8"
            className="flex-1 px-2.5 text-[12px] text-slate-900 dark:text-white"
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery('')} className="p-1">
              <X color="#94a3b8" size={15} />
            </Pressable>
          ) : null}
        </View>
      )}

      {/* Category Pills Slider (Chuyển nhanh danh mục) */}
      {categories.length > 2 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="-mx-1 py-0.5"
          contentContainerStyle={{ paddingHorizontal: 4, gap: 6 }}
        >
          {categories.map((cat) => {
            const active = selectedCategory === cat;
            const label = cat === 'ALL' ? 'Tất cả' : cat;
            const count = categoryCounts[cat] || 0;

            return (
              <Pressable
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 border ${
                  active
                    ? 'border-[#ea580c] bg-[#ea580c]'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]'
                }`}
              >
                <Text
                  className={`text-[11px] font-bold ${
                    active ? 'text-white' : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {label}
                </Text>
                <View
                  className={`px-1.5 py-0.2 rounded-full ${
                    active ? 'bg-white/25' : 'bg-slate-100 dark:bg-slate-800'
                  }`}
                >
                  <Text
                    className={`text-[9px] font-bold ${
                      active ? 'text-white' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {loading ? (
        <ActivityIndicator size="small" color="#f97316" className="py-8" />
      ) : menuItems.length === 0 ? (
        <View className="bg-slate-100 dark:bg-slate-900/30 rounded-2xl p-6 border border-dashed border-slate-200 dark:border-slate-800 items-center justify-center">
          <Text className="text-[12px] text-slate-500 dark:text-slate-400 font-semibold">
            Không có món F&B khả dụng tại cơ sở này.
          </Text>
        </View>
      ) : (
        <View className="gap-4">
          {/* Section: Khách hay gọi (chỉ hiện khi đang xem Tất cả và không tìm kiếm) */}
          {!isFiltering && popularItems.length > 0 && (
            <View>
              <View className="flex-row items-center gap-1.5 mb-2">
                <Flame color="#f97316" size={13} />
                <Text className="text-[11px] text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider">
                  Khách ở đây hay gọi
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingRight: 4 }}
              >
                {popularItems.map(({ item, orderCount }) => (
                  <MenuItemCard
                    key={`popular-${item.id}`}
                    item={item}
                    fnbQuantities={fnbQuantities}
                    onChangeQty={handleQuantityChange}
                    fnbNotes={fnbNotes}
                    onNoteChange={handleNoteChange}
                    compact
                    orderCount={orderCount}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {/* Danh sách món ăn theo danh mục hoặc kết quả lọc */}
          {filteredItems.length === 0 ? (
            <View className="bg-slate-50 dark:bg-slate-900/40 rounded-2xl p-6 border border-dashed border-slate-200 dark:border-slate-800 items-center justify-center gap-2">
              <Coffee color="#94a3b8" size={26} />
              <Text className="text-[12px] text-slate-700 dark:text-slate-300 font-bold">
                Không tìm thấy món phù hợp
              </Text>
              <Text className="text-[10px] text-slate-400 text-center">
                Thử tìm với từ khóa khác hoặc bấm nút bên dưới để xem tất cả món.
              </Text>
              <Pressable
                onPress={() => {
                  setSearchQuery('');
                  setSelectedCategory('ALL');
                }}
                className="mt-2 px-3.5 py-1.5 rounded-xl bg-[#ea580c] active:bg-[#f97316]"
              >
                <Text className="text-[11px] font-bold text-white">Xem tất cả món</Text>
              </Pressable>
            </View>
          ) : (
            [...groupedMenu.entries()].map(([categoryName, items]) => (
              <View key={categoryName}>
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-[11px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                    {categoryName}
                  </Text>
                  <Text className="text-[10px] text-slate-400 font-semibold">
                    {items.length} món
                  </Text>
                </View>
                <View className="gap-2.5">
                  {items.map((item) => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      fnbQuantities={fnbQuantities}
                      onChangeQty={handleQuantityChange}
                      fnbNotes={fnbNotes}
                      onNoteChange={handleNoteChange}
                    />
                  ))}
                </View>
              </View>
            ))
          )}

          {/* Footer Note */}
          <Text className="text-[10px] text-slate-400 dark:text-slate-500 italic leading-4 text-center mt-1">
            Không bắt buộc — bạn vẫn có thể gọi thêm tại quán, nhưng sẽ phải chờ pha chế.
          </Text>
        </View>
      )}
    </View>
  );
}
