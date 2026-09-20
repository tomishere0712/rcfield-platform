/**
 * Stored notifications outlive frontend releases. Normalize historic route
 * values first, then only navigate to routes known to exist in this client.
 */
export function resolveNotificationRoute(rawRoute: unknown): string | null {
  if (typeof rawRoute !== "string" || !rawRoute.startsWith("/")) return null

  const route = normalizeLegacyNotificationRoute(rawRoute)
  const pathname = route.split(/[?#]/, 1)[0]

  const isKnownRoute = [
    /^\/booking\/[^/?#]+$/,
    /^\/customer\/bookings(?:\/[^/?#]+)?$/,
    /^\/customer\/inspections\/[^/?#]+$/,
    /^\/customer\/extension-response\/[^/?#]+$/,
    /^\/customer\/sessions\/[^/?#]+$/,
    /^\/staff\/sessions\/[^/?#]+$/,
    /^\/staff\/bookings\/[^/?#]+$/,
    /^\/staff\/(?:fnb-orders|maintenance|today-bookings)$/,
    /^\/provider\/(?:dashboard|vehicles|bookings|subscriptions|revenue|reconciliation)$/,
    /^\/provider\/cafes\/[^/?#]+(?:\/[^/?#]+)?$/,
    /^\/payment\/bank-transfer\/[^/?#]+$/,
    /^\/contests\/[^/?#]+$/,
    /^\/provider\/contests\/[^/?#]+\/overview$/,
    /^\/staff\/contests\/[^/?#]+\/check-in$/,
  ].some((pattern) => pattern.test(pathname))

  return isKnownRoute ? route : null
}

function normalizeLegacyNotificationRoute(route: string): string {
  const reviewMatch = route.match(/^\/customer\/review\/([^/?#]+)(?:[?#].*)?$/)
  if (reviewMatch) {
    return `/customer/bookings?reviewBookingId=${encodeURIComponent(reviewMatch[1])}`
  }

  const extensionMatch = route.match(/^\/customer\/extension\/([^/?#]+)([?#].*)?$/)
  if (extensionMatch) {
    return `/customer/extension-response/${extensionMatch[1]}${extensionMatch[2] ?? ""}`
  }

  const staffSessionMatch = route.match(/^\/staff\/session\/([^/?#]+)([?#].*)?$/)
  if (staffSessionMatch) {
    return `/staff/sessions/${staffSessionMatch[1]}${staffSessionMatch[2] ?? ""}`
  }

  if (route === "/staff/bookings") return "/staff/today-bookings"
  if (route === "/provider/cafe-vehicles") return "/provider/vehicles"
  return route
}
