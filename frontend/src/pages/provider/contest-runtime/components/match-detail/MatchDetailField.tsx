import { Label } from "@/shared/ui/label"

export function MatchDetailField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <Label className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#747878]">
        {label}
      </Label>
      {children}
    </div>
  )
}
