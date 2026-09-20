import { Trophy } from "lucide-react"

import { cn } from "@/shared/lib/utils"
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from "@/shared/ui/avatar"

import { DriverTitleChip } from "./DriverTitleChip"

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

/**
 * Composite nhận diện tay đua: avatar (+ badge cúp khi có danh hiệu) + tên +
 * DriverTitleChip + handle. Dùng chung cho leaderboard, cafe top drivers, profile.
 */
export function DriverIdentity({
  name,
  avatarUrl,
  titleLabel,
  titleCode,
  handle,
  size = "md",
  className,
}: {
  name: string
  avatarUrl?: string | null
  titleLabel?: string | null
  titleCode?: string | null
  handle?: string | null
  size?: "sm" | "md"
  className?: string
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <Avatar size={size === "sm" ? "sm" : "default"}>
        {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
        <AvatarFallback>{getInitials(name) || "RC"}</AvatarFallback>
        {titleLabel ? (
          <AvatarBadge>
            <Trophy />
          </AvatarBadge>
        ) : null}
      </Avatar>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p
            className={cn(
              "truncate font-semibold text-foreground",
              size === "sm" ? "text-sm" : "text-base",
            )}
          >
            {name}
          </p>
          <DriverTitleChip label={titleLabel} code={titleCode} />
        </div>
        {handle ? (
          <p className="truncate text-xs text-muted-foreground">@{handle}</p>
        ) : null}
      </div>
    </div>
  )
}
