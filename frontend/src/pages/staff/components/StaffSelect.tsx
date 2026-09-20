interface StaffSelectOption {
  value: string
  label: string
}

interface StaffSelectProps {
  value: string
  onChange: (value: string) => void
  options: StaffSelectOption[]
  placeholder?: string
  className?: string
}

export function StaffSelect({
  value,
  onChange,
  options,
  placeholder = "Chọn...",
  className = "",
}: StaffSelectProps) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`h-10 w-full rounded-lg border border-[#d9d5d4] bg-white px-3 text-sm focus:border-[#ea580c] focus:outline-none focus:ring-1 focus:ring-[#ea580c] ${className}`}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
