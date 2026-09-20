import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import axios from "axios"
import { trackConfigApi, cafeQueryKeys } from "../api/cafe.api"
import type { CreateTrackConfigBody, UpdateTrackConfigBody, TrackConfig } from "../types"

/**
 * @param options.includeInactive Chỉ bật ở màn quản lý cấu hình sân. Mọi màn
 * hướng tới khách — trang chi nhánh, luồng đặt lịch — phải để mặc định, nếu
 * không sân đã tắt sẽ hiện ra và đặt được.
 */
export function useTrackConfigs(
  cafeId: string,
  options?: { includeInactive?: boolean },
) {
  const includeInactive = options?.includeInactive ?? false
  return useQuery({
    queryKey: cafeQueryKeys.trackConfigs(cafeId, includeInactive),
    queryFn: () => trackConfigApi.listTrackConfigs(cafeId, { includeInactive }),
    enabled: !!cafeId,
  })
}

export function useCreateTrackConfig(cafeId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: CreateTrackConfigBody) => trackConfigApi.createTrackConfig(cafeId, body),
    onSuccess: () => {
      toast.success("Tạo loại sân thành công")
      void queryClient.invalidateQueries({ queryKey: [...cafeQueryKeys.all, "track-configs", cafeId] })
    },
    onError: (error: unknown) => {
      let msg = "Đã xảy ra lỗi khi tạo loại sân"
      if (axios.isAxiosError(error)) {
        const code = error.response?.data?.code
        if (code === "TRACK_CONFIG_ALREADY_EXISTS") msg = "Loại sân này đã được cấu hình cho chi nhánh"
        else msg = error.response?.data?.message || msg
      }
      toast.error(msg)
    },
  })
}

export function useUpdateTrackConfig(cafeId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      configId,
      body,
    }: {
      configId: string
      body: UpdateTrackConfigBody
      silent?: boolean
      successMessage?: string
    }) => trackConfigApi.updateTrackConfig(cafeId, configId, body),
    onSuccess: (_, variables) => {
      if (variables.silent !== true) {
        toast.success(variables.successMessage || "Cập nhật loại sân thành công")
      }
      void queryClient.invalidateQueries({ queryKey: [...cafeQueryKeys.all, "track-configs", cafeId] })
      void queryClient.invalidateQueries({ queryKey: cafeQueryKeys.detail(cafeId) })
    },
    onError: (error: unknown) => {
      let msg = "Đã xảy ra lỗi khi cập nhật loại sân"
      if (axios.isAxiosError(error)) {
        const data = error.response?.data as { code?: string; message?: string; errors?: { field: string; message: string }[] } | undefined
        const code = data?.code
        if (code === "TRACK_CONFIG_HAS_UPCOMING_BOOKINGS") {
          msg = "Không thể tắt loại sân: còn booking sắp tới đang chờ hoặc đã xác nhận"
        } else if (code === "VALIDATION_ERROR" && data?.errors?.length) {
          msg = data.errors.map((e) => `${e.field}: ${e.message}`).join(", ")
        } else {
          msg = data?.message || msg
        }
      }
      toast.error(msg)
    },
  })
}

export function useUploadTrackConfigImages(cafeId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ configId, files }: { configId: string; files: File[] }) =>
      trackConfigApi.uploadTrackConfigImages(cafeId, configId, files),
    onSuccess: (images, variables) => {
      toast.success("Upload ảnh loại sân thành công")
      // Immediate cache sync for both includeInactive = true and false
      const syncCache = (old: TrackConfig[] | undefined) => {
        if (!old) return old
        return old.map((c) => (c.id === variables.configId || c.track_type_id === variables.configId ? { ...c, images } : c))
      }
      queryClient.setQueryData<TrackConfig[]>(cafeQueryKeys.trackConfigs(cafeId, false), syncCache)
      queryClient.setQueryData<TrackConfig[]>(cafeQueryKeys.trackConfigs(cafeId, true), syncCache)
      void queryClient.invalidateQueries({ queryKey: [...cafeQueryKeys.all, "track-configs", cafeId] })
      void queryClient.invalidateQueries({ queryKey: cafeQueryKeys.detail(cafeId) })
    },
    onError: (error: unknown) => {
      let msg = "Đã xảy ra lỗi khi upload ảnh"
      if (axios.isAxiosError(error)) {
        const code = error.response?.data?.code
        if (code === "TOO_MANY_IMAGES") msg = "Tối đa 20 ảnh cho mỗi loại sân"
        else msg = error.response?.data?.message || msg
      }
      toast.error(msg)
    },
  })
}
