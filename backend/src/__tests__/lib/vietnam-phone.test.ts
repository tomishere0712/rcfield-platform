import { normalizeVietnamPhone, isVietnamMobile } from '../../lib/vietnam-phone';

describe('normalizeVietnamPhone', () => {
  it('bỏ dấu cách, chấm, gạch và ngoặc mà người dùng hay gõ', () => {
    expect(normalizeVietnamPhone(' 090 123 45.67 ')).toBe('0901234567');
    expect(normalizeVietnamPhone('(037)-289-9192')).toBe('0372899192');
  });

  it('quy số quốc tế về dạng bắt đầu bằng 0', () => {
    expect(normalizeVietnamPhone('+84901234567')).toBe('0901234567');
    expect(normalizeVietnamPhone('84901234567')).toBe('0901234567');
  });
});

describe('isVietnamMobile', () => {
  it('nhận số di động 10 chữ số với đầu số hợp lệ', () => {
    for (const value of ['0301234567', '0501234567', '0701234567', '0801234567', '0901234567']) {
      expect(isVietnamMobile(value)).toBe(true);
    }
  });

  it('nhận cả dạng viết quốc tế', () => {
    expect(isVietnamMobile('+84 901 234 567')).toBe(true);
  });

  it('từ chối đầu số không phải di động', () => {
    expect(isVietnamMobile('0412345678')).toBe(false);
    expect(isVietnamMobile('0212345678')).toBe(false);
  });

  it('từ chối số sai độ dài', () => {
    expect(isVietnamMobile('090123456')).toBe(false);
    expect(isVietnamMobile('09012345678')).toBe(false);
  });

  // Regex cũ viết đầu số là [3|5|7|8|9]; trong lớp ký tự, dấu | là một ký tự
  // thường chứ không phải "hoặc", nên "0|12345678" lọt qua.
  it('từ chối chuỗi lọt qua vì dấu gạch đứng nằm trong lớp ký tự', () => {
    expect(isVietnamMobile('0|12345678')).toBe(false);
  });

  // Nhánh 84 của regex cũ chỉ đòi 8 chữ số phía sau và bỏ luôn phần kiểm đầu số,
  // nên 8412345678 (tức 0412345678) được chấp nhận.
  it('từ chối số quốc tế có đầu số không phải di động', () => {
    expect(isVietnamMobile('8412345678')).toBe(false);
  });

  it('từ chối chuỗi rỗng hoặc chữ', () => {
    expect(isVietnamMobile('')).toBe(false);
    expect(isVietnamMobile('không phải số')).toBe(false);
  });
});
