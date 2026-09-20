import { isRangeWithinOperatingHours } from '../../lib/vietnam-time';
import type { CafeOperatingHours } from '../../types';

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function weekly(open: string, close: string): CafeOperatingHours {
  return DAYS.reduce((hours, day) => {
    hours[day] = { open, close, is_closed: false };
    return hours;
  }, {} as CafeOperatingHours);
}

/** Mốc giờ Việt Nam, không phụ thuộc múi giờ của máy chạy test. */
const vn = (isoDate: string, time: string) => new Date(`${isoDate}T${time}:00+07:00`);

describe('isRangeWithinOperatingHours', () => {
  describe('quán mở 24/7 (00:00–24:00 mọi ngày)', () => {
    const hours = weekly('00:00', '24:00');

    it('chấp nhận khoảng nằm gọn trong một ngày', () => {
      expect(
        isRangeWithinOperatingHours(hours, vn('2026-08-12', '10:00'), vn('2026-08-12', '11:00')),
      ).toBe(true);
    });

    /*
      Đây là ca gây ra lỗi CI ngẫu nhiên: gia hạn một phiên kết thúc lúc 00:00
      thêm 15 phút. Quán mở suốt ngày đêm nên phải cho phép, nhưng phép kiểm cũ
      chỉ so với giờ đóng của MỘT ngày nên coi là vượt giờ.
    */
    it('chấp nhận khoảng vắt qua nửa đêm', () => {
      expect(
        isRangeWithinOperatingHours(hours, vn('2026-08-12', '23:00'), vn('2026-08-13', '00:15')),
      ).toBe(true);
    });

    it('chấp nhận khoảng vắt qua nhiều ngày', () => {
      expect(
        isRangeWithinOperatingHours(hours, vn('2026-08-12', '22:00'), vn('2026-08-14', '02:00')),
      ).toBe(true);
    });
  });

  describe('quán mở 09:00–22:00', () => {
    const hours = weekly('09:00', '22:00');

    it('chấp nhận khoảng trong giờ mở cửa', () => {
      expect(
        isRangeWithinOperatingHours(hours, vn('2026-08-12', '20:00'), vn('2026-08-12', '21:30')),
      ).toBe(true);
    });

    it('từ chối khoảng vượt quá giờ đóng cửa', () => {
      expect(
        isRangeWithinOperatingHours(hours, vn('2026-08-12', '21:00'), vn('2026-08-12', '22:30')),
      ).toBe(false);
    });

    it('từ chối khoảng bắt đầu trước giờ mở cửa', () => {
      expect(
        isRangeWithinOperatingHours(hours, vn('2026-08-12', '08:00'), vn('2026-08-12', '10:00')),
      ).toBe(false);
    });

    it('không nối được qua đêm vì có khoảng đóng cửa 22:00–09:00', () => {
      expect(
        isRangeWithinOperatingHours(hours, vn('2026-08-12', '21:00'), vn('2026-08-13', '10:00')),
      ).toBe(false);
    });
  });

  describe('quán bán qua đêm (20:00–02:00)', () => {
    const hours = weekly('20:00', '02:00');

    it('chấp nhận khoảng vắt qua nửa đêm trong cùng ca', () => {
      expect(
        isRangeWithinOperatingHours(hours, vn('2026-08-12', '23:00'), vn('2026-08-13', '01:00')),
      ).toBe(true);
    });

    it('từ chối khoảng rơi vào giờ nghỉ ban ngày', () => {
      expect(
        isRangeWithinOperatingHours(hours, vn('2026-08-13', '10:00'), vn('2026-08-13', '11:00')),
      ).toBe(false);
    });
  });

  it('từ chối khi ngày đó quán nghỉ', () => {
    const hours = { ...weekly('09:00', '22:00'), wed: { is_closed: true } } as CafeOperatingHours;
    // 2026-08-12 là thứ Tư
    expect(
      isRangeWithinOperatingHours(hours, vn('2026-08-12', '10:00'), vn('2026-08-12', '11:00')),
    ).toBe(false);
  });

  it('từ chối khi chưa khai giờ hoạt động', () => {
    expect(
      isRangeWithinOperatingHours(null, vn('2026-08-12', '10:00'), vn('2026-08-12', '11:00')),
    ).toBe(false);
  });
});
