import type { ContestMatchParticipant } from "@/features/contests/types"
import type { useContestRuntime } from "@/features/contests/hooks/useContestRuntime"

export type ContestRuntimeHook = ReturnType<typeof useContestRuntime>

export type MatchParticipantDraft = {
  registration_id: string
  slot_no: number
  lane: string | null
  grid_position: number | null
  seed_no: number | null
}

export type MatchResultDraft = {
  registration_id: string
  finish_position: number | null
  score: number | null
  best_lap_seconds: number | null
  total_time_seconds: number | null
  is_winner: boolean
  result_note: string | null
  status: ContestMatchParticipant["status"]
}
