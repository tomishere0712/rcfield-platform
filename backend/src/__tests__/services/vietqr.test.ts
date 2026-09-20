import {
  buildVietQrPayload,
  findBank,
  generatePaymentRefCode,
  PAYMENT_REF_CODE_REGEX,
} from '../../services/vietqr';

/**
 * Chuỗi VietQR là thứ khách quét bằng app ngân hàng thật. Sai một ký tự là app
 * từ chối đọc, hoặc tệ hơn, đọc ra số tài khoản khác. CRC ở cuối chuỗi là cơ
 * chế duy nhất phát hiện hỏng, nên nó phải đúng chuẩn CRC-16/CCITT-FALSE chứ
 * không phải một biến thể gần đúng.
 */
describe('vietqr', () => {
  const VCB_BIN = '970436';

  describe('buildVietQrPayload', () => {
    it('mở đầu bằng phiên bản EMVCo và điểm khởi tạo động', () => {
      const payload = buildVietQrPayload({
        bankBin: VCB_BIN,
        accountNumber: '0123453210',
        amount: 350000,
        memo: 'RCF7K2M9',
      });

      // 00 = Payload Format Indicator, độ dài 02, giá trị 01
      expect(payload.startsWith('000201')).toBe(true);
      // 01 = Point of Initiation, 12 = động (mang sẵn số tiền), khác 11 = tĩnh
      expect(payload).toContain('010212');
    });

    it('nhúng đúng BIN và số tài khoản', () => {
      const payload = buildVietQrPayload({
        bankBin: VCB_BIN,
        accountNumber: '0123453210',
        amount: 350000,
        memo: 'RCF7K2M9',
      });

      expect(payload).toContain(VCB_BIN);
      expect(payload).toContain('0123453210');
    });

    it('nhúng số tiền dạng chuỗi không có số lẻ thập phân', () => {
      const payload = buildVietQrPayload({
        bankBin: VCB_BIN,
        accountNumber: '0123453210',
        amount: 350000,
        memo: 'RCF7K2M9',
      });

      // 54 = Transaction Amount, độ dài 06, giá trị 350000
      expect(payload).toContain('5406350000');
    });

    it('nhúng nội dung chuyển khoản để đối soát rút mã ra được', () => {
      const payload = buildVietQrPayload({
        bankBin: VCB_BIN,
        accountNumber: '0123453210',
        amount: 350000,
        memo: 'RCF7K2M9',
      });

      expect(payload).toContain('RCF7K2M9');
    });

    it('kết thúc bằng CRC 4 ký tự hex viết hoa', () => {
      const payload = buildVietQrPayload({
        bankBin: VCB_BIN,
        accountNumber: '0123453210',
        amount: 350000,
        memo: 'RCF7K2M9',
      });

      expect(payload.slice(-8, -4)).toBe('6304');
      expect(payload.slice(-4)).toMatch(/^[0-9A-F]{4}$/);
    });

    it('CRC tính đúng chuẩn CRC-16/CCITT-FALSE trên toàn bộ chuỗi kể cả "6304"', () => {
      const payload = buildVietQrPayload({
        bankBin: VCB_BIN,
        accountNumber: '0123453210',
        amount: 350000,
        memo: 'RCF7K2M9',
      });

      const body = payload.slice(0, -4);
      const expected = payload.slice(-4);

      let crc = 0xffff;
      for (const char of body) {
        crc ^= char.charCodeAt(0) << 8;
        for (let bit = 0; bit < 8; bit += 1) {
          crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
        }
      }

      expect(crc.toString(16).toUpperCase().padStart(4, '0')).toBe(expected);
    });

    it('đổi số tiền thì đổi CRC — chứng minh CRC bao phủ cả phần số tiền', () => {
      const a = buildVietQrPayload({
        bankBin: VCB_BIN,
        accountNumber: '0123453210',
        amount: 350000,
        memo: 'RCF7K2M9',
      });
      const b = buildVietQrPayload({
        bankBin: VCB_BIN,
        accountNumber: '0123453210',
        amount: 350001,
        memo: 'RCF7K2M9',
      });

      expect(a.slice(-4)).not.toBe(b.slice(-4));
    });

    it('từ chối số tiền không dương', () => {
      expect(() =>
        buildVietQrPayload({
          bankBin: VCB_BIN,
          accountNumber: '0123453210',
          amount: 0,
          memo: 'RCF7K2M9',
        }),
      ).toThrow();
    });

    it('từ chối số tiền có phần thập phân — VND không có số lẻ', () => {
      expect(() =>
        buildVietQrPayload({
          bankBin: VCB_BIN,
          accountNumber: '0123453210',
          amount: 350000.5,
          memo: 'RCF7K2M9',
        }),
      ).toThrow();
    });
  });

  describe('findBank', () => {
    it('tra được ngân hàng lớn theo mã ngắn', () => {
      const bank = findBank('VCB');
      expect(bank).not.toBeNull();
      expect(bank?.bin).toBe(VCB_BIN);
    });

    it('không phân biệt hoa thường', () => {
      expect(findBank('vcb')?.bin).toBe(VCB_BIN);
    });

    it('trả null cho mã không có trong danh sách', () => {
      expect(findBank('KHONG_TON_TAI')).toBeNull();
    });
  });

  describe('generatePaymentRefCode', () => {
    it('sinh mã 8 ký tự bắt đầu bằng RCF', () => {
      const code = generatePaymentRefCode();
      expect(code).toHaveLength(8);
      expect(code.startsWith('RCF')).toBe(true);
    });

    it('khớp regex mà bộ đối soát dùng để rút mã khỏi nội dung', () => {
      for (let i = 0; i < 200; i += 1) {
        expect(generatePaymentRefCode()).toMatch(new RegExp(`^${PAYMENT_REF_CODE_REGEX.source}$`));
      }
    });

    it('không dùng I, L, O, U — bốn ký tự dễ đọc nhầm khi khách gõ tay', () => {
      for (let i = 0; i < 500; i += 1) {
        expect(generatePaymentRefCode().slice(3)).not.toMatch(/[ILOU]/);
      }
    });

    it('đủ phân tán để không đụng nhau liên tục', () => {
      const codes = new Set(Array.from({ length: 1000 }, () => generatePaymentRefCode()));
      // ~1 triệu tổ hợp; 1000 lần bốc mà trùng quá 5 lần là bộ sinh có vấn đề.
      expect(codes.size).toBeGreaterThan(995);
    });
  });
});
