import { Stack } from 'expo-router';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { staffApi, type StaffSessionDetail } from '@/features/staff/api/staff.api';
import { StaffSessionTools } from '@/features/staff/components/StaffSessionTools';

jest.mock('@/features/staff/api/staff.api', () => ({
  staffApi: {
    getCafeMenu: jest.fn(),
    getCafeVehicles: jest.fn(),
    proposeExtension: jest.fn(),
    addSessionFnbOrder: jest.fn(),
    swapSessionVehicle: jest.fn(),
  },
}));

const session: StaffSessionDetail = {
  sessionId: 'session-1',
  bookingId: 'booking-1',
  cafeId: 'cafe-1',
  bookingSource: 'STAFF_MANUAL',
  status: 'ACTIVE',
  staffName: 'Staff',
  plannedEnd: '2030-01-01T10:00:00.000Z',
  participants: [],
  vehicles: [],
  inspections: [],
  fnbOrders: [],
};

function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

function StaffSessionRoute() {
  return (
    <StaffSessionTools
      session={session}
      onUpdated={jest.fn().mockResolvedValue(undefined)}
      operationalTiming={{
        state: 'ON_TIME',
        minutesUntilPlannedEnd: 30,
        minutesPastPlannedEnd: 0,
        isOverdue: false,
        shouldAlert: false,
      }}
    />
  );
}

describe('StaffSessionTools in Expo Router', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(staffApi.getCafeVehicles).mockResolvedValue([]);
    jest.mocked(staffApi.getCafeMenu).mockResolvedValue([
      { id: 'coffee', name: 'Cà phê sữa', price: 25_000 },
      { id: 'tea', name: 'Trà đào', price: 35_000 },
    ]);
  });

  it('keeps the root stack navigation context while changing dishes', async () => {
    await renderRouter(
      {
        _layout: RootLayout,
        'staff/session/[sessionId]': StaffSessionRoute,
      },
      { initialUrl: '/staff/session/session-1' }
    );

    await screen.findByLabelText('Chọn Trà đào');
    fireEvent.press(screen.getByLabelText('Chọn Trà đào'));

    await waitFor(() => {
      expect(screen.getByLabelText('Chọn Trà đào').props.accessibilityState.selected).toBe(true);
    });
  });
});
