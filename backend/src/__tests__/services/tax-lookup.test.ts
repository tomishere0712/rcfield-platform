import { lookupBusinessByTaxCode, normalizeTaxCode } from '../../services/tax-lookup.service';

/**
 * VietQR được giả lập ở đây.
 *
 * Test không được phụ thuộc mạng và cũng không nên bắn request thật vào dịch vụ
 * của người khác mỗi lần chạy CI. Các payload dưới đây chép nguyên văn từ phản
 * hồi thật, kể cả chi tiết dễ bỏ sót nhất: **mọi trường hợp đều trả HTTP 200**,
 * kết luận nằm ở trường `code` trong body.
 */
const originalFetch = global.fetch;

function mockJson(payload: unknown, ok = true, status = 200) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => payload,
  }) as unknown as typeof fetch;
}

afterEach(() => {
  global.fetch = originalFetch;
});

describe('Tra mã số thuế', () => {
  it('mã đang hoạt động trả về thông tin pháp lý để điền sẵn', async () => {
    mockJson({
      code: '00',
      desc: 'Success - Thành công',
      data: {
        id: '0302158498',
        name: 'CÔNG TY CỔ PHẦN TẬP ĐOÀN XÂY DỰNG HÒA BÌNH',
        internationalName: 'HOA BINH CONSTRUCTION GROUP JOINT STOCK COMPANY',
        shortName: 'HBCG',
        address: '235 Võ Thị Sáu, Phường Xuân Hòa, TP Hồ Chí Minh',
        status: 'NNT đang hoạt động',
      },
    });

    const outcome = await lookupBusinessByTaxCode('0302158498');

    expect(outcome).toMatchObject({
      status: 'ACTIVE',
      business: {
        taxCode: '0302158498',
        legalName: 'CÔNG TY CỔ PHẦN TẬP ĐOÀN XÂY DỰNG HÒA BÌNH',
        address: '235 Võ Thị Sáu, Phường Xuân Hòa, TP Hồ Chí Minh',
        taxStatus: 'NNT đang hoạt động',
      },
    });
  });

  it('mã của cơ sở đã bỏ địa chỉ đăng ký bị đánh dấu INACTIVE', async () => {
    // Trạng thái có thật của MST 0316871243 — đúng nhóm hồ sơ cần chặn.
    mockJson({
      code: '00',
      data: {
        id: '0316871243',
        name: 'CÔNG TY CỔ PHẦN PACIFFIC GOLD',
        status: 'NNT không hoạt động tại địa chỉ đã đăng ký',
      },
    });

    const outcome = await lookupBusinessByTaxCode('0316871243');

    expect(outcome.status).toBe('INACTIVE');
  });

  it('phân biệt được không tồn tại và sai định dạng', async () => {
    mockJson({ code: '51', desc: 'Tax not found', data: null });
    expect((await lookupBusinessByTaxCode('8765432109')).status).toBe('NOT_FOUND');

    mockJson({ code: '52', desc: 'Tax invalid', data: null });
    expect((await lookupBusinessByTaxCode('0000000001')).status).toBe('INVALID');
  });

  it('chặn tại chỗ mã sai định dạng, không tốn một lần gọi mạng', async () => {
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;

    expect((await lookupBusinessByTaxCode('123')).status).toBe('INVALID');
    expect((await lookupBusinessByTaxCode('MST0123456789')).status).toBe('INVALID');
    expect(spy).not.toHaveBeenCalled();
  });

  it('API sập hoặc trả mã lạ thì báo UNAVAILABLE, không nhầm thành hợp lệ', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    expect((await lookupBusinessByTaxCode('0302158498')).status).toBe('UNAVAILABLE');

    mockJson({}, false, 503);
    expect((await lookupBusinessByTaxCode('0302158498')).status).toBe('UNAVAILABLE');

    // Mã nghiệp vụ chưa từng gặp: không được coi là đã xác minh.
    mockJson({ code: '99', data: null });
    expect((await lookupBusinessByTaxCode('0302158498')).status).toBe('UNAVAILABLE');
  });

  it('mã có đuôi đơn vị phụ thuộc vẫn tra được', async () => {
    mockJson({
      code: '00',
      data: {
        id: '0302158498-001',
        name: 'VĂN PHÒNG ĐẠI DIỆN CÔNG TY CỔ PHẦN TẬP ĐOÀN XÂY DỰNG HÒA BÌNH TẠI HÀ NỘI',
        status: 'NNT đang hoạt động',
      },
    });

    const outcome = await lookupBusinessByTaxCode(' 0302158498-001 ');

    expect(outcome.status).toBe('ACTIVE');
    expect(normalizeTaxCode(' 0302158498-001 ')).toBe('0302158498-001');
  });
});
