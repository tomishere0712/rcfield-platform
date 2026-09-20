import { useEffect } from "react"
import { useNavigate } from "react-router"

export function ProviderSessionsPage() {
  const navigate = useNavigate()
  useEffect(() => {
    navigate("/provider/bookings?tab=sessions", { replace: true })
  }, [navigate])
  return null
}
