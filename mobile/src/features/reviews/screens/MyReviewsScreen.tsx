import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import {
  ChevronLeft,
  MapPin,
  Star,
  Calendar,
  MessageSquare,
} from 'lucide-react-native';

import { getMyReviews } from '@/features/reviews/api/review.api';
import { useAuthStore } from '@/shared/store/auth-store';
import { Text } from '@/shared/ui/Text';

export function MyReviewsScreen() {
  const { colorScheme } = useColorScheme();
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchReviews = useCallback(
    async (pageNum = 1, isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else if (pageNum === 1) {
        setLoading(true);
      }

      try {
        const result = await getMyReviews(pageNum, 20);
        if (pageNum === 1) {
          setReviews(result.data);
        } else {
          setReviews((prev) => [...prev, ...result.data]);
        }
        setTotal(result.total);
        setPage(pageNum);
      } catch (error) {
        console.error('[MyReviewsScreen] Fetch error:', error);
        Alert.alert('Lỗi', 'Không thể tải danh sách đánh giá của bạn.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    fetchReviews(1);
  }, [isAuthenticated, fetchReviews]);

  const handleRefresh = () => {
    fetchReviews(1, true);
  };

  const handleLoadMore = () => {
    if (reviews.length < total && !loading && !refreshing) {
      fetchReviews(page + 1);
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      const date = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${date}/${month}/${year}`;
    } catch {
      return '';
    }
  };

  const renderReviewItem = ({ item }: { item: any }) => {
    const overallScore = Number(item.overallScore || item.rating || 5);
    const hasScores = item.vehicleScore !== null || item.staffScore !== null || item.facilityScore !== null;

    return (
      <View className="mb-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 p-4 shadow-sm">
        {/* 1. Sao đánh giá */}
        <View className="flex-row gap-0.5 mb-2.5">
          {[1, 2, 3, 4, 5].map((s) => (
            <Star
              key={s}
              color="#f59e0b"
              fill={s <= overallScore ? '#f59e0b' : 'transparent'}
              size={15}
            />
          ))}
        </View>

        {/* 2. Chi nhánh đánh giá */}
        <View className="flex-row items-center gap-1.5 mb-2.5">
          <MapPin color="#f97316" size={14} />
          <Text className="text-[13px] text-slate-800 dark:text-slate-200 font-bold">
            {item.cafeName || 'Chi nhánh RC Field'}
          </Text>
        </View>

        {/* 3. Nhận xét */}
        {item.note ? (
          <Text className="text-[13px] text-slate-600 dark:text-slate-350 italic leading-5 font-semibold mb-3">
            &quot;{item.note}&quot;
          </Text>
        ) : (
          <Text className="text-[13px] text-slate-400 dark:text-slate-500 italic leading-5 font-semibold mb-3">
            Không có nhận xét viết tay
          </Text>
        )}

        {/* 4. Điểm chi tiết (Xe, Nhân viên, Cơ sở) */}
        {hasScores && (
          <View className="flex-row flex-wrap gap-1.5 mb-3">
            {item.vehicleScore !== null && item.vehicleScore !== undefined && (
              <View className="rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-150 dark:border-slate-800 px-2.5 py-0.5">
                <Text className="text-[10px] text-slate-600 dark:text-slate-300 font-bold">
                  Xe: {item.vehicleScore}/5
                </Text>
              </View>
            )}
            {item.staffScore !== null && item.staffScore !== undefined && (
              <View className="rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-150 dark:border-slate-800 px-2.5 py-0.5">
                <Text className="text-[10px] text-slate-600 dark:text-slate-300 font-bold">
                  Nhân viên: {item.staffScore}/5
                </Text>
              </View>
            )}
            {item.facilityScore !== null && item.facilityScore !== undefined && (
              <View className="rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-150 dark:border-slate-800 px-2.5 py-0.5">
                <Text className="text-[10px] text-slate-600 dark:text-slate-300 font-bold">
                  Cơ sở: {item.facilityScore}/5
                </Text>
              </View>
            )}
          </View>
        )}

        {/* 5. Ngày đánh giá */}
        <View className="flex-row items-center gap-1.5 mt-1">
          <Calendar color="#94a3b8" size={13} />
          <Text className="text-[11px] text-slate-400 dark:text-slate-500 font-semibold">
            {formatDate(item.createdAt)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-grow flex-1 bg-[#f8fafc] dark:bg-[#0b0f19]" edges={['top', 'left', 'right']}>
      {/* Background Glows */}
      <View className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-[#f97316]/5 dark:bg-[#f97316]/10 blur-3xl pointer-events-none" />
      <View className="absolute bottom-10 -left-20 w-80 h-80 rounded-full bg-[#6366f1]/5 dark:bg-[#6366f1]/10 blur-3xl pointer-events-none" />

      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-slate-200 dark:border-slate-800/80">
        <Pressable
          onPress={() => router.back()}
          className="size-9 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-900 active:bg-slate-200 dark:active:bg-slate-800"
        >
          <ChevronLeft color={colorScheme === 'dark' ? '#94a3b8' : '#64748b'} size={20} />
        </Pressable>
        <Text className="ml-3 text-[17px] text-slate-900 dark:text-white" weight="700">
          Đánh giá & Phản hồi của tôi
        </Text>
      </View>

      {/* Content */}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(item) => item.id}
          renderItem={renderReviewItem}
          contentContainerClassName="px-5 py-5 pb-10"
          showsVerticalScrollIndicator={false}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#f97316']}
              tintColor="#f97316"
            />
          }
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center py-20">
              <View className="size-16 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 justify-center items-center mb-4">
                <MessageSquare color="#ea580c" size={24} />
              </View>
              <Text className="text-slate-800 dark:text-slate-200 text-sm font-bold text-center">
                Bạn chưa viết đánh giá nào
              </Text>
              <Text className="mt-1 text-slate-500 dark:text-slate-400 text-xs text-center leading-4 font-semibold max-w-xs">
                Khi bạn hoàn tất một lịch đặt sân chơi, bạn sẽ có thể gửi đánh giá dịch vụ cho chi nhánh đó.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
