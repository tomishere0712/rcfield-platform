import { useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { channelApi } from "../api/channel.api"

interface Props {
  cafeId: string
  returnPath?: string
}

export function FacebookConnectButton({ cafeId, returnPath }: Props) {
  const [loading, setLoading] = useState(false)

  const handleConnect = async () => {
    setLoading(true)
    try {
      const { url } = await channelApi.getAuthUrl(cafeId, returnPath)
      window.location.href = url
    } catch {
      toast.error("Không thể kết nối Facebook", { description: "Vui lòng thử lại sau." })
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleConnect}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-lg bg-[#1877F2] px-4 py-2 text-sm font-medium text-white hover:bg-[#166FE5] disabled:opacity-60"
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <svg className="size-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.268h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
        </svg>
      )}
      Kết nối với Facebook
    </button>
  )
}
