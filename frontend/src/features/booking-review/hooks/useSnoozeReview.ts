import { useMutation, useQueryClient } from "@tanstack/react-query"
import { snoozeReview } from "../api/review.api"

export function useSnoozeReview() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (bookingId: string) => snoozeReview(bookingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-reviews"] })
    },
  })
}
