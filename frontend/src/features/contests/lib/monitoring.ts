export interface ContestUiMonitorEvent {
  feature: "contest"
  event: string
  contestId?: string
  registrationId?: string
  matchId?: string
  metadata?: Record<string, unknown>
  occurredAt: string
}

export function recordContestUiEvent(
  event: string,
  details: Omit<
    Partial<ContestUiMonitorEvent>,
    "feature" | "event" | "occurredAt"
  > = {},
) {
  if (typeof window === "undefined") return

  const detail: ContestUiMonitorEvent = {
    feature: "contest",
    event,
    contestId: details.contestId,
    registrationId: details.registrationId,
    matchId: details.matchId,
    metadata: details.metadata,
    occurredAt: new Date().toISOString(),
  }

  window.dispatchEvent(new CustomEvent("rcfield:contest-monitor", { detail }))

  if (
    typeof performance !== "undefined" &&
    typeof performance.mark === "function"
  ) {
    performance.mark(`contest:${event}`)
  }
}
