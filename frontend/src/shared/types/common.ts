export type UserRole = "customer" | "staff" | "provider" | "admin"

export type BaseEntity = {
  id: string
  createdAt: string
  updatedAt: string
}
