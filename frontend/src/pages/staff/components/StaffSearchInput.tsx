import { Search } from "lucide-react"

interface StaffSearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function StaffSearchInput({
  value,
  onChange,
  placeholder = "Tìm kiếm...",
  className = "",
}: StaffSearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3 top-3 size-4 text-[#747878]" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-[#d9d5d4] bg-white px-3 pl-9 text-sm focus:border-[#ea580c] focus:outline-none focus:ring-1 focus:ring-[#ea580c]"
      />
    </div>
  )
}
