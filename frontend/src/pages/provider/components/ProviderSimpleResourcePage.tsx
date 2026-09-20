import type { ReactNode } from "react"
import { Plus, Sparkles } from "lucide-react"

import { MetricCard, Panel, PanelTitle, ProviderPageHeader, ProviderTable } from "@/pages/provider/components/ProviderPrimitives"
import { ProviderShell } from "@/pages/provider/components/ProviderShell"
import { Button } from "@/shared/ui/button"

export function ProviderSimpleResourcePage({
  title,
  description,
  metrics,
  columns,
  rows,
}: {
  title: string
  description: string
  metrics: Array<[string, string, string]>
  columns: string[]
  rows: Array<Array<ReactNode>>
}) {
  return (
    <ProviderShell>
      <ProviderPageHeader title={title} description={description} />
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {metrics.map(([label, value, helper]) => (
          <MetricCard key={label} label={label} value={value} helper={helper} icon={<Sparkles />} tone="neutral" />
        ))}
      </section>
      <Panel className="mt-4">
        <PanelTitle
          title="Danh sách"
          subtitle={description}
          action={
            <Button className="h-10 gap-2 rounded-lg bg-[#1c1b1b] text-white hover:bg-[#313030]">
              <Plus className="size-4" />
              Tạo mới
            </Button>
          }
        />
        <ProviderTable columns={columns} rows={rows} />
      </Panel>
    </ProviderShell>
  )
}
