import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Ranh giới của phần mô phỏng.
 *
 * Cả thiết kế đứng trên một lời khẳng định: **phần đối soát là mã production,
 * chỉ có ngân hàng là giả**. Lời khẳng định đó chỉ đúng nếu phần mô phỏng không
 * với tay vào logic đặt lịch — nếu nó gọi thẳng `payment.service`, thì cái đang
 * chạy lúc demo không phải đường tiền thật mà là một lối tắt trông giống.
 *
 * Test này biến lời hứa thành thứ kiểm chứng được. Nó sẽ đỏ ngay khi có người
 * thêm một import tiện tay vào thư mục mô phỏng.
 */
const SANDBOX_PATHS = [
  join(__dirname, '../../services/sandbox-bank'),
  join(__dirname, '../../routes/sandbox-bank.routes.ts'),
];

/** Import bị cấm — chạm vào là phần mô phỏng không còn gỡ ra được nữa. */
const FORBIDDEN_IMPORTS = [
  'payment.service',
  'booking.service',
  'bank-webhook.service',
  'payment-gateway',
  '../../models/',
  '../models/',
];

function collectSourceFiles(target: string): string[] {
  const stat = statSync(target);
  if (stat.isFile()) return target.endsWith('.ts') ? [target] : [];

  return readdirSync(target).flatMap((entry) => collectSourceFiles(join(target, entry)));
}

describe('ngân hàng mô phỏng: ranh giới phụ thuộc', () => {
  const files = SANDBOX_PATHS.flatMap(collectSourceFiles);

  it('tìm thấy mã nguồn của phần mô phỏng để kiểm', () => {
    // Nếu ai đó đổi tên thư mục, test phải hỏng chứ không âm thầm bỏ qua.
    expect(files.length).toBeGreaterThan(0);
  });

  /**
   * Rút đường dẫn của các câu lệnh import/require thật.
   *
   * Không quét cả file theo chuỗi con: comment trong chính những file này có
   * nhắc tên các module bị cấm để cảnh báo người đọc, và quét thô sẽ bắt nhầm
   * đúng dòng cảnh báo đó.
   */
  function extractImportPaths(source: string): string[] {
    const paths: string[] = [];
    const patterns = [
      /^\s*import\s[^'"]*from\s+['"]([^'"]+)['"]/gm,
      /^\s*import\s+['"]([^'"]+)['"]/gm,
      /require\(\s*['"]([^'"]+)['"]\s*\)/g,
      /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];

    for (const pattern of patterns) {
      let match = pattern.exec(source);
      while (match !== null) {
        paths.push(match[1]);
        match = pattern.exec(source);
      }
    }
    return paths;
  }

  it.each(FORBIDDEN_IMPORTS)('không import "%s"', (forbidden) => {
    const offenders = files.filter((file) =>
      extractImportPaths(readFileSync(file, 'utf8')).some((path) => path.includes(forbidden)),
    );

    expect(offenders).toEqual([]);
  });

  it('gọi điểm nhận thông báo qua HTTP chứ không gọi hàm trực tiếp', () => {
    const source = files.map((file) => readFileSync(file, 'utf8')).join('\n');

    // Đi qua đúng đường mạng mà dịch vụ đối soát thật sẽ đi, nghĩa là xác thực
    // khoá, giới hạn tần suất và chống trùng đều chạy thật trong lúc demo.
    expect(source).toContain('fetch(');
    expect(source).toContain('bank-webhook');
  });
});
