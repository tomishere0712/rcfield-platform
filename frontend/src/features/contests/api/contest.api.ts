import { api } from "@/shared/lib/axios"
import type {
  AdminContestFeeOrder,
  ContestFeeOrder,
  ContestFeePayOSLink,
  PendingFeaturedPopup,
  ContestFeePlan,
  ContestFeeStatus,
  ContestMatchWalkoverBody,
  ContestAuditLogItem,
  ContestBanItem,
  ContestCorrectResultsBody,
  ContestEntryPaymentResponse,
  ContestCatalogFormat,
  ContestCatalogType,
  ContestRentalOptions,
  ContestAvailableRentalVehiclesResponse,
  ContestHandoverUnit,
  ContestItem,
  ContestLeaderboardPayload,
  ContestListParams,
  ContestListResponse,
  ContestMatch,
  ContestMatchesQuery,
  ContestMetrics,
  PaginatedResponse,
  ContestRegistration,
  ContestRegistrationsQuery,
  ContestRaceRecordSyncResult,
  ContestRegistrationCreateBody,
  ContestSubmitResultsBody,
  ContestStaffAssignment,
  ContestTemplate,
  ContestGenerateMatchesBody,
  MyContestRegistrationsQuery,
  ContestUpdateMatchParticipantsBody,
  ContestUpsertBody,
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

export const contestQueryKeys = {
  all: ["contests"] as const,
  list: (params?: Record<string, unknown>) =>
    [...contestQueryKeys.all, "list", params ?? {}] as const,
  detail: (contestId?: string) =>
    [...contestQueryKeys.all, "detail", contestId] as const,
  registrations: (contestId?: string, params?: Record<string, unknown>) =>
    params
      ? ([...contestQueryKeys.all, "registrations", contestId, params] as const)
      : ([...contestQueryKeys.all, "registrations", contestId] as const),
  matches: (contestId?: string, params?: Record<string, unknown>) =>
    params
      ? ([...contestQueryKeys.all, "matches", contestId, params] as const)
      : ([...contestQueryKeys.all, "matches", contestId] as const),
  metrics: (contestId?: string) =>
    [...contestQueryKeys.all, "metrics", contestId] as const,
  feePlans: () => ["contests", "fee-plans"] as const,
  fee: (contestId?: string) => ["contests", contestId, "fee"] as const,
  auditLogs: (contestId?: string, params?: Record<string, unknown>) =>
    params
      ? ([...contestQueryKeys.all, "audit-logs", contestId, params] as const)
      : ([...contestQueryKeys.all, "audit-logs", contestId] as const),
  leaderboard: (contestId?: string) =>
    [...contestQueryKeys.all, "leaderboard", contestId] as const,
  staffAssignments: (contestId?: string) =>
    [...contestQueryKeys.all, "staff-assignments", contestId] as const,
  bans: (contestId?: string) =>
    [...contestQueryKeys.all, "bans", contestId] as const,
  lookup: (contestId?: string, checkInCode?: string) =>
    [...contestQueryKeys.all, "lookup", contestId, checkInCode] as const,
  myRegistrations: (params?: Record<string, unknown>) =>
    params
      ? ([...contestQueryKeys.all, "my-registrations", params] as const)
      : ([...contestQueryKeys.all, "my-registrations"] as const),
  catalogTypes: () => ["contest-catalog", "types"] as const,
  catalogFormats: () => ["contest-catalog", "formats"] as const,
  catalogTemplates: (params?: Record<string, unknown>) =>
    ["contest-catalog", "templates", params ?? {}] as const,
}

/* eslint-disable @typescript-eslint/no-explicit-any -- API supports both legacy snake_case and current camelCase contest payloads. */
function mapContestItem(raw: any): ContestItem {
  return {
    ...raw,
    resource_locks: Array.isArray(raw.resource_locks) ? raw.resource_locks : [],
    prize_structure: raw.prize_structure ?? null,
    public_stats: raw.public_stats ?? null,
    staff_assignments: Array.isArray(raw.staff_assignments)
      ? raw.staff_assignments
      : [],
    published_leaderboard:
      raw.published_leaderboard ?? raw.config?.published_leaderboard ?? null,
    runtime_summary: raw.runtime_summary ?? null,
    highlight_rounds: Array.isArray(raw.highlight_rounds)
      ? raw.highlight_rounds
      : Array.isArray(raw.runtime_summary?.highlight_rounds)
        ? raw.runtime_summary.highlight_rounds
        : [],
    operator_access: Boolean(raw.operator_access),
    my_registration: raw.my_registration
      ? mapContestRegistration(raw.my_registration)
      : null,
  }
}

function mapContestRegistration(raw: any): ContestRegistration {
  return {
    id: raw.id,
    contestId: raw.contest_id ?? raw.contestId,
    userId: raw.user_id ?? raw.userId,
    participantRoleSnapshot:
      raw.participant_role_snapshot ?? raw.participantRoleSnapshot ?? "",
    vehicleSource: raw.vehicle_source ?? raw.vehicleSource,
    vehicleId: raw.vehicle_id ?? raw.vehicleId ?? null,
    rentalCatalogId: raw.rental_catalog_id ?? raw.rentalCatalogId ?? null,
    bookingId: raw.booking_id ?? raw.bookingId ?? null,
    status: raw.status,
    checkInCode: raw.check_in_code ?? raw.checkInCode ?? null,
    paymentStatus: raw.payment_status ?? raw.paymentStatus,
    entryFeeAmount: raw.entry_fee_amount ?? raw.entryFeeAmount ?? null,
    // Mốc suất bị nhả nếu chưa trả lệ phí. Máy chủ tính, giao diện chỉ hiện —
    // viết cứng số phút ở đây là sớm muộn lệch với hạn thật sự được thi hành.
    entryFeeHoldExpiresAt:
      raw.entry_fee_hold_expires_at ?? raw.entryFeeHoldExpiresAt ?? null,
    checkedInCafeId: raw.checked_in_cafe_id ?? raw.checkedInCafeId ?? null,
    checkedInAt: raw.checked_in_at ?? raw.checkedInAt ?? null,
    cancellationReason:
      raw.cancellation_reason ?? raw.cancellationReason ?? null,
    createdAt: raw.created_at ?? raw.createdAt,
    updatedAt: raw.updated_at ?? raw.updatedAt,
    metadata: raw.metadata ?? {},
    participant: raw.participant
      ? {
        id: raw.participant.id,
        fullName:
          raw.participant.full_name ?? raw.participant.fullName ?? null,
        email: raw.participant.email ?? null,
        avatarUrl:
          raw.participant.avatar_url ?? raw.participant.avatarUrl ?? null,
        driverHandle: raw.participant.driver_handle ?? null,
        driverTitleLabel: raw.participant.driver_title_label ?? null,
      }
      : null,
    contest: raw.contest ? mapContestItem(raw.contest) : null,
    latestMatch: raw.latest_match
      ? {
        matchId: raw.latest_match.match_id,
        contestId: raw.latest_match.contest_id,
        roundNo: raw.latest_match.round_no,
        matchNo: raw.latest_match.match_no,
        name: raw.latest_match.name ?? null,
        status: raw.latest_match.status,
        matchType: raw.latest_match.match_type,
        scheduledAt: raw.latest_match.scheduled_at ?? null,
        startedAt: raw.latest_match.started_at ?? null,
        endedAt: raw.latest_match.ended_at ?? null,
        nextMatchId: raw.latest_match.next_match_id ?? null,
        participantStatus: raw.latest_match.participant_status ?? null,
        finishPosition: raw.latest_match.finish_position ?? null,
        isWinner: Boolean(raw.latest_match.is_winner),
      }
      : null,
    customerJourneyStatus:
      raw.customer_journey_status ?? raw.customerJourneyStatus ?? null,
    booking: raw.booking
      ? {
        id: raw.booking.id,
        status: raw.booking.status,
        paymentExpiresAt:
          raw.booking.payment_expires_at ??
          raw.booking.paymentExpiresAt ??
          null,
        totalAmount: raw.booking.total_amount ?? raw.booking.totalAmount ?? 0,
      }
      : null,
  }
}

export function mapContestMatch(raw: any): ContestMatch {
  return {
    ...raw,
    participants: (raw.participants ?? []).map((participant: any) => ({
      ...participant,
      best_lap_seconds: participant.best_lap_seconds ?? null,
      total_time_seconds: participant.total_time_seconds ?? null,
      registration: participant.registration
        ? {
          id: participant.registration.id,
          user_id: participant.registration.user_id,
          participant_name: participant.registration.participant_name ?? null,
          participant_email:
            participant.registration.participant_email ?? null,
          participant_avatar_url:
            participant.registration.participant_avatar_url ?? null,
          driver_handle: participant.registration.driver_handle ?? null,
          driver_title_label:
            participant.registration.driver_title_label ?? null,
          status: participant.registration.status,
          check_in_code: participant.registration.check_in_code ?? null,
          checked_in_at: participant.registration.checked_in_at ?? null,
          is_my_registration: Boolean(
            participant.registration.is_my_registration,
          ),
        }
        : null,
    })),
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const contestApi = {
  getContestRentalOptions: async (
    contestId: string,
  ): Promise<ContestRentalOptions> => {
    const res = await api.get<ApiEnvelope<ContestRentalOptions>>(
      `/v1/contests/${contestId}/rental-options`,
    )
    return res.data.data
  },

  getContestAvailableRentalVehicles: async (
    contestId: string,
    params: { cafe_id: string },
  ): Promise<ContestAvailableRentalVehiclesResponse> => {
    const res = await api.get<
      ApiEnvelope<ContestAvailableRentalVehiclesResponse>
    >(`/v1/contests/${contestId}/available-rental-vehicles`, { params })
    return res.data.data
  },

  listHandoverUnits: async (
    registrationId: string,
  ): Promise<ContestHandoverUnit[]> => {
    const res = await api.get<ApiEnvelope<ContestHandoverUnit[]>>(
      `/v1/contest-registrations/${registrationId}/handover-units`,
    )
    return res.data.data
  },

  listAuditLogs: async (
    contestId: string,
    params?: { page?: number; limit?: number },
  ): Promise<PaginatedResponse<ContestAuditLogItem>> => {
    const res = await api.get<PaginatedResponse<ContestAuditLogItem>>(
      `/v1/contests/${contestId}/audit-logs`,
      { params },
    )
    return res.data
  },

  listContestFeePlans: async (): Promise<ContestFeePlan[]> => {
    const res = await api.get<ApiEnvelope<ContestFeePlan[]>>(
      "/v1/contest-fee-plans",
    )
    return res.data.data
  },

  getContestFeeStatus: async (contestId: string): Promise<ContestFeeStatus> => {
    const res = await api.get<ApiEnvelope<ContestFeeStatus>>(
      `/v1/contests/${contestId}/fee`,
    )
    return res.data.data
  },

  createContestFeeOrder: async (
    contestId: string,
    planId: string,
  ): Promise<ContestFeeOrder> => {
    const res = await api.post<ApiEnvelope<ContestFeeOrder>>(
      `/v1/contests/${contestId}/fee/order`,
      { plan_id: planId },
    )
    return res.data.data
  },

  cancelContestFeeOrder: async (
    contestId: string,
  ): Promise<ContestFeeOrder> => {
    const res = await api.delete<ApiEnvelope<ContestFeeOrder>>(
      `/v1/contests/${contestId}/fee/order`,
    )
    return res.data.data
  },

  submitContestFeeTransfer: async (
    contestId: string,
    body: {
      transfer_reference: string
      transfer_date: string
      transfer_amount: number
    },
  ): Promise<ContestFeeOrder> => {
    const res = await api.post<ApiEnvelope<ContestFeeOrder>>(
      `/v1/contests/${contestId}/fee/transfer`,
      body,
    )
    return res.data.data
  },

  /** Mở phiên thanh toán PayOS cho đơn phí đang chờ trả. */
  createContestFeePayOSLink: async (
    contestId: string,
  ): Promise<ContestFeePayOSLink> => {
    const res = await api.post<ApiEnvelope<ContestFeePayOSLink>>(
      `/v1/contests/${contestId}/fee/payos-link`,
    )
    return res.data.data
  },

  /**
   * Hỏi thẳng PayOS trạng thái đơn ngay khi họ chuyển hướng về.
   * Không đợi webhook vì webhook có thể tới chậm hoặc rớt.
   */
  verifyContestFeePayOS: async (
    contestId: string,
    orderCode: number,
  ): Promise<ContestFeeOrder> => {
    const res = await api.post<ApiEnvelope<ContestFeeOrder>>(
      `/v1/contests/${contestId}/fee/payos-verify`,
      { order_code: orderCode },
    )
    return res.data.data
  },

  listContestFeeOrdersForAdmin: async (params?: {
    status?: string
    page?: number
    limit?: number
  }): Promise<PaginatedResponse<AdminContestFeeOrder>> => {
    const res = await api.get<PaginatedResponse<AdminContestFeeOrder>>(
      "/v1/admin/contest-fee-orders",
      { params },
    )
    return res.data
  },

  confirmContestFeeOrder: async (
    orderId: string,
    notes?: string,
  ): Promise<ContestFeeOrder> => {
    const res = await api.post<ApiEnvelope<ContestFeeOrder>>(
      `/v1/admin/contest-fee-orders/${orderId}/confirm`,
      { notes },
    )
    return res.data.data
  },

  rejectContestFeeOrder: async (
    orderId: string,
    reason: string,
  ): Promise<ContestFeeOrder> => {
    const res = await api.post<ApiEnvelope<ContestFeeOrder>>(
      `/v1/admin/contest-fee-orders/${orderId}/reject`,
      { reason },
    )
    return res.data.data
  },

  listPendingFeaturedPopups: async (): Promise<PendingFeaturedPopup[]> => {
    const res = await api.get<ApiEnvelope<PendingFeaturedPopup[]>>(
      "/v1/admin/featured-popups/pending",
    )
    return res.data.data
  },

  reviewFeaturedPopup: async (
    popupId: string,
    body: { approve: boolean; notes?: string },
  ): Promise<PendingFeaturedPopup> => {
    const res = await api.post<ApiEnvelope<PendingFeaturedPopup>>(
      `/v1/admin/featured-popups/${popupId}/review`,
      body,
    )
    return res.data.data
  },

  listContestTypes: async (): Promise<ContestCatalogType[]> => {
    const res = await api.get<ApiEnvelope<ContestCatalogType[]>>(
      "/v1/contest-catalog/types",
    )
    return res.data.data
  },

  listContestFormats: async (): Promise<ContestCatalogFormat[]> => {
    const res = await api.get<ApiEnvelope<ContestCatalogFormat[]>>(
      "/v1/contest-catalog/formats",
    )
    return res.data.data
  },

  listContestTemplates: async (params?: {
    contest_type_id?: string
    contest_format_id?: string
  }): Promise<ContestTemplate[]> => {
    const res = await api.get<ApiEnvelope<ContestTemplate[]>>(
      "/v1/contest-catalog/templates",
      { params },
    )
    return res.data.data
  },

  listContests: async (
    params?: ContestListParams,
  ): Promise<ContestListResponse> => {
    const res = await api.get<ContestListResponse>("/v1/contests", { params })
    return { ...res.data, data: (res.data.data ?? []).map(mapContestItem) }
  },

  listCafeContests: async (
    cafeId: string,
    params?: ContestListParams,
  ): Promise<ContestListResponse> => {
    const res = await api.get<ContestListResponse>(
      `/v1/cafes/${cafeId}/contests`,
      { params },
    )
    return { ...res.data, data: (res.data.data ?? []).map(mapContestItem) }
  },

  getContest: async (contestId: string): Promise<ContestItem> => {
    const res = await api.get<ApiEnvelope<ContestItem>>(
      `/v1/contests/${contestId}`,
    )
    return mapContestItem(res.data.data)
  },

  createContest: async (body: ContestUpsertBody): Promise<ContestItem> => {
    const res = await api.post<ApiEnvelope<ContestItem>>("/v1/contests", body)
    return mapContestItem(res.data.data)
  },

  updateContest: async (
    contestId: string,
    body: Partial<ContestUpsertBody>,
  ): Promise<ContestItem> => {
    const res = await api.patch<ApiEnvelope<ContestItem>>(
      `/v1/contests/${contestId}`,
      body,
    )
    return mapContestItem(res.data.data)
  },

  openContest: async (contestId: string): Promise<ContestItem> => {
    const res = await api.post<ApiEnvelope<ContestItem>>(
      `/v1/contests/${contestId}/open`,
    )
    return mapContestItem(res.data.data)
  },

  closeContest: async (contestId: string): Promise<ContestItem> => {
    const res = await api.post<ApiEnvelope<ContestItem>>(
      `/v1/contests/${contestId}/close`,
    )
    return mapContestItem(res.data.data)
  },

  cancelContest: async (contestId: string): Promise<ContestItem> => {
    const res = await api.post<ApiEnvelope<ContestItem>>(
      `/v1/contests/${contestId}/cancel`,
    )
    return mapContestItem(res.data.data)
  },

  registerContest: async (
    contestId: string,
    body: ContestRegistrationCreateBody,
  ): Promise<ContestRegistration> => {
    const res = await api.post<ApiEnvelope<ContestRegistration>>(
      `/v1/contests/${contestId}/register`,
      body,
    )
    return mapContestRegistration(res.data.data)
  },

  listMyRegistrations: async (
    params?: MyContestRegistrationsQuery,
  ): Promise<ContestRegistration[]> => {
    const res = await api.get<ApiEnvelope<ContestRegistration[]>>(
      "/v1/me/contest-registrations",
      { params },
    )
    return (res.data.data ?? []).map(mapContestRegistration)
  },

  listContestRegistrations: async (
    contestId: string,
    params?: ContestRegistrationsQuery,
  ): Promise<ContestRegistration[]> => {
    const res = await api.get<ApiEnvelope<ContestRegistration[]>>(
      `/v1/contests/${contestId}/registrations`,
      { params },
    )
    return (res.data.data ?? []).map(mapContestRegistration)
  },

  listMatches: async (
    contestId: string,
    params?: ContestMatchesQuery,
  ): Promise<ContestMatch[]> => {
    const res = await api.get<ApiEnvelope<ContestMatch[]>>(
      `/v1/contests/${contestId}/matches`,
      { params },
    )
    return (res.data.data ?? []).map(mapContestMatch)
  },

  generateMatches: async (
    contestId: string,
    body: ContestGenerateMatchesBody,
  ): Promise<ContestMatch[]> => {
    const res = await api.post<ApiEnvelope<ContestMatch[]>>(
      `/v1/contests/${contestId}/matches/generate`,
      body,
    )
    return (res.data.data ?? []).map(mapContestMatch)
  },

  updateMatchParticipants: async (
    matchId: string,
    body: ContestUpdateMatchParticipantsBody,
  ): Promise<ContestMatch[]> => {
    const res = await api.patch<ApiEnvelope<ContestMatch[]>>(
      `/v1/contest-matches/${matchId}/participants`,
      body,
    )
    return (res.data.data ?? []).map(mapContestMatch)
  },

  submitMatchResults: async (
    matchId: string,
    body: ContestSubmitResultsBody,
  ): Promise<ContestMatch[]> => {
    const res = await api.post<ApiEnvelope<ContestMatch[]>>(
      `/v1/contest-matches/${matchId}/results`,
      body,
    )
    return (res.data.data ?? []).map(mapContestMatch)
  },

  correctMatchResults: async (
    matchId: string,
    body: ContestCorrectResultsBody,
  ): Promise<ContestMatch[]> => {
    const res = await api.post<ApiEnvelope<ContestMatch[]>>(
      `/v1/contest-matches/${matchId}/results/correct`,
      body,
    )
    return (res.data.data ?? []).map(mapContestMatch)
  },

  recordMatchWalkover: async (
    matchId: string,
    body: ContestMatchWalkoverBody,
  ): Promise<ContestMatch[]> => {
    const res = await api.post<ApiEnvelope<ContestMatch[]>>(
      `/v1/contest-matches/${matchId}/walkover`,
      body,
    )
    return (res.data.data ?? []).map(mapContestMatch)
  },

  advanceMatch: async (matchId: string): Promise<ContestMatch[]> => {
    const res = await api.post<ApiEnvelope<ContestMatch[]>>(
      `/v1/contest-matches/${matchId}/advance`,
    )
    return (res.data.data ?? []).map(mapContestMatch)
  },

  publishLeaderboard: async (
    contestId: string,
  ): Promise<ContestLeaderboardPayload> => {
    const res = await api.post<ApiEnvelope<ContestLeaderboardPayload>>(
      `/v1/contests/${contestId}/leaderboard/publish`,
    )
    return res.data.data
  },

  syncRaceRecords: async (
    contestId: string,
  ): Promise<ContestRaceRecordSyncResult> => {
    const res = await api.post<ApiEnvelope<ContestRaceRecordSyncResult>>(
      `/v1/contests/${contestId}/sync-race-records`,
    )
    return res.data.data
  },

  getMetrics: async (contestId: string): Promise<ContestMetrics> => {
    const res = await api.get<ApiEnvelope<ContestMetrics>>(
      `/v1/contests/${contestId}/metrics`,
    )
    return res.data.data
  },

  lookupRegistration: async (
    contestId: string,
    checkInCode: string,
  ): Promise<ContestRegistration> => {
    const res = await api.get<ApiEnvelope<ContestRegistration>>(
      `/v1/contests/${contestId}/registrations/lookup`,
      { params: { check_in_code: checkInCode } },
    )
    return mapContestRegistration(res.data.data)
  },

  markEntryFeePaid: async (
    registrationId: string,
    note?: string,
  ): Promise<ContestRegistration> => {
    const res = await api.post<ApiEnvelope<ContestRegistration>>(
      `/v1/contest-registrations/${registrationId}/mark-entry-fee-paid`,
      { note },
    )
    return mapContestRegistration(res.data.data)
  },

  waiveEntryFee: async (
    registrationId: string,
    note?: string,
  ): Promise<ContestRegistration> => {
    const res = await api.post<ApiEnvelope<ContestRegistration>>(
      `/v1/contest-registrations/${registrationId}/waive-entry-fee`,
      { note },
    )
    return mapContestRegistration(res.data.data)
  },

  createEntryFeePayment: async (
    registrationId: string,
    body?: { return_url?: string },
  ): Promise<ContestEntryPaymentResponse> => {
    const res = await api.post<ApiEnvelope<ContestEntryPaymentResponse>>(
      `/v1/contest-registrations/${registrationId}/create-entry-fee-payment`,
      body ?? {},
    )
    return res.data.data
  },

  approveRegistration: async (
    registrationId: string,
    reason?: string,
  ): Promise<ContestRegistration> => {
    const res = await api.post<ApiEnvelope<ContestRegistration>>(
      `/v1/contest-registrations/${registrationId}/approve`,
      { reason },
    )
    return mapContestRegistration(res.data.data)
  },

  rejectRegistration: async (
    registrationId: string,
    reason?: string,
  ): Promise<ContestRegistration> => {
    const res = await api.post<ApiEnvelope<ContestRegistration>>(
      `/v1/contest-registrations/${registrationId}/reject`,
      { reason },
    )
    return mapContestRegistration(res.data.data)
  },

  checkInRegistration: async (
    registrationId: string,
    checkedInCafeId: string,
    rentalVehicleId?: string | null,
    byocConfirmed?: boolean,
    byocInspection?: {
      photos?: Array<{ url: string; angle?: string; notes?: string }>
      checklist?: Array<{
        itemKey: string
        itemLabel: string
        status?: "OK" | "NOT_OK" | "NA"
        note?: string
      }>
    },
  ): Promise<ContestRegistration> => {
    const res = await api.post<ApiEnvelope<ContestRegistration>>(
      `/v1/contest-registrations/${registrationId}/check-in`,
      {
        checked_in_cafe_id: checkedInCafeId,
        rental_vehicle_id: rentalVehicleId ?? undefined,
        byoc_confirmed: byocConfirmed,
        byoc_inspection: byocInspection,
      },
    )
    return mapContestRegistration(res.data.data)
  },

  cancelRegistration: async (
    registrationId: string,
  ): Promise<ContestRegistration> => {
    const res = await api.post<ApiEnvelope<ContestRegistration>>(
      `/v1/contest-registrations/${registrationId}/cancel`,
    )
    return mapContestRegistration(res.data.data)
  },

  updateByocDeclaration: async (
    registrationId: string,
    body: {
      vehicle_name: string
      vehicle_brand?: string | null
      vehicle_class?: string | null
      notes?: string | null
    },
  ): Promise<ContestRegistration> => {
    const res = await api.patch<ApiEnvelope<ContestRegistration>>(
      `/v1/contest-registrations/${registrationId}/byoc-declaration`,
      body,
    )
    return mapContestRegistration(res.data.data)
  },

  listStaffAssignments: async (
    contestId: string,
  ): Promise<ContestStaffAssignment[]> => {
    const res = await api.get<ApiEnvelope<ContestStaffAssignment[]>>(
      `/v1/contests/${contestId}/staff-assignments`,
    )
    return res.data.data ?? []
  },

  assignStaff: async (
    contestId: string,
    staffId: string,
  ): Promise<ContestStaffAssignment[]> => {
    const res = await api.post<ApiEnvelope<ContestStaffAssignment[]>>(
      `/v1/contests/${contestId}/staff-assignments`,
      {
        staff_id: staffId,
      },
    )
    return res.data.data ?? []
  },

  unassignStaff: async (
    contestId: string,
    staffId: string,
  ): Promise<ContestStaffAssignment[]> => {
    const res = await api.delete<ApiEnvelope<ContestStaffAssignment[]>>(
      `/v1/contests/${contestId}/staff-assignments/${staffId}`,
    )
    return res.data.data ?? []
  },

  listBans: async (contestId: string): Promise<ContestBanItem[]> => {
    const res = await api.get<ApiEnvelope<ContestBanItem[]>>(
      `/v1/contests/${contestId}/bans`,
    )
    return res.data.data ?? []
  },

  createBan: async (
    contestId: string,
    body: {
      user_id: string
      scope_type: "CONTEST" | "PROVIDER"
      reason: string
      evidence_url?: string | null
      notes?: string | null
      expires_at?: string | null
    },
  ): Promise<ContestBanItem> => {
    const res = await api.post<ApiEnvelope<ContestBanItem>>(
      `/v1/contests/${contestId}/bans`,
      body,
    )
    return res.data.data
  },

  liftBan: async (
    contestId: string,
    banId: string,
    body?: { reason?: string },
  ): Promise<ContestBanItem> => {
    const res = await api.post<ApiEnvelope<ContestBanItem>>(
      `/v1/contests/${contestId}/bans/${banId}/lift`,
      body ?? {},
    )
    return res.data.data
  },

  disqualifyRegistration: async (
    registrationId: string,
    reason: string,
  ): Promise<ContestRegistration> => {
    const res = await api.post<ApiEnvelope<ContestRegistration>>(
      `/v1/contest-registrations/${registrationId}/disqualify`,
      { reason },
    )
    return mapContestRegistration(res.data.data)
  },

  uploadBanner: async (
    contestId: string,
    file: File,
  ): Promise<{ banner_image_url: string; public_id: string }> => {
    const formData = new FormData()
    formData.append("file", file)
    const res = await api.post<
      ApiEnvelope<{ banner_image_url: string; public_id: string }>
    >(`/v1/contests/${contestId}/banner`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    return res.data.data
  },
}
