/**
 * Cờ điểm danh ngoài khung giờ phải bật được ở production.
 *
 * Trước đây nó bị chặn cứng bằng `nodeEnv !== 'production'`, nên khai biến môi
 * trường trên máy chủ thật cũng vô ích. Yêu cầu vận hành đã đổi: demo và diễn
 * tập trên production cần điểm danh khi giải chưa tới giờ.
 *
 * Ca test này canh đúng điều đó. Không có nó thì ai đó "dọn dẹp" và thêm lại
 * điều kiện môi trường sẽ không làm đỏ gì cả — mọi test hành vi đều tự đặt cờ
 * ở thời gian chạy nên không chạm tới phần đọc biến môi trường.
 */
function loadEnv(vars: Record<string, string | undefined>) {
  jest.resetModules();
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return jest.requireActual<typeof import('../../config/env')>('../../config/env').env;
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe('cờ DEV_BYPASS_CONTEST_CHECKIN theo môi trường', () => {
  it('BẬT được ở production', () => {
    const env = loadEnv({ NODE_ENV: 'production', DEV_BYPASS_CONTEST_CHECKIN: 'true' });
    expect(env.bypassContestCheckInWindow).toBe(true);
  });

  it('bật được ở development như trước', () => {
    const env = loadEnv({ NODE_ENV: 'development', DEV_BYPASS_CONTEST_CHECKIN: 'true' });
    expect(env.bypassContestCheckInWindow).toBe(true);
  });

  it('mặc định TẮT khi không khai gì — không tự dưng mở ra', () => {
    // Trỏ dotenv sang tệp không tồn tại. Xoá biến khỏi `process.env` là chưa
    // đủ: `import 'dotenv/config'` đọc lại `.env` của máy đang chạy và dựng
    // lại đúng biến vừa xoá, nên ca test phản ánh cấu hình máy chứ không phản
    // ánh mặc định của mã.
    const env = loadEnv({
      NODE_ENV: 'production',
      DEV_BYPASS_CONTEST_CHECKIN: undefined,
      DOTENV_CONFIG_PATH: '/tmp/rcfield-khong-ton-tai.env',
    });
    expect(env.bypassContestCheckInWindow).toBe(false);
  });

  it('khai false thì tắt', () => {
    const env = loadEnv({ NODE_ENV: 'production', DEV_BYPASS_CONTEST_CHECKIN: 'false' });
    expect(env.bypassContestCheckInWindow).toBe(false);
  });

  it('cờ bypass cửa sổ đăng ký bật độc lập ở production', () => {
    const env = loadEnv({
      NODE_ENV: 'production',
      DEV_BYPASS_CONTEST_REGISTRATION_WINDOW: 'true',
    });
    expect(env.bypassContestRegistrationWindow).toBe(true);
  });

  it('cờ bypass cửa sổ đăng ký mặc định tắt', () => {
    const env = loadEnv({
      DEV_BYPASS_CONTEST_REGISTRATION_WINDOW: undefined,
      DOTENV_CONFIG_PATH: '/tmp/rcfield-khong-ton-tai.env',
    });
    expect(env.bypassContestRegistrationWindow).toBe(false);
  });
});
