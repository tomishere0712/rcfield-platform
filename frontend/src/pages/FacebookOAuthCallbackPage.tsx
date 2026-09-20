import { useEffect } from "react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"
import { useNavigate } from "react-router"
import { routePaths } from "@/app/router/route-paths"

export function FacebookOAuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    const status = searchParams.get("status")

    if (status === "connected") {
      toast.success("Kết nối Facebook thành công")
    } else if (status === "cancelled") {
      toast.info("Kết nối đã bị huỷ")
    } else {
      toast.error("Kết nối thất bại, vui lòng thử lại.")
    }

    void navigate(routePaths.providerChannels, { replace: true })
  }, [searchParams, navigate])

  return null
}
