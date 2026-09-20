import { useMutation, useQueryClient } from "@tanstack/react-query"
import { contestApi, contestQueryKeys } from "../api/contest.api"

export function useContestEventDay(contestId?: string) {
  const queryClient = useQueryClient()

  const invalidateEventDay = async () => {
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

  const lookupMutation = useMutation({
    mutationFn: (checkInCode: string) =>
      contestApi.lookupRegistration(contestId!, checkInCode),
  })

  const checkInMutation = useMutation({
    mutationFn: ({
      registrationId,
      checkedInCafeId,
      rentalVehicleId,
      byocConfirmed,
      byocInspection,
    }: {
      registrationId: string
      checkedInCafeId: string
      rentalVehicleId?: string | null
      byocConfirmed?: boolean
      byocInspection?: {
        photos?: Array<{ url: string; angle?: string; notes?: string }>
        checklist?: Array<{
          itemKey: string
          itemLabel: string
          status?: "OK" | "NOT_OK" | "NA"
          note?: string
        }>
      }
    }) =>
      contestApi.checkInRegistration(
        registrationId,
        checkedInCafeId,
        rentalVehicleId,
        byocConfirmed,
        byocInspection,
      ),
    onSuccess: async () => {
      await invalidateEventDay()
      lookupMutation.reset()
    },
  })

  const markPaidMutation = useMutation({
    mutationFn: ({
      registrationId,
      note,
    }: {
      registrationId: string
      note?: string
    }) => contestApi.markEntryFeePaid(registrationId, note),
    onSuccess: invalidateEventDay,
  })

  const waiveFeeMutation = useMutation({
    mutationFn: ({
      registrationId,
      note,
    }: {
      registrationId: string
      note?: string
    }) => contestApi.waiveEntryFee(registrationId, note),
    onSuccess: invalidateEventDay,
  })

  const approveMutation = useMutation({
    mutationFn: ({
      registrationId,
      reason,
    }: {
      registrationId: string
      reason?: string
    }) => contestApi.approveRegistration(registrationId, reason),
    onSuccess: invalidateEventDay,
  })

  const rejectMutation = useMutation({
    mutationFn: ({
      registrationId,
      reason,
    }: {
      registrationId: string
      reason?: string
    }) => contestApi.rejectRegistration(registrationId, reason),
    onSuccess: invalidateEventDay,
  })

  const cancelRegistrationMutation = useMutation({
    mutationFn: (registrationId: string) =>
      contestApi.cancelRegistration(registrationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: contestQueryKeys.myRegistrations(),
      })
      await invalidateEventDay()
    },
  })

  return {
    lookupMutation,
    checkInMutation,
    markPaidMutation,
    waiveFeeMutation,
    approveMutation,
    rejectMutation,
    cancelRegistrationMutation,
  }
}
