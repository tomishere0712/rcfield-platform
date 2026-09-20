import { ContestRegistrationStatus, ContestStatus } from '../../types';

const mockRegistrationRepo = {
  findOne: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
};
const mockAuditRepo = {
  create: jest.fn((payload: unknown) => payload),
  save: jest.fn(),
};
const mockContestRepo = {
  findOne: jest.fn(),
};
const mockBanRepo = {
  find: jest.fn(),
};

jest.mock('../../config/database', () => ({
  AppDataSource: {
    getRepository: jest.fn((entity: { name?: string }) => {
      const name = entity?.name ?? '';
      if (name === 'ContestRegistration') return mockRegistrationRepo;
      if (name === 'ContestAuditLog') return mockAuditRepo;
      if (name === 'Contest') return mockContestRepo;
      if (name === 'ContestBan') return mockBanRepo;
      throw new Error(`Unexpected repository: ${name}`);
    }),
  },
}));

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  logContestVehicleCheckedOut,
  syncContestRegistrationOnVehicleCheckIn,
} from '../../services/contest-rental.service';

const contestBooking = {
  id: 'booking-1',
  contestId: 'contest-1',
  cafeId: 'cafe-1',
};

beforeEach(() => {
  jest.clearAllMocks();
  // Default: the atomic CONFIRMED → CHECKED_IN conditional update hits one row.
  mockRegistrationRepo.update.mockResolvedValue({ affected: 1 });
  // Default: no active contest bans.
  mockBanRepo.find.mockResolvedValue([]);
  // Default: a check-in ready contest (RUNNING, inside the time window, no entry fee).
  mockContestRepo.findOne.mockResolvedValue({
    id: 'contest-1',
    status: ContestStatus.RUNNING,
    startsAt: new Date(Date.now() - 60 * 60 * 1000),
    endsAt: new Date(Date.now() + 60 * 60 * 1000),
    entryFee: 0,
  });
});

describe('syncContestRegistrationOnVehicleCheckIn', () => {
  it('returns null for non-contest bookings', async () => {
    const result = await syncContestRegistrationOnVehicleCheckIn(
      { ...contestBooking, contestId: null },
      { staffUserId: 'staff-1' },
    );
    expect(result).toBeNull();
    expect(mockRegistrationRepo.findOne).not.toHaveBeenCalled();
  });

  it('skips when no registration is linked to the booking', async () => {
    mockRegistrationRepo.findOne.mockResolvedValue(null);
    const result = await syncContestRegistrationOnVehicleCheckIn(contestBooking, {
      staffUserId: 'staff-1',
    });
    expect(result).toEqual({ registrationId: null, synced: false, previousStatus: null });
    expect(mockRegistrationRepo.save).not.toHaveBeenCalled();
  });

  it('transitions a CONFIRMED registration to CHECKED_IN and writes an audit log', async () => {
    const registration = {
      id: 'reg-1',
      status: ContestRegistrationStatus.CONFIRMED,
      checkedInCafeId: null,
      checkedInBy: null,
      checkedInAt: null,
    };
    mockRegistrationRepo.findOne.mockResolvedValue(registration);

    const result = await syncContestRegistrationOnVehicleCheckIn(contestBooking, {
      staffUserId: 'staff-1',
    });

    expect(result).toEqual({
      registrationId: 'reg-1',
      synced: true,
      previousStatus: ContestRegistrationStatus.CONFIRMED,
    });
    expect(mockRegistrationRepo.update).toHaveBeenCalledWith(
      { id: 'reg-1', status: ContestRegistrationStatus.CONFIRMED },
      expect.objectContaining({
        status: ContestRegistrationStatus.CHECKED_IN,
        checkedInCafeId: 'cafe-1',
        checkedInBy: 'staff-1',
        checkedInAt: expect.any(Function),
      }),
    );
    expect(mockRegistrationRepo.save).not.toHaveBeenCalled();
    expect(mockAuditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        contestId: 'contest-1',
        registrationId: 'reg-1',
        actorId: 'staff-1',
        eventType: 'registration.checked_in',
        beforeJson: { status: ContestRegistrationStatus.CONFIRMED },
        afterJson: { status: ContestRegistrationStatus.CHECKED_IN, checkedInCafeId: 'cafe-1' },
      }),
    );
  });

  it('is a no-op when the registration is already CHECKED_IN', async () => {
    mockRegistrationRepo.findOne.mockResolvedValue({
      id: 'reg-1',
      status: ContestRegistrationStatus.CHECKED_IN,
    });
    const result = await syncContestRegistrationOnVehicleCheckIn(contestBooking, {
      staffUserId: 'staff-1',
    });
    expect(result).toEqual({
      registrationId: 'reg-1',
      synced: false,
      previousStatus: ContestRegistrationStatus.CHECKED_IN,
    });
    expect(mockRegistrationRepo.save).not.toHaveBeenCalled();
  });

  it('returns synced=false when a concurrent check-in already transitioned the row', async () => {
    mockRegistrationRepo.findOne.mockResolvedValue({
      id: 'reg-1',
      status: ContestRegistrationStatus.CONFIRMED,
      paymentStatus: 'NOT_REQUIRED',
    });
    // Simulate the race: the conditional UPDATE ... WHERE status='CONFIRMED'
    // matches 0 rows because someone else checked the registration in first.
    mockRegistrationRepo.update.mockResolvedValue({ affected: 0 });

    const result = await syncContestRegistrationOnVehicleCheckIn(contestBooking, {
      staffUserId: 'staff-1',
    });

    expect(result).toEqual({
      registrationId: 'reg-1',
      synced: false,
      previousStatus: ContestRegistrationStatus.CONFIRMED,
    });
    expect(mockRegistrationRepo.update).toHaveBeenCalled();
    expect(mockAuditRepo.save).not.toHaveBeenCalled();
  });

  it('does not block check-in for unexpected statuses (e.g. PENDING)', async () => {
    mockRegistrationRepo.findOne.mockResolvedValue({
      id: 'reg-1',
      status: ContestRegistrationStatus.PENDING,
    });
    const result = await syncContestRegistrationOnVehicleCheckIn(contestBooking, {
      staffUserId: 'staff-1',
    });
    expect(result).toEqual({
      registrationId: 'reg-1',
      synced: false,
      previousStatus: ContestRegistrationStatus.PENDING,
    });
    expect(mockRegistrationRepo.save).not.toHaveBeenCalled();
    expect(mockAuditRepo.save).not.toHaveBeenCalled();
  });

  it('keeps registration CONFIRMED when the entry fee is unpaid', async () => {
    mockContestRepo.findOne.mockResolvedValue({
      id: 'contest-1',
      status: ContestStatus.RUNNING,
      startsAt: new Date(Date.now() - 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 60 * 60 * 1000),
      entryFee: 100000,
    });
    const registration = {
      id: 'reg-1',
      status: ContestRegistrationStatus.CONFIRMED,
      paymentStatus: 'PENDING_PAYMENT',
    };
    mockRegistrationRepo.findOne.mockResolvedValue(registration);

    const result = await syncContestRegistrationOnVehicleCheckIn(contestBooking, {
      staffUserId: 'staff-1',
    });

    expect(result).toEqual({
      registrationId: 'reg-1',
      synced: false,
      previousStatus: ContestRegistrationStatus.CONFIRMED,
    });
    expect(registration.status).toBe(ContestRegistrationStatus.CONFIRMED);
    expect(mockRegistrationRepo.save).not.toHaveBeenCalled();
    expect(mockAuditRepo.save).not.toHaveBeenCalled();
  });

  it('skips the sync when the participant is banned from the contest', async () => {
    mockContestRepo.findOne.mockResolvedValue({
      id: 'contest-1',
      providerId: 'provider-1',
      status: ContestStatus.RUNNING,
      startsAt: new Date(Date.now() - 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 60 * 60 * 1000),
      entryFee: 0,
    });
    mockRegistrationRepo.findOne.mockResolvedValue({
      id: 'reg-1',
      userId: 'customer-1',
      status: ContestRegistrationStatus.CONFIRMED,
      paymentStatus: 'NOT_REQUIRED',
    });
    mockBanRepo.find.mockResolvedValue([
      {
        userId: 'customer-1',
        providerId: 'provider-1',
        contestId: 'contest-1',
        scopeType: 'CONTEST',
        liftedAt: null,
        expiresAt: null,
      },
    ]);

    const result = await syncContestRegistrationOnVehicleCheckIn(contestBooking, {
      staffUserId: 'staff-1',
    });

    expect(result).toEqual({
      registrationId: 'reg-1',
      synced: false,
      previousStatus: ContestRegistrationStatus.CONFIRMED,
    });
    expect(mockRegistrationRepo.update).not.toHaveBeenCalled();
    expect(mockAuditRepo.save).not.toHaveBeenCalled();
  });

  it('keeps registration CONFIRMED when the contest is not check-in ready', async () => {
    mockContestRepo.findOne.mockResolvedValue({
      id: 'contest-1',
      status: ContestStatus.OPEN,
      startsAt: new Date(Date.now() - 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 60 * 60 * 1000),
      entryFee: 0,
    });
    const registration = {
      id: 'reg-1',
      status: ContestRegistrationStatus.CONFIRMED,
      paymentStatus: 'NOT_REQUIRED',
    };
    mockRegistrationRepo.findOne.mockResolvedValue(registration);

    const result = await syncContestRegistrationOnVehicleCheckIn(contestBooking, {
      staffUserId: 'staff-1',
    });

    expect(result).toEqual({
      registrationId: 'reg-1',
      synced: false,
      previousStatus: ContestRegistrationStatus.CONFIRMED,
    });
    expect(registration.status).toBe(ContestRegistrationStatus.CONFIRMED);
    expect(mockRegistrationRepo.save).not.toHaveBeenCalled();
    expect(mockAuditRepo.save).not.toHaveBeenCalled();
  });
});

describe('logContestVehicleCheckedOut', () => {
  it('does nothing for non-contest bookings', async () => {
    await logContestVehicleCheckedOut({ id: 'booking-1', contestId: null }, { id: 'session-1' });
    expect(mockAuditRepo.save).not.toHaveBeenCalled();
  });

  it('writes an audit entry with booking/session/registration metadata', async () => {
    mockRegistrationRepo.findOne.mockResolvedValue({ id: 'reg-1' });
    await logContestVehicleCheckedOut(contestBooking, { id: 'session-1' });
    expect(mockAuditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        contestId: 'contest-1',
        registrationId: 'reg-1',
        eventType: 'booking.vehicle_checked_out',
        metadata: {
          booking_id: 'booking-1',
          session_id: 'session-1',
          registration_id: 'reg-1',
        },
      }),
    );
  });

  it('still writes an audit entry when no registration exists', async () => {
    mockRegistrationRepo.findOne.mockResolvedValue(null);
    await logContestVehicleCheckedOut(contestBooking, { id: 'session-1' });
    expect(mockAuditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationId: null,
        metadata: expect.objectContaining({ registration_id: null }),
      }),
    );
  });
});
