import type { ContestMatch } from "@/features/contests/types"
import { getMatchParticipantName } from "@/features/contests/lib/contest-runtime"
import { getParticipantStatusLabel } from "@/features/contests/lib/contest-status"
import { DriverTitleChip } from "@/features/racing/components/DriverTitleChip"

export function MatchParticipantView({ match }: { match: ContestMatch }) {
  return (
    <section className="rounded-lg border border-[#e5e2e1] bg-[#fcf8f8] p-4">
      <h4 className="mb-2 text-sm font-extrabold text-[#1c1b1b]">
        Người thi đấu của trận này
      </h4>
      <div className="space-y-2">
        {match.participants.length > 0 ? (
          match.participants.map((participant) => (
            <div
              key={participant.registration_id}
              className="rounded-lg border border-[#e5e2e1] bg-white px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-[#1c1b1b]">
                  {getMatchParticipantName(participant)}
                </p>
                <DriverTitleChip
                  label={participant.registration?.driver_title_label}
                  className="px-2 py-0 text-[10px]"
                />
              </div>
              <p className="mt-1 text-xs font-semibold text-[#747878]">
                Vị trí {participant.slot_no} ·{" "}
                {getParticipantStatusLabel(participant.status)}
              </p>
            </div>
          ))
        ) : (
          <p className="text-sm font-semibold text-[#747878]">
            Chưa có người thi đấu nào cho trận này.
          </p>
        )}
      </div>
    </section>
  )
}
