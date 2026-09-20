import { CreditCard, KeyRound, ShieldCheck } from "lucide-react"

import type { ContestRegistrationAvailability } from "@/features/contests/lib/contest-status"
import {
  getContestStatusLabel,
  getJourneyStatusLabel,
} from "@/features/contests/lib/contest-status"
import type {
  ContestItem,
  ContestMatch,
  ContestRegistration,
} from "@/features/contests/types"

import { ContestRegistrationPanel } from "./ContestRegistrationPanel"
import { StatusRow } from "./DetailPrimitives"
import { MyRegistrationMatches } from "./MyRegistrationSection"
import { PageSection, Reveal, SectionHeading } from "./SectionShell"

const BENEFITS = [
  {
    icon: CreditCard,
    title: "Một lần thanh toán",
    body: "Lệ phí giải và tiền thuê xe được gộp chung trong một giao dịch VNPay duy nhất.",
  },
  {
    icon: ShieldCheck,
    title: "Không yêu cầu tiền cọc",
    body: "RCField không thu tiền cọc xe khi đặt lịch hoặc tham gia giải đấu.",
  },
  {
    icon: KeyRound,
    title: "Mã check-in riêng",
    // "Đăng ký xong nhận ngay" là sai với giải có thu lệ phí: mã chỉ cấp sau
    // khi trả tiền, và backend cũng chặn điểm danh khi lệ phí chưa ngã ngũ.
    body: "Thanh toán xong bạn nhận mã điểm danh, tới nơi chỉ cần đọc mã cho nhân viên.",
  },
]

export function ContestJoinSection({
  contest,
  registrationAvailability,
  role,
  profileName,
  existingRegistration,
  onRegistered,
}: {
  contest: ContestItem
  registrationAvailability: ContestRegistrationAvailability
  role: string | null
  profileName: string
  existingRegistration: ContestRegistration | null
  onRegistered?: () => void
}) {
  const remaining = contest.public_stats?.capacity_remaining ?? null
  const isOpen = registrationAvailability === "AVAILABLE"

  return (
    <PageSection id="dang-ky" tone="dark" className="overflow-hidden">
      <div className="pointer-events-none absolute -right-40 top-10 size-96 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -left-40 bottom-0 size-96 rounded-full bg-accent/10 blur-3xl" />

      <div className="relative grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
        <div>
          <Reveal>
            <SectionHeading
              eyebrow="Tham gia"
              title={
                existingRegistration
                  ? "Bạn đã có mặt trong giải"
                  : "Sẵn sàng vào cuộc?"
              }
              lead={
                existingRegistration
                  ? "Theo dõi trạng thái đăng ký của bạn ở khung bên cạnh. Mọi cập nhật về lịch thi đấu sẽ hiện ngay tại đây."
                  : "Giữ suất chỉ mất vài phút. Chọn hình thức xe, xác nhận và thanh toán — phần còn lại để ban tổ chức lo."
              }
              tone="dark"
            />
          </Reveal>

          {isOpen && remaining !== null && remaining <= 10 ? (
            <Reveal index={1}>
              <p className="mt-8 inline-flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm font-black text-primary">
                Chỉ còn {remaining} suất cho giải này
              </p>
            </Reveal>
          ) : null}

          <div className="mt-10 space-y-8">
            {BENEFITS.map((benefit, index) => (
              <Reveal key={benefit.title} index={index + 2}>
                <div className="flex gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/5 text-brand-amber">
                    <benefit.icon className="size-5" />
                  </span>
                  <div>
                    <h3 className="text-base font-black text-white">
                      {benefit.title}
                    </h3>
                    <p className="mt-1.5 text-sm font-medium leading-7 text-white/60">
                      {benefit.body}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal index={1}>
          <ContestRegistrationPanel
            contest={contest}
            registrationAvailability={registrationAvailability}
            role={role}
            profileName={profileName}
            existingRegistration={existingRegistration}
            onRegistered={onRegistered}
          />
        </Reveal>
      </div>
    </PageSection>
  )
}

/**
 * Phần dành riêng cho người đã ghi danh — đặt ngay sau phần giới thiệu vì với họ
 * đây là thông tin đáng xem nhất khi mở lại trang.
 */
export function ContestMyJourneySection({
  registration,
  matches,
  loading,
  effectiveStatus,
  currentRoundNo,
}: {
  registration: ContestRegistration
  matches: ContestMatch[]
  loading: boolean
  effectiveStatus: ContestItem["status"]
  currentRoundNo: number | null
}) {
  return (
    <PageSection id="cua-toi" tone="muted">
      <Reveal>
        <SectionHeading
          eyebrow="Dành cho bạn"
          title="Hành trình của bạn"
          lead="Trạng thái đăng ký và những trận đấu có tên bạn."
        />
      </Reveal>

      <Reveal index={1}>
        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          <StatusRow
            label="Giải đấu"
            value={getContestStatusLabel(effectiveStatus)}
          />
          <StatusRow
            label="Vòng hiện tại"
            value={currentRoundNo ? `Vòng ${currentRoundNo}` : "Chưa mở"}
          />
          <StatusRow
            label="Trạng thái của bạn"
            value={getJourneyStatusLabel(registration.customerJourneyStatus)}
          />
        </div>
      </Reveal>

      <Reveal index={2} className="mt-8">
        <MyRegistrationMatches
          registration={registration}
          matches={matches}
          loading={loading}
        />
      </Reveal>
    </PageSection>
  )
}
