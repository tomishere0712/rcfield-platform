import { CreateContestSchema } from '../../validate';

const UUID = {
  type: '00000000-0000-4000-8000-000000000001',
  format: '00000000-0000-4000-8000-000000000002',
  template: '00000000-0000-4000-8000-000000000003',
  track: '00000000-0000-4000-8000-000000000004',
  cafe: '00000000-0000-4000-8000-000000000005',
};

function contestBody(registrationOpensAt: Date) {
  const registrationClosesAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const startsAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const endsAt = new Date(Date.now() + 4 * 60 * 60 * 1000);
  return {
    name: 'Giải kiểm thử thời gian',
    contest_type_id: UUID.type,
    contest_format_id: UUID.format,
    contest_template_id: UUID.template,
    track_type_id: UUID.track,
    participating_cafe_ids: [UUID.cafe],
    registration_opens_at: registrationOpensAt.toISOString(),
    registration_closes_at: registrationClosesAt.toISOString(),
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    capacity: 8,
    vehicle_rule: { vehicle_policy: 'BYOC_ONLY' },
  };
}

describe('CreateContestSchema — thời gian mở đăng ký', () => {
  // Cố tình cho phép quá khứ: dùng để demo một giải "đã mở đăng ký sẵn" mà
  // không phải tạo trước rồi sửa lại. Chỉ registration_opens_at được nới —
  // starts_at (khởi tranh) vẫn phải là tương lai, kiểm ở bước "schedule" của
  // wizard (contest-wizard.ts), không nằm trong schema này.
  it('chấp nhận thời gian mở đăng ký trong quá khứ', () => {
    const result = CreateContestSchema.safeParse(contestBody(new Date(Date.now() - 60_000)));

    expect(result.success).toBe(true);
  });

  it('chấp nhận thời gian mở đăng ký trong tương lai', () => {
    const result = CreateContestSchema.safeParse(
      contestBody(new Date(Date.now() + 30 * 60 * 1000)),
    );

    expect(result.success).toBe(true);
  });
});
