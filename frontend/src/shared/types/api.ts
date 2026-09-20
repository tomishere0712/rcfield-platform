export type ApiError = {
  message: string
  code?: string
  fieldErrors?: Record<string, string[]>
}

export type PaginatedResponse<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
}
