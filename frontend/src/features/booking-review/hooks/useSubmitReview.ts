import { useMutation, useQueryClient } from '@tanstack/react-query';
import { submitReview } from '../api/review.api';

export function useSubmitReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: submitReview,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-reviews'] });
    },
  });
}
