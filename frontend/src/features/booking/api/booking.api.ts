import { api } from "@/shared/lib/axios"
import { sanitizeImageUrl } from "@/shared/lib/utils"
import type {
  AvailabilityResponse,
  BookingListResponse,
  BookingResponse,
  CancellationQuote,
  CafeBookingListResponse,
  CheckAvailabilityParams,
  CafePaymentMethodOption,
  CheckoutResponse,
  CreateBookingBody,
  CreateBookingResult,
  ListCafeBookingsParams,
  ListMyBookingsParams,
  PaymentResultTransaction,
  CafeSessionListResponse,
  ListCafeSessionsParams,
  CafeSessionStatsResponse,
} from "../types/booking.types"

interface ApiEnvelope<T> {
  success: boolean
  data: T
}

export const bookingQueryKeys = {
  all: ["bookings"] as const,
  mine: (params?: ListMyBookingsParams) =>
    [...bookingQueryKeys.all, "mine", params ?? {}] as const,
  detail: (id?: string) => [...bookingQueryKeys.all, "detail", id] as const,
  cafe: (cafeId: string, params?: ListCafeBookingsParams) =>
    [...bookingQueryKeys.all, "cafe", cafeId, params ?? {}] as const,
  availability: (cafeId: string, params: CheckAvailabilityParams) =>
    ["availability", cafeId, params] as const,
  sessions: (cafeId: string, params?: ListCafeSessionsParams) =>
    [...bookingQueryKeys.all, "sessions", cafeId, params ?? {}] as const,
  sessionsStats: (cafeId: string, date: string) =>
    [...bookingQueryKeys.all, "sessions-stats", cafeId, date] as const,
}

export const bookingApi = {
  checkAvailability: async (
    cafeId: string,
    params: CheckAvailabilityParams,
  ): Promise<AvailabilityResponse> => {
    const searchParams = new URLSearchParams()
    searchParams.append("slot_start", params.slot_start)
    searchParams.append("slot_end", params.slot_end)
    searchParams.append("play_mode", params.play_mode)
    if (params.track_type_id) {
      searchParams.append("track_type_id", params.track_type_id)
    }
    if (params.track_config_id) {
      searchParams.append("track_config_id", params.track_config_id)
    }

    const res = await api.get<ApiEnvelope<AvailabilityResponse>>(
      `/v1/cafes/${cafeId}/availability`,
      { params: searchParams },
    )
    return res.data.data
  },

  createBooking: async (
    body: CreateBookingBody,
  ): Promise<CreateBookingResult> => {
    const res = await api.post<ApiEnvelope<CreateBookingResult>>(
      "/v1/bookings",
      body,
    )
    return res.data.data
  },

  getBooking: async (id: string): Promise<BookingResponse> => {
    const res = await api.get<ApiEnvelope<BookingResponse>>(
      `/v1/bookings/${id}`,
    )
    const booking = res.data.data
    return {
      ...booking,
      vehicles: booking.vehicles.map((vehicle) => ({
        ...vehicle,
        coverImageUrl: sanitizeImageUrl(vehicle.coverImageUrl),
      })),
    }
  },

  getPaymentTransaction: async (
    txnRef: string,
  ): Promise<PaymentResultTransaction> => {
    const res = await api.get<ApiEnvelope<PaymentResultTransaction>>(
      `/v1/bookings/payment-transactions/${encodeURIComponent(txnRef)}`,
    )
    return res.data.data
  },

  listMyBookings: async (
    params: ListMyBookingsParams = {},
  ): Promise<BookingListResponse> => {
    const res = await api.get<ApiEnvelope<BookingListResponse>>(
      "/v1/bookings",
      { params },
    )
    return res.data as unknown as BookingListResponse
  },

  listCafeBookings: async (
    cafeId: string,
    params: ListCafeBookingsParams,
  ): Promise<CafeBookingListResponse> => {
    const res = await api.get<ApiEnvelope<CafeBookingListResponse>>(
      `/v1/provider/cafes/${cafeId}/bookings`,
      { params },
    )
    return res.data.data
  },

  createCheckout: async (
    bookingId: string,
    paymentMethod?: CafePaymentMethodOption,
  ): Promise<CheckoutResponse> => {
    // Không truyền `payment_method` nghĩa là VNPay — giữ nguyên hành vi cũ.
    const res = await api.post<ApiEnvelope<CheckoutResponse>>(
      `/v1/bookings/${bookingId}/checkout`,
      paymentMethod ? { payment_method: paymentMethod } : undefined,
    )
    return res.data.data
  },

  /**
   * Thu khoản phát sinh cuối phiên (gia hạn, đồ ăn tại quầy, hư hỏng).
   *
   * `paymentMethod` vắng mặt nghĩa là VNPay — giữ nguyên hành vi cũ. Với
   * `bank_transfer`, phản hồi mang `flow: "bank_transfer"` kèm dữ liệu mã QR
   * thay vì một URL để chuyển hướng.
   */
  createCheckoutAdditionalPayment: async (
    bookingId: string,
    paymentMethod?: CafePaymentMethodOption,
  ): Promise<CheckoutResponse> => {
    const res = await api.post<ApiEnvelope<CheckoutResponse>>(
      `/v1/bookings/${bookingId}/checkout-additional-payment`,
      paymentMethod ? { payment_method: paymentMethod } : undefined,
    )
    return res.data.data
  },

  mockCheckout: async (bookingId: string): Promise<void> => {
    await api.post(`/v1/bookings/${bookingId}/mock-checkout`)
  },

  cancelBooking: async (
    bookingId: string,
    reason?: string,
  ): Promise<BookingResponse> => {
    const res = await api.post<ApiEnvelope<BookingResponse>>(
      `/v1/bookings/${bookingId}/cancel`,
      { reason },
    )
    return res.data.data
  },

  getCancellationQuote: async (
    bookingId: string,
  ): Promise<CancellationQuote> => {
    const res = await api.get<ApiEnvelope<CancellationQuote>>(
      `/v1/bookings/${bookingId}/cancellation-quote`,
    )
    return res.data.data
  },

  listCafeSessions: async (
    cafeId: string,
    params: ListCafeSessionsParams,
  ): Promise<CafeSessionListResponse> => {
    const res = await api.get<ApiEnvelope<CafeSessionListResponse>>(
      `/v1/provider/cafes/${cafeId}/sessions`,
      { params },
    )
    return res.data.data
  },

  listCafeSessionStats: async (
    cafeId: string,
    date: string,
  ): Promise<CafeSessionStatsResponse> => {
    const res = await api.get<ApiEnvelope<CafeSessionStatsResponse>>(
      `/v1/provider/cafes/${cafeId}/sessions/stats`,
      { params: { date } },
    )
    return res.data.data
  },
}
