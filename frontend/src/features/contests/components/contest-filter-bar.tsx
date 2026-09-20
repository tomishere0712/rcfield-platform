import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router"

import { cn } from "@/shared/lib/utils"
import { Input } from "@/shared/ui/input"

export interface ContestFilterOption {
  value: string
  label: string
}

export interface ContestFilterField {
  /** URL search param key, e.g. "status", "contest_format_id", "journey". */
  param: string
  options: ContestFilterOption[]
  /** Label of the "no filter" option. */
  allLabel: string
  /** Value treated as "no filter" and removed from the URL. Defaults to "". */
  allValue?: string
}

interface ContestFilterBarProps {
  fields?: ContestFilterField[]
  /** Search param key for the keyword input. Defaults to "query". */
  searchParam?: string
  searchPlaceholder?: string
  /** Debounce delay for the keyword input, in ms. Defaults to 400. */
  debounceMs?: number
  className?: string
  inputClassName?: string
  selectClassName?: string
}

/**
 * BE-first filter bar: every change is synced to URL search params so the
 * caller can feed them straight into its list query (queryKey + queryFn).
 */
export function ContestFilterBar({
  fields = [],
  searchParam = "query",
  searchPlaceholder = "Tìm kiếm...",
  debounceMs = 400,
  className,
  inputClassName,
  selectClassName,
}: ContestFilterBarProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const paramKeyword = searchParams.get(searchParam) ?? ""
  const [keyword, setKeyword] = useState(paramKeyword)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep the local keyword in sync when the URL changes from elsewhere.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync local input with external URL param
    setKeyword(paramKeyword)
  }, [paramKeyword])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const applyUpdates = (
    updates: Record<string, string>,
    allValues: Record<string, string>,
  ) => {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === allValues[key]) next.delete(key)
      else next.set(key, value)
    }
    next.delete("page")
    setSearchParams(next)
  }

  const handleKeywordChange = (value: string) => {
    setKeyword(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      applyUpdates({ [searchParam]: value }, {})
    }, debounceMs)
  }

  return (
    <div
      data-slot="contest-filter-bar"
      className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}
    >
      <Input
        value={keyword}
        onChange={(event) => handleKeywordChange(event.target.value)}
        placeholder={searchPlaceholder}
        className={cn("h-10", inputClassName)}
      />
      {fields.map((field) => {
        const allValue = field.allValue ?? ""
        return (
          <select
            key={field.param}
            value={searchParams.get(field.param) ?? allValue}
            onChange={(event) =>
              applyUpdates(
                { [field.param]: event.target.value },
                { [field.param]: allValue },
              )
            }
            className={cn(
              "h-10 rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
              selectClassName,
            )}
          >
            <option value={allValue}>{field.allLabel}</option>
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )
      })}
    </div>
  )
}
