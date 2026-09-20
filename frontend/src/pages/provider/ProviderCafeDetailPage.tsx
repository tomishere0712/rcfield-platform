import { useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft,
  BarChart3,
  Car,
  CheckCircle2,
  ExternalLink,
  Power,
  ShieldAlert,
  TrendingUp,
} from "lucide-react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router"
import { toast } from "sonner"

import { routePaths } from "@/app/router/route-paths"
import { providerDashboardApi } from "@/features/dashboard/api/provider-dashboard.api"
import { cafeApi, cafeQueryKeys } from "@/features/cafes/api/cafe.api"
import { formatCurrency } from "@/shared/lib/format"
import type {
  BackendCafe,
  CafeImage,
  CafeStatus,
  CafeUpsertBody,
} from "@/features/cafes/types"
import { CafePricingTab } from "@/pages/provider/components/CafePricingTab"
import { ChannelSettingsTab } from "@/pages/provider/components/ChannelSettingsTab"
import { ProviderCafeForm } from "@/pages/provider/components/ProviderCafeForm"
import { WidgetConfigForm } from "@/pages/provider/components/WidgetConfigForm"
import { KbDocumentsSection } from "@/pages/provider/components/KbDocumentsSection"
import { TrackConfigManager } from "@/pages/provider/components/TrackConfigManager"
import { CafePaymentSettingsCard } from "@/pages/provider/components/CafePaymentSettingsCard"
import { BankTransactionsPanel } from "@/pages/provider/components/BankTransactionsPanel"
import { ProviderCafeVehiclesSection } from "@/pages/provider/components/ProviderCafeVehiclesSection"
import {
  formatGio,
  formatOccupancyRate,
  MetricCard,
  ProviderPageHeader,
  StatusBadge,
} from "@/pages/provider/components/ProviderPrimitives"
import { ProviderShell } from "@/pages/provider/components/ProviderShell"
import { ProviderMenuPage } from "@/pages/provider/ProviderMenuPage"
import { ProviderPackagesPage } from "@/pages/provider/ProviderPackagesPage"
import { ProviderPromotionsPage } from "@/pages/provider/ProviderPromotionsPage"
import { ProviderReviewsTab } from "@/pages/provider/components/ProviderReviewsTab"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/ui/alert-dialog"
import { Button } from "@/shared/ui/button"

const TAB_META: Record<string, { label: string; description: string }> = {
  info: {
    label: "Thông tin cơ sở",
    description: "Chỉnh sửa thông tin và trạng thái vận hành",
  },
  tracks: {
    label: "Loại sân (Track)",
    description: "Quản lý các loại sân chạy",
  },
  pricing: { label: "Cấu hình giá", description: "Thiết lập giá thuê sân" },
  catalogs: { label: "Đội xe", description: "Quản lý danh mục xe" },
  widget: {
    label: "Widget Chat & Tài liệu",
    description: "Cấu hình widget và tài liệu hỗ trợ",
  },
  menu: { label: "Thực đơn", description: "Quản lý đồ ăn & thức uống" },
  packages: { label: "Gói & Giá", description: "Gói dịch vụ và ưu đãi" },
  promotions: { label: "Ưu đãi", description: "Chương trình khuyến mãi" },
  payments: {
    label: "Nhận thanh toán",
    description: "Tài khoản nhận tiền và đối soát chuyển khoản",
  },
  channel: { label: "Kênh Messenger", description: "Kết nối kênh nhắn tin" },
  reviews: { label: "Đánh giá", description: "Phản hồi từ khách hàng" },
}

export function ProviderCafeDetailPage() {
  const { cafeId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const {
    data: cafe,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: cafeQueryKeys.detail(cafeId),
    queryFn: () => cafeApi.getCafe(cafeId!),
    enabled: !!cafeId,
  })

  const { data: branchOperations, isError: isBranchOperationsError } = useQuery(
    {
      queryKey: ["provider-dashboard", "branch-operations", "current-month"],
      queryFn: () => providerDashboardApi.getBranchOperations(),
      enabled: !!cafeId,
      staleTime: 15_000,
    },
  )
  const branchOperation = useMemo(
    () => branchOperations?.find((operation) => operation.cafeId === cafeId),
    [branchOperations, cafeId],
  )

  const saveMutation = useMutation({
    mutationFn: async ({
      values,
      files,
      coverFile,
    }: {
      values: CafeUpsertBody
      files: File[]
      coverFile: File | null
    }) => {
      let finalValues = values
      if (coverFile) {
        const [uploaded] = await cafeApi.uploadCafeImages(cafeId!, [coverFile])
        finalValues = { ...values, cover_image_url: uploaded.url }
      }
      const savedCafe = await cafeApi.updateCafe(cafeId!, finalValues)
      if (files.length > 0) {
        await cafeApi.uploadCafeImages(savedCafe.id, files)
      }
      return savedCafe
    },
    onSuccess: async (savedCafe) => {
      await invalidateCafeQueries(queryClient, savedCafe.id)
      toast.success("Đã cập nhật cơ sở", { description: savedCafe.name })
    },
    onError: () => {
      toast.error("Không thể cập nhật cơ sở")
    },
  })

  /**
   * Ảnh chọn xong là lưu ngay, không chờ nút "Lưu thay đổi".
   *
   * Ảnh đã nằm trên Cloudinary từ lúc tải; bắt chủ quán bấm thêm một nút nữa mới
   * ghi vào cơ sở chỉ tạo ra tình huống tải xong, thấy ảnh hiện lên, rồi rời
   * trang và mất trắng.
   */
  const coverUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const [uploaded] = await cafeApi.uploadCafeImages(cafeId!, [file])
      return cafeApi.updateCafe(cafeId!, { cover_image_url: uploaded.url })
    },
    onSuccess: async (savedCafe) => {
      await invalidateCafeQueries(queryClient, savedCafe.id)
      toast.success("Đã cập nhật ảnh bìa")
    },
    onError: () => {
      toast.error("Không tải được ảnh bìa")
    },
  })

  const galleryUploadMutation = useMutation({
    mutationFn: (files: File[]) => cafeApi.uploadCafeImages(cafeId!, files),
    onSuccess: async (uploaded) => {
      await invalidateCafeQueries(queryClient, cafeId!)
      toast.success(`Đã thêm ${uploaded.length} ảnh vào gallery`)
    },
    onError: () => {
      toast.error("Không tải được ảnh gallery")
    },
  })

  const statusMutation = useMutation({
    mutationFn: ({ cafe, status }: { cafe: BackendCafe; status: CafeStatus }) =>
      cafeApi.updateCafeStatus(cafe.id, status),
    onSuccess: async (savedCafe) => {
      await invalidateCafeQueries(queryClient, savedCafe.id)
      toast.success("Đã cập nhật trạng thái cơ sở", {
        description: savedCafe.name,
      })
    },
    onError: () => {
      toast.error("Không thể cập nhật trạng thái cơ sở")
    },
  })

  const deleteImageMutation = useMutation({
    mutationFn: async (image: CafeImage) => {
      await cafeApi.deleteCafeImage(image.id)
      return image
    },
    onSuccess: async (image) => {
      await queryClient.invalidateQueries({
        queryKey: cafeQueryKeys.images(image.cafeId),
      })
      toast.success("Đã xóa ảnh cơ sở")
    },
    onError: () => {
      toast.error("Không thể xóa ảnh cơ sở")
    },
  })

  const [searchParams] = useSearchParams()
  const tab = (searchParams.get("tab") || "info") as
    | "info"
    | "tracks"
    | "widget"
    | "catalogs"
    | "pricing"
    | "menu"
    | "packages"
    | "promotions"
    | "payments"
    | "channel"
    | "reviews"

  if (isLoading) {
    return (
      <ProviderShell>
        <div className="space-y-4 p-6">
          <div className="h-28 animate-pulse rounded-xl bg-[#f6f3f2]" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-44 animate-pulse rounded-xl bg-[#f6f3f2]"
              />
            ))}
          </div>
        </div>
      </ProviderShell>
    )
  }

  if (isError || !cafe) {
    return (
      <ProviderShell>
        <ProviderPageHeader
          title="Không tải được cơ sở"
          description="Cơ sở không tồn tại hoặc bạn không có quyền xem/cập nhật cơ sở này."
        />
        <div className="p-6">
          <div className="mb-4 flex justify-start">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(routePaths.providerCafes)}
              className="h-10 gap-2 rounded-lg border-[#c4c7c8] bg-[#f1edec] text-[#1c1b1b] hover:bg-[#e5e2e1] font-bold"
            >
              <ArrowLeft className="size-5" />
              Danh sách cơ sở
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void refetch()}
            className="h-10 px-4 rounded-lg border-[#c4c7c8] font-bold"
          >
            Tải lại dữ liệu cơ sở
          </Button>
        </div>
      </ProviderShell>
    )
  }

  const canProviderToggle = cafe.status !== "PENDING"
  const nextStatus: CafeStatus =
    cafe.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED"

  return (
    <ProviderShell>
      <ProviderPageHeader
        title={cafe.name}
        description={`${cafe.district}, ${cafe.city}`}
      />

      <div className="space-y-5 p-4 md:p-6">
        <div className="flex items-center justify-between gap-2 border-b border-[#e5e2e1] pb-4">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(routePaths.providerCafes)}
              className="h-10 gap-2 rounded-lg border-[#c4c7c8] bg-[#f1edec] text-[#1c1b1b] hover:bg-[#e5e2e1] font-bold"
            >
              <ArrowLeft className="size-5" />
              Danh sách
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                navigate(
                  routePaths.providerCafePreview.replace(":cafeId", cafe.id),
                )
              }
              className="h-10 gap-2 rounded-lg border-[#c4c7c8] font-bold text-[#1c1b1b] hover:bg-[#f6f3f2]"
            >
              <ExternalLink className="size-4" />
              Xem trước
            </Button>
          </div>
          {TAB_META[tab] && (
            <div className="hidden flex-col items-end sm:flex">
              <span className="text-sm font-bold text-[#1c1b1b]">
                {TAB_META[tab].label}
              </span>
              <span className="text-xs text-[#747878]">
                {TAB_META[tab].description}
              </span>
            </div>
          )}
        </div>
        {tab === "info" && (
          <>
            <section>
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[#747878]">
                Tổng quan từ đầu tháng đến hiện tại
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <Link
                  to={`/provider/dashboard?cafeId=${cafe.id}`}
                  className="group block transition-transform hover:-translate-y-0.5 focus:outline-none"
                  title="Bấm để xem chi tiết doanh thu trên Bảng điều khiển"
                >
                  <MetricCard
                    label="Doanh thu tháng"
                    value={
                      branchOperation
                        ? formatCurrency(branchOperation.totalRevenue)
                        : "--"
                    }
                    helper={
                      isBranchOperationsError
                        ? "Không thể tải dữ liệu"
                        : branchOperation
                          ? `${branchOperation.bookingCount} lượt đặt lịch`
                          : "Đang tải..."
                    }
                    actionLabel="Xem Dashboard"
                    icon={
                      <BarChart3 className="transition-colors group-hover:text-orange-600" />
                    }
                    tone="neutral"
                    className="transition-colors group-hover:border-orange-300 group-hover:shadow-md"
                  />
                </Link>
                <MetricCard
                  label="Tỷ lệ khai thác sân"
                  value={
                    branchOperation?.occupancyRate !== null &&
                    branchOperation?.occupancyRate !== undefined
                      ? formatOccupancyRate(branchOperation.occupancyRate)
                      : "--"
                  }
                  /*
                    "Theo công suất tháng này" không nói được gì.

                    Mẫu số của tỷ lệ này là MỌI suất chơi của MỌI giờ mở cửa từ
                    đầu tháng tới giờ — 100% nghĩa là tất cả các sân kín khách
                    liên tục suốt cả tháng, một mức không quán nào chạm tới. Nên
                    một con số như "0,2%" đứng trơ ra sẽ đọc thành "hệ thống
                    tính sai" chứ không phải "quán còn nhiều chỗ trống".
                    
                    In thẳng phân số ra thì con số tự giải thích chính nó.
                  */
                  helper={
                    isBranchOperationsError
                      ? "Không thể tải dữ liệu"
                      : branchOperation?.occupancyRate === null
                        ? "Chi nhánh chưa khai sức chứa sân"
                        : branchOperation
                          ? `${formatGio(branchOperation.occupiedSlotMinutes)} đã đặt / ${formatGio(branchOperation.bookableSlotMinutes)} có thể bán`
                          : "Đang tải..."
                  }
                  icon={<TrendingUp />}
                  tone="neutral"
                />
                <MetricCard
                  label="Đội xe"
                  value={
                    branchOperation
                      ? `${branchOperation.totalVehicles} xe`
                      : "--"
                  }
                  helper={
                    isBranchOperationsError
                      ? "Không thể tải dữ liệu"
                      : branchOperation
                        ? `${branchOperation.availableVehicles} sẵn sàng · ${branchOperation.maintenanceVehicles} bảo trì`
                        : "Đang tải..."
                  }
                  icon={<Car />}
                  tone="neutral"
                />
                <MetricCard
                  label="Trạng thái"
                  value={formatCafeStatus(cafe.status)}
                  helper={
                    cafe.status === "ACTIVE"
                      ? "Sẵn sàng đón khách"
                      : cafe.status === "PENDING"
                        ? "Đang chờ admin duyệt"
                        : "Tạm ngưng nhận lịch"
                  }
                  icon={<CheckCircle2 />}
                  tone={
                    cafe.status === "SUSPENDED" || cafe.status === "PENDING"
                      ? "warning"
                      : "success"
                  }
                />
              </div>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#c4c7c8] bg-white px-5 py-4">
              <div className="flex items-center gap-3">
                {cafe.status === "PENDING" ? (
                  <span className="text-xs font-bold text-amber-700">
                    Cơ sở đang chờ admin duyệt — chưa thể thay đổi trạng thái
                  </span>
                ) : (
                  <span className="text-sm font-bold text-[#1c1b1b]">
                    Trạng thái vận hành hiện tại
                  </span>
                )}
                <StatusBadge status={formatCafeStatus(cafe.status)} />
              </div>
              <StatusConfirmAction
                cafe={cafe}
                nextStatus={nextStatus}
                disabled={!canProviderToggle || statusMutation.isPending}
                onConfirm={() =>
                  statusMutation.mutate({ cafe, status: nextStatus })
                }
              />
            </div>
          </>
        )}

        <div>
          {tab === "info" && (
            <ProviderCafeForm
              cafe={cafe}
              isPending={saveMutation.isPending}
              submitLabel="Lưu thay đổi"
              onSubmit={async (values, files, coverFile) => {
                await saveMutation.mutateAsync({ values, files, coverFile })
              }}
              onDeleteImage={async (image) => {
                await deleteImageMutation.mutateAsync(image)
              }}
              onUploadCover={async (file) => {
                await coverUploadMutation.mutateAsync(file)
              }}
              onUploadGallery={async (files) => {
                await galleryUploadMutation.mutateAsync(files)
              }}
            />
          )}
          {tab === "tracks" && <TrackConfigManager cafeId={cafe.id} />}
          {tab === "pricing" && <CafePricingTab cafeId={cafe.id} cafe={cafe} />}
          {tab === "catalogs" && (
            <ProviderCafeVehiclesSection cafeId={cafe.id} />
          )}
          {tab === "widget" && (
            <div className="space-y-4">
              <WidgetConfigForm cafeId={cafe.id} />
              <KbDocumentsSection cafeId={cafe.id} />
            </div>
          )}
          {tab === "menu" && <ProviderMenuPage cafeId={cafe.id} />}
          {tab === "packages" && <ProviderPackagesPage cafeId={cafe.id} />}
          {tab === "promotions" && <ProviderPromotionsPage cafeId={cafe.id} />}
          {tab === "payments" && (
            <div className="space-y-5">
              <CafePaymentSettingsCard cafeId={cafe.id} />
              <BankTransactionsPanel cafeId={cafe.id} />
            </div>
          )}
          {tab === "channel" && <ChannelSettingsTab cafeId={cafe.id} />}
          {tab === "reviews" && <ProviderReviewsTab cafeId={cafe.id} />}
        </div>
      </div>
    </ProviderShell>
  )
}

function StatusConfirmAction({
  cafe,
  nextStatus,
  disabled,
  onConfirm,
}: {
  cafe: BackendCafe
  nextStatus: CafeStatus
  disabled: boolean
  onConfirm: () => void
}) {
  const isReactivating = nextStatus === "ACTIVE"
  const label = isReactivating ? "Kích hoạt cơ sở" : "Tạm ngưng cơ sở"
  const description = isReactivating
    ? "Cơ sở sẽ có thể quay lại trạng thái hoạt động sau khi xác nhận."
    : "Cơ sở sẽ bị tạm ngưng và provider cần kích hoạt lại trước khi vận hành tiếp."

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant={isReactivating ? "outline" : "destructive"}
          disabled={disabled}
          className="h-9 gap-2 rounded-lg border-[#c4c7c8] text-sm font-bold"
        >
          <Power className="size-4" />
          {cafe.status === "PENDING" ? "Chờ admin duyệt" : label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia
            className={
              isReactivating
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
            }
          >
            <ShieldAlert className="size-5" />
          </AlertDialogMedia>
          <AlertDialogTitle>{label}</AlertDialogTitle>
          <AlertDialogDescription>
            Bạn có chắc chắn muốn{" "}
            {isReactivating ? "kích hoạt lại" : "tạm ngưng"} "{cafe.name}"?{" "}
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="font-bold">Hủy</AlertDialogCancel>
          <AlertDialogAction
            variant={isReactivating ? "default" : "destructive"}
            onClick={onConfirm}
            className="font-bold"
          >
            Xác nhận
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function formatCafeStatus(status: string) {
  if (status === "ACTIVE") return "Hoạt động"
  if (status === "PENDING") return "Chờ duyệt"
  return "Tạm ngưng"
}

async function invalidateCafeQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  cafeId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: cafeQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: cafeQueryKeys.detail(cafeId) }),
    queryClient.invalidateQueries({ queryKey: cafeQueryKeys.images(cafeId) }),
  ])
}
