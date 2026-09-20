import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/features/auth/stores/auth.store'
import {
  customerPackageApi,
  customerPackageQueryKeys,
  type PackagePaymentGateway,
  type CustomerPackageStatus,
} from '../api/customer-package.api'

export function usePublicPackages(cafeId?: string) {
  return useQuery({
    queryKey: customerPackageQueryKeys.public(cafeId),
    queryFn: () => customerPackageApi.listPublic(cafeId!),
    enabled: !!cafeId,
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * @param options.enabled Tắt query ở những màn chỉ thỉnh thoảng mới cần danh sách
 *   gói (mặc định bật). Luôn phải đăng nhập mới chạy.
 */
export function useMyPackages(
  params?: { status?: CustomerPackageStatus; cafe_id?: string },
  options?: { enabled?: boolean },
) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return useQuery({
    queryKey: customerPackageQueryKeys.mine(params),
    queryFn: () => customerPackageApi.listMine(params),
    enabled: isAuthenticated && (options?.enabled ?? true),
  })
}

export function usePackageUsageHistory(customerPackageId?: string) {
  return useQuery({
    queryKey: customerPackageQueryKeys.usage(customerPackageId),
    queryFn: () => customerPackageApi.getUsageHistory(customerPackageId!),
    enabled: !!customerPackageId,
  })
}

export function usePurchasePackage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      cafeId,
      packageId,
      gateway,
    }: {
      cafeId: string
      packageId: string
      gateway?: PackagePaymentGateway
    }) => customerPackageApi.purchase(cafeId, packageId, gateway),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: customerPackageQueryKeys.all })
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err?.response?.data?.message ?? 'Mua gói thất bại. Vui lòng thử lại.')
    },
  })
}

export function useRepayPackage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ customerPackageId }: { customerPackageId: string }) =>
      customerPackageApi.repay(customerPackageId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: customerPackageQueryKeys.all })
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err?.response?.data?.message ?? 'Thanh toán lại thất bại. Vui lòng thử lại.')
    },
  })
}
