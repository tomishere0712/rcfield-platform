import { KeyRound, Swords } from "lucide-react"
import { Link } from "react-router"

import { MatchStatusBadge } from "@/features/contests/components"
import {
  formatContestDateTime,
  formatMatchLabel,
  getMatchParticipantName,
} from "@/features/contests/lib/contest-runtime"
import type {
  ContestMatch,
  ContestRegistration,
  ContestRegistrationBooking,
} from "@/features/contests/types"
import { DriverTitleChip } from "@/features/racing/components/DriverTitleChip"
import { Card } from "@/shared/ui/card"
import { EmptyState } from "@/shared/ui/empty-state"
import { CardListSkeleton } from "@/shared/ui/loading-state"

import { formatCurrency } from "../utils"

export function MyRegistrationMatches({
  registration,
  matches,
  loading,
}: {
  registration: ContestRegistration
  matches: ContestMatch[]
  loading: boolean
}) {
  return (
    <Card className="rounded-2xl border border-[#e5e2e1] bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2 text-slate-900">
        <Swords className="size-5 text-orange-500" />
        <h3 className="text-lg font-extrabold">Bracket của bạn</h3>
      </div>
      <p className="mt-2 text-sm text-slate-500">
        Tập trung vào các trận bạn tham gia và đối thủ trực tiếp của bạn.
      </p>

      {registration.booking ? (
        <LinkedBookingCard booking={registration.booking} />
      ) : null}

      <div className="mt-5 space-y-4">
        {loading ? (
          <CardListSkeleton count={2} itemClassName="h-28 rounded-2xl" />
        ) : matches.length === 0 ? (
          <EmptyState
            title="Bạn chưa có trận nào trong sơ đồ đấu hiện tại."
            className="rounded-2xl border-slate-200 p-6"
          />
        ) : (
          matches.map((match) => {
            const myParticipant =
              match.participants.find(
                (participant) =>
                  participant.registration?.is_my_registration ||
                  participant.registration_id === registration.id,
              ) ?? null
            const opponents = match.participants.filter(
              (participant) =>
                !participant.registration?.is_my_registration &&
                participant.registration_id !== registration.id,
            )

            return (
              <article
                key={match.id}
                className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-base font-bold text-slate-900">
                      {formatMatchLabel(match)}
                    </p>
                    <p className="text-sm text-slate-500">
                      Thi đấu lúc {formatContestDateTime(match.scheduled_at)}
                    </p>
                  </div>
                  <MatchStatusBadge
                    status={match.status}
                    className="h-auto px-2.5 py-1 font-bold"
                  />
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <BracketCard
                    title="Bạn"
                    name={
                      myParticipant
                        ? getMatchParticipantName(myParticipant)
                        : (registration.participant?.fullName ??
                          registration.participant?.email ??
                          "Người chơi của bạn")
                    }
                    detail={
                      myParticipant?.status
                        ? `Trạng thái: ${myParticipant.status}`
                        : "Chờ cập nhật vào trận"
                    }
                    titleLabel={myParticipant?.registration?.driver_title_label}
                    highlight
                  />
                  <BracketCard
                    title="Đối thủ"
                    name={
                      opponents[0]
                        ? getMatchParticipantName(opponents[0])
                        : "Chưa xác định"
                    }
                    detail={
                      opponents[0]?.status
                        ? `Trạng thái: ${opponents[0].status}`
                        : "Chưa có người ghép trận"
                    }
                    titleLabel={opponents[0]?.registration?.driver_title_label}
                  />
                </div>
              </article>
            )
          })
        )}
      </div>
    </Card>
  )
}

function LinkedBookingCard({
  booking,
}: {
  booking: ContestRegistrationBooking
}) {
  const statusMeta = getBookingStatusMeta(booking.status)

  return (
    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-orange-500" />
          <p className="text-sm font-extrabold text-slate-900">
            Booking thuê xe kèm theo
          </p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-black ${statusMeta.className}`}
        >
          {statusMeta.label}
        </span>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
        <p>
          Tổng tiền:{" "}
          <span className="font-bold text-slate-900">
            {formatCurrency(booking.totalAmount)}
          </span>
        </p>
        {booking.status === "PENDING" && booking.paymentExpiresAt ? (
          <p>
            Hạn thanh toán:{" "}
            <span className="font-bold text-amber-700">
              {formatContestDateTime(booking.paymentExpiresAt)}
            </span>
          </p>
        ) : null}
      </div>
      {booking.status === "PENDING" ? (
        <p className="mt-2 text-xs text-amber-700">
          Booking đang chờ thanh toán — vui lòng hoàn tất trước hạn để giữ chỗ
          thi đấu.
        </p>
      ) : null}
      <Link
        to={`/customer/bookings/${booking.id}`}
        className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-orange-600 transition hover:text-orange-700"
      >
        Xem chi tiết booking →
      </Link>
    </div>
  )
}

function getBookingStatusMeta(status: string) {
  switch (status) {
    case "PENDING":
      return {
        label: "Chờ thanh toán",
        className: "border-amber-200 bg-amber-50 text-amber-800",
      }
    case "CONFIRMED":
      return {
        label: "Đã xác nhận",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      }
    case "COMPLETED":
      return {
        label: "Hoàn thành",
        className: "border-slate-200 bg-slate-100 text-slate-700",
      }
    case "CANCELLED":
      return {
        label: "Đã hủy",
        className: "border-red-200 bg-red-50 text-red-700",
      }
    case "NO_SHOW":
      return {
        label: "Vắng mặt",
        className: "border-red-200 bg-red-50 text-red-700",
      }
    default:
      return {
        label: status,
        className: "border-slate-200 bg-slate-100 text-slate-700",
      }
  }
}

function BracketCard({
  title,
  name,
  detail,
  titleLabel,
  highlight = false,
}: {
  title: string
  name: string
  detail: string
  titleLabel?: string | null
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${highlight ? "border-orange-200 bg-orange-50/70" : "border-slate-200 bg-white"}`}
    >
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {title}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="text-base font-extrabold text-slate-900">{name}</p>
        <DriverTitleChip label={titleLabel} />
      </div>
      <p className="mt-1 text-sm font-medium text-slate-500">{detail}</p>
    </div>
  )
}
