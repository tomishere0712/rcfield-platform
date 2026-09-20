import { useState, type Dispatch, type SetStateAction } from "react"
import { ArrowRight, Wand2 } from "lucide-react"

import { cn } from "@/shared/lib/utils"
import { Input } from "@/shared/ui/input"

import { ContestFormField } from "../ContestFormField"
import { DateTimeField } from "../DateTimeField"
import type { ContestFormState } from "../contest-form-types"
import type { ContestRuntimeFormat } from "../contest-form-utils"
import { KNOCKOUT_CAPACITIES } from "../contest-wizard"

/* Lịch chuẩn cho một giải mới, tính XUÔI từ lúc mở đăng ký. */
const REGISTRATION_WINDOW_DAYS = 7
const PREPARATION_DAYS = 2
const RACE_START_HOUR = 8
const RACE_DURATION_HOURS = 3

const DAY_MS = 86_400_000

/**
 * Bước 4 — lịch trình và quy mô.
 *
 * Bốn ô xếp theo đúng thứ tự thời gian, mỗi ô lấy ô trước làm chặn dưới nên không
 * thể chọn lệch thứ tự. Nút gợi ý ở đầu bước điền cả bốn mốc một lần.
 */
export function StepSchedule({
  form,
  setForm,
  errors,
  isEdit,
  runtimeFormat,
}: {
  form: ContestFormState
  setForm: Dispatch<SetStateAction<ContestFormState>>
  errors: Record<string, string>
  isEdit: boolean
  runtimeFormat: ContestRuntimeFormat
}) {
  // Chốt "bây giờ" một lần khi mount: dùng làm chặn dưới cho các ô ngày.
  // Tính lại mỗi render vừa thừa vừa vi phạm quy tắc component thuần khiết.
  const [nowInput] = useState(() => toDateTimeLocal(new Date()))
  const minMoment = isEdit ? undefined : nowInput

  const setField = (key: keyof ContestFormState) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }))

  const suggestSchedule = () => {
    const suggested = form.starts_at
      ? buildScheduleFromRaceDate(form.starts_at)
      : buildStandardSchedule()
    if (!suggested) return
    setForm((current) => ({ ...current, ...suggested }))
  }

  return (
    <div className="space-y-8">
      <button
        type="button"
        onClick={suggestSchedule}
        className="inline-flex items-center gap-2 rounded-lg border border-[#c4c7c8] bg-white px-4 py-2.5 text-sm font-bold text-[#1c1b1b] transition hover:bg-[#f6f3f2]"
      >
        <Wand2 className="size-4 text-orange-600" />
        {form.starts_at
          ? "Gợi ý lịch đăng ký cho ngày thi đã chọn"
          : `Gợi ý lịch chuẩn (mở đăng ký hôm nay, thi sau ${REGISTRATION_WINDOW_DAYS + PREPARATION_DAYS} ngày)`}
      </button>

      <section>
        <h3 className="text-sm font-black uppercase tracking-[0.14em] text-[#adaaaa]">
          Cổng đăng ký
        </h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <DateTimeField
            label="Mở đăng ký"
            value={form.registration_opens_at}
            // Cho phép chọn quá khứ ngay cả lúc tạo mới — dùng để demo giải
            // đã mở đăng ký sẵn. Backend cũng đã bỏ ràng buộc "phải ở tương
            // lai" riêng cho mốc này (khác với "khởi tranh", vẫn phải tương lai).
            max={form.registration_closes_at || form.starts_at || undefined}
            onChange={setField("registration_opens_at")}
            error={errors.registration_opens_at}
          />
          <DateTimeField
            label="Đóng đăng ký"
            hint="Phải trước hoặc đúng lúc giải khởi tranh."
            value={form.registration_closes_at}
            min={form.registration_opens_at || minMoment}
            max={form.starts_at || undefined}
            onChange={setField("registration_closes_at")}
            error={errors.registration_closes_at}
          />
        </div>
      </section>

      <section>
        <h3 className="text-sm font-black uppercase tracking-[0.14em] text-[#adaaaa]">
          Thời gian thi đấu
        </h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <DateTimeField
            label="Khởi tranh"
            value={form.starts_at}
            min={form.registration_closes_at || minMoment}
            onChange={setField("starts_at")}
            error={errors.starts_at}
          />
          <DateTimeField
            label="Kết thúc dự kiến"
            value={form.ends_at}
            min={form.starts_at || minMoment}
            onChange={setField("ends_at")}
            error={errors.ends_at}
          />
        </div>

        <TimelinePreview form={form} />
      </section>

      <section>
        <h3 className="text-sm font-black uppercase tracking-[0.14em] text-[#adaaaa]">
          Quy mô & chi phí
        </h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <ContestFormField
            label="Sức chứa tối đa (VĐV)"
            error={errors.capacity}
          >
            {runtimeFormat === "KNOCKOUT" ? (
              <>
                {/*
                  Sơ đồ đấu loại chỉ chia đôi đẹp khi số suất là luỹ thừa của 2.
                  Cho nhập số bất kỳ thì vòng trong sẽ có trận chỉ một người và
                  nhân viên phải nhập kết quả giả cho trận không có đối thủ.
                */}
                <select
                  className="h-11 w-full rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm"
                  value={form.capacity}
                  onChange={(event) => setField("capacity")(event.target.value)}
                >
                  {/* Giải cũ đang để số lẻ thì vẫn hiện ra, kèm nhãn, để provider
                      biết vì sao bước này báo lỗi thay vì thấy ô rỗng khó hiểu. */}
                  {!KNOCKOUT_CAPACITIES.map(String).includes(form.capacity) &&
                  form.capacity ? (
                    <option value={form.capacity}>
                      {form.capacity} VĐV (không dùng được cho đấu loại)
                    </option>
                  ) : null}
                  {KNOCKOUT_CAPACITIES.map((size) => (
                    <option key={size} value={size}>
                      {size} VĐV
                    </option>
                  ))}
                </select>
                <p className="text-xs leading-5 text-[#747878]">
                  Đấu loại trực tiếp cần số suất chia đôi được đến tận chung
                  kết. Đăng ký thiếu so với số này thì các suất trống được xử
                  thắng tự động.
                </p>
              </>
            ) : (
              <>
                <Input
                  type="number"
                  min={1}
                  className="h-11"
                  value={form.capacity}
                  onChange={(event) => setField("capacity")(event.target.value)}
                />
                <p className="text-xs leading-5 text-[#747878]">
                  Hệ thống từ chối đăng ký mới khi đã đủ số này.
                </p>
              </>
            )}
          </ContestFormField>
          <ContestFormField
            label="Lệ phí tham gia (VND)"
            error={errors.entry_fee}
          >
            <Input
              type="number"
              min={0}
              className="h-11"
              value={form.entry_fee}
              onChange={(event) => setField("entry_fee")(event.target.value)}
            />
            <p className="text-xs leading-5 text-[#747878]">
              Nhập 0 nếu miễn phí. Đây là khoản duy nhất VĐV phải trả — thuê xe
              của quán trong giải không tính thêm tiền.
            </p>
          </ContestFormField>
        </div>
      </section>
    </div>
  )
}

type ScheduleFields = Pick<
  ContestFormState,
  "registration_opens_at" | "registration_closes_at" | "starts_at" | "ends_at"
>

/**
 * Lịch chuẩn cho giải mới, tính XUÔI từ lúc mở đăng ký.
 *
 * Đây là chuỗi sự kiện đúng như nó diễn ra ngoài đời: hôm nay mở cổng đăng ký,
 * cho khách một tuần để ghi danh, chốt danh sách rồi hai ngày sau mới thi đấu.
 */
function buildStandardSchedule(): ScheduleFields {
  const opensAt = roundUpToHalfHour(new Date())

  const closesAt = new Date(
    opensAt.getTime() + REGISTRATION_WINDOW_DAYS * DAY_MS,
  )

  const startsAt = new Date(closesAt.getTime() + PREPARATION_DAYS * DAY_MS)
  startsAt.setHours(RACE_START_HOUR, 0, 0, 0)

  const endsAt = new Date(startsAt.getTime() + RACE_DURATION_HOURS * 3_600_000)

  return {
    registration_opens_at: toDateTimeLocal(opensAt),
    registration_closes_at: toDateTimeLocal(closesAt),
    starts_at: toDateTimeLocal(startsAt),
    ends_at: toDateTimeLocal(endsAt),
  }
}

/**
 * Provider đã chốt ngày thi đấu — suy ngược ra cổng đăng ký.
 *
 * Phần khó là khi ngày thi đấu quá gần: mốc "mở trước 7 ngày" rơi vào quá khứ,
 * kéo nó về hiện tại thì có thể vượt qua luôn mốc đóng đăng ký. Bản trước đúng là
 * mắc lỗi này — mở đăng ký nhảy lên sau cả đóng đăng ký lẫn giờ khởi tranh. Ở đây
 * mọi mốc đều được kẹp lại để chuỗi luôn tăng dần.
 */
function buildScheduleFromRaceDate(rawStartsAt: string): ScheduleFields | null {
  const startsAt = parseLocal(rawStartsAt)
  if (!startsAt) return null

  const now = roundUpToHalfHour(new Date())
  const desiredOpensAt = new Date(
    startsAt.getTime() - (REGISTRATION_WINDOW_DAYS + PREPARATION_DAYS) * DAY_MS,
  )
  const opensAt =
    desiredOpensAt.getTime() < now.getTime() ? now : desiredOpensAt

  let closesAt = new Date(startsAt.getTime() - PREPARATION_DAYS * DAY_MS)
  if (closesAt.getTime() <= opensAt.getTime()) {
    // Không đủ chỗ cho khoảng chuẩn: chia đôi quãng còn lại giữa mở và khởi tranh.
    const midpoint = new Date((opensAt.getTime() + startsAt.getTime()) / 2)
    closesAt = roundDownToHalfHour(midpoint)
  }
  if (closesAt.getTime() <= opensAt.getTime()) {
    // Giải sát tới mức không chia được nữa: đóng đăng ký đúng lúc khởi tranh
    // (hợp lệ theo BR-CT-011 — cho phép đóng <= khởi tranh).
    closesAt = startsAt
  }

  const endsAt =
    parseLocal(rawStartsAt) !== null
      ? new Date(startsAt.getTime() + RACE_DURATION_HOURS * 3_600_000)
      : null

  return {
    registration_opens_at: toDateTimeLocal(opensAt),
    registration_closes_at: toDateTimeLocal(closesAt),
    starts_at: rawStartsAt,
    ends_at: endsAt ? toDateTimeLocal(endsAt) : "",
  }
}

/**
 * Dải tóm tắt bốn mốc. Mốc nào lùi so với mốc liền trước thì tô đỏ ngay tại đây —
 * thứ tự sai nhìn dãy số rất khó nhận ra nếu không được đánh dấu.
 */
function TimelinePreview({ form }: { form: ContestFormState }) {
  const milestones = [
    { label: "Mở đăng ký", value: form.registration_opens_at },
    { label: "Đóng đăng ký", value: form.registration_closes_at },
    { label: "Khởi tranh", value: form.starts_at },
    { label: "Kết thúc", value: form.ends_at },
  ]

  if (milestones.every((item) => !item.value)) return null

  let previousTime: number | null = null
  const rows = milestones.map((milestone) => {
    const time = parseLocal(milestone.value)?.getTime() ?? null
    const isOutOfOrder =
      time !== null && previousTime !== null && time < previousTime
    if (time !== null) previousTime = time
    return { ...milestone, isOutOfOrder }
  })
  const hasOutOfOrder = rows.some((row) => row.isOutOfOrder)

  return (
    <div
      className={cn(
        "mt-5 rounded-xl border px-4 py-3",
        hasOutOfOrder
          ? "border-red-200 bg-red-50/60"
          : "border-[#e5e2e1] bg-[#fcf8f8]",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {rows.map((row, index) => (
          <span key={row.label} className="flex items-center gap-3">
            <span>
              <span
                className={cn(
                  "block text-xs font-bold uppercase tracking-wide",
                  row.isOutOfOrder ? "text-red-500" : "text-[#adaaaa]",
                )}
              >
                {row.label}
              </span>
              <span
                className={cn(
                  "block text-sm font-bold",
                  row.isOutOfOrder ? "text-red-700" : "text-[#1c1b1b]",
                )}
              >
                {formatMilestone(row.value)}
              </span>
            </span>
            {index < rows.length - 1 ? (
              <ArrowRight className="size-4 shrink-0 text-[#c4c7c8]" />
            ) : null}
          </span>
        ))}
      </div>
      {hasOutOfOrder ? (
        <p className="mt-2 text-sm font-bold text-red-700">
          Các mốc đang lệch thứ tự thời gian — sửa lại trước khi sang bước sau.
        </p>
      ) : null}
    </div>
  )
}

/** Định dạng `YYYY-MM-DDTHH:mm` theo giờ địa phương — đúng thứ các ô ngày/giờ hiểu. */
function toDateTimeLocal(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function parseLocal(value: string): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Làm tròn lên/xuống mốc 30 phút để khớp danh sách giờ của `DateTimeField`. */
function roundUpToHalfHour(date: Date) {
  const rounded = new Date(date)
  rounded.setSeconds(0, 0)
  const remainder = rounded.getMinutes() % 30
  if (remainder !== 0)
    rounded.setMinutes(rounded.getMinutes() + (30 - remainder))
  return rounded
}

function roundDownToHalfHour(date: Date) {
  const rounded = new Date(date)
  rounded.setSeconds(0, 0)
  rounded.setMinutes(rounded.getMinutes() - (rounded.getMinutes() % 30))
  return rounded
}

function formatMilestone(value: string) {
  if (!value) return "--"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "--"
  return date.toLocaleString("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  })
}
