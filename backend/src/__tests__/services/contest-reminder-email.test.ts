/**
 * `jest-setup` mock toàn bộ email service cho mọi test — hợp lý, vì không test
 * nào khác cần gửi email thật. Nhưng bài này kiểm chính NỘI DUNG email, nên
 * phải lấy bản thật bằng `requireActual`.
 */
const { emailService } = jest.requireActual<typeof import('../../services/email.service')>(
  '../../services/email.service',
);

/**
 * Brevo được giả lập: test không gửi email thật, chỉ soi đúng cái payload mà
 * service dựng ra. Đó cũng là chỗ duy nhất kiểm được nội dung email.
 */
const originalFetch = global.fetch;

type BrevoPayload = {
  subject: string;
  textContent?: string;
  htmlContent: string;
  to: { email: string; name?: string }[];
};

function mockBrevo(): jest.Mock {
  const spy = jest.fn().mockResolvedValue({ ok: true, status: 201, text: async () => '' });
  global.fetch = spy as unknown as typeof fetch;
  return spy;
}

function sentPayload(spy: jest.Mock): BrevoPayload {
  const [, init] = spy.mock.calls[0] as [string, { body: string }];
  return JSON.parse(init.body) as BrevoPayload;
}

const BASE_INPUT = {
  to: 'racer@test.com',
  customerName: 'Nguyễn Văn A',
  contestName: 'Cúp Mùa Hè',
  contestId: '11111111-1111-1111-1111-111111111111',
  hostBranchName: 'RC Arena Sài Gòn',
  hostBranchAddress: '12 Nguyễn Huệ, Quận 1, TP Hồ Chí Minh',
  startsAt: new Date('2026-08-15T02:30:00.000Z'), // 09:30 giờ Việt Nam
  reminderLabel: 'Còn 2 giờ',
  checkInCode: 'AAF24F7B',
};

afterEach(() => {
  global.fetch = originalFetch;
});

describe('Email nhắc lịch thi đấu', () => {
  it('đưa thời gian còn lại lên tiêu đề để đọc được ngay ở hộp thư', async () => {
    const spy = mockBrevo();

    await emailService.sendContestReminder(BASE_INPUT);

    const payload = sentPayload(spy);
    expect(payload.subject).toBe('Còn 2 giờ nữa: Cúp Mùa Hè | RCField');
  });

  it('có bản chữ thuần cho client không dựng được HTML', async () => {
    const spy = mockBrevo();

    await emailService.sendContestReminder(BASE_INPUT);

    const payload = sentPayload(spy);
    expect(payload.textContent).toBeTruthy();
    expect(payload.textContent).toContain('AAF24F7B');
    expect(payload.textContent).toContain('12 Nguyễn Huệ');
  });

  it('hiện giờ theo múi giờ Việt Nam, mã điểm danh và link chỉ đường', async () => {
    const spy = mockBrevo();

    await emailService.sendContestReminder(BASE_INPUT);

    const { htmlContent } = sentPayload(spy);
    // 02:30 UTC là 09:30 ở Việt Nam — sai múi giờ là VĐV tới trễ 7 tiếng.
    expect(htmlContent).toContain('09:30');
    expect(htmlContent).toContain('AAF24F7B');
    expect(htmlContent).toContain('RC Arena Sài Gòn');
    expect(htmlContent).toContain('google.com/maps');
  });

  it('không có mã điểm danh thì bỏ hẳn khối đó, không hiện ô trống', async () => {
    const spy = mockBrevo();

    await emailService.sendContestReminder({ ...BASE_INPUT, checkInCode: null });

    const { htmlContent, textContent } = sentPayload(spy);
    expect(htmlContent).not.toContain('Mã điểm danh');
    expect(textContent).not.toContain('Mã điểm danh');
  });

  it('không có địa chỉ thì không dựng link chỉ đường rỗng', async () => {
    const spy = mockBrevo();

    await emailService.sendContestReminder({ ...BASE_INPUT, hostBranchAddress: null });

    const { htmlContent } = sentPayload(spy);
    expect(htmlContent).toContain('RC Arena Sài Gòn');
    expect(htmlContent).not.toContain('google.com/maps');
  });

  it('tên giải chứa thẻ HTML bị vô hiệu hoá, không chèn được vào email', async () => {
    // Tên giải do provider tự đặt, đi thẳng vào HTML thì chèn được thẻ.
    const spy = mockBrevo();

    await emailService.sendContestReminder({
      ...BASE_INPUT,
      contestName: '<script>alert(1)</script>Giải "lạ"',
    });

    const { htmlContent } = sentPayload(spy);
    expect(htmlContent).not.toContain('<script>');
    expect(htmlContent).toContain('&lt;script&gt;');
    expect(htmlContent).toContain('&quot;lạ&quot;');
  });
});
