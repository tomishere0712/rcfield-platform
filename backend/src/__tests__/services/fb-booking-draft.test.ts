import { redis } from '../../config/redis';
import {
  DRAFT_TTL_SECONDS,
  applyRevalidationOutcome,
  clearDraft,
  draftKey,
  firstMissingField,
  hasRequiredFields,
  isConfirmationTurn,
  loadDraft,
  saveDraft,
  type FbBookingDraft,
} from '../../services/fb-booking-draft';

/**
 * Máy trạng thái đơn nháp — Nguyên tắc V của Constitution: test viết trước,
 * xác nhận đỏ, rồi mới hiện thực.
 *
 * Đây là logic tài chính chứ không phải logic hội thoại: máy trạng thái này là
 * thứ DUY NHẤT quyết định khi nào một nghĩa vụ thanh toán được tạo ra. Mô hình
 * ngôn ngữ không được cấp công cụ tạo đơn (research.md D3), nên nếu `isConfirmationTurn`
 * nới lỏng một chút thôi thì quyền quyết định rơi ngược về phía model — đúng
 * thứ FR-004 cấm.
 */
describe('fb-booking-draft: máy trạng thái đơn nháp', () => {
  const pageId = '101234567890123';
  let psidSeq = 0;

  function freshPsid(): string {
    psidSeq += 1;
    return `2468101214${String(1000 + psidSeq)}`;
  }

  function completeDraft(overrides: Partial<FbBookingDraft> = {}): FbBookingDraft {
    return {
      state: 'AWAITING_CONFIRMATION',
      cafeId: '11111111-1111-1111-1111-111111111111',
      fullName: 'Nam',
      phone: '0901234567',
      playerCount: 2,
      playMode: 'RENTAL',
      trackConfigId: '22222222-2222-2222-2222-222222222222',
      slotStart: '2026-08-22T19:00:00+07:00',
      slotEnd: '2026-08-22T21:00:00+07:00',
      vehicleIds: ['33333333-3333-3333-3333-333333333333'],
      quotedTotal: 560_000,
      ...overrides,
    };
  }

  afterEach(async () => {
    const keys: string[] = [];
    for (let i = 1; i <= psidSeq; i += 1) {
      keys.push(draftKey(pageId, `2468101214${String(1000 + i)}`));
    }
    await Promise.all(keys.map((k) => redis.del(k).catch(() => undefined)));
  });

  // ── Vòng đời lưu trữ ────────────────────────────────────────────────────────

  it('trả null khi chưa có đơn nháp nào', async () => {
    expect(await loadDraft(pageId, freshPsid())).toBeNull();
  });

  it('ghi rồi đọc lại ra đúng đơn nháp', async () => {
    const psid = freshPsid();
    const draft = completeDraft();

    await saveDraft(pageId, psid, draft);

    expect(await loadDraft(pageId, psid)).toEqual(draft);
  });

  it('khoá gồm cả pageId — một người nhắn hai chi nhánh là hai đơn nháp riêng', async () => {
    const psid = freshPsid();
    const otherPage = '999888777666555';

    await saveDraft(pageId, psid, completeDraft({ fullName: 'Chi nhánh A' }));
    await saveDraft(otherPage, psid, completeDraft({ fullName: 'Chi nhánh B' }));

    expect((await loadDraft(pageId, psid))?.fullName).toBe('Chi nhánh A');
    expect((await loadDraft(otherPage, psid))?.fullName).toBe('Chi nhánh B');

    await redis.del(draftKey(otherPage, psid));
  });

  it('hạn sống BẰNG hạn của lịch sử chữ — không được để đơn nháp chết trước', async () => {
    // Đơn nháp chết trước lịch sử tạo ra trạng thái xác sống: mô hình đọc lại
    // bản tóm tắt cũ trong lịch sử và trả lời như thể vẫn đang nhận đơn, trong
    // khi không còn gì để tạo đơn.
    expect(DRAFT_TTL_SECONDS).toBe(30 * 60);

    const psid = freshPsid();
    await saveDraft(pageId, psid, completeDraft());

    const ttl = await redis.ttl(draftKey(pageId, psid));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(30 * 60);
  });

  it('xoá đơn nháp sau khi tạo đơn xong', async () => {
    const psid = freshPsid();
    await saveDraft(pageId, psid, completeDraft());

    await clearDraft(pageId, psid);

    expect(await loadDraft(pageId, psid)).toBeNull();
  });

  // ── Điều kiện nhận "xác nhận" ───────────────────────────────────────────────

  it('nhận xác nhận khi đủ ba điều kiện: đúng trạng thái, đủ trường, đúng từ khoá', () => {
    expect(isConfirmationTurn(completeDraft(), 'xác nhận')).toBe(true);
    expect(isConfirmationTurn(completeDraft(), 'đồng ý')).toBe(true);
    expect(isConfirmationTurn(completeDraft(), 'ok đặt luôn')).toBe(true);
    expect(isConfirmationTurn(completeDraft(), 'chốt')).toBe(true);
  });

  it('TỪ CHỐI khi khách gõ xác nhận mà AI chưa tóm tắt đơn', () => {
    // FR-005: khách phải được nhìn thấy toàn bộ đơn và tổng tiền trước đã.
    // Thiếu chốt này thì một tiếng "ok" giữa câu hỏi khác cũng tạo ra nghĩa vụ
    // thanh toán.
    for (const state of ['AWAITING_NAME', 'AWAITING_SLOT', 'AWAITING_VEHICLES'] as const) {
      expect(isConfirmationTurn(completeDraft({ state }), 'xác nhận')).toBe(false);
    }
  });

  it('TỪ CHỐI khi thiếu trường bắt buộc dù trạng thái đang chờ xác nhận', () => {
    expect(isConfirmationTurn(completeDraft({ phone: undefined }), 'xác nhận')).toBe(false);
    expect(isConfirmationTurn(completeDraft({ fullName: undefined }), 'xác nhận')).toBe(false);
    expect(isConfirmationTurn(completeDraft({ slotStart: undefined }), 'xác nhận')).toBe(false);
    // RENTAL mà không có xe thì không tính là đủ.
    expect(isConfirmationTurn(completeDraft({ vehicleIds: [] }), 'xác nhận')).toBe(false);
  });

  it('BYOC không cần xe vẫn tính là đủ trường', () => {
    const byoc = completeDraft({ playMode: 'BYOC', vehicleIds: [] });
    expect(isConfirmationTurn(byoc, 'xác nhận')).toBe(true);
  });

  it('TỪ CHỐI câu chữ không phải xác nhận', () => {
    for (const text of ['giá bao nhiêu', 'thôi để mai', 'xe nào rẻ nhất', 'không']) {
      expect(isConfirmationTurn(completeDraft(), text)).toBe(false);
    }
  });

  it('TỪ CHỐI khi đơn đã được tạo — chống tạo đơn trùng', () => {
    // FR-039: khách sốt ruột gõ "xác nhận" lần nữa phải nhận lại đúng đơn cũ,
    // không sinh đơn mới và không giữ chỗ thêm lần nữa.
    const withBooking = completeDraft({
      createdBookingId: '44444444-4444-4444-4444-444444444444',
      state: 'AWAITING_PAYMENT',
    });
    expect(isConfirmationTurn(withBooking, 'xác nhận')).toBe(false);
  });

  // ── Dọn trường sau khi tra lại (research.md D4) ─────────────────────────────

  it('xe bị thuê mất: xoá xe, GIỮ tên, số điện thoại và khung giờ', () => {
    const next = applyRevalidationOutcome(completeDraft(), { kind: 'VEHICLE_TAKEN' });

    expect(next.state).toBe('AWAITING_VEHICLES');
    expect(next.vehicleIds).toBeUndefined();
    // FR-036 cấm bắt khách khai lại từ đầu. Tên và số điện thoại không liên quan
    // gì tới việc một chiếc xe bị thuê mất.
    expect(next.fullName).toBe('Nam');
    expect(next.phone).toBe('0901234567');
    expect(next.slotStart).toBe('2026-08-22T19:00:00+07:00');
  });

  it('khung giờ hết chỗ: xoá cả khung giờ lẫn xe, GIỮ tên và số điện thoại', () => {
    const next = applyRevalidationOutcome(completeDraft(), { kind: 'SLOT_FULL' });

    expect(next.state).toBe('AWAITING_SLOT');
    expect(next.slotStart).toBeUndefined();
    expect(next.slotEnd).toBeUndefined();
    // Xe đã chọn được kiểm theo đúng khung giờ đó, nên khung giờ đổi thì xe
    // không còn ý nghĩa.
    expect(next.vehicleIds).toBeUndefined();
    expect(next.fullName).toBe('Nam');
    expect(next.phone).toBe('0901234567');
  });

  it('chỉ giá thay đổi: không xoá gì, bắt xác nhận lại mức giá mới', () => {
    const next = applyRevalidationOutcome(completeDraft(), {
      kind: 'PRICE_CHANGED',
      newTotal: 620_000,
    });

    expect(next.state).toBe('AWAITING_CONFIRMATION');
    expect(next.priceChanged).toBe(true);
    expect(next.previousQuotedTotal).toBe(560_000);
    expect(next.quotedTotal).toBe(620_000);
    expect(next.vehicleIds).toEqual(['33333333-3333-3333-3333-333333333333']);
  });

  it('giá đổi rồi thì lần gõ xác nhận cũ không được dùng lại cho giá mới', () => {
    // FR-037: không tạo đơn với mức giá khách chưa từng đồng ý.
    const changed = applyRevalidationOutcome(completeDraft(), {
      kind: 'PRICE_CHANGED',
      newTotal: 620_000,
    });

    expect(isConfirmationTurn(changed, 'xác nhận')).toBe(false);
  });

  it('không đổi gì: đơn nháp giữ nguyên và vẫn nhận xác nhận', () => {
    const draft = completeDraft();
    const next = applyRevalidationOutcome(draft, { kind: 'UNCHANGED' });

    expect(next).toEqual(draft);
    expect(isConfirmationTurn(next, 'xác nhận')).toBe(true);
  });

  // ── Bất biến ────────────────────────────────────────────────────────────────

  it('trạng thái chặn tài khoản thật không bao giờ nhận xác nhận', () => {
    const blocked = completeDraft({ state: 'BLOCKED_REAL_ACCOUNT' });
    expect(isConfirmationTurn(blocked, 'xác nhận')).toBe(false);
  });
});

/**
 * Vòng lặp vô hạn ở bước xác nhận.
 *
 * Người dùng phát hiện khi chạy thử thật: gõ "xác nhận" thì bot tóm tắt lại đơn,
 * gõ tiếp thì lại tóm tắt, mãi mãi không tạo được đơn.
 *
 * Nguyên nhân: `hasRequiredFields` đòi `trackConfigId` còn `nextQuestion` của bộ
 * điều phối thì không hỏi tới nó. Không bên nào ném lỗi, nên hỏng lặng lẽ.
 *
 * Test này khoá lại chính cái bất biến bị vi phạm: hai phía phải dùng CHUNG một
 * định nghĩa "đủ trường".
 */
describe('fb-booking-draft: không được lặp vô hạn ở bước xác nhận', () => {
  const base = {
    state: 'AWAITING_CONFIRMATION' as const,
    cafeId: '11111111-1111-1111-1111-111111111111',
    fullName: 'Nam',
    phone: '0901234567',
    playerCount: 1,
    playMode: 'BYOC' as const,
    slotStart: '2026-08-22T12:00:00+07:00',
    slotEnd: '2026-08-22T13:00:00+07:00',
  };

  it('thiếu trackConfigId thì PHẢI báo là thiếu, không được im lặng coi như đủ', () => {
    const draft = { ...base };
    expect(firstMissingField(draft)).toBe('trackConfigId');
    expect(hasRequiredFields(draft)).toBe(false);
    expect(isConfirmationTurn(draft, 'xác nhận')).toBe(false);
  });

  it('có đủ trackConfigId thì nhận xác nhận và tạo được đơn', () => {
    const draft = { ...base, trackConfigId: '22222222-2222-2222-2222-222222222222' };
    expect(firstMissingField(draft)).toBeNull();
    expect(hasRequiredFields(draft)).toBe(true);
    expect(isConfirmationTurn(draft, 'xác nhận')).toBe(true);
  });

  it('RENTAL thiếu xe thì báo thiếu đúng trường vehicleIds', () => {
    const draft = {
      ...base,
      playMode: 'RENTAL' as const,
      trackConfigId: '22222222-2222-2222-2222-222222222222',
    };
    expect(firstMissingField(draft)).toBe('vehicleIds');
    expect(isConfirmationTurn(draft, 'xác nhận')).toBe(false);
  });

  it('mọi trường mà hasRequiredFields đòi đều phải có tên trong firstMissingField', () => {
    // Bất biến cấu trúc: đủ trường ⟺ không thiếu trường nào. Hai vế lệch nhau là
    // vòng lặp quay lại.
    const complete = { ...base, trackConfigId: '22222222-2222-2222-2222-222222222222' };
    for (const key of ['slotStart', 'playMode', 'playerCount', 'trackConfigId'] as const) {
      const broken = { ...complete, [key]: undefined };
      expect(hasRequiredFields(broken)).toBe(false);
      expect(firstMissingField(broken)).not.toBeNull();
    }
  });
});
