import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { contestApi, contestQueryKeys } from "../api/contest.api"
import type {
  ContestMatchesQuery,
  ContestMatchWalkoverBody,
  ContestCorrectResultsBody,
  ContestGenerateMatchesBody,
  ContestRegistrationsQuery,
  ContestSubmitResultsBody,
  ContestUpdateMatchParticipantsBody,
  ContestAuditLogsQuery,
} from "../types"

export function useContestRuntime(
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
    }
  },
) {
  const queryClient = useQueryClient()
  const enabled = {
    registrations: options?.enabled?.registrations ?? true,
    matches: options?.enabled?.matches ?? true,
    metrics: options?.enabled?.metrics ?? true,
    auditLogs: options?.enabled?.auditLogs ?? true,
  }

  const contestQuery = useQuery({
    queryKey: contestQueryKeys.detail(contestId),
    queryFn: () => contestApi.getContest(contestId!),
    enabled: Boolean(contestId),
  })

  const registrationsQuery = useQuery({
    queryKey: contestQueryKeys.registrations(contestId, options?.registrations),
    queryFn: () =>
      contestApi.listContestRegistrations(contestId!, options?.registrations),
    enabled: Boolean(contestId) && enabled.registrations,
  })

  const matchesQuery = useQuery({
    queryKey: contestQueryKeys.matches(contestId, options?.matches),
    queryFn: () => contestApi.listMatches(contestId!, options?.matches),
    enabled: Boolean(contestId) && enabled.matches,
  })

  const metricsQuery = useQuery({
    queryKey: contestQueryKeys.metrics(contestId),
    queryFn: () => contestApi.getMetrics(contestId!),
    enabled: Boolean(contestId) && enabled.metrics,
  })

  const auditLogsQuery = useQuery({
    queryKey: contestQueryKeys.auditLogs(contestId, options?.auditLogs),
    queryFn: () => contestApi.listAuditLogs(contestId!, options?.auditLogs),
    enabled: Boolean(contestId) && enabled.auditLogs,
  })

  const invalidateRuntime = async () => {
    if (!contestId) return
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: contestQueryKeys.detail(contestId),
      }),
      queryClient.invalidateQueries({
        queryKey: contestQueryKeys.registrations(contestId),
      }),
      queryClient.invalidateQueries({
        queryKey: contestQueryKeys.matches(contestId),
      }),
      queryClient.invalidateQueries({
        queryKey: contestQueryKeys.metrics(contestId),
      }),
      queryClient.invalidateQueries({
        queryKey: contestQueryKeys.auditLogs(contestId),
      }),
    ])
  }

  const generateMatchesMutation = useMutation({
    mutationFn: (body: ContestGenerateMatchesBody) =>
      contestApi.generateMatches(contestId!, body),
    onSuccess: invalidateRuntime,
  })

  const publishLeaderboardMutation = useMutation({
    mutationFn: () => contestApi.publishLeaderboard(contestId!),
    onSuccess: invalidateRuntime,
  })

  const syncRaceRecordsMutation = useMutation({
    mutationFn: () => contestApi.syncRaceRecords(contestId!),
    onSuccess: invalidateRuntime,
  })

  const updateParticipantsMutation = useMutation({
    mutationFn: ({
      matchId,
      body,
    }: {
      matchId: string
      body: ContestUpdateMatchParticipantsBody
    }) => contestApi.updateMatchParticipants(matchId, body),
    onSuccess: invalidateRuntime,
  })

  const submitResultsMutation = useMutation({
    mutationFn: ({
      matchId,
      body,
    }: {
      matchId: string
      body: ContestSubmitResultsBody
    }) => contestApi.submitMatchResults(matchId, body),
    onSuccess: invalidateRuntime,
  })

  const correctResultsMutation = useMutation({
    mutationFn: ({
      matchId,
      body,
    }: {
      matchId: string
      body: ContestCorrectResultsBody
    }) => contestApi.correctMatchResults(matchId, body),
    onSuccess: invalidateRuntime,
  })

  const walkoverMutation = useMutation({
    mutationFn: ({
      matchId,
      body,
    }: {
      matchId: string
      body: ContestMatchWalkoverBody
    }) => contestApi.recordMatchWalkover(matchId, body),
    onSuccess: invalidateRuntime,
  })

  const advanceMatchMutation = useMutation({
    mutationFn: (matchId: string) => contestApi.advanceMatch(matchId),
    onSuccess: invalidateRuntime,
  })

  return {
    contestQuery,
    registrationsQuery,
    matchesQuery,
    metricsQuery,
    auditLogsQuery,
    generateMatchesMutation,
    publishLeaderboardMutation,
    syncRaceRecordsMutation,
    updateParticipantsMutation,
    submitResultsMutation,
    correctResultsMutation,
    advanceMatchMutation,
    walkoverMutation,
  }
}
