import {
  Camera,
  Coffee,
  Fan,
  Radio,
  Route,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Timer,
  Utensils,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react"

/**
 * Trường `icon` của tiện ích là một từ khoá ("timer", "tool", "road"...), không
 * phải emoji. Render thẳng nó ra sẽ hiện đúng chữ "timer" cạnh tên tiện ích —
 * đúng như đang thấy ở bộ lọc trang Khám phá. Bảng này dịch từ khoá sang icon.
 */
const ICON_BY_KEYWORD: Record<string, LucideIcon> = {
  timer: Timer,
  tool: Wrench,
  tools: Wrench,
  road: Route,
  track: Route,
  snow: Snowflake,
  ac: Snowflake,
  fan: Fan,
  coffee: Coffee,
  food: Utensils,
  camera: Camera,
  stream: Radio,
  wifi: Wifi,
  power: Zap,
  charge: Zap,
  safety: ShieldCheck,
}

/**
 * Icon của một tiện ích. Trả về phần tử chứ không trả về component, để nơi gọi
 * không phải gán component vào biến trong lúc render (React sẽ coi đó là một
 * component mới mỗi lần render và reset state của cây con).
 */
export function AmenityIcon({
  keyword,
  className,
}: {
  keyword: string | null | undefined
  className?: string
}) {
  const Icon: LucideIcon = keyword
    ? (ICON_BY_KEYWORD[keyword.trim().toLowerCase()] ?? Sparkles)
    : Sparkles

  return <Icon className={className} />
}
