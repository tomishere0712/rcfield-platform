import type { TrackConfig } from "@/features/cafes/types"

import type { ResourceLockState } from "./contest-form-types"

export function toInputDateTime(value: string) {
  const date = new Date(value)
  const offset = date.getTimezoneOffset()
  const normalized = new Date(date.getTime() - offset * 60_000)
  return normalized.toISOString().slice(0, 16)
}

export function getErrorMessage(error: unknown) {
  const maybe = error as { response?: { data?: { message?: string } } }
  return maybe.response?.data?.message ?? "Vui lòng kiểm tra lại dữ liệu."
}

export type ContestRuntimeFormat =
  | "TIME_TRIAL"
  | "KNOCKOUT"
  | "QUALIFYING_FINAL"

export function getRuntimeFormatFromCode(
  code?: string | null,
): ContestRuntimeFormat {
  if (code === "TIME_TRIAL") return "TIME_TRIAL"
  if (code === "QUALIFYING_FINAL") return "QUALIFYING_FINAL"
  return "KNOCKOUT"
}

export function stripManagedContestConfig(
  config: Record<string, unknown> | null | undefined,
) {
  const nextConfig = { ...(config ?? {}) }
  delete nextConfig.format
  delete nextConfig.runtime_format
  delete nextConfig.resource_locks
  delete nextConfig.finalists
  // rental_policy là tàn dư của thời thuê xe trong giải còn tính tiền. Giờ thuê
  // xe miễn phí nên form không còn ô nào ghi nó; xoá đi để giải cũ mở ra sửa
  // không mang theo một chính sách giá đã hết hiệu lực.
  delete nextConfig.rental_policy
  return nextConfig
}

export function buildResourceLocks(
  cafeIds: string[],
  trackConfigsByCafe: Record<string, TrackConfig[]>,
  resourceLocks: ResourceLockState,
) {
  return cafeIds.map((cafeId) => {
    const trackConfigs = (trackConfigsByCafe[cafeId] ?? []).filter(
      (item) => item.is_active,
    )
    const lockState = resourceLocks[cafeId]

    if (trackConfigs.length <= 1) {
      return {
        cafe_id: cafeId,
        scope: "FULL_BRANCH" as const,
        track_config_ids: trackConfigs.map((item) => item.id),
      }
    }

    if (lockState?.scope === "SELECTED_TRACKS") {
      return {
        cafe_id: cafeId,
        scope: "SELECTED_TRACKS" as const,
        track_config_ids: lockState.track_config_ids.filter((trackId) =>
          trackConfigs.some((item) => item.id === trackId),
        ),
      }
    }

    return {
      cafe_id: cafeId,
      scope: "FULL_BRANCH" as const,
      track_config_ids: trackConfigs.map((item) => item.id),
    }
  })
}
