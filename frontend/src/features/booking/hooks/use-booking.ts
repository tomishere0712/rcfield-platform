import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { bookingApi, bookingQueryKeys } from "../api/booking.api"
import type {
  AvailabilityResponse,
  CafePaymentMethodOption,
  CheckAvailabilityParams,
  CreateBookingBody,
  CreateBookingResult,
  ListCafeBookingsParams,
  ListMyBookingsParams,
  ListCafeSessionsParams,
} from "../types/booking.types"

/**
 * Converts a cafe-local slot (Vietnam, UTC+07:00) to a valid ISO datetime.
 * `24:00` is represented as 00:00 on the following day, since the API's ISO
 * validator correctly rejects 24 as an hour value.
 */
export function toVietnamSlotISOString(date: string, time: string): string {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!dateMatch || !timeMatch) return ""

  const [, yearText, monthText, dayText] = dateMatch
  const [, hourText, minuteText] = timeMatch
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 47 ||
    minute < 0 ||
    minute > 59
  ) {
    return ""
  }

  const timestamp = Date.UTC(year, month - 1, day, hour - 7, minute, 0)
  return Number.isNaN(timestamp) ? "" : new Date(timestamp).toISOString()
}

export function useAvailability(
  cafeId: string,
  params: CheckAvailabilityParams,
  enabled = true,
) {
  return useQuery({
    queryKey: bookingQueryKeys.availability(cafeId, params),
    queryFn: () => bookingApi.checkAvailability(cafeId, params),
    enabled: enabled && !!cafeId && !!params.slot_start && !!params.slot_end,
    staleTime: 30_000,
  })
}

export type HourlySlotAvailability = {
  hour: number
  data: AvailabilityResponse | null
}

/**
 * Fetches combined RENTAL + BYOC availability for each hour within the cafe's operating range.
 * A slot is "available" if RENTAL vehicles are available OR BYOC capacity remains.
 * Merged result: byoc_remaining from BYOC check, vehicles from RENTAL check.
 */
export function useDailyAvailability(
  cafeId: string,
  date: string,
  openHour: number,
  closeHour: number,
  trackConfigId?: string,
) {
  const isMock = cafeId.startsWith("cafe-")
  return useQuery({
    queryKey: [
      "daily-availability",
      cafeId,
      date,
      openHour,
      closeHour,
      trackConfigId ?? null,
    ],
    queryFn: async (): Promise<HourlySlotAvailability[]> => {
      const hours = Array.from(
        { length: closeHour - openHour },
        (_, i) => i + openHour,
      )
      const results = await Promise.all(
        hours.map(async (h) => {
          const hh = String(h).padStart(2, "0")
          const slotStart = toVietnamSlotISOString(date, `${hh}:00`)
          const slotEnd = toVietnamSlotISOString(
            date,
            `${String(h + 1).padStart(2, "0")}:00`,
          )
          try {
            const [rental, byoc] = await Promise.all([
              bookingApi.checkAvailability(cafeId, {
                slot_start: slotStart,
                slot_end: slotEnd,
                play_mode: "RENTAL",
                ...(trackConfigId ? { track_config_id: trackConfigId } : {}),
              }),
              bookingApi.checkAvailability(cafeId, {
                slot_start: slotStart,
                slot_end: slotEnd,
                play_mode: "BYOC",
                ...(trackConfigId ? { track_config_id: trackConfigId } : {}),
              }),
            ])
            const rentalCount = rental.vehicles?.length ?? 0
            const byocRemaining = byoc.byoc_remaining ?? 0
            return {
              hour: h,
              data: {
                play_mode: rentalCount > 0 ? "RENTAL" : "BYOC",
                available: rentalCount > 0 || byocRemaining > 0,
                byoc_remaining: byocRemaining,
                vehicles: rental.vehicles ?? [],
              } satisfies AvailabilityResponse,
            }
          } catch (err) {
            console.error(`checkAvailability failed for hour ${h}:`, err)
            return { hour: h, data: null }
          }
        }),
      )
      return results
    },
    /*
      `closeHour` vượt quá 24 khi quán đóng cửa sau nửa đêm: 09:00–01:00 được
      quy đổi thành 9 → 25 để biểu diễn "1 giờ sáng hôm sau".

      Điều kiện cũ đòi `closeHour <= 24`, nên với mọi chi nhánh mở qua đêm thì
      truy vấn KHÔNG BAO GIỜ chạy — `data` là undefined, danh sách slot rỗng,
      và người dùng thấy một khung giờ trống trơn dù nhãn vẫn ghi "16 slot/ngày"
      (nhãn đó tính từ open/close chứ không đọc mảng slot, nên nó không hé lộ
      chuyện gì đang sai).

      Trần 48 là giới hạn hợp lý: một ngày vận hành không thể dài hơn 24 tiếng
      kể từ giờ mở cửa.
    */
    enabled:
      !!cafeId &&
      !!date &&
      !isMock &&
      Number.isInteger(openHour) &&
      Number.isInteger(closeHour) &&
      openHour >= 0 &&
      closeHour > openHour &&
      closeHour <= 48,
    staleTime: 60_000,
  })
}

export function useBooking(id: string | undefined) {
  return useQuery({
    queryKey: bookingQueryKeys.detail(id),
    queryFn: () => bookingApi.getBooking(id!),
    enabled: !!id,
  })
}

export function useMyBookings(params: ListMyBookingsParams = {}) {
  return useQuery({
    queryKey: bookingQueryKeys.mine(params),
    queryFn: () => bookingApi.listMyBookings(params),
  })
}

export function useCafeBookings(
  cafeId: string | undefined,
  params: ListCafeBookingsParams,
) {
  return useQuery({
    queryKey: bookingQueryKeys.cafe(cafeId ?? "", params),
    queryFn: () => bookingApi.listCafeBookings(cafeId!, params),
    enabled: !!cafeId,
    staleTime: 0,
  })
}

export function useCreateBooking() {
  const queryClient = useQueryClient()
  return useMutation<CreateBookingResult, Error, CreateBookingBody>({
    mutationFn: (body: CreateBookingBody) => bookingApi.createBooking(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bookingQueryKeys.all })
      void queryClient.invalidateQueries({ queryKey: ["daily-availability"] })
    },
  })
}

export function useCreateCheckout() {
  return useMutation({
    // Nhận cả dạng chuỗi (gọi cũ) lẫn dạng đối tượng có phương thức thanh toán,
    // để mọi chỗ đang gọi `mutateAsync(bookingId)` chạy y nguyên.
    mutationFn: (
      input: string | { bookingId: string; paymentMethod?: CafePaymentMethodOption },
    ) =>
      typeof input === "string"
        ? bookingApi.createCheckout(input)
        : bookingApi.createCheckout(input.bookingId, input.paymentMethod),
  })
}

export function useCancelBooking() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      bookingId,
      reason,
    }: {
      bookingId: string
      reason?: string
    }) => bookingApi.cancelBooking(bookingId, reason),
    // Refresh on both outcomes. A timeout or a concurrent cancellation can
    // change the booking state on the server even when this request returns an
    // error, and the customer must not keep seeing a stale active hold.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: bookingQueryKeys.all })
    },
  })
}

export function useCafeSessions(
  cafeId: string | undefined,
  params: ListCafeSessionsParams,
) {
  return useQuery({
    queryKey: bookingQueryKeys.sessions(cafeId ?? "", params),
    queryFn: () => bookingApi.listCafeSessions(cafeId!, params),
    enabled: !!cafeId && !!params.date,
    staleTime: 0,
  })
}

export function useCafeSessionStats(
  cafeId: string | undefined,
  date: string,
) {
  return useQuery({
    queryKey: bookingQueryKeys.sessionsStats(cafeId ?? "", date),
    queryFn: () => bookingApi.listCafeSessionStats(cafeId!, date),
    enabled: !!cafeId && !!date,
    staleTime: 0,
  })
}
