import { useMemo, useState } from "react"
import type { ContestRegistration } from "@/features/contests/types"
import { getRegistrationDisplayName } from "@/features/contests/lib/contest-runtime"

export function useRegistrationFilters(registrations: ContestRegistration[]) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | ContestRegistration["status"]
  >("ALL")
  const [paymentFilter, setPaymentFilter] = useState<
    "ALL" | ContestRegistration["paymentStatus"]
  >("ALL")

  const filteredRegistrations = useMemo(() => {
    const normalized = search.trim().toLowerCase()
    return registrations.filter((registration) => {
      const matchesSearch =
        normalized.length === 0 ||
        registration.id.toLowerCase().includes(normalized) ||
        (registration.checkInCode ?? "").toLowerCase().includes(normalized) ||
        getRegistrationDisplayName(registration)
          .toLowerCase()
          .includes(normalized) ||
        (registration.participant?.email ?? "")
          .toLowerCase()
          .includes(normalized)
      const matchesStatus =
        statusFilter === "ALL" || registration.status === statusFilter
      const matchesPayment =
        paymentFilter === "ALL" || registration.paymentStatus === paymentFilter
      return matchesSearch && matchesStatus && matchesPayment
    })
  }, [paymentFilter, registrations, search, statusFilter])

  const summary = useMemo(
    () => ({
      total: registrations.length,
      pending: registrations.filter((item) => item.status === "PENDING").length,
      confirmed: registrations.filter((item) => item.status === "CONFIRMED")
        .length,
      checkedIn: registrations.filter((item) => item.status === "CHECKED_IN")
        .length,
      revenue: {
        expected: registrations
          .filter((item) => item.status !== "CANCELLED")
          .reduce((sum, item) => sum + (item.entryFeeAmount ?? 0), 0),
        paid: registrations
          .filter((item) => item.paymentStatus === "MARKED_PAID")
          .reduce((sum, item) => sum + (item.entryFeeAmount ?? 0), 0),
        pending: registrations
          .filter((item) =>
            ["PENDING_PAYMENT", "PENDING_REVIEW"].includes(item.paymentStatus),
          )
          .reduce((sum, item) => sum + (item.entryFeeAmount ?? 0), 0),
        waived: registrations
          .filter((item) => item.paymentStatus === "WAIVED")
          .reduce((sum, item) => sum + (item.entryFeeAmount ?? 0), 0),
      },
    }),
    [registrations],
  )

  return {
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    paymentFilter,
    setPaymentFilter,
    filteredRegistrations,
    summary,
  }
}
