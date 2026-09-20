import { z } from "zod"

export const idSchema = z.string().min(1)
export const uuidSchema = z.string().uuid()
