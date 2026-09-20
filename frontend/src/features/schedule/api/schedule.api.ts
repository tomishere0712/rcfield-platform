import { api } from "@/shared/lib/axios"

export type ShiftPosition = {
  id: string
  name: string
}

export type StaffShift = {
  id: string
  cafeId: string
  positionId: string
  staffId: string
  staffName: string
  staffEmail: string
  shiftDate: string
  shiftLabel: string | null
  startTime: string | null
  endTime: string | null
}

export type WeekScheduleResponse = {
  weekStart: string
  weekEnd: string
  positions: ShiftPosition[]
  shifts: StaffShift[]
}

export type ShiftTimePreset = {
  id: string
  label: string
  startTime: string
  endTime: string
  sortOrder: number
}

export const scheduleQueryKeys = {
  all: ["schedule"] as const,
  week: (startDate: string, cafeId?: string) => [...scheduleQueryKeys.all, "week", startDate, cafeId ?? ""] as const,
  shiftTimePresets: () => [...scheduleQueryKeys.all, "shift-time-presets"] as const,
}

export const scheduleApi = {
  getWeek: async (startDate: string, cafeId: string): Promise<WeekScheduleResponse> => {
    const res = await api.get<{ success: boolean; data: WeekScheduleResponse }>("/v1/provider/shifts/week", {
      params: { start_date: startDate, cafe_id: cafeId },
    })
    return res.data.data
  },

  createPosition: async (name: string): Promise<ShiftPosition> => {
    const res = await api.post<{ success: boolean; data: ShiftPosition }>("/v1/provider/positions", { name })
    return res.data.data
  },

  updatePosition: async (positionId: string, name: string): Promise<ShiftPosition> => {
    const res = await api.patch<{ success: boolean; data: ShiftPosition }>(`/v1/provider/positions/${positionId}`, { name })
    return res.data.data
  },

  deletePosition: async (positionId: string): Promise<void> => {
    await api.delete(`/v1/provider/positions/${positionId}`)
  },

  listShiftTimePresets: async (): Promise<ShiftTimePreset[]> => {
    const res = await api.get<{ success: boolean; data: ShiftTimePreset[] }>("/v1/provider/shift-time-presets")
    return res.data.data
  },

  createShiftTimePreset: async (body: {
    label: string
    start_time: string
    end_time: string
  }): Promise<ShiftTimePreset> => {
    const res = await api.post<{ success: boolean; data: ShiftTimePreset }>("/v1/provider/shift-time-presets", body)
    return res.data.data
  },

  updateShiftTimePreset: async (
    presetId: string,
    body: {
      label: string
      start_time: string
      end_time: string
    },
  ): Promise<ShiftTimePreset> => {
    const res = await api.patch<{ success: boolean; data: ShiftTimePreset }>(`/v1/provider/shift-time-presets/${presetId}`, body)
    return res.data.data
  },

  deleteShiftTimePreset: async (presetId: string): Promise<void> => {
    await api.delete(`/v1/provider/shift-time-presets/${presetId}`)
  },

  assignShift: async (body: {
    cafe_id: string
    position_id: string
    staff_id: string
    shift_date: string
  }): Promise<StaffShift> => {
    const res = await api.post<{ success: boolean; data: StaffShift }>("/v1/provider/shifts/assign", body)
    return res.data.data
  },

  updateShiftTime: async (body: {
    shift_id: string
    shift_label: string
    start_time: string
    end_time: string
  }): Promise<StaffShift> => {
    const res = await api.put<{ success: boolean; data: StaffShift }>("/v1/provider/shifts/update-time", body)
    return res.data.data
  },

  moveShift: async (body: {
    shift_id: string
    new_position_id: string
    new_date: string
  }): Promise<StaffShift> => {
    const res = await api.put<{ success: boolean; data: StaffShift }>("/v1/provider/shifts/move", body)
    return res.data.data
  },

  cloneShift: async (body: {
    source_shift_id: string
    position_id: string
    shift_date: string
  }): Promise<StaffShift> => {
    const res = await api.post<{ success: boolean; data: StaffShift }>("/v1/provider/shifts/clone", body)
    return res.data.data
  },

  bulkCloneShifts: async (body: {
    source_shift_ids: string[]
    target_cells: Array<{ position_id: string; shift_date: string }>
  }): Promise<StaffShift[]> => {
    const res = await api.post<{ success: boolean; data: StaffShift[] }>("/v1/provider/shifts/bulk-clone", body)
    return res.data.data
  },

  bulkDeleteShifts: async (shiftIds: string[]): Promise<{ deletedCount: number }> => {
    const res = await api.delete<{ success: boolean; data: { deletedCount: number } }>("/v1/provider/shifts/bulk", {
      data: { shift_ids: shiftIds },
    })
    return res.data.data
  },

  clearEmployeeWeek: async (body: {
    employee_id: string
    week_start_date: string
  }): Promise<{ deletedCount: number }> => {
    const res = await api.delete<{ success: boolean; data: { deletedCount: number } }>("/v1/provider/shifts/clear-employee-week", {
      data: body,
    })
    return res.data.data
  },
}
