import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import axios from "axios"
import { vehicleApi } from "../api/vehicle.api"
import { vehicleKeys } from "../constants/queryKeys"
import type { CreateVehicleUnitDto, UpdateVehicleUnitDto } from "../types"

export function useCreateVehicleUnit(cafeId: string, catalogId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateVehicleUnitDto) => vehicleApi.createUnit(cafeId, catalogId, data),
    onSuccess: () => {
      toast.success("Thêm xe thành công")
      void queryClient.invalidateQueries({
        queryKey: vehicleKeys.units(cafeId),
      })
      void queryClient.invalidateQueries({
        queryKey: vehicleKeys.catalog(cafeId, catalogId),
      })
    },
    onError: (error: unknown) => {
      let msg = "Đã xảy ra lỗi khi thêm xe"
      if (axios.isAxiosError(error)) {
        msg = error.response?.data?.message || msg
      }
      toast.error(msg)
    },
  })
}

export function useUpdateVehicleUnit(cafeId: string, catalogId: string, unitId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: UpdateVehicleUnitDto) => vehicleApi.updateUnit(cafeId, catalogId, unitId, data),
    onSuccess: () => {
      toast.success("Cập nhật thông tin xe thành công")
      void queryClient.invalidateQueries({
        queryKey: vehicleKeys.units(cafeId),
      })
      void queryClient.invalidateQueries({
        queryKey: vehicleKeys.catalog(cafeId, catalogId),
      })
      void queryClient.invalidateQueries({
        queryKey: vehicleKeys.unit(cafeId, catalogId, unitId),
      })
    },
    onError: (error: unknown) => {
      let msg = "Đã xảy ra lỗi khi cập nhật thông tin xe"
      if (axios.isAxiosError(error)) {
        msg = error.response?.data?.message || msg
      }
      toast.error(msg)
    },
  })
}

export function useDeleteVehicleUnit(cafeId: string, catalogId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (unitId: string) => vehicleApi.deleteUnit(cafeId, catalogId, unitId),
    onSuccess: () => {
      toast.success("Xóa xe thành công")
      void queryClient.invalidateQueries({
        queryKey: vehicleKeys.units(cafeId),
      })
      void queryClient.invalidateQueries({
        queryKey: vehicleKeys.catalog(cafeId, catalogId),
      })
    },
    onError: (error: unknown) => {
      let msg = "Đã xảy ra lỗi khi xóa xe"
      if (axios.isAxiosError(error)) {
        msg = error.response?.data?.message || msg
      }
      toast.error(msg)
    },
  })
}
