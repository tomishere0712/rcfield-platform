import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { routePaths } from "@/app/router/route-paths"
import { cafeApi, cafeQueryKeys } from "@/features/cafes/api/cafe.api"
import type { CafeUpsertBody } from "@/features/cafes/types"
import { subscriptionApi } from "@/features/subscriptions/api/subscription.api"
import { ProviderCafeForm } from "@/pages/provider/components/ProviderCafeForm"
import { ProviderPageHeader } from "@/pages/provider/components/ProviderPrimitives"
import { ProviderShell } from "@/pages/provider/components/ProviderShell"
import { Button } from "@/shared/ui/button"

export function ProviderCafeCreatePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: async ({ values, files }: { values: CafeUpsertBody; files: File[] }) => {
      const cafe = await cafeApi.createCafe(values)
      if (files.length > 0) {
        await cafeApi.uploadCafeImages(cafe.id, files)
      }
      return cafe
    },
    onSuccess: async (cafe) => {
      await queryClient.invalidateQueries({ queryKey: cafeQueryKeys.all })
      toast.success("Đã tạo cơ sở", { description: cafe.name })
      navigate(routePaths.providerCafeDetail.replace(":cafeId", cafe.id))
    },
    onError: (err: unknown) => {
      // Hiện đúng câu backend trả về. Backend đã nói rõ lý do — ví dụ "Gói
      // STARTER chỉ cho phép tối đa 1 chi nhánh" — mà trước đây bị thay bằng
      // một câu chung chung, nên provider không biết mình sai ở đâu.
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data
        ?.message
      toast.error("Không thể tạo cơ sở", {
        description:
          message ?? "Vui lòng kiểm tra dữ liệu nhập và trạng thái tài khoản provider.",
      })
    },
  })

  /*
    Chặn tại TRANG, không phải tại nút.

    Có bốn lối dẫn tới đây (danh sách cơ sở, danh mục xe, đội xe, và gõ thẳng
    URL). Khoá từng nút là chắc chắn bỏ sót một lối; khoá ở đây thì mọi lối đều
    đi qua cùng một cửa.
  */
  const { data: subscription } = useQuery({
    queryKey: ["provider-subscription", "branch-quota"],
    queryFn: () => subscriptionApi.getSubscriptionStatus(),
    staleTime: 60_000,
  })
  const { data: cafeList } = useQuery({
    queryKey: cafeQueryKeys.list({ scope: "managed", limit: 100 }),
    queryFn: () => cafeApi.listCafes({ scope: "managed", limit: 100 }),
    staleTime: 60_000,
  })

  const branchLimit = subscription?.data?.plan?.branchLimit ?? null
  // `-1` là quy ước "không giới hạn".
  const hasBranchLimit = branchLimit !== null && branchLimit >= 0
  const cafeCount = cafeList?.data?.length
  const quotaReached =
    hasBranchLimit && cafeCount !== undefined && cafeCount >= (branchLimit as number)

  if (quotaReached) {
    return (
      <ProviderShell>
        <ProviderPageHeader
          title="Thêm cơ sở"
          description="Gói dịch vụ hiện tại đã dùng hết số chi nhánh cho phép."
        />
        <div className="p-4 md:p-6">
          <div className="mx-auto max-w-lg rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
            <h2 className="text-base font-black text-amber-900">
              Đã dùng hết {cafeCount}/{branchLimit} chi nhánh
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-amber-900/80">
              Gói hiện tại chỉ cho phép {branchLimit} chi nhánh. Nâng gói để thêm
              cơ sở mới, hoặc tạm ngưng một cơ sở đang có.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button
                type="button"
                onClick={() => navigate(routePaths.providerSubscriptions)}
                className="h-10 rounded-lg font-bold"
              >
                Xem các gói dịch vụ
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(routePaths.providerCafes)}
                className="h-10 rounded-lg font-bold"
              >
                Quay lại danh sách cơ sở
              </Button>
            </div>
          </div>
        </div>
      </ProviderShell>
    )
  }

  return (
    <ProviderShell>
      <ProviderPageHeader
        title="Thêm cơ sở"
        description="Tạo cơ sở xe RC mới cho provider. Cơ sở mới sẽ ở trạng thái chờ duyệt."
      />
      <div className="p-4 md:p-6">
        <div className="mb-4 flex justify-start">
          <Button type="button" variant="outline" onClick={() => navigate(routePaths.providerCafes)} className="h-10 gap-2 rounded-lg border-[#c4c7c8] bg-[#f1edec] text-[#1c1b1b] hover:bg-[#e5e2e1] font-bold">
            <ArrowLeft className="size-5" />
            Danh sách cơ sở
          </Button>
        </div>
        <ProviderCafeForm
          isPending={createMutation.isPending}
          submitLabel="Tạo cơ sở"
          onCancel={() => navigate(routePaths.providerCafes)}
          onSubmit={async (values, files) => {
            await createMutation.mutateAsync({ values, files })
          }}
        />
      </div>
    </ProviderShell>
  )
}
