import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { ContestMatch } from "@/features/contests/types"

import { ContestGrandPrixFlow } from "./ContestGrandPrixFlow"

function qualifyingMatch(id: string, position: number): ContestMatch {
  return {
    id,
    round_no: 1,
    match_no: position,
    status: "COMPLETED",
    scheduled_at: "2026-09-01T02:00:00.000Z",
    metadata: { phase: "QUALIFYING" },
    participants: [
      {
        id: `participant-${id}`,
        registration_id: `registration-${id}`,
        status: "FINISHED",
        seed_no: position,
        best_lap_seconds: 30 + position,
        total_time_seconds: 40 + position,
        registration: { participant_name: `Tay đua ${position}` },
      },
    ],
  } as unknown as ContestMatch
}

describe("ContestGrandPrixFlow", () => {
  it("hiển thị flow vòng loại, top 4, bán kết và chung kết", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <ContestGrandPrixFlow
          contest={{ id: "contest-1", config: { finalists: 4 } } as never}
          matches={[1, 2, 3, 4].map((position) =>
            qualifyingMatch(`match-${position}`, position),
          )}
          selectedMatchId={null}
          onSelectMatch={vi.fn()}
          onStageAdvance={vi.fn()}
          onUndo={vi.fn()}
          onCommit={vi.fn()}
          canUndo={false}
          hasChanges={false}
        />
      </QueryClientProvider>,
    )

    expect(screen.getByText("Lộ trình Grand Prix")).toBeInTheDocument()
    expect(screen.getByText("Vòng loại")).toBeInTheDocument()
    expect(screen.getByText("Top 4 · Bán kết")).toBeInTheDocument()
    expect(screen.getByText("Chung kết")).toBeInTheDocument()
    expect(screen.getAllByText(/Seed [1-4]/)).toHaveLength(4)
    expect(
      screen.getByRole("button", { name: "Sinh nhánh top 4" }),
    ).toBeEnabled()
  })
})
