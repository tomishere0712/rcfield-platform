import { ContestStatus } from '../../types';

const mockContestRepo = {
  findOne: jest.fn(),
};

jest.mock('../../config/database', () => ({
  AppDataSource: {
    getRepository: jest.fn((entity: { name?: string }) => {
      const name = entity?.name ?? '';
      if (name === 'Contest') return mockContestRepo;
      throw new Error(`Unexpected repository: ${name}`);
    }),
  },
}));

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { bookContestRental } from '../../services/contest-rental.service';

const slot = {
  cafe_id: 'cafe-1',
  slot_start: '2026-08-01T09:00:00+07:00',
  slot_end: '2026-08-01T10:00:00+07:00',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('bookContestRental (WF-A validation)', () => {
  it('throws CONTEST_NOT_FOUND when contest does not exist', async () => {
    mockContestRepo.findOne.mockResolvedValue(null);
    await expect(bookContestRental('contest-x', 'customer-1', slot)).rejects.toMatchObject({
      statusCode: 404,
      code: 'CONTEST_NOT_FOUND',
    });
  });

  it('throws CONTEST_NOT_OPEN when contest is not OPEN', async () => {
    mockContestRepo.findOne.mockResolvedValue({ id: 'contest-1', status: ContestStatus.DRAFT });
    await expect(bookContestRental('contest-1', 'customer-1', slot)).rejects.toMatchObject({
      statusCode: 400,
      code: 'CONTEST_NOT_OPEN',
    });
  });
});
