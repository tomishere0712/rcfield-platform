interface ApiErrorLike {
  response?: {
    data?: {
      message?: string
    }
  }
  message?: string
}

export function getContestErrorMessage(error: unknown, fallback: string) {
  const maybeError = error as ApiErrorLike
  return maybeError.response?.data?.message || maybeError.message || fallback
}
