import { AppDataSource } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { Cafe } from '../models/cafe.entity';
import { AppError, BookingMode, BookingParticipantType, BookingSource } from '../types';
import {
  assertMaxAdvanceBookingDays,
  assertMinimumBookingNotice,
  assertSlotWithinOperatingHours,
  assertWithinSubscriptionCoverage,
  countOccupiedByocParticipants,
  createBooking,
} from './booking.service';
import {
  acknowledgePriceChange,
  firstMissingField,
  isConfirmationTurn,
  matchesConfirmationKeyword,
  clearDraft,
  loadDraft,
  saveDraft,
  touchDraft,
  type FbBookingDraft,
  type RequiredField,
} from './fb-booking-draft';
import { extractBookingFields, type ExtractedFields } from './fb-booking-extractor';
import { handler as checkAvailabilityTool } from './chat-tools/check-availability';
import { classifyTurn } from './fb-booking-triage';
import { getEffectiveMultiplier } from './pricing.service';
import { normalizePhone, resolveFacebookSoftUser } from './fb-soft-user';
import { getVerifiedBankSettings } from './payment-method-resolver';
import { createCheckoutUrl } from './payment.service';
import { uploadQrForMessenger } from './fb-qr-image';

/**
 * Bộ điều phối luồng đặt lịch qua Facebook Messenger.
 *
 * ── Ai cầm quyền tạo đơn ────────────────────────────────────────────────────
 *
 * Backend, không phải mô hình ngôn ngữ. Mô hình chỉ được cấp các công cụ CHỈ ĐỌC
 * (tra chỗ trống, liệt kê xe, báo giá) và một bộ trích xuất thông tin. Hàm tạo
 * đơn nằm ở đây, ngoài tầm với của nó.
 *
 * Đây là ràng buộc CẤU TRÚC chứ không phải lời dặn trong prompt: không có cách
 * nào để mô hình gọi tới `createBooking` kể cả khi nó muốn.
 *
 * ── Quan hệ với luồng hỏi–đáp sẵn có ────────────────────────────────────────
 *
 * `tryHandleBookingTurn` trả `null` nghĩa là "lượt này không thuộc luồng đặt
 * lịch" — bộ điều khiển webhook cứ chạy tiếp đường hỏi–đáp bình thường. Nhờ vậy
 * việc thêm tính năng này không đụng gì tới hành vi trả lời câu hỏi đã có.
 */

/**
 * Những trường mang thông tin đặt lịch, dùng để so trước/sau một lượt.
 *
 * Không so `state` — nó đổi theo câu hỏi kế tiếp chứ không phản ánh việc khách
 * có cung cấp thêm gì hay không.
 */
/**
 * Khách có nêu ra một giá trị nào cho luồng đặt lịch không — kể cả giá trị SAI.
 *
 * Phân biệt "gõ nhầm số điện thoại" với "hỏi chuyện khác". Cái đầu cần báo lại
 * cho khách sửa; cái sau cần được trả lời tử tế rồi mới quay về câu đang dở.
 */
function hasFieldSignal(extracted: ExtractedFields): boolean {
  return Boolean(
    extracted.fullName ||
    extracted.phone ||
    extracted.email ||
    extracted.playerCount ||
    extracted.playMode ||
    extracted.slotStart ||
    extracted.trackName ||
    extracted.vehicleNames?.length ||
    extracted.declinedEmail,
  );
}

function draftFingerprint(draft: FbBookingDraft): string {
  return JSON.stringify([
    draft.fullName,
    draft.phone,
    draft.email,
    draft.playerCount,
    draft.playMode,
    draft.trackConfigId,
    draft.slotStart,
    draft.slotEnd,
    draft.vehicleIds,
  ]);
}

/** Kết quả một lượt thuộc luồng đặt lịch. */
export interface BookingTurnResult {
  /** Chữ để gửi cho khách. */
  text: string;
  /** URL trang thanh toán — có thì gửi kèm nút bấm. */
  paymentUrl?: string;
  /** URL công khai của ảnh QR — có thì gửi thêm một tin ảnh. */
  qrImageUrl?: string;
}

export interface BookingTurnContext {
  cafeId: string;
  pageId: string;
  psid: string;
  text: string;
}

/** Số slot mặc định khi khách không nói rõ chơi bao lâu. */
const DEFAULT_SLOT_COUNT = 1;

/**
 * Câu hỏi mà luồng đặt lịch đang chờ trả lời, để đường hỏi–đáp nhắc lại.
 *
 * Khách hỏi xen ngang một câu, được trả lời, rồi... im lặng. Bot vẫn đang chờ
 * số điện thoại nhưng không nói ra, nên từ phía khách luồng đặt lịch bốc hơi.
 * Trả về `null` khi không có đơn nháp hoặc đã đủ trường.
 */
export async function pendingBookingQuestion(pageId: string, psid: string): Promise<string | null> {
  const draft = await loadDraft(pageId, psid);
  if (!draft || draft.state === 'BLOCKED_REAL_ACCOUNT') return null;
  if (draft.state === 'AWAITING_PAYMENT') return null;

  if (firstMissingField(draft) === null) {
    return 'Quay lại đơn đặt lịch: bạn gõ "xác nhận" để mình giữ chỗ, hoặc "huỷ" nếu đổi ý nhé.';
  }
  const question = await nextQuestion(draft);
  return question ? `Quay lại đơn đặt lịch nhé — ${question.text}` : null;
}

function loginUrl(): string {
  return new URL('/login', env.frontendUrl).toString();
}

/**
 * Chi nhánh đã sẵn sàng nhận đặt lịch qua Messenger chưa.
 *
 * Kiểm NGAY khi khách bộc lộ ý định, không phải ở bước cuối.
 * `buildBankTransferCheckout` ném `PAYMENT_METHOD_UNAVAILABLE` khi chi nhánh
 * chưa cấu hình tài khoản nhận tiền — mà lúc đó khách đã khai xong tên, số điện
 * thoại, khung giờ và chọn xe. Bắt họ đi hết quãng đường đó rồi mới báo là hỏng
 * thì tệ hơn nhiều so với từ chối ngay từ câu đầu.
 */
async function cafeCanAcceptBookings(cafeId: string): Promise<boolean> {
  const settings = await getVerifiedBankSettings(cafeId);
  return Boolean(settings?.bankBin && settings.accountNumber && settings.accountName);
}

/** Ghi các trường vừa rút được vào đơn nháp, sau khi backend tự kiểm lại từng cái. */
async function mergeExtracted(
  draft: FbBookingDraft,
  extracted: ExtractedFields,
  cafe: Cafe,
): Promise<FbBookingDraft> {
  const next: FbBookingDraft = { ...draft };

  if (extracted.fullName?.trim()) next.fullName = extracted.fullName.trim();

  // Số điện thoại: chỉ nhận khi CHUẨN HOÁ ĐƯỢC. Mô hình hoàn toàn có thể trả về
  // một chuỗi trông giống số điện thoại nhưng không phải.
  if (extracted.phone) {
    const normalized = normalizePhone(extracted.phone);
    if (normalized) next.phone = normalized;
  }

  if (extracted.email?.includes('@')) next.email = extracted.email.trim();
  if (extracted.declinedEmail) next.email = undefined;

  if (extracted.playerCount && extracted.playerCount > 0 && extracted.playerCount <= 20) {
    next.playerCount = Math.floor(extracted.playerCount);
  }

  if (extracted.playMode === 'RENTAL' || extracted.playMode === 'BYOC') {
    next.playMode = extracted.playMode;
  }

  // Khung giờ: bỏ nếu nằm trong quá khứ. Mô hình suy "tối nay" ra một mốc đã
  // trôi qua là chuyện bình thường khi khách nhắn lúc nửa đêm.
  if (extracted.slotStart) {
    const start = new Date(extracted.slotStart);
    if (!Number.isNaN(start.getTime()) && start.getTime() > Date.now()) {
      const slotCount =
        extracted.slotCount && extracted.slotCount > 0 ? extracted.slotCount : DEFAULT_SLOT_COUNT;
      next.slotStart = start.toISOString();
      next.slotEnd = new Date(
        start.getTime() + slotCount * cafe.slotDurationMinutes * 60_000,
      ).toISOString();
    }
  }

  return next;
}

/**
 * Tra danh sách đường đua đang hoạt động của chi nhánh.
 *
 * Chi nhánh chỉ có MỘT đường đua thì không hỏi — hỏi một câu chỉ có một đáp án
 * là làm phiền khách mà không thu được thông tin gì.
 */
async function listTrackConfigs(
  cafeId: string,
): Promise<Array<{ id: string; name: string; description: string | null }>> {
  return AppDataSource.query<Array<{ id: string; name: string; description: string | null }>>(
    `SELECT ctc.id, tt.name, ctc.description
       FROM cafe_track_configs ctc
       JOIN track_types tt ON tt.id = ctc.track_type_id
      WHERE ctc.cafe_id = $1 AND ctc.is_active = true AND ctc.deleted_at IS NULL
      ORDER BY ctc.sort_order ASC`,
    [cafeId],
  );
}

/**
 * Danh mục xe MỜI ĐƯỢC cho khách.
 *
 * ── Hai bộ lọc, cả hai đều bắt buộc ─────────────────────────────────────────
 *
 * 1. **Tương thích với sân đã chọn.** `createBooking` từ chối xe không nằm
 *    trong `compatible_track_types` của sân, kèm mã `VEHICLE_TRACK_INCOMPATIBLE`.
 *    RC Tân Bình có 2 sân mà mỗi danh mục xe chỉ chạy được 1 sân — nên mời
 *    không lọc là chắc chắn có tổ hợp khách chọn xong bị từ chối ở bước cuối.
 *    Danh sách rỗng nghĩa là "chạy được mọi sân", theo đúng cách `createBooking`
 *    hiểu.
 *
 * 2. **Còn ít nhất một chiếc sẵn sàng.** Danh mục mà mọi chiếc đều đang bảo trì
 *    thì mời cũng vô nghĩa.
 */
async function listVehicleCatalogs(
  cafeId: string,
  trackTypeId?: string | null,
): Promise<Array<{ id: string; name: string; hourlyRate: number; tier: string }>> {
  return AppDataSource.query<Array<{ id: string; name: string; hourlyRate: number; tier: string }>>(
    `SELECT vc.id, vc.name, vc.hourly_rate::float AS "hourlyRate", vc.tier
       FROM vehicle_catalogs vc
      WHERE vc.cafe_id = $1
        AND vc.deleted_at IS NULL
        AND ($2::uuid IS NULL
             OR COALESCE(array_length(vc.compatible_track_types, 1), 0) = 0
             OR $2::uuid = ANY(vc.compatible_track_types))
        AND EXISTS (
          SELECT 1 FROM vehicles v
           WHERE v.catalog_id = vc.id
             AND v.status = 'AVAILABLE'
             AND v.deleted_at IS NULL
        )
      ORDER BY vc.name ASC`,
    [cafeId, trackTypeId ?? null],
  );
}

/** Loại sân của một cấu hình sân — cần để lọc xe tương thích. */
async function trackTypeOf(trackConfigId: string): Promise<string | null> {
  const [row] = await AppDataSource.query<Array<{ trackTypeId: string }>>(
    `SELECT track_type_id AS "trackTypeId" FROM cafe_track_configs WHERE id = $1`,
    [trackConfigId],
  );
  return row?.trackTypeId ?? null;
}

/**
 * Chọn một mục từ danh sách đã đánh số: thử theo TÊN trước, rồi mới theo SỐ.
 *
 * Bot liệt kê "1. Đường nhựa (Asphalt) / 2. Đường thảm (Carpet)" nên khách trả
 * lời "sân 1" là chuyện đương nhiên. Chỉ nhận chuỗi thuần số thì câu đó khớp
 * hụt, và bot hỏi lại đúng danh sách vừa đưa — vòng lặp không lối ra.
 *
 * Tên trước số vì có sân đặt tên sẵn là "Sân 1"; lúc đó tên mới là ý khách,
 * không phải thứ tự trong danh sách.
 */
function pickFromList<T extends { name: string }>(items: T[], spoken: string): T | undefined {
  const byName = matchByName(items, spoken);
  if (byName) return byName;

  const digits = spoken.match(/\d{1,2}/g);
  if (digits?.length === 1) {
    const index = Number(digits[0]);
    if (index >= 1 && index <= items.length) return items[index - 1];
  }
  return undefined;
}

/** So khớp lỏng theo tên — khách gõ "xe A" phải khớp được với "Xe A - Traxxas". */
function matchByName<T extends { name: string }>(items: T[], spoken: string): T | undefined {
  const needle = spoken.trim().toLowerCase();
  if (!needle) return undefined;
  return (
    items.find((item) => item.name.toLowerCase() === needle) ??
    items.find((item) => item.name.toLowerCase().includes(needle)) ??
    items.find((item) => needle.includes(item.name.toLowerCase()))
  );
}

/**
 * Điền `trackConfigId` và `vehicleIds` — hai trường bắt buộc mà bộ trích xuất
 * không tự sinh ra được vì chúng là mã trong cơ sở dữ liệu, không phải thứ khách
 * nói ra.
 *
 * Không có bước này thì đơn nháp KHÔNG BAO GIỜ đủ trường, và cuộc trò chuyện
 * lặp vô hạn ở bước xác nhận.
 */
async function resolveIds(
  draft: FbBookingDraft,
  extracted: ExtractedFields,
): Promise<FbBookingDraft> {
  const next: FbBookingDraft = { ...draft };

  // Cho phép ĐỔI sân đã chọn, không chỉ điền lần đầu.
  //
  // Đường giải mã bằng luật chỉ đặt `trackName` khi sân còn trống, nên có
  // `trackName` mà sân đã chọn rồi nghĩa là mô hình đọc ra một yêu cầu đổi —
  // tin nó. Thiếu nhánh này thì "đổi sang sân 2" bị bỏ qua âm thầm: bot vẫn
  // tóm tắt sân cũ và khách không hiểu vì sao.
  if (!next.trackConfigId || extracted.trackName) {
    const tracks = await listTrackConfigs(next.cafeId);
    if (tracks.length === 1) {
      next.trackConfigId = tracks[0].id;
    } else if (extracted.trackName) {
      // Số thứ tự trước, vì đó là đáp án luôn khớp được. Chỉ nhận khi câu trả
      // lời NGẮN — "2" là chọn sân số 2, còn "2 người" thì không phải.
      const picked = pickFromList(tracks, extracted.trackName);
      if (picked) next.trackConfigId = picked.id;
    }
  }

  if (next.playMode === 'RENTAL' && extracted.vehicleNames?.length) {
    // Chỉ đối chiếu trong những xe THẬT SỰ mời được cho sân đã chọn — nếu không,
    // khách gõ đúng tên một chiếc không chạy được sân đó và bị từ chối ở bước cuối.
    const trackTypeId = next.trackConfigId ? await trackTypeOf(next.trackConfigId) : null;
    const catalogs = await listVehicleCatalogs(next.cafeId, trackTypeId);
    const matched = extracted.vehicleNames
      .map((spoken) => pickFromList(catalogs, spoken)?.id)
      .filter((id): id is string => Boolean(id));
    if (matched.length) next.vehicleIds = matched;
  }

  return next;
}

/** Tên và giá thuê của các xe khách đã chọn. */
async function loadChosenVehicles(
  cafeId: string,
  vehicleIds: string[],
): Promise<Array<{ name: string; hourlyRate: number }>> {
  if (!vehicleIds.length) return [];
  return AppDataSource.query<Array<{ name: string; hourlyRate: number }>>(
    `SELECT name, hourly_rate::float AS "hourlyRate"
       FROM vehicle_catalogs
      WHERE cafe_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL`,
    [cafeId, vehicleIds],
  );
}

/**
 * Tính tổng tiền để TRÌNH cho khách trước khi họ xác nhận.
 *
 * ── Vì sao phải có ──────────────────────────────────────────────────────────
 *
 * FR-005 đòi bản tóm tắt nêu tổng số tiền phải trả — không ai xác nhận một đơn
 * mà không biết mình sẽ trả bao nhiêu.
 *
 * Và nó còn giữ một chốt chặn khác: `finalizeBooking` so con số này với tổng
 * tiền thật lúc tạo đơn để phát hiện giá đổi giữa chừng (FR-037). Không gán
 * `quotedTotal` thì phép so đó luôn sai và chốt chặn thành code chết — đúng
 * tình trạng trước lần sửa này.
 *
 * Con số ở đây chỉ để HIỂN THỊ. Số tiền thu thật vẫn do `createBooking` chốt và
 * ghi vào ảnh chụp đơn, theo Nguyên tắc I của hiến chương.
 */
interface Quote {
  slotFee: number;
  rentalFee: number;
  total: number;
}

async function quoteDraft(draft: FbBookingDraft, cafe: Cafe): Promise<Quote | undefined> {
  if (!draft.slotStart || !draft.slotEnd || !draft.playerCount) return undefined;

  const start = new Date(draft.slotStart);
  const minutes = (new Date(draft.slotEnd).getTime() - start.getTime()) / 60_000;
  const slotCount = minutes / cafe.slotDurationMinutes;

  const { multiplier } = await getEffectiveMultiplier(cafe.id, start);
  const slotFee = Number(cafe.slotFeeRate) * multiplier * slotCount * draft.playerCount;

  let rentalFee = 0;
  if (draft.playMode === BookingMode.RENTAL && draft.vehicleIds?.length) {
    const vehicles = await loadChosenVehicles(cafe.id, draft.vehicleIds);
    rentalFee = vehicles.reduce((sum, v) => sum + v.hourlyRate * (minutes / 60), 0);
  }

  return {
    slotFee: Math.round(slotFee),
    rentalFee: Math.round(rentalFee),
    total: Math.round(slotFee + rentalFee),
  };
}

/**
 * Đổi lỗi nghiệp vụ thành câu tiếng Việt nói được cho khách.
 *
 * `createBooking` và các hàm kiểm luật của nó ném `AppError` với thông điệp
 * TIẾNG ANH — chúng vốn dành cho lập trình viên và cho phản hồi API, không phải
 * cho khách đọc. Ném thẳng `err.message` vào Messenger thì khách nhận được
 * "Selected slot is outside cafe operating hours", vừa không hiểu vừa không biết
 * phải sửa gì.
 *
 * Câu thay thế phải nói được ĐIỀU CẦN LÀM, không chỉ nói cái gì sai.
 */
function friendlyBookingError(err: AppError, cafe?: Cafe | null): string {
  const hours = cafe?.operatingHours as
    | Record<string, { open?: string; close?: string; is_closed?: boolean }>
    | null
    | undefined;
  const today = Object.values(hours ?? {}).find((day) => day?.open && day?.close);
  const hint = today ? ` Quán mở cửa khoảng ${today.open}–${today.close} ạ.` : '';

  switch (err.code) {
    case 'SLOT_OUTSIDE_OPERATING_HOURS':
    case 'OUTSIDE_OPERATING_HOURS':
      return `Khung giờ này nằm ngoài giờ mở cửa của quán ạ.${hint} Bạn chọn giờ khác giúp mình nhé?`;
    case 'SLOT_IN_PAST':
      return 'Khung giờ này đã trôi qua rồi ạ. Bạn chọn giờ khác giúp mình nhé?';
    case 'BOOKING_NOTICE_TOO_SHORT':
    case 'MIN_BOOKING_NOTICE':
      return 'Bạn cần đặt trước sớm hơn một chút ạ. Bạn chọn khung giờ xa hơn giúp mình nhé?';
    case 'MAX_ADVANCE_BOOKING_EXCEEDED':
      return 'Quán chưa nhận đặt xa tới ngày đó ạ. Bạn chọn ngày gần hơn giúp mình nhé?';
    case 'BYOC_CAPACITY_FULL':
      return 'Khung giờ này đã kín chỗ cho khách mang xe riêng ạ. Bạn chọn giờ khác nhé?';
    case 'VEHICLE_UNAVAILABLE':
    case 'SLOT_LOCKED':
      return 'Xe bạn chọn vừa có người thuê mất rồi ạ. Bạn chọn xe khác giúp mình nhé?';
    case 'CONTEST_SLOT_LOCKED':
      return 'Khung giờ này được giữ riêng cho một giải đấu ạ. Bạn chọn giờ khác giúp mình nhé?';
    default:
      // Không nhận ra mã lỗi thì KHÔNG đọc nguyên văn thông điệp kỹ thuật ra cho
      // khách — nói chung chung còn hơn nói một câu họ không hiểu.
      logger.warn('FbBooking', 'lỗi nghiệp vụ chưa có câu tiếng Việt', {
        code: err.code,
        message: err.message,
      });
      return 'Khung giờ này hiện không đặt được ạ. Bạn chọn khung giờ khác giúp mình nhé?';
  }
}

/** Kết quả tra chỗ trống cho khung giờ khách vừa chọn. */
interface SlotCheck {
  ok: boolean;
  /** Câu trả lời khi khung giờ không dùng được. */
  message?: string;
}

/**
 * Kiểm khung giờ khách chọn có thật sự đặt được không — NGAY TRONG hội thoại.
 *
 * ── Vì sao gọi thẳng hàm, không để mô hình gọi ──────────────────────────────
 *
 * `check_availability` vốn là công cụ cấp cho Gemini. Nhưng ở đây backend đã
 * biết chính xác cần tra ngày nào, nên đưa qua mô hình chỉ thêm ba cách hỏng mà
 * không thêm được gì: mô hình có thể quên gọi, gọi sai ngày, hoặc đọc sai JSON
 * trả về. Gọi thẳng thì không còn xác suất nào.
 *
 * ── Vì sao phải kiểm ở đây ──────────────────────────────────────────────────
 *
 * Trước bước này, bộ điều phối nhận khung giờ khách nói rồi đi thẳng tới
 * `createBooking`. Khung giờ kín chỗ chỉ lộ ra ở bước cuối — sau khi khách đã
 * khai tên, số điện thoại và chọn xe. Cùng kiểu hỏng với lỗi giải đấu: hứa xong
 * nuốt lời.
 */
/**
 * Sức chứa xe cá nhân của ĐÚNG sân khách chọn.
 *
 * ── Vì sao không dùng `check_availability` cho việc này ─────────────────────
 *
 * Công cụ đó đọc `cafes.byoc_capacity` — con số cấp QUÁN — và đếm gộp mọi
 * booking xe cá nhân của cả chi nhánh vào một bộ đếm. `createBooking` thì dùng
 * sức chứa của TỪNG SÂN. Hai con số khác nhau, và sai cả hai chiều:
 *
 *   RC Tân Bình: cấp quán = 3, nhưng Asphalt = 2 và Carpet = 10.
 *     • chọn Asphalt, đã có 2 người → công cụ nói còn chỗ, tạo đơn thì bị từ chối
 *     • chọn Carpet, đã có 3 người → công cụ nói hết chỗ, trong khi còn trống 7
 *
 * Chiều thứ hai tệ hơn: đuổi mất khách đang muốn trả tiền, mà không ai biết.
 */
async function checkTrackCapacity(draft: FbBookingDraft): Promise<SlotCheck> {
  if (draft.playMode !== 'BYOC' || !draft.trackConfigId || !draft.slotStart || !draft.slotEnd) {
    return { ok: true };
  }

  const [track] = await AppDataSource.query<
    Array<{ byocCapacity: number; trackTypeId: string; name: string }>
  >(
    `SELECT ctc.byoc_capacity AS "byocCapacity", ctc.track_type_id AS "trackTypeId", tt.name
       FROM cafe_track_configs ctc
       JOIN track_types tt ON tt.id = ctc.track_type_id
      WHERE ctc.id = $1`,
    [draft.trackConfigId],
  );
  if (!track) return { ok: true };

  const occupied = await countOccupiedByocParticipants(
    draft.cafeId,
    new Date(draft.slotStart),
    new Date(draft.slotEnd),
    draft.trackConfigId,
    track.trackTypeId,
  );
  const free = track.byocCapacity - occupied;
  const wanted = draft.playerCount ?? 1;

  if (free >= wanted) return { ok: true };

  return {
    ok: false,
    message:
      free > 0
        ? `Sân ${track.name} khung giờ này chỉ còn ${free} chỗ, mà bạn cần ${wanted} ạ. Bạn giảm số người hoặc đổi sân/khung giờ giúp mình nhé?`
        : `Sân ${track.name} khung giờ này đã kín chỗ rồi ạ. Bạn đổi sân hoặc khung giờ khác giúp mình nhé?`,
  };
}

/**
 * Xe khách chọn có còn chiếc nào rảnh trong đúng khung giờ đó không.
 *
 * Tương thích với sân là điều kiện CẦN, chưa đủ: một danh mục có 4 chiếc mà cả
 * 4 đã bị thuê trong khung giờ đó thì vẫn không đặt được. `createBooking` bắt
 * được ở bước cuối; bắt sớm ở đây thì khách đổi xe được ngay thay vì phải khai
 * lại từ đầu.
 */
async function checkRentalAvailability(draft: FbBookingDraft): Promise<SlotCheck> {
  if (draft.playMode !== 'RENTAL' || !draft.vehicleIds?.length) return { ok: true };
  if (!draft.slotStart || !draft.slotEnd) return { ok: true };

  const rows = await AppDataSource.query<Array<{ name: string; free: number }>>(
    `SELECT vc.name,
            (SELECT COUNT(*)::int FROM vehicles v
              WHERE v.catalog_id = vc.id
                AND v.status = 'AVAILABLE'
                AND v.deleted_at IS NULL
                AND NOT EXISTS (
                  SELECT 1 FROM booking_vehicles bv
                    JOIN bookings b ON b.id = bv.booking_id
                   WHERE bv.vehicle_id = v.id
                     AND b.status IN ('PENDING', 'CONFIRMED')
                     AND b.slot_start < $3::timestamptz
                     AND b.slot_end   > $2::timestamptz
                )) AS free
       FROM vehicle_catalogs vc
      WHERE vc.id = ANY($1::uuid[])`,
    [draft.vehicleIds, draft.slotStart, draft.slotEnd],
  );

  const taken = rows.filter((row) => row.free < 1);
  if (taken.length === 0) return { ok: true };

  return {
    ok: false,
    message: `${taken.map((t) => t.name).join(', ')} đã có người thuê trong khung giờ này rồi ạ. Bạn chọn xe khác giúp mình nhé?`,
  };
}

async function checkSlotStillOffered(draft: FbBookingDraft): Promise<SlotCheck> {
  if (!draft.slotStart || !draft.playMode) return { ok: true };

  const start = new Date(draft.slotStart);
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(start);
  const wantedTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
  }).format(start);

  let parsed: {
    available?: boolean;
    message?: string;
    rental?: { availableTimes?: string[] };
    byoc?: { availableTimes?: string[] };
  };
  try {
    parsed = JSON.parse(await checkAvailabilityTool(draft.cafeId, { date: dateStr }));
  } catch (err) {
    // Tra hỏng thì KHÔNG chặn khách — `createBooking` vẫn còn chốt chặn cuối.
    // Chặn ở đây khi chưa chắc chắn là từ chối một đơn có thể hợp lệ.
    logger.warn('FbBooking', 'không tra được chỗ trống, bỏ qua bước kiểm sớm', err);
    return { ok: true };
  }

  if (parsed.available === false) {
    return { ok: false, message: parsed.message ?? 'Ngày này bên mình đã kín chỗ ạ.' };
  }

  const offered =
    draft.playMode === 'BYOC'
      ? (parsed.byoc?.availableTimes ?? [])
      : (parsed.rental?.availableTimes ?? []);

  if (offered.includes(wantedTime)) return { ok: true };

  const suggestions = offered.slice(0, 5).join(', ');
  return {
    ok: false,
    message: suggestions
      ? `Khung ${wantedTime} ngày ${dateStr} đã kín chỗ rồi ạ. Bên mình còn: ${suggestions}. Bạn chọn giúp mình khung khác nhé?`
      : `Khung ${wantedTime} ngày ${dateStr} đã kín chỗ, và ngày đó cũng không còn khung nào phù hợp ạ. Bạn chọn ngày khác giúp mình nhé?`,
  };
}

/**
 * Câu hỏi cho trường còn thiếu.
 *
 * Danh sách trường bắt buộc do `firstMissingField` giữ — hàm này chỉ dịch sang
 * câu chữ. Tách như vậy để không bao giờ tái diễn tình trạng hai nơi có hai
 * danh sách lệch nhau; xem chú thích ở `firstMissingField`.
 */
async function nextQuestion(
  draft: FbBookingDraft,
): Promise<{ state: FbBookingDraft['state']; text: string } | null> {
  const missing: RequiredField | null = firstMissingField(draft);
  if (!missing) return null;

  switch (missing) {
    case 'slotStart':
      return { state: 'AWAITING_SLOT', text: 'Bạn muốn chơi vào ngày giờ nào ạ?' };
    case 'playMode':
      return {
        state: 'AWAITING_PLAY_MODE',
        text: 'Bạn thuê xe của quán hay mang xe cá nhân tới ạ?',
      };
    case 'playerCount':
      return { state: 'AWAITING_PLAY_MODE', text: 'Có mấy bạn cùng chơi ạ?' };
    case 'trackConfigId': {
      const tracks = await listTrackConfigs(draft.cafeId);
      if (tracks.length === 0) {
        // Chi nhánh chưa cấu hình đường đua nào thì không nhận đặt lịch được.
        // Báo thẳng thay vì hỏi một câu không có đáp án.
        return {
          state: 'AWAITING_SLOT',
          text: 'Hiện chi nhánh chưa mở đường đua nào ạ. Bạn liên hệ trực tiếp quán giúp mình nhé!',
        };
      }
      // Đánh số để khách luôn có một đáp án CHẮC CHẮN khớp.
      //
      // Khớp theo tên là so chuỗi lỏng: sân "Đường nhựa (Asphalt)" thì "đường
      // nhựa" khớp được, nhưng "sân nhựa" hay "cái đầu tiên" thì không — và khi
      // không khớp, câu hỏi này lặp lại y nguyên, không có lối ra.
      return {
        state: 'AWAITING_SLOT',
        text: [
          'Bạn muốn chơi ở sân nào ạ?',
          ...tracks.map((t, i) =>
            t.description ? `${i + 1}. ${t.name} — ${t.description}` : `${i + 1}. ${t.name}`,
          ),
          '',
          'Bạn gõ số hoặc tên sân giúp mình nhé.',
        ].join('\n'),
      };
    }
    case 'vehicleIds': {
      const trackTypeId = draft.trackConfigId ? await trackTypeOf(draft.trackConfigId) : null;
      const catalogs = await listVehicleCatalogs(draft.cafeId, trackTypeId);
      // Trường hợp không còn xe nào đã được gỡ TRƯỚC khi tới đây — xem
      // `escapeDeadEndTrack`. Tới được đây mà rỗng là bất thường.
      if (catalogs.length === 0) {
        return {
          state: 'AWAITING_VEHICLES',
          text: 'Hiện quán chưa có xe nào cho thuê ở khung giờ này ạ. Bạn mang xe cá nhân tới nhé?',
        };
      }
      // Kèm GIÁ THEO GIỜ và hạng xe. Không có giá thì khách chọn mù — đó là
      // thông tin quyết định, không phải chi tiết trang trí.
      const hours =
        draft.slotStart && draft.slotEnd
          ? (new Date(draft.slotEnd).getTime() - new Date(draft.slotStart).getTime()) / 3_600_000
          : 1;
      return {
        state: 'AWAITING_VEHICLES',
        text: [
          'Bạn muốn thuê xe nào ạ?',
          ...catalogs.slice(0, 8).map((c, i) => {
            const total = Math.round(c.hourlyRate * hours);
            return `${i + 1}. ${c.name} — ${c.hourlyRate.toLocaleString('vi-VN')}đ/giờ (${total.toLocaleString('vi-VN')}đ cho ${hours} tiếng)`;
          }),
          '',
          'Giá trên chưa gồm phí sân. Bạn gõ số hoặc tên xe giúp mình nhé.',
        ].join('\n'),
      };
    }
    case 'fullName':
      return { state: 'AWAITING_NAME', text: 'Cho mình xin tên của bạn ạ?' };
    case 'phone':
      return { state: 'AWAITING_PHONE', text: 'Cho mình xin số điện thoại để giữ chỗ ạ?' };
  }
}

/**
 * Bản tóm tắt khách nhìn thấy trước khi gõ xác nhận.
 *
 * Phải nêu ĐỦ mọi thứ khách đã khai, kể cả tên và số điện thoại. Đây là cơ hội
 * duy nhất họ phát hiện mình đọc nhầm số hay bot nghe nhầm tên — sau khi xác
 * nhận thì đơn đã giữ chỗ và số điện thoại sai nghĩa là staff gọi nhầm người.
 */
async function summarize(
  draft: FbBookingDraft,
  cafe: Cafe,
  cafeName: string,
  quote?: Quote,
): Promise<string> {
  const fmt = (iso?: string) =>
    iso
      ? new Intl.DateTimeFormat('vi-VN', {
          timeZone: 'Asia/Ho_Chi_Minh',
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit',
        }).format(new Date(iso))
      : '';

  const lines = [
    'Mình tóm tắt đơn nhé:',
    ``,
    `Chi nhánh: ${cafeName}`,
    `Thời gian: ${fmt(draft.slotStart)} — ${fmt(draft.slotEnd)}`,
    `Số người: ${draft.playerCount}`,
    `Hình thức: ${draft.playMode === BookingMode.RENTAL ? 'Thuê xe của quán' : 'Mang xe cá nhân'}`,
  ];

  if (draft.playMode === BookingMode.RENTAL && draft.vehicleIds?.length) {
    const vehicles = await loadChosenVehicles(cafe.id, draft.vehicleIds);
    if (vehicles.length) {
      lines.push(
        `Xe: ${vehicles.map((v) => `${v.name} (${v.hourlyRate.toLocaleString('vi-VN')}đ/giờ)`).join(', ')}`,
      );
    }
  }

  lines.push(``, `Người đặt: ${draft.fullName ?? '(chưa có)'}`);
  lines.push(`Điện thoại: ${draft.phone ?? '(chưa có)'}`);
  if (draft.email) lines.push(`Email: ${draft.email}`);

  // Tách rõ từng khoản. Một con số tổng không nói được vì sao nó là con số đó,
  // và khách không có cơ sở nào để cân nhắc đổi xe hay giảm số người.
  if (quote) {
    lines.push(``);
    lines.push(`Phí sân: ${quote.slotFee.toLocaleString('vi-VN')}đ (${draft.playerCount} người)`);
    if (quote.rentalFee > 0) {
      lines.push(`Phí thuê xe: ${quote.rentalFee.toLocaleString('vi-VN')}đ`);
    }
    lines.push(`Tổng tiền: ${quote.total.toLocaleString('vi-VN')}đ`);
  } else if (draft.quotedTotal !== undefined) {
    lines.push(``, `Tổng tiền: ${draft.quotedTotal.toLocaleString('vi-VN')}đ`);
  }

  lines.push(``, 'Thông tin đúng chưa ạ? Bạn gõ "xác nhận" để mình giữ chỗ nhé!');
  return lines.join('\n');
}

/**
 * Mô tả ngắn gọn những gì khách đã khai, để ghép vào ngữ cảnh của đường hỏi–đáp.
 *
 * ── Vì sao cần ──────────────────────────────────────────────────────────────
 *
 * Lịch sử chữ chỉ giữ 10 tin gần nhất. Một cuộc đặt lịch dài hơn thế, nên tới
 * lúc khách hỏi "tên tôi là gì" thì lượt họ khai tên đã trôi ra khỏi cửa sổ —
 * và bot trả lời là không biết, dù nó đang giữ cái tên đó trong đơn nháp.
 *
 * Ghép bản mô tả này vào đầu lịch sử vừa gọn hơn nhiều so với nới cửa sổ (đưa
 * dữ liệu có cấu trúc thay vì chữ thô), vừa không mất khi cuộc trò chuyện kéo
 * dài thêm.
 */
export async function describeDraftForContext(
  pageId: string,
  psid: string,
): Promise<string | null> {
  const draft = await loadDraft(pageId, psid);
  if (!draft) return null;

  const known: string[] = [];
  if (draft.fullName) known.push(`tên khách: ${draft.fullName}`);
  if (draft.phone) known.push(`số điện thoại: ${draft.phone}`);
  if (draft.email) known.push(`email: ${draft.email}`);
  if (draft.slotStart) known.push(`khung giờ đang chọn: ${draft.slotStart}`);
  if (draft.playerCount) known.push(`số người: ${draft.playerCount}`);
  if (draft.playMode) {
    known.push(
      `hình thức: ${draft.playMode === 'RENTAL' ? 'thuê xe của quán' : 'mang xe cá nhân'}`,
    );
  }
  if (draft.quotedTotal !== undefined) known.push(`tổng tiền tạm tính: ${draft.quotedTotal}đ`);

  if (!known.length) return null;

  return [
    '[Ngữ cảnh nội bộ — khách đang ĐANG ĐẶT LỊCH DỞ, đã cung cấp:]',
    known.map((item) => `- ${item}`).join('\n'),
    '',
    'Cách dùng:',
    '- Trả lời NGẮN GỌN và bám vào lựa chọn khách đang cân nhắc, không liệt kê lan man.',
    '- Chiếu theo khung giờ và sân khách đã chọn ở trên; đừng trả lời chung chung cho cả quán.',
    '- Khách hỏi so sánh ("xe nào nhanh hơn", "sân nào phù hợp") thì nêu rõ khác biệt và gợi ý một lựa chọn.',
    '- KHÔNG hỏi lại thông tin đã có ở trên. KHÔNG đọc nguyên văn dòng ngữ cảnh này cho khách.',
    '- KHÔNG tự nhận đã ghi nhận đơn hay giữ chỗ — việc đó do hệ thống đặt lịch làm, không phải bạn.',
  ].join('\n');
}

/**
 * Xử lý một lượt thuộc luồng đặt lịch.
 *
 * Trả `null` khi lượt này KHÔNG thuộc luồng đặt lịch — bộ điều khiển webhook
 * chạy tiếp đường hỏi–đáp bình thường.
 */
export async function tryHandleBookingTurn(
  ctx: BookingTurnContext,
): Promise<BookingTurnResult | null> {
  const existing = await loadDraft(ctx.pageId, ctx.psid);

  // Toàn bộ luật định tuyến nằm ở `classifyTurn`. Ở đây chỉ THI HÀNH, không
  // quyết định thêm gì — thêm một `if` vào chỗ này là bắt đầu lại đúng mớ bòng
  // bong mà lần gom này dọn đi.
  const intent = classifyTurn(existing, ctx.text);
  logger.info('FbBooking', `phân loại lượt: ${intent.kind}`, {
    psid: ctx.psid,
    trangThai: existing?.state,
  });

  switch (intent.kind) {
    // Ba trường hợp nhường hẳn cho đường hỏi–đáp.
    case 'BLOCKED':
    case 'NOT_BOOKING':
      return null;

    case 'ASK_QUESTION':
      // Gia hạn đơn nháp: khách hỏi han bao lâu cũng được mà không mất tiến độ.
      if (existing) await touchDraft(ctx.pageId, ctx.psid);
      return null;

    case 'CANCEL':
      await clearDraft(ctx.pageId, ctx.psid);
      return {
        text: 'Mình đã huỷ thông tin đặt lịch vừa rồi ạ. Bạn muốn đặt lại thì cứ nhắn mình ngày giờ mong muốn nhé!',
      };

    case 'NEW_BOOKING':
      // Đơn CŨ không bị đụng tới — nó đã nằm trong cơ sở dữ liệu và tự đi tiếp
      // theo vòng đời thanh toán của nó.
      await clearDraft(ctx.pageId, ctx.psid);
      return { text: 'Dạ, mình bắt đầu một đơn mới nhé. Bạn muốn chơi vào ngày giờ nào ạ?' };

    case 'EXPIRED_CONFIRM':
      return {
        text: 'Xin lỗi bạn, thông tin đặt lịch vừa rồi đã hết hạn nên mình chưa giữ chỗ được ạ. Bạn cho mình biết lại ngày giờ muốn chơi nhé?',
      };

    default:
      break;
  }

  // Còn lại: CONFIRM, PROVIDE_INFO, NEEDS_MODEL — đều đi tiếp vào luồng.
  const extraction =
    intent.kind === 'NEEDS_MODEL'
      ? await extractBookingFields(ctx.text, existing)
      : { fields: intent.kind === 'PROVIDE_INFO' ? intent.fields : {}, failed: false };
  const extracted = extraction.fields;

  // Mô hình HỎNG thì KHÔNG được coi là "khách không muốn đặt". Bộ lọc từ khoá
  // đã thấy dấu hiệu đặt lịch — đó là bằng chứng đủ để đi tiếp.
  if (extraction.failed) {
    logger.error('FbBooking', 'trích xuất HỎNG — vẫn đi tiếp theo dấu hiệu từ khoá', {
      psid: ctx.psid,
      text: ctx.text.slice(0, 60),
    });
  }

  // Mô hình đọc được và thấy đây không phải ý định đặt lịch — tin nó, vì nó
  // thấy ngữ cảnh mà bộ lọc từ khoá không thấy.
  if (!existing && !extraction.failed && !extracted.wantsToBook) {
    logger.info('FbBooking', 'mô hình xác định không phải ý định đặt lịch', { psid: ctx.psid });
    return null;
  }

  const cafe = await AppDataSource.getRepository(Cafe).findOne({ where: { id: ctx.cafeId } });
  if (!cafe) {
    logger.warn('FbBooking', 'không tìm thấy chi nhánh', { cafeId: ctx.cafeId });
    return null;
  }

  if (!(await cafeCanAcceptBookings(ctx.cafeId))) {
    logger.warn('FbBooking', 'chi nhánh chưa cấu hình tài khoản nhận tiền', { cafeId: ctx.cafeId });
    return {
      text: 'Hiện chi nhánh chưa nhận đặt lịch qua Messenger ạ. Bạn liên hệ trực tiếp quán giúp mình nhé!',
    };
  }

  const draft: FbBookingDraft = existing ?? { state: 'AWAITING_SLOT', cafeId: ctx.cafeId };
  let next = await mergeExtracted(draft, extracted, cafe);
  // Điền mã đường đua và mã xe TRƯỚC khi hỏi tiếp — nếu không, đơn nháp không
  // bao giờ đủ trường và cuộc trò chuyện lặp vô hạn ở bước xác nhận.
  next = await resolveIds(next, extracted);

  /*
    Lượt này KHÔNG mang thêm thông tin nào — nhường cho đường hỏi–đáp.

    Đây là chỗ quyết định luồng đặt lịch có linh hoạt hay không. Trước đây chỉ
    những câu khớp một danh sách từ khoá hẹp ('?', 'bao nhiêu', 'mấy giờ'…) mới
    được coi là câu hỏi; mọi câu khác bị đem đi phân tích như một câu trả lời,
    phân tích hụt, rồi bot hỏi lại đúng câu cũ. Khách hỏi "tư vấn xe nào phù hợp
    cho người mới" và nhận lại "Bạn muốn thuê xe nào ạ?" — tin nhắn của họ biến
    mất không dấu vết.

    Quy tắc đúng không phải "câu này có phải câu hỏi không" mà là "câu này có
    chứa thứ tôi đang chờ không". Không có thì để hỏi–đáp trả lời bằng dữ liệu
    thật (nó có đủ công cụ tra xe, sân, giá), rồi `pendingBookingQuestion` nhắc
    lại chỗ đang dừng.

    Đơn nháp vẫn nằm nguyên trong Redis nên hỏi xong quay lại là đặt tiếp được.
  */
  /*
    Đường leo thang DUY NHẤT giữa hai pha.

    Mô hình đã đọc mà không rút được trường nào, và đơn nháp không đổi gì — nghĩa
    là khách đang nói chuyện khác. Nhường cho hỏi–đáp trả lời bằng dữ liệu thật,
    rồi `pendingBookingQuestion` nhắc lại chỗ đang dừng.

    Loại trừ lượt xác nhận (cố ý không đổi gì) và lượt khách nêu giá trị SAI
    (cần báo để họ sửa, không được im lặng đổi chủ đề).
  */
  if (
    existing &&
    intent.kind !== 'CONFIRM' &&
    !hasFieldSignal(extracted) &&
    draftFingerprint(next) === draftFingerprint(existing)
  ) {
    logger.info('FbBooking', 'lượt không mang thông tin mới — nhường cho hỏi–đáp', {
      psid: ctx.psid,
    });
    return null;
  }

  // Bốn luật đặt lịch của `createBooking`, kiểm NGAY khi biết khung giờ.
  //
  // Gọi lại đúng những hàm đó chứ không chép luật sang đây — chép là hai bản sẽ
  // lệch nhau, đúng kiểu lỗi đã gây ra vòng lặp vô hạn ở bước xác nhận.
  //
  // Không có bước này thì khách nói "3 giờ sáng mai" và bot vẫn nhận, đi hết
  // hội thoại rồi mới vỡ ở bước cuối.
  if (next.slotStart && next.slotEnd) {
    const slotStart = new Date(next.slotStart);
    const slotEnd = new Date(next.slotEnd);
    try {
      assertSlotWithinOperatingHours(cafe, slotStart, slotEnd);
      assertMinimumBookingNotice(slotStart, cafe.minBookingNoticeMinutes);
      assertMaxAdvanceBookingDays(slotStart, slotEnd, cafe.maxAdvanceBookingDays);
      await assertWithinSubscriptionCoverage(cafe, slotEnd);
    } catch (err) {
      if (err instanceof AppError) {
        const retry: FbBookingDraft = {
          ...next,
          slotStart: undefined,
          slotEnd: undefined,
          vehicleIds: undefined,
          state: 'AWAITING_SLOT',
        };
        await saveDraft(ctx.pageId, ctx.psid, retry);
        return { text: friendlyBookingError(err, cafe) };
      }
      throw err;
    }
  }

  // Khung giờ vừa có đủ thông tin để tra thì tra ngay, đừng để tới bước cuối.
  //
  // Hai lớp: `checkSlotStillOffered` tra ở mức chi nhánh khi chưa biết sân;
  // `checkTrackCapacity` tra đúng sân khách đã chọn, dùng cùng con số mà
  // `createBooking` sẽ dùng.
  if (next.slotStart && next.playMode) {
    // Biết sân rồi thì con số của SÂN là con số đúng — `createBooking` cũng dùng
    // đúng nó. Chưa biết sân thì tra ở mức chi nhánh, chấp nhận thô hơn.
    // Ba lớp, từ hẹp tới rộng. Lớp nào bắt được lỗi trước thì dừng ở đó —
    // câu trả lời càng cụ thể càng dễ cho khách sửa.
    const trackCheck = await checkTrackCapacity(next);
    const rentalCheck = trackCheck.ok ? await checkRentalAvailability(next) : trackCheck;
    const slotCheck = rentalCheck.ok ? await checkSlotStillOffered(next) : rentalCheck;
    if (!slotCheck.ok) {
      // Xe bị thuê mất thì chỉ hỏi lại XE — khung giờ vẫn còn dùng được, xoá đi
      // là bắt khách chọn lại thứ không hề hỏng (FR-036).
      const onlyVehicleGone = !rentalCheck.ok && trackCheck.ok;
      const retry: FbBookingDraft = onlyVehicleGone
        ? { ...next, vehicleIds: undefined, state: 'AWAITING_VEHICLES' }
        : {
            ...next,
            slotStart: undefined,
            slotEnd: undefined,
            vehicleIds: undefined,
            state: 'AWAITING_SLOT',
          };
      await saveDraft(ctx.pageId, ctx.psid, retry);
      return { text: slotCheck.message ?? 'Khung giờ này đã kín chỗ ạ.' };
    }
  }

  // ── Khách đồng ý mức giá mới sau khi giá đổi ──────────────────────────────
  //
  // Đơn đã được tạo ở lượt trước và đang giữ chỗ, chỉ còn thiếu bước phát mã QR.
  // `isConfirmationTurn` cố ý trả `false` ở đây (đơn đã tồn tại), nên nhánh này
  // phải đứng TRƯỚC nó.
  if (next.priceChanged && next.createdBookingId && matchesConfirmationKeyword(ctx.text)) {
    return issueCheckout(ctx, acknowledgePriceChange(next), next.createdBookingId, cafe.name);
  }

  // ── Lượt xác nhận ─────────────────────────────────────────────────────────
  if (isConfirmationTurn(next, ctx.text)) {
    return finalizeBooking(ctx, next, cafe.name);
  }

  // Khách nói chuyện khác trong lúc đang chờ đồng ý giá mới — giữ nguyên cờ để
  // lời xác nhận cũ không bị dùng lại cho mức giá họ chưa chấp nhận.
  if (next.priceChanged) {
    await saveDraft(ctx.pageId, ctx.psid, next);
    return {
      text:
        next.previousQuotedTotal !== undefined
          ? `Giá đã đổi từ ${next.previousQuotedTotal.toLocaleString('vi-VN')}đ thành ${next.quotedTotal?.toLocaleString('vi-VN')}đ ạ. Bạn gõ "xác nhận" nếu đồng ý, hoặc cho mình biết bạn muốn đổi gì.`
          : `Bạn gõ "xác nhận" nếu đồng ý mức giá ${next.quotedTotal?.toLocaleString('vi-VN')}đ nhé, hoặc cho mình biết bạn muốn đổi gì ạ.`,
    };
  }

  /*
    Gỡ ngõ cụt: khách chọn một sân mà quán không có xe nào chạy được trên đó.

    Trước đây bot báo "sân này chưa có xe nào, bạn đổi sân nhé?" rồi để nguyên
    `trackConfigId`. Khách gõ "1" để chọn sân khác, nhưng trường còn thiếu vẫn là
    `vehicleIds`, nên "1" bị hiểu là chọn XE — trong danh sách rỗng. Bot lặp lại
    y nguyên câu cũ, không lối ra.

    Bỏ hẳn sân đã chọn thì câu hỏi kế tiếp tự quay về chọn sân, kèm danh sách
    đánh số — và "1" lúc đó có nghĩa.
  */
  if (next.playMode === BookingMode.RENTAL && next.trackConfigId && !next.vehicleIds?.length) {
    const trackTypeId = await trackTypeOf(next.trackConfigId);
    const usable = await listVehicleCatalogs(next.cafeId, trackTypeId);
    if (usable.length === 0) {
      const [dead] = await AppDataSource.query<Array<{ name: string }>>(
        `SELECT tt.name FROM cafe_track_configs ctc
           JOIN track_types tt ON tt.id = ctc.track_type_id
          WHERE ctc.id = $1`,
        [next.trackConfigId],
      );
      const cleared: FbBookingDraft = { ...next, trackConfigId: undefined, state: 'AWAITING_SLOT' };
      await saveDraft(ctx.pageId, ctx.psid, cleared);
      const question = await nextQuestion(cleared);
      return {
        text: [
          `Sân ${dead?.name ?? 'bạn chọn'} hiện chưa có xe nào của quán chạy được ạ.`,
          '',
          question?.text ?? 'Bạn chọn sân khác giúp mình nhé?',
          '',
          '(Hoặc bạn mang xe cá nhân tới thì chơi sân nào cũng được ạ.)',
        ].join('\n'),
      };
    }
  }

  // ── Chưa đủ trường: hỏi tiếp ──────────────────────────────────────────────
  const question = await nextQuestion(next);
  if (question) {
    /*
      Khách nêu một thứ KHÔNG khớp mục nào trong danh sách sân/xe.

      Ở hai bước này, tầng phân loại buộc phải coi mọi câu là "tên sân/tên xe" —
      nó không có quyền truy cập cơ sở dữ liệu nên không biết câu đó có khớp
      không. Chỉ tới đây mới biết.

      Khớp hụt gần như luôn có nghĩa là khách đang HỎI chứ không chọn: "xe nào
      chạy nhanh hơn", "sân nào rộng hơn", "xe cơ bản có gì khác". Những câu này
      không mang dấu hỏi nên tầng phân loại không nhận ra được.

      Nhường cho hỏi–đáp: nó có công cụ tra xe và sân nên trả lời được thật,
      rồi `pendingBookingQuestion` đưa lại danh sách. Khách gõ nhầm tên cũng
      được lợi — họ nhận một câu trả lời hữu ích thay vì cùng một danh sách lặp
      lại mà không rõ vì sao.
    */
    const nameMissed =
      (extracted.trackName && !next.trackConfigId) ||
      (extracted.vehicleNames?.length &&
        next.playMode === BookingMode.RENTAL &&
        !next.vehicleIds?.length);

    if (nameMissed) {
      // Vẫn ghi lại những gì lượt này thu được (nếu có), để không mất tiến độ.
      await saveDraft(ctx.pageId, ctx.psid, { ...next, state: question.state });
      logger.info('FbBooking', 'không khớp tên sân/xe — nhường cho hỏi–đáp', {
        psid: ctx.psid,
        text: ctx.text.slice(0, 60),
      });
      return null;
    }

    next.state = question.state;
    await saveDraft(ctx.pageId, ctx.psid, next);
    return { text: question.text };
  }

  // ── Đủ trường: báo giá rồi tóm tắt ────────────────────────────────────────
  //
  // Tính giá TRƯỚC khi tóm tắt: bản tóm tắt phải nêu tổng tiền (FR-005), và
  // `quotedTotal` còn là mốc để phát hiện giá đổi ở bước tạo đơn (FR-037).
  const quote = await quoteDraft(next, cafe);
  next.quotedTotal = quote?.total;

  const askEmail =
    !next.email && !extracted.declinedEmail && next.state !== 'AWAITING_CONFIRMATION';
  next.state = 'AWAITING_CONFIRMATION';
  await saveDraft(ctx.pageId, ctx.psid, next);

  const summary = await summarize(next, cafe, cafe.name, quote);
  return {
    text: askEmail
      ? `${summary}\n\n(Bạn muốn nhận email xác nhận thì cho mình xin địa chỉ, không thì bỏ qua cũng được ạ.)`
      : summary,
  };
}

/**
 * Phát hành phiên thanh toán cho một đơn đã tồn tại: sinh mã QR và gửi cho khách.
 *
 * Tách riêng vì có HAI đường dẫn tới đây — tạo đơn xong xuôi, và khách đồng ý
 * mức giá mới sau khi giá đổi. Gộp vào `finalizeBooking` thì đường thứ hai phải
 * tạo lại đơn, mà đơn đã tồn tại rồi.
 */
async function issueCheckout(
  ctx: BookingTurnContext,
  draft: FbBookingDraft,
  bookingId: string,
  cafeName: string,
): Promise<BookingTurnResult> {
  // ⚠️ 'bank_transfer', KHÔNG BAO GIỜ 'mock'. Cổng mock xác nhận đơn ngay trong
  // lời gọi này, trước cả khi mã QR được sinh ra — bước quét mã và bấm thanh
  // toán sẽ thành trang trí. Xem research.md D1.
  const checkout = await createCheckoutUrl(bookingId, '127.0.0.1', undefined, 'bank_transfer');

  const qr = checkout.bank_transfer?.qr_image_data_url
    ? await uploadQrForMessenger(checkout.bank_transfer.qr_image_data_url, bookingId)
    : null;

  // Ghi định danh ảnh để móc nối xác nhận dọn được sau khi khách trả tiền.
  if (qr) {
    await AppDataSource.query(
      `UPDATE bookings SET snapshot = COALESCE(snapshot, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
      [bookingId, JSON.stringify({ fb_qr_public_id: qr.publicId })],
    );
  }

  await saveDraft(ctx.pageId, ctx.psid, {
    ...draft,
    state: 'AWAITING_PAYMENT',
    createdBookingId: bookingId,
    priceChanged: false,
  });

  const expiresAt = checkout.bank_transfer?.expires_at
    ? new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(checkout.bank_transfer.expires_at))
    : null;

  const bank = checkout.bank_transfer;

  /*
    KHÔNG dùng `checkout.payment_url` cho khách Facebook.

    Đường dẫn đó trỏ tới trang `/payment/bank-transfer/:bookingId`, mà trang ấy
    gọi `POST /bookings/:id/checkout` — một endpoint đòi đăng nhập VÀ đòi vai
    CUSTOMER. Khách đặt qua Messenger là tài khoản mềm: không có mật khẩu, không
    bao giờ đăng nhập được. Nút đó vì vậy KHÔNG THỂ chạy với bất kỳ đơn Facebook
    nào — ai bấm cũng ra "Không mở được trang thanh toán", kể cả chính chủ quán
    đang đăng nhập sẵn (vai PROVIDER thì `authorize(CUSTOMER)` chặn ngay).

    Tệ hơn: nếu vượt được cửa quyền thì nó lại tạo một phiên thanh toán MỚI cho
    cùng đơn, khác mã tham chiếu với mã QR vừa gửi trong Messenger.

    Ở chế độ mô phỏng, `sandbox_url` mới là thứ đúng: đó chính là nội dung mã QR
    kia mã hoá, một trang công khai không cần đăng nhập. Bấm nút và quét mã dẫn
    tới cùng một chỗ.
  */
  const payUrl = bank?.sandbox_url;

  return {
    text: [
      `Đã giữ chỗ cho bạn tại ${cafeName}!`,
      ``,
      `Số tiền: ${checkout.total_amount.toLocaleString('vi-VN')}đ`,
      ...(expiresAt ? [`Thanh toán trước: ${expiresAt}`] : []),
      // Thông tin chuyển khoản dạng chữ: đường thoát khi ảnh QR gửi hụt hoặc
      // khách xem trên máy tính không quét được. Không có nó thì mất ảnh là mất
      // luôn mọi cách trả tiền.
      ...(bank
        ? [
            ``,
            `Ngân hàng: ${bank.bank_name}`,
            `Số tài khoản: ${bank.account_number}`,
            `Chủ tài khoản: ${bank.account_name}`,
            `Nội dung chuyển khoản: ${bank.ref_code}`,
            `(Ghi đúng nội dung này để hệ thống tự khớp đơn giúp bạn.)`,
          ]
        : []),
      ``,
      payUrl
        ? `Quét mã QR hoặc bấm nút bên dưới để thanh toán nhé.`
        : `Quét mã QR để thanh toán nhé.`,
    ].join('\n'),
    paymentUrl: payUrl,
    qrImageUrl: qr?.url,
  };
}

/**
 * Tạo đơn thật.
 *
 * Chỉ tới được đây khi `isConfirmationTurn` đã đúng — tức là đủ trường, đúng
 * trạng thái, và khách đã gõ xác nhận sau khi xem tóm tắt.
 */
async function finalizeBooking(
  ctx: BookingTurnContext,
  draft: FbBookingDraft,
  cafeName: string,
): Promise<BookingTurnResult> {
  // Gõ trùng: trả lại đúng đơn cũ, không tạo đơn mới.
  if (draft.createdBookingId) {
    return { text: 'Đơn của bạn đã được giữ chỗ rồi ạ, bạn thanh toán theo link mình gửi nhé!' };
  }

  const resolution = await resolveFacebookSoftUser({
    phone: draft.phone!,
    fullName: draft.fullName!,
    email: draft.email,
  });

  if (resolution.outcome === 'INVALID_PHONE') {
    const retry: FbBookingDraft = { ...draft, phone: undefined, state: 'AWAITING_PHONE' };
    await saveDraft(ctx.pageId, ctx.psid, retry);
    return { text: 'Số điện thoại chưa đúng định dạng ạ, bạn cho mình xin lại nhé?' };
  }

  if (resolution.outcome === 'BLOCKED_REAL_ACCOUNT') {
    await saveDraft(ctx.pageId, ctx.psid, { ...draft, state: 'BLOCKED_REAL_ACCOUNT' });
    return {
      text: [
        'Số điện thoại này đã có tài khoản RCField rồi ạ.',
        '',
        `Bạn đăng nhập tại đây để đặt bằng tài khoản của mình nhé: ${loginUrl()}`,
      ].join('\n'),
    };
  }

  const customer = resolution.user;

  try {
    // Đi qua ĐÚNG đường tạo đơn hiện hành — mọi luật đặt lịch (giờ hoạt động,
    // bội số khung giờ, sức chứa, xung đột giải đấu, phạm vi gói thuê bao) đều
    // được áp y hệt các kênh khác.
    const created = await createBooking(customer.id, {
      cafe_id: ctx.cafeId,
      play_mode: draft.playMode === 'BYOC' ? BookingMode.BYOC : BookingMode.RENTAL,
      slot_start: draft.slotStart!,
      slot_end: draft.slotEnd!,
      vehicle_ids: draft.vehicleIds ?? [],
      /*
        Người đi cùng, KHÔNG kể người đặt.

        `createBooking` tính `playerCount = 1 + participants.length` — người đặt
        được cộng sẵn. Truyền mảng rỗng như trước nghĩa là mọi đơn đều tính đúng
        MỘT người, bất kể khách đặt cho mấy người:

          • thu thiếu tiền sân — phí sân nhân theo đầu người
          • sức chứa xe cá nhân bị trừ 1 thay vì n, nên sân nhận quá tải

        Không có tên và số của từng người đi cùng vì hội thoại chỉ hỏi TỔNG số
        người — đủ để tính tiền và giữ chỗ, còn danh tính từng người thì staff
        ghi tại quầy lúc nhận xe.
      */
      participants: Array.from({ length: Math.max(0, (draft.playerCount ?? 1) - 1) }, () => ({
        participant_type: BookingParticipantType.WALK_IN_GUEST,
      })),
      fnb_items: [],
      track_config_id: draft.trackConfigId,
      source: BookingSource.FACEBOOK,
      // Không dùng lại đơn PENDING sẵn có: đơn đó có thể thuộc một phiên trò
      // chuyện khác của cùng tài khoản mềm.
      skipPendingReuse: true,
    });

    // Danh tính Facebook — móc nối gửi tin xác nhận đọc từ đây sau khi khách
    // thanh toán. Ghi vào `snapshot` chứ không thêm cột.
    await AppDataSource.query(
      `UPDATE bookings
          SET snapshot = COALESCE(snapshot, '{}'::jsonb) || $2::jsonb
        WHERE id = $1`,
      [
        created.booking_id,
        JSON.stringify({
          fb_psid: ctx.psid,
          fb_page_id: ctx.pageId,
          ...(draft.email ? { contact_email: draft.email } : {}),
        }),
      ],
    );

    // ⚠️ 'bank_transfer', KHÔNG BAO GIỜ 'mock'. Cổng mock xác nhận đơn ngay
    // trong lời gọi này, trước cả khi mã QR được sinh ra — bước quét mã và bấm
    // thanh toán sẽ thành trang trí. Xem research.md D1.
    // ── Giá đổi giữa lúc báo giá và lúc xác nhận (FR-037) ───────────────────
    //
    // `createBooking` áp lại nhân hệ số giá theo khung giờ tại thời điểm gọi,
    // nên tổng tiền có thể khác con số khách vừa nhìn thấy. KHÔNG được gửi mã
    // QR trong trường hợp đó — làm vậy là thu một mức giá khách chưa từng đồng ý.
    //
    // Đơn vẫn giữ nguyên (đang PENDING, chỗ và xe đã giữ) để khách không mất
    // chỗ trong lúc cân nhắc. Không đồng ý thì đơn tự hết hạn theo cơ chế sẵn có.
    if (draft.quotedTotal !== undefined && created.total_amount !== draft.quotedTotal) {
      await saveDraft(ctx.pageId, ctx.psid, {
        ...draft,
        state: 'AWAITING_CONFIRMATION',
        createdBookingId: created.booking_id,
        priceChanged: true,
        previousQuotedTotal: draft.quotedTotal,
        quotedTotal: created.total_amount,
      });

      logger.info('FbBooking', 'giá đổi giữa báo giá và xác nhận', {
        bookingId: created.booking_id,
        quoted: draft.quotedTotal,
        actual: created.total_amount,
      });

      // Đọc từ hai trường tách bạch, không dựa vào thứ tự ghi đè.
      const previous = draft.quotedTotal;
      return {
        text: [
          `Giá khung giờ này vừa thay đổi ạ.`,
          ``,
          `Giá báo lúc nãy: ${previous.toLocaleString('vi-VN')}đ`,
          `Giá hiện tại: ${created.total_amount.toLocaleString('vi-VN')}đ`,
          ``,
          `Bạn gõ "xác nhận" lần nữa nếu đồng ý mức giá mới nhé.`,
        ].join('\n'),
      };
    }

    return issueCheckout(ctx, draft, created.booking_id, cafeName);
  } catch (err) {
    // Tra lại thất bại vì chỗ hoặc xe vừa bị lấy mất. Giữ lại phần còn hợp lệ
    // của đơn nháp, chỉ hỏi lại phần đã hỏng (FR-036).
    if (err instanceof AppError) {
      const cleaned: FbBookingDraft =
        err.code === 'VEHICLE_UNAVAILABLE' || err.code === 'SLOT_LOCKED'
          ? { ...draft, vehicleIds: undefined, state: 'AWAITING_VEHICLES' }
          : {
              ...draft,
              slotStart: undefined,
              slotEnd: undefined,
              vehicleIds: undefined,
              state: 'AWAITING_SLOT',
            };
      await saveDraft(ctx.pageId, ctx.psid, cleaned);

      logger.info('FbBooking', 'tạo đơn thất bại, giữ lại đơn nháp', {
        code: err.code,
        psid: ctx.psid,
      });
      return { text: friendlyBookingError(err) };
    }

    logger.error('FbBooking', 'lỗi ngoài dự kiến khi tạo đơn', err);
    return { text: 'Xin lỗi, hệ thống đang bận. Bạn thử lại sau ít phút nhé!' };
  }
}
