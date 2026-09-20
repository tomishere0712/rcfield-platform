import { api } from "@/shared/lib/axios"
import type {
  AchievementDefinition,
  DriverPassport,
  GlobalLeaderboardEntry,
  GlobalLeaderboardQuery,
  UpdateDriverPassportBody,
} from "../types"

type ApiEnvelope<T> = {
  success: boolean
  data: T
}

export const racingQueryKeys = {
  passport: () => ["racing", "passport"] as const,
  achievements: () => ["racing", "achievements"] as const,
  globalLeaderboard: (params?: Record<string, unknown>) => ["racing", "leaderboard", params ?? {}] as const,
}

export const racingApi = {
  getMyPassport: async (): Promise<DriverPassport> => {
    const response = await api.get<ApiEnvelope<DriverPassport>>("/v1/me/driver-passport")
    return response.data.data
  },

  updateMyPassport: async (body: UpdateDriverPassportBody): Promise<DriverPassport> => {
    const response = await api.patch<ApiEnvelope<DriverPassport>>("/v1/me/driver-passport", body)
    return response.data.data
  },

  listGlobalLeaderboard: async (params?: GlobalLeaderboardQuery): Promise<GlobalLeaderboardEntry[]> => {
    const response = await api.get<ApiEnvelope<GlobalLeaderboardEntry[]>>("/v1/leaderboards/global", { params })
    return response.data.data ?? []
  },

  listAchievements: async (): Promise<AchievementDefinition[]> => {
    const response = await api.get<ApiEnvelope<AchievementDefinition[]>>("/v1/achievements")
    return response.data.data ?? []
  },
}
