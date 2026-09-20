import { BookingStatus, ContestRegistrationStatus, UserRole } from '../../types';

const mockBookingRepo = {
  findOne: jest.fn(),
};
const mockTransition = jest.fn();
const mockWriteContestAudit = jest.fn();

jest.mock('../../config/database', () => ({
  AppDataSource: {
    getRepository: jest.fn((entity: { name?: string }) => {
      const name = entity?.name ?? '';
      if (name === 'Booking') return mockBookingRepo;
      throw new Error(`Unexpected repository: ${name}`);
    }),
    transaction: jest.fn(),
  },
}));

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../services/booking.service', () => ({
  transition: (...args: unknown[]) => mockTransition(...args),
}));

jest.mock('../../services/contest.helpers', () => ({
  writeContestAudit: (...args: unknown[]) => mockWriteContestAudit(...args),
}));

// contest.service pulls in many other modules; stub the side-effectful ones.
jest.mock('../../services/vnpay.service', () => ({ createPaymentUrl: jest.fn() }));
jest.mock('../../services/payment.service', () => ({ processMockConfirmation: jest.fn() }));
jest.mock('../../services/notification.service', () => ({ createNotification: jest.fn() }));
jest.mock('../../services/email.service', () => ({
  emailService: { sendContestRegistrationCreated: jest.fn() },
}));
jest.mock('../../services/contest-runtime.service', () => ({
  getContestPublicRuntimeSummary: jest.fn(),
}));
jest.mock('../../config/env', () => ({ env: {} }));

import { cleanupContestRentalBookingOnRegistrationCancel } from '../../services/contest.service';

const viewer = { userId: 'provider-1', role: UserRole.PROVIDER };

function registrationWithBooking(bookingId: string | null) {
  return {
    id: 'reg-1',
    contestId: 'contest-1',
    bookingId,
    status: ContestRegistrationStatus.CANCELLED,
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockWriteContestAudit.mockResolvedValue(undefined);
  mockTransition.mockResolvedValue(undefined);
});

describe('cleanupContestRentalBookingOnRegistrationCancel (WF-B)', () => {
  it('does nothing when registration has no booking', async () => {
    await cleanupContestRentalBookingOnRegistrationCancel(
      registrationWithBooking(null),
      viewer,
      'registration.cancelled',
    );
    expect(mockBookingRepo.findOne).not.toHaveBeenCalled();
    expect(mockTransition).not.toHaveBeenCalled();
  });

  it('cancels an unpaid (PENDING) contest booking and writes audit log', async () => {
    mockBookingRepo.findOne.mockResolvedValue({
      id: 'booking-1',
      contestId: 'contest-1',
      status: BookingStatus.PENDING,
    });
    await cleanupContestRentalBookingOnRegistrationCancel(
      registrationWithBooking('booking-1'),
      viewer,
      'registration.cancelled',
    );
    expect(mockTransition).toHaveBeenCalledWith('booking-1', 'PAYMENT_TIMEOUT');
    expect(mockWriteContestAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'booking.contest_rental_cancelled',
        metadata: { booking_id: 'booking-1', trigger: 'registration.cancelled' },
      }),
    );
  });

  it('keeps a paid (CONFIRMED) booking and only writes an audit log', async () => {
    mockBookingRepo.findOne.mockResolvedValue({
      id: 'booking-1',
      contestId: 'contest-1',
      status: BookingStatus.CONFIRMED,
    });
    await cleanupContestRentalBookingOnRegistrationCancel(
      registrationWithBooking('booking-1'),
      viewer,
      'registration.rejected',
    );
    expect(mockTransition).not.toHaveBeenCalled();
    expect(mockWriteContestAudit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'booking.contest_rental_retained' }),
    );
  });

  it('does nothing for an already-cancelled booking', async () => {
    mockBookingRepo.findOne.mockResolvedValue({
      id: 'booking-1',
      contestId: 'contest-1',
      status: BookingStatus.CANCELLED,
    });
    await cleanupContestRentalBookingOnRegistrationCancel(
      registrationWithBooking('booking-1'),
      viewer,
      'registration.cancelled',
    );
    expect(mockTransition).not.toHaveBeenCalled();
    expect(mockWriteContestAudit).not.toHaveBeenCalled();
  });

  it('ignores bookings that are not linked to a contest', async () => {
    mockBookingRepo.findOne.mockResolvedValue({
      id: 'booking-1',
      contestId: null,
      status: BookingStatus.PENDING,
    });
    await cleanupContestRentalBookingOnRegistrationCancel(
      registrationWithBooking('booking-1'),
      viewer,
      'registration.cancelled',
    );
    expect(mockTransition).not.toHaveBeenCalled();
  });
});
