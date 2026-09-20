import { useQuery } from '@tanstack/react-query';
import { getPendingReviews } from '../api/review.api';

export function usePendingReviews(includeSnoozed = false) {
  return useQuery({
    queryKey: ['pending-reviews', { includeSnoozed }],
    queryFn: () => getPendingReviews({ includeSnoozed }),
  });
}
