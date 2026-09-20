import { api } from "@/shared/lib/axios"
import { mapContestMatch } from "./contest.api"
import type {
  ContestBookingItem,
  ContestMatch,
  ContestRentalBookingCreateBody,
  ContestRentalBookingResult,
} from "../types"

type ApiEnvelope<T> = {
  success: boolean
  data: T
  meta?: {
    total: number
    page: number
    limit: number
  }
}

export const contestBookingQueryKeys = {
  all: ["contest-bookings"] as const,
  list: (contestId?: string) =>
    [...contestBookingQueryKeys.all, "list", contestId] as const,
}

/* eslint-disable @typescript-eslint/no-explicit-any -- API supports both legacy snake_case and current camelCase payloads. */
function mapContestRentalBookingResult(raw: any): ContestRentalBookingResult {
  return {
    bookingId: raw.booking_id ?? raw.bookingId,
    vehicleId: raw.vehicle_id ?? raw.vehicleId ?? null,
    contestId: raw.contest_id ?? raw.contestId,
    status: raw.status,
    paymentExpiresAt: raw.payment_expires_at ?? raw.paymentExpiresAt ?? null,
    totalAmount: raw.total_amount ?? raw.totalAmount ?? 0,
    breakdown: raw.breakdown ?? {},
  }
}

function mapContestBookingItem(raw: any): ContestBookingItem {
  return {
    id: raw.id,
    status: raw.status,
    source: raw.source,
    slotStart: raw.slot_start ?? raw.slotStart,
    slotEnd: raw.slot_end ?? raw.slotEnd,
    customer: raw.customer
      ? {
          id: raw.customer.id,
          fullName: raw.customer.full_name ?? raw.customer.fullName ?? null,
          email: raw.customer.email ?? null,
          avatarUrl: raw.customer.avatar_url ?? raw.customer.avatarUrl ?? null,
          phone: raw.customer.phone ?? null,
        }
      : null,
    registration: raw.registration
      ? {
          id: raw.registration.id,
          status: raw.registration.status,
          vehicleSource:
            raw.registration.vehicle_source ??
            raw.registration.vehicleSource ??
            null,
          checkInCode:
            raw.registration.check_in_code ??
            raw.registration.checkInCode ??
            null,
        }
      : null,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const contestBookingApi = {
  createContestRentalBooking: async (
    body: ContestRentalBookingCreateBody,
  ): Promise<ContestRentalBookingResult> => {
    const res = await api.post<ApiEnvelope<unknown>>(
      "/v1/bookings/contest-rental",
      body,
    )
    return mapContestRentalBookingResult(res.data.data)
  },

  listContestBookings: async (
    contestId: string,
  ): Promise<ContestBookingItem[]> => {
    const res = await api.get<ApiEnvelope<unknown[]>>(
      `/v1/contests/${contestId}/bookings`,
    )
    return (res.data.data ?? []).map(mapContestBookingItem)
  },

  generateFinalBracket: async (contestId: string): Promise<ContestMatch[]> => {
    const res = await api.post<ApiEnvelope<unknown[]>>(
      `/v1/contests/${contestId}/matches/generate-final-bracket`,
    )
    return (res.data.data ?? []).map(mapContestMatch)
  },
}
