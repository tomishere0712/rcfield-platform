import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import axios from "axios"
import { vehicleApi } from "../api/vehicle.api"
import { vehicleKeys } from "../constants/queryKeys"
import type { CreateVehicleCatalogDto, UpdateVehicleCatalogDto } from "../types"

export function useCreateVehicleCatalog(cafeId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateVehicleCatalogDto) => vehicleApi.createCatalog(cafeId, data),
    onSuccess: () => {
      toast.success("Tạo danh mục phương tiện thành công")
      void queryClient.invalidateQueries({
        queryKey: vehicleKeys.catalogs(cafeId),
      })
    },
    onError: (error: unknown) => {
      let msg = "Đã xảy ra lỗi khi tạo danh mục"
      if (axios.isAxiosError(error)) {
        msg = error.response?.data?.message || msg
      }
      toast.error(msg)
    },
  })
}

export function useUpdateVehicleCatalog(cafeId: string, catalogId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdateVehicleCatalogDto) => vehicleApi.updateCatalog(cafeId, catalogId, data),
    onSuccess: () => {
      toast.success("Cập nhật danh mục thành công")
      void queryClient.invalidateQueries({
        queryKey: vehicleKeys.catalogs(cafeId),
      })
      void queryClient.invalidateQueries({
        queryKey: vehicleKeys.catalog(cafeId, catalogId),
      })
    },
    onError: (error: unknown) => {
      let msg = "Đã xảy ra lỗi khi cập nhật danh mục"
      if (axios.isAxiosError(error)) {
        msg = error.response?.data?.message || msg
      }
      toast.error(msg)
    },
  })
}

export function useDeleteVehicleCatalog(cafeId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (catalogId: string) => vehicleApi.deleteCatalog(cafeId, catalogId),
    onSuccess: () => {
      toast.success("Xóa danh mục phương tiện thành công")
      void queryClient.invalidateQueries({
        queryKey: vehicleKeys.catalogs(cafeId),
      })
    },
    onError: (error: unknown) => {
      let msg = "Đã xảy ra lỗi khi xóa danh mục"
      if (axios.isAxiosError(error)) {
        msg = error.response?.data?.message || msg
      }
      toast.error(msg)
    },
  })
}
