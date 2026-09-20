import { AppDataSource } from '../../config/database';
import { handler as checkAvailability } from '../../services/chat-tools/check-availability';
import { ContestResourceScope, ContestStatus } from '../../types';
import { createTestCafe } from '../helpers';

/**
 * Công cụ tra chỗ trống phải biết tới giải đấu.
 *
 * ── Lỗi mà test này khoá lại ────────────────────────────────────────────────
 *
 * `check_availability` chỉ đếm bảng `bookings`, hoàn toàn không tra khoá tài
 * nguyên của giải đấu. Trong khi `createBooking` lại gọi
 * `assertBookingNotBlockedByContest` và ném `CONTEST_SLOT_LOCKED`.
 *
 * Kết quả: chatbot báo "còn slot 19:00", khách khai xong tên, số điện thoại,
 * chọn xe, gõ xác nhận — rồi backend từ chối ở bước cuối. Hứa xong nuốt lời là
 * kiểu hỏng tệ hơn nhiều so với báo hết chỗ ngay từ câu đầu.
 *
 * Lỗi có từ trước feature `020` (widget web cũng dính), nhưng `020` làm nó nặng
 * hơn hẳn vì giờ chatbot chốt đơn chứ không chỉ trả lời câu hỏi.
 */
describe('chat-tools: tra chỗ trống phải trừ khung giờ giải đấu giữ', () => {
  /** Ngày mai theo giờ Việt Nam — công cụ bỏ qua mọi khung giờ đã trôi qua. */
  function tomorrowInVn(): string {
    const vnNow = new Date(Date.now() + 7 * 3600_000);
    vnNow.setUTCDate(vnNow.getUTCDate() + 1);
    return vnNow.toISOString().slice(0, 10);
  }

  async function seedContest(opts: {
    cafeId: string;
    date: string;
    scope: ContestResourceScope;
    status?: ContestStatus;
  }) {
    const [trackType] = await AppDataSource.query(`SELECT id FROM track_types LIMIT 1`);
    const [provider] = await AppDataSource.query(
      `SELECT provider_id AS id FROM cafes WHERE id = $1`,
      [opts.cafeId],
    );

    const config = {
      resource_locks: [{ cafe_id: opts.cafeId, scope: opts.scope, track_config_ids: [] }],
    };

    const [contest] = await AppDataSource.query(
      `INSERT INTO contests (cafe_id, provider_id, name, track_type, track_type_id,
                             starts_at, ends_at, capacity, entry_fee, status, config, created_by)
       VALUES ($1, $2, 'Giải Thử', 'DRIFT', $3,
               $4::timestamptz, $5::timestamptz, 16, 0, $6, $7::jsonb, $2)
       RETURNING id`,
      [
        opts.cafeId,
        provider.id,
        trackType.id,
        `${opts.date}T00:00:00+07:00`,
        `${opts.date}T23:59:59+07:00`,
        opts.status ?? ContestStatus.OPEN,
        JSON.stringify(config),
      ],
    );

    await AppDataSource.query(
      `INSERT INTO contest_cafes (contest_id, cafe_id, role, display_order, check_in_enabled)
       VALUES ($1, $2, 'HOST', 0, true)`,
      [contest.id, opts.cafeId],
    );
    return contest.id as string;
  }

  it('BÁO HẾT CHỖ khi giải đấu giữ cả chi nhánh trong ngày đó', async () => {
    const cafe = await createTestCafe();
    const date = tomorrowInVn();

    // Trước khi có giải: phải còn chỗ, nếu không thì test sau không chứng minh
    // được điều gì.
    const before = JSON.parse(await checkAvailability(cafe.id, { date }));
    expect(before.available).toBe(true);

    await seedContest({ cafeId: cafe.id, date, scope: ContestResourceScope.FULL_BRANCH });

    const after = JSON.parse(await checkAvailability(cafe.id, { date }));

    expect(after.available).toBe(false);
    expect(after.reason).toBe('CONTEST_RESERVED');
    // Nói rõ tên giải, để model giải thích được cho khách thay vì chỉ nói "hết chỗ".
    expect(after.message).toContain('Giải Thử');
  });

  it('giải đấu ĐÃ HUỶ thì không chiếm chỗ', async () => {
    const cafe = await createTestCafe();
    const date = tomorrowInVn();

    await seedContest({
      cafeId: cafe.id,
      date,
      scope: ContestResourceScope.FULL_BRANCH,
      status: ContestStatus.CANCELLED,
    });

    const result = JSON.parse(await checkAvailability(cafe.id, { date }));
    expect(result.available).toBe(true);
  });

  it('giải chỉ giữ MỘT SỐ đường đua thì vẫn còn chỗ, kèm lời nhắc', async () => {
    const cafe = await createTestCafe();
    const date = tomorrowInVn();

    await seedContest({ cafeId: cafe.id, date, scope: ContestResourceScope.SELECTED_TRACKS });

    const result = JSON.parse(await checkAvailability(cafe.id, { date }));

    // Khoá một phần không được làm mất sạch chỗ trống — chi nhánh vẫn còn đường
    // đua khác phục vụ khách thường.
    expect(result.available).toBe(true);
    expect(result.contestNotice).toContain('Giải Thử');
  });

  it('giải ở NGÀY KHÁC không ảnh hưởng ngày đang tra', async () => {
    const cafe = await createTestCafe();
    const date = tomorrowInVn();

    const otherDay = new Date(`${date}T00:00:00+07:00`);
    otherDay.setUTCDate(otherDay.getUTCDate() + 5);
    await seedContest({
      cafeId: cafe.id,
      date: otherDay.toISOString().slice(0, 10),
      scope: ContestResourceScope.FULL_BRANCH,
    });

    const result = JSON.parse(await checkAvailability(cafe.id, { date }));
    expect(result.available).toBe(true);
  });
});
