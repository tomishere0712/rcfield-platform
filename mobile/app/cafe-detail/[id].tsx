import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { CafeDetailScreen } from '@/features/explore/components/CafeDetailScreen';
import { View } from 'react-native';
import { Text } from '@/shared/ui/Text';

export default function CafeDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  if (!id) {
    return (
      <View className="flex-1 bg-[#0b0f19] items-center justify-center p-5">
        <Text className="text-[14px] text-red-500 font-bold">
          Thiếu mã chi nhánh! Không thể hiển thị chi tiết.
        </Text>
      </View>
    );
  }

  return <CafeDetailScreen cafeId={id} />;
}
