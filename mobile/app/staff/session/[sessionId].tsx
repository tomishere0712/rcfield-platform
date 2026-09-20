import { useLocalSearchParams } from 'expo-router';

import { StaffSessionDetailScreen } from '@/features/staff/components/StaffSessionDetailScreen';

export default function StaffSessionRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId?: string | string[] }>();
  const normalizedSessionId = Array.isArray(sessionId) ? sessionId[0] : sessionId;

  return <StaffSessionDetailScreen sessionId={normalizedSessionId ?? ''} />;
}
