import { Input } from "@/shared/ui/input"

import { ContestFormField } from "./ContestFormField"

/** Bước nhảy của ô chọn giờ. Lịch giải đấu không cần độ chính xác tới phút. */
const MINUTE_STEP = 30

const TIME_OPTIONS: string[] = (() => {
  const options: string[] = []
  for (let minutes = 0; minutes < 24 * 60; minutes += MINUTE_STEP) {
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0")
    const mm = String(minutes % 60).padStart(2, "0")
    options.push(`${hh}:${mm}`)
  }
  return options
})()

/** Giờ mặc định khi provider vừa chọn ngày mà chưa chọn giờ. */
const DEFAULT_TIME = "09:00"

function splitValue(value: string) {
  if (!value || value.length < 16) return { date: "", time: "" }
  return { date: value.slice(0, 10), time: value.slice(11, 16) }
}

/**
 * Ô chọn mốc thời gian: một ô ngày + một danh sách giờ theo bước 30 phút.
 *
 * Thay cho `<input type="datetime-local">` — bộ chọn mặc định của trình duyệt bắt
 * cuộn qua từng phút một (…44, 45, 46…), chọn một mốc mất cả chục thao tác. Ở đây
 * ngày là một lần bấm, giờ là một lần chọn trong danh sách ngắn.
 *
 * `min`/`max` nhận cùng định dạng `YYYY-MM-DDTHH:mm`. Khi ngày đang chọn trùng
 * ngày biên, các mốc giờ vượt biên bị vô hiệu hoá — chặn ngay tại chỗ chọn thay vì
 * để người dùng chọn xong mới báo lỗi.
 */
export function DateTimeField({
  label,
  hint,
  value,
  onChange,
  error,
  min,
  max,
}: {
  label: string
  hint?: string
  value: string
  onChange: (next: string) => void
  error?: string
  min?: string
  max?: string
}) {
  const { date, time } = splitValue(value)
  const minParts = splitValue(min ?? "")
  const maxParts = splitValue(max ?? "")

  const handleDateChange = (nextDate: string) => {
    if (!nextDate) {
      onChange("")
      return
    }
    // Chọn ngày xong mà chưa có giờ thì điền sẵn giờ mặc định, nhưng phải nằm
    // trong biên nếu ngày đó chính là ngày biên.
    let nextTime = time || DEFAULT_TIME
    if (minParts.date && nextDate === minParts.date && nextTime < minParts.time) {
      nextTime = minParts.time
    }
    if (maxParts.date && nextDate === maxParts.date && nextTime > maxParts.time) {
      nextTime = maxParts.time
    }
    onChange(`${nextDate}T${nextTime}`)
  }

  const isTimeDisabled = (option: string) => {
    if (!date) return false
    if (minParts.date && date === minParts.date && option < minParts.time) return true
    if (maxParts.date && date === maxParts.date && option > maxParts.time) return true
    return false
  }

  return (
    <ContestFormField label={label} error={error}>
      <div className="flex flex-wrap gap-2">
        <Input
          type="date"
          className="h-11 min-w-[10rem] flex-1"
          value={date}
          min={minParts.date || undefined}
          max={maxParts.date || undefined}
          onChange={(event) => handleDateChange(event.target.value)}
        />
        <select
          className="h-11 w-28 rounded-lg border border-[#c4c7c8] bg-white px-3 text-sm disabled:bg-[#f6f3f2] disabled:text-[#9a9494]"
          value={time}
          disabled={!date}
          onChange={(event) => onChange(`${date}T${event.target.value}`)}
        >
          {/* Chỉ tồn tại khi giờ đã lưu không rơi đúng bước 30 phút (vd giải cũ) */}
          {time && !TIME_OPTIONS.includes(time) ? (
            <option value={time}>{time}</option>
          ) : null}
          {!time ? <option value="">--:--</option> : null}
          {TIME_OPTIONS.map((option) => (
            <option key={option} value={option} disabled={isTimeDisabled(option)}>
              {option}
            </option>
          ))}
        </select>
      </div>
      {hint ? <p className="text-xs leading-5 text-[#747878]">{hint}</p> : null}
    </ContestFormField>
  )
}
