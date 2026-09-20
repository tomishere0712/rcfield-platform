import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { StaffInspectionFormScreen } from '@/features/staff/components/StaffInspectionFormScreen';
import type { StaffInspectionType } from '@/features/staff/api/staff.api';
import { Text } from '@/shared/ui/Text';

export default function StaffInspectionRoute() {
  const { sessionId, type } = useLocalSearchParams<{
    sessionId?: string | string[];
    type?: string | string[];
  }>();

  const normalizedSessionId = Array.isArray(sessionId) ? sessionId[0] : sessionId;
  const normalizedType = Array.isArray(type) ? type[0] : type;

  if (!normalizedSessionId || (normalizedType !== 'CHECK_IN' && normalizedType !== 'CHECK_OUT')) {
    return (
      <View className="flex-1 items-center justify-center bg-[#0b0f19] px-6">
        <Text className="text-center text-[15px] text-white" weight="700">
          Thiếu thông tin biên bản
        </Text>
        <Text className="mt-1 text-center text-[12px] text-slate-500">
          Vui lòng quay lại phiên chạy và chọn lại thao tác kiểm xe.
        </Text>
      </View>
    );
  }

  return (
    <StaffInspectionFormScreen
      sessionId={normalizedSessionId}
      type={normalizedType as StaffInspectionType}
    />
  );
}
