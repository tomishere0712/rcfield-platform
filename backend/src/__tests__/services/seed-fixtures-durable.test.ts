import fs from 'fs';
import path from 'path';

/**
 * Dữ liệu mẫu phải SỐNG được sau khi seed.
 *
 * Job dọn (`expireUnpaidContestRegistrations`) huỷ mọi đăng ký còn
 * `PENDING_PAYMENT` quá 30 phút. Nên một dòng dữ liệu mẫu để ở trạng thái đó
 * sẽ TỰ BIẾN MẤT nửa tiếng sau khi seed — và người demo mở lên chỉ thấy đăng ký
 * đã huỷ, không hiểu vì sao.
 *
 * Đây là loại lỗi không có gì báo: seed chạy xong vẫn "thành công", dữ liệu vẫn
 * đúng lúc kiểm tra ngay, chỉ hỏng sau đó. Nên phải canh ở tầng mã nguồn.
 *
 * Ngoại lệ duy nhất là đăng ký ĐÃ HUỶ: job bỏ qua chúng, và một đăng ký huỷ vì
 * chưa trả tiền là bản ghi lịch sử hợp lệ.
 */

const SEED_DIRS = ['src/seeds', 'src/scripts'];

/** Bắt từng object literal có khai paymentStatus, kèm status đi cùng. */
const FIXTURE_RE = /\{[^{}]*?paymentStatus: '(\w+)'[^{}]*?\}/gs;

function collectFixtures() {
  const found: Array<{ file: string; status: string; paymentStatus: string }> = [];
  for (const dir of SEED_DIRS) {
    const abs = path.join(process.cwd(), dir);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs)) {
      if (!name.endsWith('.ts')) continue;
      const src = fs.readFileSync(path.join(abs, name), 'utf8');
      for (const match of src.matchAll(FIXTURE_RE)) {
        const status = /status: '(\w+)'/.exec(match[0]);
        if (!status) continue;
        found.push({ file: name, status: status[1], paymentStatus: match[1] });
      }
    }
  }
  return found;
}

describe('dữ liệu mẫu giải đấu', () => {
  const fixtures = collectFixtures();

  it('quét được các bản ghi mẫu để mà kiểm', () => {
    // Regex không khớp gì nữa thì mọi ca dưới đây xanh một cách vô nghĩa.
    expect(fixtures.length).toBeGreaterThan(3);
  });

  it('không tạo đăng ký chưa trả tiền mà vẫn còn hiệu lực', () => {
    const tuHuy = fixtures.filter(
      (f) => f.paymentStatus === 'PENDING_PAYMENT' && f.status !== 'CANCELLED',
    );
    expect(tuHuy).toEqual([]);
  });

  it('đăng ký đã huỷ vẫn được để chưa trả tiền — job bỏ qua chúng', () => {
    // Không cấm tuyệt đối PENDING_PAYMENT: người huỷ giữa chừng thì đúng là
    // chưa trả, và đó là lịch sử thật cần giữ.
    const daHuy = fixtures.filter(
      (f) => f.paymentStatus === 'PENDING_PAYMENT' && f.status === 'CANCELLED',
    );
    expect(daHuy.length).toBeGreaterThan(0);
  });
});
