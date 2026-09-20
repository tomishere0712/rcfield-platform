import React from 'react';
import { View, Text, Image, TouchableOpacity } from 'react-native';
import { Calendar, MapPin, Users, Ticket } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import type { Contest } from '../types/contests.types';

interface ContestCardProps {
  contest: Contest;
  registeredCount?: number;
}

export const ContestCard: React.FC<ContestCardProps> = ({ contest, registeredCount = 0 }) => {
  const router = useRouter();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'bg-emerald-100 text-emerald-800';
      case 'CLOSED':
        return 'bg-amber-100 text-amber-800';
      case 'RUNNING':
        return 'bg-blue-100 text-blue-800 border border-blue-200';
      case 'COMPLETED':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'Đang mở đăng ký';
      case 'CLOSED':
        return 'Đóng đăng ký';
      case 'RUNNING':
        return 'Đang thi đấu';
      case 'COMPLETED':
        return 'Đã kết thúc';
      default:
        return status;
    }
  };

  const formatPrice = (price: number) => {
    if (price === undefined || price === null) return 'Miễn phí';
    if (price === 0) return 'Miễn phí';
    return `${price.toLocaleString('vi-VN')} VND`;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Chưa định ngày';
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const defaultBanner = 'https://images.unsplash.com/photo-1568605117036-5fecc6207a71?auto=format&fit=crop&w=600&q=80';
  const branchName = contest.host_branch?.cafe?.name || 'RC Field Branch';

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => router.push(`/customer/contest-detail/${contest.id}` as any)}
      className="mb-4 overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-[#0f172a]/60 shadow-sm"
    >
      {/* Banner */}
      <View className="relative h-44 w-full">
        <Image
          source={contest.banner_image_url ? { uri: contest.banner_image_url } : { uri: defaultBanner }}
          className="h-full w-full object-cover"
          resizeMode="cover"
        />
        {/* Status Tag */}
        <View className="absolute left-3 top-3">
          <View className={`rounded-full px-3 py-1 ${getStatusColor(contest.status)}`}>
            <Text className="text-[11px] font-extrabold uppercase tracking-wider">
              {getStatusText(contest.status)}
            </Text>
          </View>
        </View>
      </View>

      {/* Content */}
      <View className="p-4">
        {/* Title */}
        <Text className="mb-2 text-base font-extrabold text-gray-900 dark:text-white leading-tight" numberOfLines={2}>
          {contest.name}
        </Text>

        {/* Info Rows */}
        <View className="space-y-1.5 mb-4">
          <View className="flex-row items-center">
            <Calendar color="#94a3b8" size={14} style={{ marginRight: 8 }} />
            <Text className="text-xs font-semibold text-gray-600 dark:text-slate-400">
              {formatDate(contest.starts_at)}
            </Text>
          </View>

          <View className="flex-row items-center">
            <MapPin color="#94a3b8" size={14} style={{ marginRight: 8 }} />
            <Text className="text-xs font-semibold text-gray-600 dark:text-slate-400" numberOfLines={1}>
              {branchName}
            </Text>
          </View>

          <View className="flex-row items-center justify-between mt-1">
            <View className="flex-row items-center">
              <Users color="#94a3b8" size={14} style={{ marginRight: 8 }} />
              <Text className="text-xs font-semibold text-gray-600 dark:text-slate-400">
                Sức chứa: {contest.capacity ? `${contest.capacity} tay đua` : 'Không giới hạn'}
              </Text>
            </View>
            
            <View className="flex-row items-center">
              <Ticket color="#f97316" size={14} style={{ marginRight: 4 }} />
              <Text className="text-sm font-extrabold text-orange-600">
                {formatPrice(contest.entry_fee)}
              </Text>
            </View>
          </View>
        </View>

        {/* Action Button */}
        <View className="border-t border-gray-50 dark:border-slate-800/60 pt-3 flex-row justify-end items-center">
          <Text className="text-xs font-extrabold text-orange-500 mr-1">Xem chi tiết giải đấu</Text>
          <Text className="text-xs font-extrabold text-orange-500">→</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};
