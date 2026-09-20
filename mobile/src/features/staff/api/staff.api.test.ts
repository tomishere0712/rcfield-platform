import { api } from '@/shared/lib/api';
import { staffApi } from '@/features/staff/api/staff.api';

jest.mock('@/shared/lib/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

describe('staffApi.getCafeMenu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes malformed variants before the menu reaches the screen', async () => {
    jest.mocked(api.get).mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 'coffee',
            name: 'Cà phê sữa',
            price: '25000.00',
            variants: { id: 'not-an-array' },
          },
          {
            id: 'tea',
            name: 'Trà đào',
            price: '35000.00',
            variants: [
              { id: 'large', name: 'Lớn', price: '40000.00', isAvailable: true },
              null,
            ],
          },
          null,
        ],
      },
    });

    await expect(staffApi.getCafeMenu('cafe-1')).resolves.toEqual([
      expect.objectContaining({ id: 'coffee', price: 25_000, variants: [] }),
      expect.objectContaining({
        id: 'tea',
        price: 35_000,
        variants: [expect.objectContaining({ id: 'large', price: 40_000 })],
      }),
    ]);
  });
});
