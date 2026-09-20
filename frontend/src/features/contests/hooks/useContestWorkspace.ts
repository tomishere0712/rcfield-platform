import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { contestApi, contestQueryKeys } from "../api/contest.api"
import { useContestEventDay } from "./useContestEventDay"
import { useContestRuntime } from "./useContestRuntime"
import { staffApi, staffQueryKeys } from "@/features/staff/api/staff.api"
import type {
  ContestMatchesQuery,
  ContestRegistrationsQuery,
  ContestAuditLogsQuery,
} from "../types"

export function useContestWorkspace(
  contestId?: string,
  options?: {
    registrations?: ContestRegistrationsQuery
    matches?: ContestMatchesQuery
    auditLogs?: ContestAuditLogsQuery
    enabled?: {
      registrations?: boolean
      matches?: boolean
      metrics?: boolean
      auditLogs?: boolean
      staffAssignments?: boolean
      bans?: boolean
      staffOptions?: boolean
    }
  },
) {
  const queryClient = useQueryClient()
  const runtime = useContestRuntime(contestId, options)
  const eventDay = useContestEventDay(contestId)
  const enabled = {
    staffAssignments: options?.enabled?.staffAssignments ?? false,
    bans: options?.enabled?.bans ?? false,
    staffOptions: options?.enabled?.staffOptions ?? false,
  }

  const staffAssignmentsQuery = useQuery({
    queryKey: contestQueryKeys.staffAssignments(contestId),
    queryFn: () => contestApi.listStaffAssignments(contestId!),
    enabled: Boolean(contestId) && enabled.staffAssignments,
  })

  const bansQuery = useQuery({
    queryKey: contestQueryKeys.bans(contestId),
    queryFn: () => contestApi.listBans(contestId!),
    enabled: Boolean(contestId) && enabled.bans,
  })

  const staffOptionsQuery = useQuery({
    queryKey: [...staffQueryKeys.list(), "contest-workspace"],
    queryFn: () => staffApi.listStaff(),
    enabled: Boolean(contestId) && enabled.staffOptions,
  })

  const invalidateGovernance = async () => {
    if (!contestId) return
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: contestQueryKeys.staffAssignments(contestId),
      }),
      queryClient.invalidateQueries({
        queryKey: contestQueryKeys.bans(contestId),
      }),
      queryClient.invalidateQueries({
        queryKey: contestQueryKeys.registrations(contestId),
      }),
      queryClient.invalidateQueries({
        queryKey: contestQueryKeys.matches(contestId),
      }),
      queryClient.invalidateQueries({
        queryKey: contestQueryKeys.auditLogs(contestId),
      }),
      queryClient.invalidateQueries({
        queryKey: contestQueryKeys.metrics(contestId),
      }),
      queryClient.invalidateQueries({
        queryKey: contestQueryKeys.detail(contestId),
      }),
    ])
  }

  const assignStaffMutation = useMutation({
    mutationFn: (staffId: string) =>
      contestApi.assignStaff(contestId!, staffId),
    onSuccess: invalidateGovernance,
  })

  const unassignStaffMutation = useMutation({
    mutationFn: (staffId: string) =>
      contestApi.unassignStaff(contestId!, staffId),
    onSuccess: invalidateGovernance,
  })

  const createBanMutation = useMutation({
    mutationFn: (body: Parameters<typeof contestApi.createBan>[1]) =>
      contestApi.createBan(contestId!, body),
    onSuccess: invalidateGovernance,
  })

  const liftBanMutation = useMutation({
    mutationFn: ({ banId, reason }: { banId: string; reason?: string }) =>
      contestApi.liftBan(contestId!, banId, { reason }),
    onSuccess: invalidateGovernance,
  })

  const disqualifyRegistrationMutation = useMutation({
    mutationFn: ({
      registrationId,
      reason,
    }: {
      registrationId: string
      reason: string
    }) => contestApi.disqualifyRegistration(registrationId, reason),
    onSuccess: invalidateGovernance,
  })

  return {
    runtime,
    eventDay,
    staffAssignmentsQuery,
    bansQuery,
    staffOptionsQuery,
    assignStaffMutation,
    unassignStaffMutation,
    createBanMutation,
    liftBanMutation,
    disqualifyRegistrationMutation,
  }
}
