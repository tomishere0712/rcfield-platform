export type DriverPassport = {
  user_id: string
  driver_handle: string
  display_name: string
  passport_code: string
  public_profile_enabled: boolean
  leaderboard_opt_in: boolean
  current_title: {
    code: string | null
    label: string | null
  }
  stats: {
    completed_sessions: number
    completed_plays: number
    distinct_cafes_played: number
    verified_race_records: number
    best_global_lap_ms: number | null
  }
  achievements: Array<{
    code: string
    name: string
    description: string | null
    badge_icon_url: string | null
    title_label: string | null
    unlocked_at: string
    source: Record<string, unknown>
  }>
}

export type UpdateDriverPassportBody = {
  driver_handle?: string
  display_name?: string
  home_cafe_id?: string | null
  public_profile_enabled?: boolean
  leaderboard_opt_in?: boolean
}

export type GlobalLeaderboardEntry = {
  rank: number
  id: string
  user_id: string
  display_name: string
  driver_handle: string | null
  avatar_url: string | null
  current_title: {
    code: string | null
    label: string | null
  }
  cafe: {
    name: string
    city: string
  }
  vehicle_source: string
  best_lap_ms: number | null
  total_time_ms: number | null
  score: number | null
  finish_position: number | null
  contest_name: string | null
  recorded_at: string
}

export type GlobalLeaderboardQuery = {
  period?: "daily" | "weekly" | "monthly" | "all_time"
  city?: string
  cafe_id?: string
  vehicle_source?: "RENTAL" | "BYOC"
  limit?: number
}

export type AchievementDefinition = {
  code: string
  name: string
  description: string | null
  badge_icon_url: string | null
  title_label: string | null
  rule_code: string
  rule_config: Record<string, unknown>
  sort_order: number
}
