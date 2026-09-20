import type { ReactNode } from "react"

export function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200/60 bg-slate-50/40 p-4">
      <p className="text-2xs font-bold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-extrabold text-slate-900">{value}</p>
    </div>
  )
}

export function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 font-semibold text-slate-900">{value}</p>
    </div>
  )
}

export function FactStrip({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
      <div className="flex size-9 items-center justify-center rounded-xl bg-white text-orange-600">
        {icon}
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
          {label}
        </p>
        <p className="text-sm font-extrabold text-slate-900">{value}</p>
      </div>
    </div>
  )
}

export function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm">
      <span className="font-semibold text-slate-500">{label}</span>
      <span className="font-extrabold text-slate-900">{value}</span>
    </div>
  )
}
