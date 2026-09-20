import { AppDataSource } from '../../config/database';
import { env } from '../../config/env';
import {
  ContestEntryFeePaymentStatus,
  ContestRegistrationStatus,
  ContestStatus,
  UserRole,
} from '../../types';
import { createTestCafe, createTestUser } from '../helpers';
import { checkInRegistration } from '../../services/contest';

/**
 * Điểm danh ngoài khung giờ giải.
 *
 * Cờ `DEV_BYPASS_CONTEST_CHECKIN` bật được ở MỌI môi trường, kể cả production,
 * vì demo và diễn tập trên máy chủ thật cần điểm danh khi giải chưa tới giờ.
 *
 * Đổi lại, mỗi lần dùng phải để lại dấu vết. Bypass lặng lẽ là thứ nguy hiểm:
 * sáu tháng sau không ai dựng lại được vì sao một người được điểm danh khi giải
 * còn đang mở đăng ký. Dòng kiểm toán riêng làm câu hỏi đó trả lời được — và
 * nếu nó mất thì KHÔNG có gì báo, vì việc điểm danh vẫn thành công như thường.
 */

async function seedReadyRegistration(contestStatus: ContestStatus) {
  const cafe = await createTestCafe();
  const provider = await createTestUser({ role: UserRole.PROVIDER });
  const customer = await createTestUser({ role: UserRole.CUSTOMER });

  const [type] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_types LIMIT 1`,
  );
  const [format] = await AppDataSource.query<{ id: string }[]>(
    `SELECT id FROM contest_formats LIMIT 1`,
  );
  const [track] = await AppDataSource.query<{ id: string }[]>(`SELECT id FROM track_types LIMIT 1`);

  // Giải bắt đầu sau BA NGÀY — chưa tới giờ điểm danh theo mọi cách hiểu.
  const [contest] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO contests
       (provider_id, cafe_id, created_by, contest_type_id, contest_format_id, track_type_id,
        track_type, name, status, starts_at, ends_at, capacity, entry_fee, config)
     VALUES ($1,$5,$1,$2,$3,$4,'DRIFT','Giải kiểm bypass',$6,
             NOW() + INTERVAL '3 days', NOW() + INTERVAL '4 days', 16, 0, '{}'::jsonb)
     RETURNING id`,
    [provider.id, type.id, format.id, track.id, cafe.id, contestStatus],
  );

  await AppDataSource.query(
    `INSERT INTO contest_cafes (contest_id, cafe_id, display_order) VALUES ($1,$2,0)`,
    [contest.id, cafe.id],
  );

  const [reg] = await AppDataSource.query<{ id: string }[]>(
    `INSERT INTO contest_registrations
       (contest_id, user_id, status, payment_status, entry_fee_amount, vehicle_source, metadata)
     VALUES ($1,$2,$3,$4,0,'BYOC',
             '{"byoc_declaration":{"vehicle_name":"Traxxas Slash"}}'::jsonb)
     RETURNING id`,
    [
      contest.id,
      customer.id,
      ContestRegistrationStatus.CONFIRMED,
      ContestEntryFeePaymentStatus.NOT_REQUIRED,
    ],
  );

  return { cafeId: cafe.id, provider, registrationId: reg.id, contestId: contest.id };
}

/** Nhận xe cá nhân đòi tối thiểu 2 ảnh và đủ ba hạng mục — thiếu là 400. */
const BYOC_INSPECTION = {
  photos: [
    { url: 'https://placehold.co/600x400/png?text=F', angle: 'FRONT' },
    { url: 'https://placehold.co/600x400/png?text=R', angle: 'REAR' },
  ],
  checklist: [
    { itemKey: 'body', itemLabel: 'Thân xe', status: 'OK' as const },
    { itemKey: 'power_system', itemLabel: 'Hệ truyền động', status: 'OK' as const },
    { itemKey: 'wheels', itemLabel: 'Bánh xe', status: 'OK' as const },
  ],
};

async function readAudit(contestId: string, eventType: string) {
  return AppDataSource.query<{ actor_id: string; reason: string; after_json: unknown }[]>(
    `SELECT actor_id, reason, after_json FROM contest_audit_logs
      WHERE contest_id = $1 AND event_type = $2`,
    [contestId, eventType],
  );
}

/** Bật/tắt cờ quanh một phép thử rồi trả lại nguyên trạng. */
async function withBypass<T>(on: boolean, fn: () => Promise<T>): Promise<T> {
  const original = env.bypassContestCheckInWindow;
  (env as { bypassContestCheckInWindow: boolean }).bypassContestCheckInWindow = on;
  try {
    return await fn();
  } finally {
    (env as { bypassContestCheckInWindow: boolean }).bypassContestCheckInWindow = original;
  }
}

describe('cờ điểm danh ngoài khung giờ', () => {
  it('TẮT thì giải chưa tới giờ bị chặn', async () => {
    const { cafeId, provider, registrationId } = await seedReadyRegistration(ContestStatus.CLOSED);

    await expect(
      withBypass(false, () =>
        checkInRegistration(
          registrationId,
          cafeId,
          { userId: provider.id, role: UserRole.PROVIDER },
          null,
          true,
          BYOC_INSPECTION,
        ),
      ),
    ).rejects.toMatchObject({ code: 'CONTEST_CHECKIN_NOT_STARTED' });
  });

  it('BẬT thì điểm danh được dù giải còn ba ngày nữa mới bắt đầu', async () => {
    const { cafeId, provider, registrationId } = await seedReadyRegistration(ContestStatus.CLOSED);

    await withBypass(true, () =>
      checkInRegistration(
        registrationId,
        cafeId,
        { userId: provider.id, role: UserRole.PROVIDER },
        null,
        true,
        BYOC_INSPECTION,
      ),
    );

    const [row] = await AppDataSource.query<{ checked_in_at: Date | null }[]>(
      `SELECT checked_in_at FROM contest_registrations WHERE id = $1`,
      [registrationId],
    );
    expect(row.checked_in_at).not.toBeNull();
  });

  it('BẬT thì bỏ qua cả trạng thái giải — điểm danh được khi còn đang mở đăng ký', async () => {
    // Đây chính là điều đoạn chú thích cũ cảnh báo: giao xe cho người chưa chắc
    // suất. Ghi lại ở đây để ai đọc test cũng thấy cái giá của cờ này.
    const { cafeId, provider, registrationId } = await seedReadyRegistration(ContestStatus.OPEN);

    await withBypass(true, () =>
      checkInRegistration(
        registrationId,
        cafeId,
        { userId: provider.id, role: UserRole.PROVIDER },
        null,
        true,
        BYOC_INSPECTION,
      ),
    );

    const [row] = await AppDataSource.query<{ checked_in_at: Date | null }[]>(
      `SELECT checked_in_at FROM contest_registrations WHERE id = $1`,
      [registrationId],
    );
    expect(row.checked_in_at).not.toBeNull();
  });

  it('mỗi lần bypass để lại một dòng kiểm toán riêng, kèm người thực hiện', async () => {
    const { cafeId, provider, registrationId, contestId } = await seedReadyRegistration(
      ContestStatus.CLOSED,
    );

    await withBypass(true, () =>
      checkInRegistration(
        registrationId,
        cafeId,
        { userId: provider.id, role: UserRole.PROVIDER },
        null,
        true,
        BYOC_INSPECTION,
      ),
    );

    const rows = await readAudit(contestId, 'registration.checked_in_outside_window');
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_id).toBe(provider.id);
    expect(rows[0].reason).toMatch(/DEV_BYPASS_CONTEST_CHECKIN/);
    // Chụp lại trạng thái giải lúc đó: sau này giải chuyển sang RUNNING thì đọc
    // bảng contests nữa cũng không dựng lại được bối cảnh của quyết định.
    expect((rows[0].after_json as { contest_status: string }).contest_status).toBe(
      ContestStatus.CLOSED,
    );
  });

  it('điểm danh đúng giờ KHÔNG sinh dòng ngoại lệ', async () => {
    // Dòng ngoại lệ phải hiếm và có nghĩa. Ghi cho mọi lần điểm danh thì nó
    // thành nhiễu, và lúc cần lọc ra ca bất thường sẽ không lọc được nữa.
    const { cafeId, provider, registrationId, contestId } = await seedReadyRegistration(
      ContestStatus.RUNNING,
    );
    await AppDataSource.query(
      `UPDATE contests SET starts_at = NOW() - INTERVAL '1 hour',
                           ends_at = NOW() + INTERVAL '5 hours' WHERE id = $1`,
      [contestId],
    );

    await withBypass(false, () =>
      checkInRegistration(
        registrationId,
        cafeId,
        { userId: provider.id, role: UserRole.PROVIDER },
        null,
        true,
        BYOC_INSPECTION,
      ),
    );

    expect(await readAudit(contestId, 'registration.checked_in_outside_window')).toHaveLength(0);
    expect(await readAudit(contestId, 'registration.checked_in')).toHaveLength(1);
  });
});

describe('bypass riêng của Contest Lab', () => {
  it('điểm danh trước giờ khi cờ toàn server đang tắt và audit đúng lý do', async () => {
    const { cafeId, provider, registrationId, contestId } = await seedReadyRegistration(
      ContestStatus.CLOSED,
    );

    await withBypass(false, () =>
      checkInRegistration(
        registrationId,
        cafeId,
        { userId: provider.id, role: UserRole.PROVIDER },
        null,
        true,
        BYOC_INSPECTION,
        { bypassWindow: true, bypassReason: 'CONTEST_LAB' },
      ),
    );

    const rows = await readAudit(contestId, 'registration.checked_in_outside_window');
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_id).toBe(provider.id);
    expect(rows[0].reason).toBe('CONTEST_LAB');
    expect((rows[0].after_json as { bypass_source: string }).bypass_source).toBe('CONTEST_LAB');
  });

  it('không bỏ qua guard registration phải CONFIRMED', async () => {
    const { cafeId, provider, registrationId } = await seedReadyRegistration(ContestStatus.CLOSED);
    await AppDataSource.query(`UPDATE contest_registrations SET status = 'PENDING' WHERE id = $1`, [
      registrationId,
    ]);

    await expect(
      withBypass(false, () =>
        checkInRegistration(
          registrationId,
          cafeId,
          { userId: provider.id, role: UserRole.PROVIDER },
          null,
          true,
          BYOC_INSPECTION,
          { bypassWindow: true, bypassReason: 'CONTEST_LAB' },
        ),
      ),
    ).rejects.toMatchObject({ code: 'REGISTRATION_NOT_CONFIRMED' });
  });

  it('không bỏ qua vòng đời contest: DRAFT vẫn chưa được điểm danh', async () => {
    const { cafeId, provider, registrationId } = await seedReadyRegistration(ContestStatus.DRAFT);
    await expect(
      withBypass(false, () =>
        checkInRegistration(
          registrationId,
          cafeId,
          { userId: provider.id, role: UserRole.PROVIDER },
          null,
          true,
          BYOC_INSPECTION,
          { bypassWindow: true, bypassReason: 'CONTEST_LAB' },
        ),
      ),
    ).rejects.toMatchObject({ code: 'CONTEST_NOT_CHECKIN_READY' });
  });
});
