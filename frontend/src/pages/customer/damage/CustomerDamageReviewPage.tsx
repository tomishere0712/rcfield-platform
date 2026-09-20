import { Navigate } from "react-router"
import { routePaths } from "@/app/router/route-paths"

export function CustomerDamageReviewPage() {
  return <Navigate to={routePaths.customerBookings} replace />
}
