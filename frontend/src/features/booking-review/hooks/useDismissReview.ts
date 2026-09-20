import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dismissReview } from '../api/review.api';

export function useDismissReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: string) => dismissReview(bookingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-reviews'] });
    },
  });
}
