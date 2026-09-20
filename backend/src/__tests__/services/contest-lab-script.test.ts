import vm from 'vm';
import { CLIENT_SCRIPT } from '../../dev-tools/contest-lab.template';

/**
 * Nạp phần JS của Contest Lab vào một DOM giả để soi được vào bên trong.
 *
 * Chạy lô và các kịch bản lệch đường đều nhảy thẳng vào giữa chuỗi 17 bước bằng
 * chỉ số. Chèn thêm một bước ở giữa là mọi chỉ số phía sau lệch đi một, và
 * KHÔNG có gì báo: công cụ vẫn chạy, chỉ là "dừng ở RUNNING" lại dừng ở chỗ
 * khác. Test này neo chỉ số vào TÊN bước, nên lệch là đỏ ngay.
 */
function loadScript() {
  const el = () => ({
    value: '',
    textContent: '',
    innerHTML: '',
    className: '',
    style: {},
    dataset: {},
    classList: { contains: () => false },
    appendChild() {},
    querySelector: () => ({ textContent: '', appendChild() {} }),
    addEventListener() {},
    scrollTop: 0,
    scrollHeight: 0,
    firstChild: null,
  });

  const sandbox = {
    location: { origin: 'http://localhost:3000', search: '?key=abc' },
    URLSearchParams,
    document: {
      getElementById: () => el(),
      createElement: () => el(),
      querySelectorAll: () => [],
    },
    localStorage: { getItem: () => null, setItem() {} },
    navigator: { clipboard: { writeText() {} } },
    // Không cho gọi mạng thật: mọi lời gọi trả về lỗi, phần khởi động đã bắt sẵn.
    fetch: () => Promise.reject(new Error('offline')),
    console,
    setTimeout,
  };
  vm.createContext(sandbox);
  // Trả STEPS/STEP ra ngoài — cả hai là const ở phạm vi cao nhất của script.
  new vm.Script(
    CLIENT_SCRIPT +
      '\n;globalThis.__probe = { STEPS, STEP, SCENARIOS, BATCH, devPath, vietnameseName, slugTen,' +
      ' TEN_NAM, TEN_NU, DEM_NAM, DEM_NU, KHU_VUC, duLieuChiNhanh, tenKhu, soDienThoai,' +
      ' stableHash, resultRowsForMatch, executableMatches,' +
      ' setContestId: (id) => { ctx.contestId = id; } };',
  ).runInContext(sandbox);
  return (sandbox as unknown as { __probe: Probe }).__probe;
}

interface Probe {
  STEPS: Array<{ name: string; api: string; run: () => Promise<string> }>;
  STEP: Record<string, number>;
  SCENARIOS: Record<string, { label: string; run: () => Promise<void> }>;
  BATCH: Array<{ input: string; label: string; to: number; cancel?: boolean }>;
  devPath: (p: string) => string;
  vietnameseName: () => { full: string; ten: string };
  slugTen: (t: string) => string;
  TEN_NAM: string[];
  TEN_NU: string[];
  DEM_NAM: string[];
  DEM_NU: string[];
  KHU_VUC: Array<{ city: string; district: string; lat: number; lng: number; streets: string[] }>;
  duLieuChiNhanh: (khu: Probe['KHU_VUC'][number], i: number) => Record<string, unknown>;
  tenKhu: (district: string) => string;
  soDienThoai: () => string;
  stableHash: (text: string) => number;
  setContestId: (id: string) => void;
  resultRowsForMatch: (match: Record<string, unknown>) => Array<{
    registration_id: string;
    best_lap_seconds: number;
    total_time_seconds: number;
    is_winner: boolean;
  }>;
  executableMatches: (
    matches: Array<Record<string, unknown>>,
    phase: 'QUALIFYING' | 'FINAL',
  ) => Array<Record<string, unknown>>;
}

describe('phần JS của Contest Lab', () => {
  const probe = loadScript();

  it('có đủ 18 bước, mỗi bước đều nêu rõ endpoint nó gọi', () => {
    expect(probe.STEPS).toHaveLength(18);
    probe.STEPS.forEach((s) => {
      expect(typeof s.name).toBe('string');
      expect(s.api.length).toBeGreaterThan(0);
      expect(typeof s.run).toBe('function');
    });
  });

  /**
   * Neo từng chỉ số vào một mẩu tên đặc trưng của bước đó. Đổi tên bước thì test
   * đỏ và người sửa phải nhìn lại chỉ số — đó chính là điều cần xảy ra.
   */
  it('chỉ số bước trỏ đúng bước nó nói', () => {
    const at = (i: number) => probe.STEPS[i].name.toLowerCase();
    expect(at(probe.STEP.CREATE)).toContain('tạo giải');
    expect(at(probe.STEP.FEE_ORDER)).toContain('gói tổ chức');
    expect(at(probe.STEP.FEE_TRANSFER)).toContain('chuyển khoản');
    expect(at(probe.STEP.FEE_CONFIRM)).toContain('xác nhận');
    expect(at(probe.STEP.OPEN)).toContain('mở đăng ký');
    expect(at(probe.STEP.ENABLE_REGISTRATION_NOW)).toContain('đăng ký ngay');
    expect(at(probe.STEP.REGISTER)).toContain('đăng ký');
    expect(at(probe.STEP.ENTRY_FEE)).toContain('phí dự thi');
    expect(at(probe.STEP.APPROVE)).toContain('duyệt đăng ký');
    expect(at(probe.STEP.CLOSE)).toContain('đóng đăng ký');
    expect(at(probe.STEP.CHECKIN)).toContain('điểm danh');
    expect(at(probe.STEP.GENERATE)).toContain('sinh trận');
    expect(at(probe.STEP.RESULTS)).toContain('kết quả');
    expect(at(probe.STEP.PUBLISH)).toContain('xếp hạng');
  });

  it('phần chuẩn bị dừng ngay trước bước tạo giải', () => {
    // Chạy lô chạy phần chuẩn bị đúng MỘT lần rồi mới lặp phần dựng giải. Hai
    // mốc này rời nhau là hoặc tạo lại provider mỗi vòng, hoặc bỏ qua chuẩn bị.
    expect(probe.STEP.PRELUDE_END).toBe(probe.STEP.CREATE);
  });

  it('mọi mục chạy lô dừng trong phạm vi bộ bước', () => {
    expect(probe.BATCH.length).toBeGreaterThan(0);
    probe.BATCH.forEach((b) => {
      expect(b.to).toBeGreaterThan(probe.STEP.CREATE);
      expect(b.to).toBeLessThanOrEqual(probe.STEPS.length);
    });
    // COMPLETED phải chạy trọn bộ, nếu không giải dừng ở RUNNING mà vẫn dán
    // nhãn COMPLETED — sai lệch chỉ lộ ra khi mở giao diện lên xem.
    const completed = probe.BATCH.find((b) => b.label === 'COMPLETED');
    expect(completed?.to).toBe(probe.STEPS.length);
    // CANCELLED phải thật sự gọi huỷ, không thì nó chỉ là một giải OPEN.
    expect(probe.BATCH.find((b) => b.label === 'CANCELLED')?.cancel).toBe(true);
  });

  it('lời gọi dev-tools mang theo khoá mở trang', () => {
    // Endpoint /dev-tools/customers nằm sau chính hàng rào khoá như trang này.
    // Quên kèm khoá thì nhận 404 — trông y hệt "endpoint không tồn tại", và
    // người sửa đi tìm lỗi ở chỗ hoàn toàn khác.
    expect(probe.devPath('/dev-tools/customers')).toBe('/dev-tools/customers?key=abc');
    // Đã có dấu hỏi rồi thì nối bằng &, không thì khoá đè lên tham số cũ.
    expect(probe.devPath('/dev-tools/customers?limit=500')).toBe(
      '/dev-tools/customers?limit=500&key=abc',
    );
  });

  describe('bộ sinh kết quả demo', () => {
    it('cùng contest/match/VĐV luôn cho cùng kết quả và total không nhỏ hơn best lap', () => {
      probe.setContestId('contest-a');
      const match = {
        id: 'match-1',
        match_type: 'TIME_ATTACK',
        round_no: 1,
        metadata: { run_no: 1 },
        participants: [{ registration_id: 'athlete-1', full_name: 'Nguyễn Văn An' }],
      };
      const first = probe.resultRowsForMatch(match);
      const second = probe.resultRowsForMatch(match);
      expect(second).toEqual(first);
      expect(first[0].total_time_seconds).toBeGreaterThanOrEqual(first[0].best_lap_seconds);
      expect(first[0].is_winner).toBe(false);
    });

    it('VĐV và lượt chạy khác nhau không bị điền cùng một thời gian', () => {
      probe.setContestId('contest-a');
      const make = (matchId: string, registrationId: string, runNo: number) =>
        probe.resultRowsForMatch({
          id: matchId,
          match_type: 'TIME_ATTACK',
          metadata: { run_no: runNo },
          participants: [{ registration_id: registrationId }],
        })[0].best_lap_seconds;
      expect(make('m1', 'a1', 1)).not.toBe(make('m2', 'a2', 1));
      expect(make('m1', 'a1', 1)).not.toBe(make('m3', 'a1', 2));
    });

    it('knockout chọn đúng một winner và chỉ lấy vòng sớm nhất đang chạy được', () => {
      probe.setContestId('contest-a');
      const ready = (id: string, round: number) => ({
        id,
        status: 'READY',
        match_type: 'HEAD_TO_HEAD',
        round_no: round,
        participants: [{ registration_id: id + '-a' }, { registration_id: id + '-b' }],
      });
      const matches = [ready('semi', 1), ready('final', 2)];
      expect(probe.executableMatches(matches, 'FINAL').map((m) => m.id)).toEqual(['semi']);
      const results = probe.resultRowsForMatch(matches[0]);
      expect(results.filter((r) => r.is_winner)).toHaveLength(1);
      expect(new Set(results.map((r) => r.total_time_seconds)).size).toBe(results.length);
    });
  });

  describe('sinh tên người Việt cho tài khoản tạo mới', () => {
    it('bỏ dấu đúng để dựng email — email lọt ký tự ngoài ASCII là địa chỉ hỏng', () => {
      expect(probe.slugTen('Trí')).toBe('tri');
      expect(probe.slugTen('Quỳnh')).toBe('quynh');
      expect(probe.slugTen('Thảo')).toBe('thao');
      expect(probe.slugTen('Nghĩa')).toBe('nghia');
      // "đ" KHÔNG phải "d" cộng dấu phụ nên NFD không tách được — phải xử riêng.
      expect(probe.slugTen('Đạt')).toBe('dat');
    });

    it('tên đệm đi đúng với tên chính, không ghép lệch giới', () => {
      // "Nguyễn Thị Cường" hay "Trần Văn Quỳnh" — người Việt nhìn là biết máy
      // sinh, và buổi demo mất tin cậy vì đúng những chi tiết nhỏ như thế.
      const nam = new Set(probe.TEN_NAM);
      const nu = new Set(probe.TEN_NU);
      const demNam = new Set(probe.DEM_NAM);
      const demNu = new Set(probe.DEM_NU);

      for (let i = 0; i < 500; i++) {
        const [, dem, ten] = probe.vietnameseName().full.split(' ');
        // Vài tên đệm dùng chung cho cả hai giới; chỉ xét những cái riêng biệt.
        if (demNam.has(dem) && !demNu.has(dem)) expect(nu.has(ten) && !nam.has(ten)).toBe(false);
        if (demNu.has(dem) && !demNam.has(dem)) expect(nam.has(ten) && !nu.has(ten)).toBe(false);
      }
    });

    it('luôn đủ ba phần và họ không trùng tên chính', () => {
      for (let i = 0; i < 500; i++) {
        const n = probe.vietnameseName();
        const parts = n.full.split(' ');
        expect(parts).toHaveLength(3);
        expect(parts[2]).toBe(n.ten);
        expect(parts[0]).not.toBe(parts[2]);
        expect(probe.slugTen(n.ten)).toMatch(/^[a-z]+$/);
      }
    });
  });

  describe('dữ liệu chi nhánh', () => {
    /** Khung bao quanh phần đất liền Việt Nam, nới rộng một chút cho hải đảo. */
    const VN = { latMin: 8.2, latMax: 23.5, lngMin: 102.1, lngMax: 109.5 };

    it('mọi toạ độ nằm trong lãnh thổ Việt Nam', () => {
      // Toạ độ bịa thì bản đồ ghim chi nhánh xuống giữa biển, mà bản đồ lại là
      // thứ đầu tiên hiện lên ở trang tìm chi nhánh.
      probe.KHU_VUC.forEach((k) => {
        expect(k.lat).toBeGreaterThan(VN.latMin);
        expect(k.lat).toBeLessThan(VN.latMax);
        expect(k.lng).toBeGreaterThan(VN.lngMin);
        expect(k.lng).toBeLessThan(VN.lngMax);
        expect(k.streets.length).toBeGreaterThan(0);
      });
    });

    it('toạ độ nhích ra vẫn đúng khu vực, không trôi sang tỉnh khác', () => {
      probe.KHU_VUC.forEach((k) => {
        for (let i = 0; i < 40; i++) {
          const c = probe.duLieuChiNhanh(k, i) as { latitude: number; longitude: number };
          // Nhích tối đa ~1km để nhiều chi nhánh không chồng lên nhau, nhưng
          // lệch quá thì địa chỉ ghi Quận 7 mà ghim rơi sang quận khác.
          expect(Math.abs(c.latitude - k.lat)).toBeLessThan(0.011);
          expect(Math.abs(c.longitude - k.lng)).toBeLessThan(0.011);
        }
      });
    });

    it('quận đánh số rút gọn thành Q7, không còn trơ lại con số', () => {
      // Cắt thẳng chữ "Quận " thì "Quận 7" còn lại "7", ra "Drift House 7" —
      // nghe như chi nhánh thứ bảy chứ không phải quán ở Quận 7.
      expect(probe.tenKhu('Quận 7')).toBe('Q7');
      expect(probe.tenKhu('Quận Cầu Giấy')).toBe('Cầu Giấy');
      expect(probe.tenKhu('TP. Thủ Đức')).toBe('Thủ Đức');
    });

    it('số điện thoại dùng đầu số di động Việt Nam có thật', () => {
      const dauSo = /^(03[2-9]|05[6889]|07[06-9]|08[1-9]|09[0-9])\d{7}$/;
      for (let i = 0; i < 200; i++) expect(probe.soDienThoai()).toMatch(dauSo);
    });

    it('giờ mở cửa đủ bảy ngày và giờ đóng luôn sau giờ mở', () => {
      const ngay = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      for (let i = 0; i < 10; i++) {
        const c = probe.duLieuChiNhanh(probe.KHU_VUC[i % probe.KHU_VUC.length], i) as {
          operating_hours: Record<string, { open: string; close: string; is_closed: boolean }>;
        };
        expect(Object.keys(c.operating_hours).sort()).toEqual(ngay.slice().sort());
        Object.values(c.operating_hours).forEach((h) => {
          // Ngày nghỉ mới được phép mở bằng đóng; ngày mở cửa mà đóng trước giờ
          // mở thì mọi khung đặt lịch của ngày đó rỗng, và không có gì báo.
          if (!h.is_closed) expect(h.close > h.open).toBe(true);
        });
      }
    });
  });

  it('bốn kịch bản lệch đường đều có nhãn và hàm chạy', () => {
    expect(Object.keys(probe.SCENARIOS).sort()).toEqual([
      'cancelPaid',
      'noshow',
      'overCapacity',
      'withdraw',
    ]);
    Object.values(probe.SCENARIOS).forEach((s) => {
      expect(s.label.length).toBeGreaterThan(0);
      expect(typeof s.run).toBe('function');
    });
  });
});
