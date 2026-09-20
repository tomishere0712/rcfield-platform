import { ProviderPageHeader } from "@/pages/provider/components/ProviderPrimitives"
import { ProviderShell } from "@/pages/provider/components/ProviderShell"
import { GuideCenter } from "@/pages/guides/GuideCenter"

export function ProviderHelpPage() {
  return (
    <ProviderShell>
      <ProviderPageHeader
        title="Trợ giúp"
        description="Hướng dẫn thiết lập, vận hành và phát triển cơ sở của bạn."
      />
      <GuideCenter role="provider" />
    </ProviderShell>
  )
}
