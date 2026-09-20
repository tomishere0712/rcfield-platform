import { useCallback, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useReducedMotion } from "framer-motion"
import { ArrowLeft } from "lucide-react"
import { Link, useParams } from "react-router"

import { routePaths } from "@/app/router/route-paths"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import {
  contestApi,
  contestQueryKeys,
} from "@/features/contests/api/contest.api"
import {
  getContestRuntimeFormat,
  groupMatchesByRound,
} from "@/features/contests/lib/contest-runtime"
import {
  getContestRegistrationAvailability,
  getEffectiveContestStatus,
} from "@/features/contests/lib/contest-status"
import type {
  ContestItem,
  ContestRegistration,
} from "@/features/contests/types"
import { Skeleton } from "@/shared/ui/skeleton"

import {
  ContestBracketBoard,
  ContestRuntimeOverview,
} from "./components/ContestBracketSection"
import { ContestHero } from "./components/ContestHero"
import {
  ContestJoinSection,
  ContestMyJourneySection,
} from "./components/ContestJoinSection"
import { ContestLeaderboardSection } from "./components/ContestLeaderboardSection"
import {
  ContestSectionNav,
  type ContestNavItem,
} from "./components/ContestSectionNav"
import {
  ContestAboutSection,
  ContestFormatSection,
  ContestPrizeSection,
  ContestScheduleSection,
  ContestVenueSection,
} from "./components/ContestStorySections"
import { PageSection, Reveal, SectionHeading } from "./components/SectionShell"
import { formatCurrency } from "./utils"

export function PublicContestDetailPage() {
  const { contestId } = useParams()
  const role = useAuthStore((state) => state.role)
  const profile = useAuthStore((state) => state.user)
  const prefersReducedMotion = useReducedMotion()

  const contestQuery = useQuery({
    queryKey: contestQueryKeys.detail(contestId),
    queryFn: () => contestApi.getContest(contestId!),
    enabled: Boolean(contestId),
  })
  const matchesQuery = useQuery({
    queryKey: contestQueryKeys.matches(contestId),
    queryFn: () => contestApi.listMatches(contestId!),
    enabled: Boolean(contestId),
  })
  const myRegistrationsQuery = useQuery({
    queryKey: contestQueryKeys.myRegistrations(),
    queryFn: () => contestApi.listMyRegistrations(),
    enabled: role === "customer",
  })

  const contest = contestQuery.data
  const existingRegistration = useMemo(
    () =>
      contest?.my_registration ??
      myRegistrationsQuery.data?.find((item) => item.contestId === contestId) ??
      null,
    [contest?.my_registration, myRegistrationsQuery.data, contestId],
  )
  const matches = useMemo(() => matchesQuery.data ?? [], [matchesQuery.data])
  const groupedMatches = useMemo(() => groupMatchesByRound(matches), [matches])
  const myMatches = useMemo(
    () =>
      matches.filter((match) =>
        match.participants.some(
          (participant) => participant.registration?.is_my_registration,
        ),
      ),
    [matches],
  )

  /**
   * Cuộn tới một phần. Dùng `scrollIntoView` thay vì để trình duyệt nhảy theo
   * hash để có thể tắt hiệu ứng mượt khi người dùng bật giảm chuyển động.
   */
  const handleJump = useCallback(
    (sectionId: string) => {
      const element = document.getElementById(sectionId)
      if (!element) return
      element.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start",
      })
    },
    [prefersReducedMotion],
  )

  if (!contest) {
    return contestQuery.isError ? (
      <ContestDetailError />
    ) : (
      <ContestDetailSkeleton />
    )
  }

  const runtimeSummary = contest.runtime_summary
  const highlightRounds =
    contest.highlight_rounds ?? runtimeSummary?.highlight_rounds ?? []
  const leaderboard = contest.published_leaderboard ?? null
  const effectiveStatus = getEffectiveContestStatus(contest)
  const contestOver =
    effectiveStatus === "COMPLETED" || effectiveStatus === "CANCELLED"
  const registrationAvailability = getContestRegistrationAvailability(contest)
  const prizeStructure = contest.prize_structure
  const prizeItems = Array.isArray(prizeStructure?.items)
    ? (prizeStructure.items as Array<Record<string, unknown>>)
    : Array.isArray(prizeStructure?.tiers)
      ? (prizeStructure.tiers as Array<Record<string, unknown>>)
      : []

  // Chỉ dựng phần "Diễn biến" khi thật sự có gì để xem — giải mới mở đăng ký mà
  // hiện một khối rỗng dài sẽ làm loãng mạch giới thiệu.
  const showProgress =
    matches.length > 0 ||
    Boolean(leaderboard) ||
    effectiveStatus === "RUNNING" ||
    effectiveStatus === "COMPLETED"

  // Giải khép lại thì dẫn sang kết quả, trừ khi chẳng có gì để xem (giải huỷ
  // trước khi bốc thăm) — lúc đó phần Đăng ký ít ra còn nói rõ giải đã huỷ.
  const primaryCtaTarget = contestOver && showProgress ? "dien-bien" : "dang-ky"

  const navItems: ContestNavItem[] = [
    { id: "gioi-thieu", label: "Giới thiệu" },
    ...(existingRegistration
      ? [{ id: "cua-toi", label: "Hành trình của bạn" }]
      : []),
    { id: "the-thuc", label: "Thể thức" },
    { id: "lich-trinh", label: "Lịch trình" },
    { id: "giai-thuong", label: "Giải thưởng" },
    { id: "dia-diem", label: "Địa điểm" },
    ...(showProgress ? [{ id: "dien-bien", label: "Diễn biến" }] : []),
    // Giải khép lại rồi thì mục Đăng ký chỉ dẫn tới một khối báo "đã kết thúc".
    ...(contestOver ? [] : [{ id: "dang-ky", label: "Đăng ký" }]),
  ]

  return (
    <div className="bg-white pb-20 lg:pb-0">
      <ContestHero
        contest={contest}
        effectiveStatus={effectiveStatus}
        ctaTarget={primaryCtaTarget}
        onJump={handleJump}
      />

      <ContestSectionNav
        items={navItems}
        // Giải đã khép lại thì mời đăng ký là sai; dẫn khách sang phần kết quả.
        ctaLabel={
          contestOver
            ? showProgress
              ? "Xem kết quả"
              : "Xem chi tiết"
            : existingRegistration
              ? "Đăng ký của bạn"
              : "Đăng ký ngay"
        }
        onJump={() => handleJump(primaryCtaTarget)}
      />

      <ContestAboutSection contest={contest} />

      {existingRegistration ? (
        <ContestMyJourneySection
          registration={existingRegistration}
          matches={myMatches}
          loading={matchesQuery.isLoading}
          effectiveStatus={effectiveStatus}
          currentRoundNo={runtimeSummary?.current_round_no ?? null}
        />
      ) : null}

      <ContestFormatSection contest={contest} />
      <ContestScheduleSection contest={contest} />
      <ContestPrizeSection prizeItems={prizeItems} />
      <ContestVenueSection contest={contest} />

      {showProgress ? (
        <PageSection id="dien-bien" tone="muted">
          <Reveal>
            <SectionHeading
              eyebrow="Diễn biến"
              title="Đường tới ngôi vô địch"
              lead="Sơ đồ thi đấu, người đi tiếp và bảng xếp hạng được cập nhật ngay khi ban tổ chức chốt kết quả từng trận."
            />
          </Reveal>
          <div className="mt-12 space-y-6">
            <ContestRuntimeOverview
              effectiveStatus={effectiveStatus}
              runtimeSummary={runtimeSummary}
              highlightRounds={highlightRounds}
            />
            <ContestBracketBoard
              matches={matches}
              groupedMatches={groupedMatches}
              existingRegistration={existingRegistration}
              loading={matchesQuery.isLoading}
              format={getContestRuntimeFormat(contest)}
            />
            <ContestLeaderboardSection
              leaderboard={leaderboard}
              matches={matches}
            />
          </div>
        </PageSection>
      ) : null}

      <ContestJoinSection
        contest={contest}
        registrationAvailability={registrationAvailability}
        role={role}
        profileName={profile?.email ?? profile?.fullName ?? "--"}
        existingRegistration={existingRegistration}
        onRegistered={() => handleJump("cua-toi")}
      />

      <MobileJoinBar
        contest={contest}
        existingRegistration={existingRegistration}
        onJump={handleJump}
      />
    </div>
  )
}

/**
 * Thanh hành động dính đáy màn hình nhỏ — trên mobile phần đăng ký nằm cuối
 * một trang cuộn dài, nếu không có lối tắt thì khách phải cuộn qua toàn bộ nội dung.
 */
function MobileJoinBar({
  contest,
  existingRegistration,
  onJump,
}: {
  contest: ContestItem
  existingRegistration: ContestRegistration | null
  onJump: (sectionId: string) => void
}) {
  if (existingRegistration) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-xl lg:hidden">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-2xs font-black uppercase tracking-[0.16em] text-slate-400">
            Lệ phí
          </p>
          <p className="text-base font-black text-slate-900">
            {formatCurrency(contest.entry_fee)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onJump("dang-ky")}
          className="h-11 flex-1 rounded-2xl bg-primary text-sm font-black text-primary-foreground transition active:scale-[0.98]"
        >
          Đăng ký tham gia
        </button>
      </div>
    </div>
  )
}

function ContestDetailSkeleton() {
  return (
    <div className="bg-white">
      <div className="bg-brand-dark">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
          <Skeleton className="h-4 w-48 bg-white/10" />
          <Skeleton className="mt-10 h-8 w-40 rounded-full bg-white/10" />
          <Skeleton className="mt-6 h-14 w-3/4 bg-white/10" />
          <Skeleton className="mt-4 h-4 w-1/2 bg-white/10" />
          <div className="mt-16 grid gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-14 bg-white/10" />
            ))}
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-16 sm:px-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-40 w-full rounded-3xl" />
      </div>
    </div>
  )
}

function ContestDetailError() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
      <h1 className="text-2xl font-black text-slate-900">
        Không tải được giải đấu này
      </h1>
      <p className="mt-3 text-sm font-medium text-slate-500">
        Giải đấu có thể đã bị gỡ hoặc đường dẫn không còn đúng. Bạn thử quay lại
        danh sách giải đấu nhé.
      </p>
      <Link
        to={routePaths.contests}
        className="mt-8 inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-900 px-6 text-sm font-bold text-white transition hover:bg-slate-800"
      >
        <ArrowLeft className="size-4" />
        Quay lại danh sách giải đấu
      </Link>
    </div>
  )
}
