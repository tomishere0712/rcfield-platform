import { Contest } from '../../models/contest.entity';
import { BookingSource } from '../../types';
import {
  applyContestRentalPricing,
  DEFAULT_CONTEST_RENTAL_POLICY,
  getContestRentalPolicy,
} from '../../services/contest-rental.service';

function contestWithConfig(config: Record<string, unknown>): Pick<Contest, 'config'> {
  return { config } as Pick<Contest, 'config'>;
}

describe('getContestRentalPolicy', () => {
  it('returns defaults when contest has no config', () => {
    expect(getContestRentalPolicy(contestWithConfig({}))).toEqual(DEFAULT_CONTEST_RENTAL_POLICY);
    expect(getContestRentalPolicy(null)).toEqual(DEFAULT_CONTEST_RENTAL_POLICY);
    expect(getContestRentalPolicy(undefined)).toEqual(DEFAULT_CONTEST_RENTAL_POLICY);
  });

  it('returns defaults when rental_policy is missing', () => {
    expect(getContestRentalPolicy(contestWithConfig({ other: 1 }))).toEqual(
      DEFAULT_CONTEST_RENTAL_POLICY,
    );
  });

  it('parses a full valid policy', () => {
    const policy = getContestRentalPolicy(
      contestWithConfig({
        rental_policy: {
          waive_slot_fee: true,
          deposit_mode: 'REDUCED',
          deposit_percent: 30,
          slot_window: { before_min: 120, after_min: 45 },
        },
      }),
    );
    expect(policy).toEqual({
      waive_slot_fee: true,
      deposit_mode: 'REDUCED',
      deposit_percent: 30,
      slot_window: { before_min: 120, after_min: 45 },
    });
  });

  it('accepts lowercase deposit_mode', () => {
    const policy = getContestRentalPolicy(
      contestWithConfig({ rental_policy: { deposit_mode: 'waived' } }),
    );
    expect(policy.deposit_mode).toBe('WAIVED');
  });

  it('falls back per-field on bad values', () => {
    const policy = getContestRentalPolicy(
      contestWithConfig({
        rental_policy: {
          waive_slot_fee: 'yes', // not a boolean true
          deposit_mode: 'FREE', // unknown mode
          deposit_percent: 150, // out of range
          slot_window: { before_min: -5, after_min: 'abc' },
        },
      }),
    );
    expect(policy).toEqual(DEFAULT_CONTEST_RENTAL_POLICY);
  });

  it('keeps valid fields while defaulting invalid ones', () => {
    const policy = getContestRentalPolicy(
      contestWithConfig({
        rental_policy: {
          waive_slot_fee: true,
          deposit_mode: 'REDUCED',
          deposit_percent: -10,
          slot_window: { before_min: 90 },
        },
      }),
    );
    expect(policy.waive_slot_fee).toBe(true);
    expect(policy.deposit_mode).toBe('REDUCED');
    expect(policy.deposit_percent).toBe(50);
    expect(policy.slot_window).toEqual({ before_min: 90, after_min: 60 });
  });
});

describe('applyContestRentalPricing', () => {
  const contestBooking = { contestId: 'contest-1', source: BookingSource.CONTEST };

  it('returns identity adjustments for regular bookings', () => {
    const result = applyContestRentalPricing(
      { contestId: null, source: BookingSource.APP },
      { ...DEFAULT_CONTEST_RENTAL_POLICY, waive_slot_fee: true, deposit_mode: 'WAIVED' },
    );
    expect(result).toEqual({ waiveSlotFee: false, depositMultiplier: 1 });
  });

  it('FULL mode keeps the full deposit', () => {
    const result = applyContestRentalPricing(contestBooking, DEFAULT_CONTEST_RENTAL_POLICY);
    expect(result).toEqual({ waiveSlotFee: false, depositMultiplier: 1 });
  });

  it('WAIVED mode zeroes the deposit and waives the slot fee', () => {
    const result = applyContestRentalPricing(contestBooking, {
      ...DEFAULT_CONTEST_RENTAL_POLICY,
      waive_slot_fee: true,
      deposit_mode: 'WAIVED',
    });
    expect(result).toEqual({ waiveSlotFee: true, depositMultiplier: 0 });
  });

  it('REDUCED mode multiplies the deposit by deposit_percent', () => {
    const result = applyContestRentalPricing(contestBooking, {
      ...DEFAULT_CONTEST_RENTAL_POLICY,
      deposit_mode: 'REDUCED',
      deposit_percent: 40,
    });
    expect(result).toEqual({ waiveSlotFee: false, depositMultiplier: 0.4 });
  });

  it('treats source=CONTEST without contestId as a contest booking', () => {
    const result = applyContestRentalPricing(
      { contestId: null, source: BookingSource.CONTEST },
      { ...DEFAULT_CONTEST_RENTAL_POLICY, deposit_mode: 'WAIVED' },
    );
    expect(result.depositMultiplier).toBe(0);
  });

  it('end-to-end: parsed policy feeds pricing adjustments', () => {
    const policy = getContestRentalPolicy(
      contestWithConfig({
        rental_policy: { waive_slot_fee: true, deposit_mode: 'REDUCED', deposit_percent: 25 },
      }),
    );
    expect(applyContestRentalPricing(contestBooking, policy)).toEqual({
      waiveSlotFee: true,
      depositMultiplier: 0.25,
    });
  });
});
