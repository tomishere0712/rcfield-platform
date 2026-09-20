import type { ContestMatchParticipant } from "@/features/contests/types"
import {
  getMatchParticipantName,
  getMatchParticipantSubtitle,
} from "@/features/contests/lib/contest-runtime"
import { getParticipantStatusLabel } from "@/features/contests/lib/contest-status"
import { DriverTitleChip } from "@/features/racing/components/DriverTitleChip"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { MatchDetailField } from "./MatchDetailField"
import type { MatchParticipantDraft } from "./match-detail-types"

type EditableParticipantField = "slot_no" | "lane" | "grid_position" | "seed_no"

export function MatchParticipantReorderList({
  participants,
  participantMap,
  onUpdateParticipant,
  onSave,
}: {
  participants: MatchParticipantDraft[]
  participantMap: Map<string, ContestMatchParticipant>
  onUpdateParticipant: (
    registrationId: string,
    field: EditableParticipantField,
    value: number | string | null,
  ) => void
  onSave: () => Promise<void>
}) {
  return (
    <section>
      <h4 className="mb-2 text-sm font-extrabold text-[#1c1b1b]">
        Thứ tự thi đấu
      </h4>
      <div className="space-y-3">
        {participants.map((participant) => {
          const snapshot = participantMap.get(participant.registration_id)
          return (
            <div
              key={participant.registration_id}
              className="rounded-lg border border-[#e5e2e1] bg-[#fcf8f8] p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-[#1c1b1b]">
                      {snapshot
                        ? getMatchParticipantName(snapshot)
                        : participant.registration_id.slice(0, 8)}
                    </p>
                    <DriverTitleChip
                      label={snapshot?.registration?.driver_title_label}
                      className="px-2 py-0 text-[10px]"
                    />
                  </div>
                  {snapshot ? (
                    <p className="text-xs font-medium text-[#747878]">
                      {getMatchParticipantSubtitle(snapshot) ??
                        "Chưa có email hoặc mã điểm danh"}
                    </p>
                  ) : null}
                </div>
                <p className="text-xs font-semibold text-[#747878]">
                  {snapshot ? getParticipantStatusLabel(snapshot.status) : "--"}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <MatchDetailField label="Vị trí">
                  <Input
                    type="number"
                    value={participant.slot_no}
                    onChange={(event) =>
                      onUpdateParticipant(
                        participant.registration_id,
                        "slot_no",
                        Number(event.target.value),
                      )
                    }
                  />
                </MatchDetailField>
                <MatchDetailField label="Làn">
                  <Input
                    value={participant.lane ?? ""}
                    onChange={(event) =>
                      onUpdateParticipant(
                        participant.registration_id,
                        "lane",
                        event.target.value || null,
                      )
                    }
                  />
                </MatchDetailField>
                <MatchDetailField label="Ô xuất phát">
                  <Input
                    type="number"
                    value={participant.grid_position ?? ""}
                    onChange={(event) =>
                      onUpdateParticipant(
                        participant.registration_id,
                        "grid_position",
                        event.target.value ? Number(event.target.value) : null,
                      )
                    }
                  />
                </MatchDetailField>
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-3">
        <Button
          variant="outline"
          className="rounded-lg border-[#c4c7c8] bg-[#f6f3f2] text-[#1c1b1b] hover:bg-[#ebe7e7]"
          onClick={() => void onSave()}
        >
          Lưu thứ tự thi đấu
        </Button>
      </div>
    </section>
  )
}
