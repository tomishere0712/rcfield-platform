import { ProviderPageHeader } from "@/pages/provider/components/ProviderPrimitives"
import { ProviderShell } from "@/pages/provider/components/ProviderShell"

export function ChannelSettingsPage() {
  return (
    <ProviderShell>
      <ProviderPageHeader
        title="Kênh Messenger"
        description="Vào từng cơ sở để cấu hình kết nối Facebook Page riêng cho từng chi nhánh."
      />
    </ProviderShell>
  )
}
