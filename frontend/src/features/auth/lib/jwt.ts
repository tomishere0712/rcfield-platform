import type { UserRole } from "@/shared/types/common"

type BackendRole = "CUSTOMER" | "STAFF" | "PROVIDER" | "ADMIN"

type JwtAuthPayload = {
  userId?: string
  email?: string
  role?: unknown
}

const roleMap: Record<BackendRole, UserRole> = {
  CUSTOMER: "customer",
  STAFF: "staff",
  PROVIDER: "provider",
  ADMIN: "admin",
}

function isBackendRole(role: unknown): role is BackendRole {
  return role === "CUSTOMER" || role === "STAFF" || role === "PROVIDER" || role === "ADMIN"
}

export function mapBackendRole(role: unknown): UserRole | null {
  return isBackendRole(role) ? roleMap[role] : null
}

export function decodeJwtPayload(token: string): JwtAuthPayload | null {
  const payload = token.split(".")[1]
  if (!payload) return null

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=")
    return JSON.parse(window.atob(padded)) as JwtAuthPayload
  } catch {
    return null
  }
}

export function getAuthFromJwt(token: string) {
  const payload = decodeJwtPayload(token)
  const role = mapBackendRole(payload?.role)

  if (!payload || !role) {
    throw new Error("JWT role is missing or unsupported")
  }

  return {
    id: payload.userId ?? "",
    email: payload.email ?? "",
    role,
  }
}
