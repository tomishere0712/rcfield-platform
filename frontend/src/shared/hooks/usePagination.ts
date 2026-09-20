import { useState } from "react"

export function usePagination(initialPage = 1, initialPageSize = 10) {
  const [page, setPage] = useState(initialPage)
  const [pageSize, setPageSize] = useState(initialPageSize)

  return { page, setPage, pageSize, setPageSize }
}
