/* eslint-disable no-console */
/**
 * Nạp thí sinh giả vào một giải có sẵn để test trọn luồng đấu loại trực tiếp.
 *
 * Script tạo thẳng registration ở trạng thái CONFIRMED (đã duyệt, đã thu lệ phí)
 * — tức đúng tập người mà bốc thăm lấy vào sơ đồ — nên không phải bấm đăng ký,
 * thanh toán, duyệt thủ công cho từng người.
 *
 * Mặc định nạp ÍT HƠN sức chứa 2 người để sơ đồ có ô trống, vì đó là nhánh dễ
 * vỡ nhất (walkover, publish leaderboard). Muốn sơ đồ đầy thì truyền --count.
 *
 * Cách dùng:
 *   npx ts-node --transpile-only src/scripts/seed-contest-entrants.ts --contest=<uuid>
 *   npx ts-node --transpile-only src/scripts/seed-contest-entrants.ts --contest=<uuid> --count=8
 *   npx ts-node --transpile-only src/scripts/seed-contest-entrants.ts --contest=<uuid> --reset
 *
 * Cờ:
 *   --contest=<uuid>  Bắt buộc. ID giải cần nạp.
 *   --count=<n>       Số thí sinh. Mặc định = capacity - 2 (tối thiểu 2).
 *   --rental=<n>      Bao nhiêu người thuê xe quán. Mặc định theo vehicle_policy
 *                     của giải; giải BYOC_ONLY thì luôn là 0.
 *   --pending=<n>     Bao nhiêu người để ở trạng thái CHỜ DUYỆT thay vì đã duyệt,
 *                     để thử nút "Duyệt xe". Chỉ áp cho xe cá nhân — thuê xe
 *                     của quán được backend tự xác nhận nên không giữ chờ được.
 *   --reset           Xoá sơ đồ đấu + thí sinh do script tạo, đưa giải về OPEN
 *                     để bốc thăm lại từ đầu.
 *   --dry-run         Chỉ in ra dự định, không ghi gì vào DB.
 */
import 'dotenv/config';
import 'reflect-metadata';
import bcrypt from 'bcrypt';
import { EntityManager, In, Not } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Contest } from '../models/contest.entity';
import { ContestCafe } from '../models/contest-cafe.entity';
import { ContestMatchParticipant } from '../models/contest-match-participant.entity';
import { ContestMatch } from '../models/contest-match.entity';
import { ContestRegistration } from '../models/contest-registration.entity';
import { User } from '../models/user.entity';
import {
  ContestEntryFeePaymentStatus,
  ContestRegistrationStatus,
  ContestStatus,
  UserRole,
  VehicleSource,
} from '../types';
import { generateUniqueCheckInCode } from '../services/contest/guards';

const SEED_EMAIL_PREFIX = 'seed.entrant.';
const SEED_EMAIL_DOMAIN = '@rcfield.test';
const SEED_PASSWORD = '123456';

/** Tên thật để bảng đấu đọc được như giải thật, không phải "Racer 1, Racer 2". */
const RACER_NAMES = [
  'Nguyễn Hoàng Phúc',
  'Trần Gia Bảo',
  'Lê Minh Quân',
  'Phạm Nhật Nam',
  'Đỗ Khánh Linh',
  'Võ Quốc Hưng',
  'Bùi Thành Đạt',
  'Ngô Tuệ An',
  'Hồ Hải Long',
  'Dương Minh Khoa',
  'Lý Quang Huy',
  'Trịnh Công Chính',
  'Mai Thanh Tùng',
  'Vũ Hoàng Nam',
  'Phan Đức Thịnh',
  'Lâm Hùng Dũng',
  'Tô Hoàng Việt',
  'Đặng Bảo Sơn',
  'Chu Minh Tiến',
  'Hoàng Anh Kiệt',
  'Nguyễn Thu Hà',
  'Trần Diệu My',
  'Lê Bích Ngọc',
  'Phạm Tuấn Kiệt',
  'Đinh Gia Hân',
  'Cao Nhật Minh',
  'Tạ Hoàng Bách',
  'Lưu Trung Nghĩa',
  'Nguyễn Khắc Duy',
  'Trần Vĩnh Phát',
  'Phùng Quốc Đạt',
  'Hà Minh Trí',
];

const BYOC_VEHICLES = [
  { name: 'Tamiya TT-02', brand: 'Tamiya', vehicleClass: 'Touring 1/10' },
  { name: 'Traxxas Slash 4x4', brand: 'Traxxas', vehicleClass: 'Short Course 1/10' },
  { name: 'Yokomo YD-2', brand: 'Yokomo', vehicleClass: 'Drift 1/10' },
  { name: 'MST RMX 2.5', brand: 'MST', vehicleClass: 'Drift 1/10' },
  { name: 'Arrma Typhon 3S', brand: 'Arrma', vehicleClass: 'Buggy 1/8' },
  { name: 'Kyosho Fazer Mk2', brand: 'Kyosho', vehicleClass: 'Touring 1/10' },
  { name: 'HPI Sport 3', brand: 'HPI Racing', vehicleClass: 'Drift 1/10' },
  { name: 'Team Associated DR10', brand: 'Team Associated', vehicleClass: 'Drag 1/10' },
];

type Args = {
  contestId: string;
  count: number | null;
  rental: number | null;
  pending: number | null;
  reset: boolean;
  dryRun: boolean;
};

type CatalogSlot = {
  catalogId: string;
  catalogName: string;
  cafeId: string;
  freeUnits: number;
};

type PlannedEntrant = {
  index: number;
  email: string;
  fullName: string;
  vehicleSource: VehicleSource;
  rentalCatalogId: string | null;
  rentalCatalogName: string | null;
  rentalCafeId: string | null;
  /** Giữ ở PENDING để ban tổ chức còn có cái mà bấm "Duyệt xe". */
  pendingReview: boolean;
};

function parseArgs(): Args {
  const raw = process.argv.slice(2);
  const get = (name: string): string | null => {
    const hit = raw.find((item) => item.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };
  const has = (name: string): boolean => raw.includes(`--${name}`);

  const contestId = get('contest');
  if (!contestId) {
    throw new Error(
      'Thiếu --contest=<uuid>. Ví dụ: --contest=6a07dd3b-7e2c-4ab9-a11a-8896c32d03e9',
    );
  }

  const parseNumber = (value: string | null, label: string): number | null => {
    if (value === null) return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error(`--${label} phải là số nguyên không âm, nhận được "${value}"`);
    }
    return parsed;
  };

  return {
    contestId,
    count: parseNumber(get('count'), 'count'),
    rental: parseNumber(get('rental'), 'rental'),
    pending: parseNumber(get('pending'), 'pending'),
    reset: has('reset'),
    dryRun: has('dry-run'),
  };
}

/**
 * Chỗ trống còn lại của từng dòng xe tại các chi nhánh tham gia.
 *
 * Trừ đi những đăng ký đang giữ chỗ để chạy script nhiều lần không nạp quá số
 * xe có thật — đúng luật `assertContestRentalCatalogHasSlot` áp lúc đăng ký.
 */
async function loadRentalSlots(
  manager: EntityManager,
  contestId: string,
  cafeIds: string[],
): Promise<CatalogSlot[]> {
  if (cafeIds.length === 0) return [];
  const rows: Array<{
    catalog_id: string;
    catalog_name: string;
    cafe_id: string;
    total_units: string;
    taken: string;
  }> = await manager.query(
    `SELECT vc.id            AS catalog_id,
            vc.name          AS catalog_name,
            vc.cafe_id       AS cafe_id,
            COUNT(DISTINCT v.id) AS total_units,
            COALESCE((
              SELECT COUNT(*)
              FROM contest_registrations cr
              WHERE cr.contest_id = $1
                AND cr.rental_catalog_id = vc.id
                AND cr.status <> 'CANCELLED'
            ), 0) AS taken
       FROM vehicle_catalogs vc
       LEFT JOIN vehicles v ON v.catalog_id = vc.id AND v.deleted_at IS NULL
      WHERE vc.cafe_id = ANY($2::uuid[])
        AND vc.deleted_at IS NULL
      GROUP BY vc.id, vc.name, vc.cafe_id
      ORDER BY COUNT(DISTINCT v.id) DESC`,
    [contestId, cafeIds],
  );

  return rows
    .map((row) => ({
      catalogId: row.catalog_id,
      catalogName: row.catalog_name,
      cafeId: row.cafe_id,
      freeUnits: Math.max(0, Number(row.total_units) - Number(row.taken)),
    }))
    .filter((slot) => slot.freeUnits > 0);
}

/** Xoá sơ đồ đấu và thí sinh giả để bốc lại từ đầu. */
async function resetContest(manager: EntityManager, contest: Contest): Promise<void> {
  const matches = await manager.getRepository(ContestMatch).find({
    where: { contestId: contest.id },
  });
  if (matches.length > 0) {
    await manager.getRepository(ContestMatchParticipant).delete({
      matchId: In(matches.map((item) => item.id)),
    });
    await manager.getRepository(ContestMatch).delete({ contestId: contest.id });
  }

  const seedUsers = await manager
    .getRepository(User)
    .createQueryBuilder('user')
    .where('user.email LIKE :pattern', { pattern: `${SEED_EMAIL_PREFIX}%${SEED_EMAIL_DOMAIN}` })
    .getMany();

  let removedRegistrations = 0;
  if (seedUsers.length > 0) {
    const result = await manager.getRepository(ContestRegistration).delete({
      contestId: contest.id,
      userId: In(seedUsers.map((item) => item.id)),
    });
    removedRegistrations = result.affected ?? 0;
  }

  // Kết quả bốc thăm và bảng xếp hạng đã công bố nằm trong config; giữ lại thì
  // lần bốc sau vẫn hiện lá thăm cũ trên giao diện.
  const nextConfig = { ...(contest.config ?? {}) };
  delete nextConfig.bracket_draw;
  delete nextConfig.published_leaderboard;
  contest.config = nextConfig;

  if (contest.status !== ContestStatus.DRAFT) {
    contest.status = ContestStatus.OPEN;
  }
  await manager.getRepository(Contest).save(contest);

  console.log(
    `  đã xoá ${matches.length} trận, ${removedRegistrations} đăng ký giả, ` +
      `xoá lá thăm cũ và bảng xếp hạng đã công bố`,
  );
}

async function ensureSeedUser(
  manager: EntityManager,
  index: number,
  fullName: string,
): Promise<User> {
  const email = `${SEED_EMAIL_PREFIX}${String(index).padStart(2, '0')}${SEED_EMAIL_DOMAIN}`;
  const repo = manager.getRepository(User);
  const existing = await repo.findOne({ where: { email } });
  if (existing) return existing;

  return repo.save(
    repo.create({
      email,
      full_name: fullName,
      phone: `09${String(10000000 + index).slice(0, 8)}`,
      password_hash: await bcrypt.hash(SEED_PASSWORD, 10),
      role: UserRole.CUSTOMER,
      is_active: true,
    }),
  );
}

async function seedEntrants(): Promise<void> {
  const args = parseArgs();
  await AppDataSource.initialize();

  try {
    const contest = await AppDataSource.getRepository(Contest).findOne({
      where: { id: args.contestId },
    });
    if (!contest) {
      throw new Error(`Không tìm thấy contest ${args.contestId}`);
    }

    console.log('');
    console.log(`Giải: ${contest.name}`);
    console.log(
      `  trạng thái ${contest.status} · sức chứa ${contest.capacity ?? 'không giới hạn'}`,
    );
    console.log(`  lệ phí ${Number(contest.entryFee ?? 0).toLocaleString('vi-VN')}đ`);
    console.log('');

    if (args.reset) {
      console.log('Dọn dữ liệu cũ:');
      if (args.dryRun) {
        console.log('  (dry-run, không xoá gì)');
      } else {
        await AppDataSource.transaction((manager) => resetContest(manager, contest));
      }
      console.log('');
    }

    const capacity = contest.capacity ?? 8;
    // Ít hơn sức chứa 2 người để sơ đồ có ô trống — nhánh dễ vỡ nhất.
    const requestedCount = args.count ?? Math.max(2, capacity - 2);
    if (requestedCount > RACER_NAMES.length) {
      throw new Error(`Script chỉ có sẵn ${RACER_NAMES.length} tên thí sinh`);
    }
    if (contest.capacity && requestedCount > contest.capacity) {
      throw new Error(`--count=${requestedCount} vượt sức chứa ${contest.capacity} của giải`);
    }

    const alreadyRegistered = await AppDataSource.getRepository(ContestRegistration).count({
      where: { contestId: contest.id, status: Not(ContestRegistrationStatus.CANCELLED) },
    });
    if (contest.capacity && alreadyRegistered + requestedCount > contest.capacity) {
      throw new Error(
        `Giải đã có ${alreadyRegistered} đăng ký, nạp thêm ${requestedCount} sẽ vượt sức chứa ` +
          `${contest.capacity}. Chạy lại với --reset hoặc giảm --count.`,
      );
    }

    const cafeIds = (
      await AppDataSource.getRepository(ContestCafe).find({
        where: { contestId: contest.id },
        order: { displayOrder: 'ASC' },
      })
    ).map((item) => item.cafeId);

    const vehiclePolicy = String(contest.vehicleRule?.vehicle_policy ?? 'RENTAL_ONLY');
    const rentalSlots =
      vehiclePolicy === 'BYOC_ONLY'
        ? []
        : await loadRentalSlots(AppDataSource.manager, contest.id, cafeIds);
    const totalRentalSlots = rentalSlots.reduce((sum, slot) => sum + slot.freeUnits, 0);

    let rentalCount: number;
    if (vehiclePolicy === 'BYOC_ONLY') {
      rentalCount = 0;
    } else if (vehiclePolicy === 'RENTAL_ONLY') {
      rentalCount = requestedCount;
    } else {
      rentalCount = args.rental ?? Math.min(requestedCount, totalRentalSlots);
    }
    if (args.rental !== null && vehiclePolicy !== 'BYOC_ONLY') {
      rentalCount = Math.min(args.rental, requestedCount);
    }

    if (rentalCount > totalRentalSlots) {
      throw new Error(
        `Cần ${rentalCount} suất thuê xe nhưng các chi nhánh của giải chỉ còn ${totalRentalSlots} ` +
          `chiếc trống. Thêm xe vào kho, hoặc giảm --rental.`,
      );
    }

    // Thuê xe của quán được backend tự xác nhận nên không giữ chờ duyệt được;
    // chờ duyệt chỉ có nghĩa với xe cá nhân, khi ban tổ chức còn phải xem ảnh.
    const byocCount = requestedCount - rentalCount;
    const pendingCount = Math.min(args.pending ?? 0, byocCount);
    if (args.pending !== null && args.pending > byocCount) {
      console.log(
        `Chỉ giữ chờ duyệt được ${byocCount} người (số đăng ký xe cá nhân), ` +
          `bỏ qua phần dư của --pending=${args.pending}.`,
      );
    }

    // Rải đều theo dòng xe: hết chiếc của dòng này mới sang dòng khác.
    const slotQueue: CatalogSlot[] = rentalSlots.map((slot) => ({ ...slot }));
    const planned: PlannedEntrant[] = [];
    for (let index = 0; index < requestedCount; index += 1) {
      const useRental = index < rentalCount;
      const slot = useRental ? slotQueue.find((item) => item.freeUnits > 0) : undefined;
      if (useRental && slot) slot.freeUnits -= 1;

      planned.push({
        pendingReview: !useRental && index - rentalCount < pendingCount,
        index: index + 1,
        email: `${SEED_EMAIL_PREFIX}${String(index + 1).padStart(2, '0')}${SEED_EMAIL_DOMAIN}`,
        fullName: RACER_NAMES[index],
        vehicleSource: useRental ? VehicleSource.RENTAL : VehicleSource.BYOC,
        rentalCatalogId: slot?.catalogId ?? null,
        rentalCatalogName: slot?.catalogName ?? null,
        rentalCafeId: slot?.cafeId ?? null,
      });
    }

    console.log(
      `Sẽ nạp ${requestedCount} thí sinh (${rentalCount} thuê xe, ` +
        `${byocCount} mang xe cá nhân` +
        `${pendingCount > 0 ? `, ${pendingCount} chờ duyệt` : ''}) ` +
        `— chính sách xe: ${vehiclePolicy}`,
    );
    if (contest.capacity) {
      const emptySeats = contest.capacity - requestedCount;
      console.log(
        emptySeats > 0
          ? `Sơ đồ ${contest.capacity} ô sẽ có ${emptySeats} ô trống — đúng nhánh cần test.`
          : `Sơ đồ ${contest.capacity} ô sẽ đầy, không có ô trống.`,
      );
    }
    console.log('');

    if (args.dryRun) {
      for (const entrant of planned) {
        console.log(
          `  ${String(entrant.index).padStart(2)}. ${entrant.fullName.padEnd(20)} ` +
            `${entrant.vehicleSource}${entrant.rentalCatalogName ? ` · ${entrant.rentalCatalogName}` : ''}`,
        );
      }
      console.log('');
      console.log('(dry-run — chưa ghi gì vào DB)');
      return;
    }

    const entryFee = Number(contest.entryFee ?? 0);
    const created: Array<{ entrant: PlannedEntrant; checkInCode: string }> = [];

    await AppDataSource.transaction(async (manager) => {
      for (const entrant of planned) {
        const user = await ensureSeedUser(manager, entrant.index, entrant.fullName);
        const repo = manager.getRepository(ContestRegistration);
        const existing = await repo.findOne({
          where: { contestId: contest.id, userId: user.id },
        });

        const registration = existing ?? repo.create();
        registration.contestId = contest.id;
        registration.userId = user.id;
        registration.participantRoleSnapshot = UserRole.CUSTOMER;
        registration.vehicleSource = entrant.vehicleSource;
        // Chiếc xe cụ thể và phiếu mượn xe chỉ sinh lúc staff giao xe ở check-in.
        registration.vehicleId = null;
        registration.bookingId = null;
        registration.rentalCatalogId = entrant.rentalCatalogId;
        registration.rentalCafeId = entrant.rentalCafeId;
        registration.status = entrant.pendingReview
          ? ContestRegistrationStatus.PENDING
          : ContestRegistrationStatus.CONFIRMED;
        registration.checkInCode =
          existing?.checkInCode ?? (await generateUniqueCheckInCode(manager));
        registration.entryFeeAmount = entryFee;
        registration.entryFeeDueAt = contest.registrationClosesAt ?? contest.startsAt;
        registration.paymentStatus =
          entryFee > 0
            ? ContestEntryFeePaymentStatus.MARKED_PAID
            : ContestEntryFeePaymentStatus.NOT_REQUIRED;
        registration.entryFeeMarkedPaidBy = entryFee > 0 ? contest.createdBy : null;
        registration.entryFeeMarkedPaidAt = entryFee > 0 ? new Date() : null;

        const byoc = BYOC_VEHICLES[(entrant.index - 1) % BYOC_VEHICLES.length];
        registration.metadata = {
          ...(registration.metadata ?? {}),
          seeded_by: 'seed-contest-entrants',
          byoc_declaration:
            entrant.vehicleSource === VehicleSource.BYOC
              ? {
                  vehicle_name: byoc.name,
                  vehicle_brand: byoc.brand,
                  vehicle_class: byoc.vehicleClass,
                  notes: 'Dữ liệu test do seed-contest-entrants tạo',
                }
              : undefined,
        };

        const saved = await repo.save(registration);
        created.push({ entrant, checkInCode: saved.checkInCode ?? '—' });
      }

      // Runtime chỉ thao tác được khi giải ở OPEN/CLOSED/RUNNING; giải còn DRAFT
      // thì bốc thăm sẽ trả về CONTEST_RUNTIME_NOT_READY.
      if (contest.status === ContestStatus.DRAFT) {
        contest.status = ContestStatus.OPEN;
        await manager.getRepository(Contest).save(contest);
        console.log('Giải đang DRAFT — đã mở đăng ký (OPEN) để bốc thăm được.');
        console.log('');
      }
    });

    console.log('Đã nạp xong. Tài khoản đăng nhập đều dùng mật khẩu 123456:');
    console.log('');
    console.log('   #  Họ tên               Mã check-in  Xe');
    console.log('  ─────────────────────────────────────────────────────────────');
    for (const { entrant, checkInCode } of created) {
      const vehicle =
        entrant.vehicleSource === VehicleSource.RENTAL
          ? `thuê · ${entrant.rentalCatalogName ?? '—'}`
          : `cá nhân · ${BYOC_VEHICLES[(entrant.index - 1) % BYOC_VEHICLES.length].name}`;
      console.log(
        `  ${String(entrant.index).padStart(2)}. ${entrant.fullName.padEnd(20)} ` +
          `${checkInCode.padEnd(12)} ${entrant.pendingReview ? 'CHỜ DUYỆT' : 'đã duyệt '} ` +
          `${vehicle}`,
      );
    }
    console.log('');
    console.log('Bước tiếp theo:');
    console.log('  1. Provider mở giải → bấm Bốc thăm để sinh sơ đồ đấu');
    console.log('  2. Staff dùng mã check-in ở trên để điểm danh từng người');
    console.log('  3. Nhập kết quả từng trận, rồi thử công bố kết quả');
    console.log('');
  } finally {
    await AppDataSource.destroy();
  }
}

seedEntrants().catch((error: unknown) => {
  console.error('');
  console.error(`Lỗi: ${error instanceof Error ? error.message : String(error)}`);
  console.error('');
  process.exit(1);
});
