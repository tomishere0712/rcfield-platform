import { useQuery } from "@tanstack/react-query"
import { Trophy } from "lucide-react"

import { useAuthStore } from "@/features/auth/stores/auth.store"
import { racingApi, racingQueryKeys } from "@/features/racing/api/racing.api"
import { DriverTitleChip } from "@/features/racing/components/DriverTitleChip"
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from "@/shared/ui/avatar"
import { Card, CardContent } from "@/shared/ui/card"

/**
 * Thẻ danh tính của khách, hiện ở mọi trang trong khu vực khách hàng.
 *
 * Trước đây chỗ này là HAI thẻ chồng nhau, và con số "Lượt chơi" nằm ở cả hai —
 * cùng một giá trị, in hai lần, cách nhau đúng một đường viền. Người đọc không
 * có cách nào biết đó là một hay là hai chỉ số khác nhau.
 *
 * Giờ gộp lại một thẻ, và mỗi chỉ số chỉ xuất hiện đúng một lần TRÊN TOÀN
 * TRANG — bốn con số dưới đây không lặp lại ở thẻ hồ sơ bên phải nữa.
 */
export function ProfileSidebar() {
  const user = useAuthStore((state) => state.user)
  const { data: passport } = useQuery({
    queryKey: racingQueryKeys.passport(),
    queryFn: () => racingApi.getMyPassport(),
    retry: false,
    staleTime: 60_000,
  })

  const fullName = user?.fullName ?? "--"
  const titleLabel = passport?.current_title.label ?? null

  return (
    <Card className="rounded-xl shadow-sm">
      <CardContent className="p-6">
        <div className="text-center">
          <Avatar className="mx-auto h-20 w-20">
            <AvatarImage src={user?.avatarUrl ?? undefined} />
            <AvatarFallback>{getInitials(fullName)}</AvatarFallback>
            {titleLabel ? (
              <AvatarBadge className="size-5 [&>svg]:size-3">
                <Trophy />
              </AvatarBadge>
            ) : null}
          </Avatar>

          <h2 className="mt-4 truncate text-lg font-semibold">{fullName}</h2>
          <p className="truncate text-sm text-muted-foreground">{user?.email ?? "--"}</p>

          {passport ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              @{passport.driver_handle}
            </p>
          ) : null}

          {titleLabel ? (
            <div className="mt-3 flex justify-center">
              <DriverTitleChip label={titleLabel} code={passport?.current_title.code} />
            </div>
          ) : null}
        </div>

        {/*
          Bốn chỉ số, mỗi cái một lần. Lưới 2×2 chứ không phải một hàng bốn cột:
          cột này rộng 300px, nhét bốn số ngang thì nhãn nào cũng bị bẻ hai dòng.
        */}
        {passport ? (
          <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-t pt-5">
            <Stat label="Lượt chơi" value={String(passport.stats.completed_plays)} />
            <Stat label="Quán đã đi" value={String(passport.stats.distinct_cafes_played)} />
            <Stat label="Danh hiệu" value={String(passport.achievements.length)} />
            <Stat label="Vòng nhanh nhất" value={formatLap(passport.stats.best_global_lap_ms)} />
          </dl>
        ) : null}
      </CardContent>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

function formatLap(value?: number | null) {
  if (value === null || value === undefined) return "--"
  return `${(value / 1000).toFixed(2)}s`
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(-2)
    .toUpperCase()
}
