import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { BankTransferQrPanel, type PaymentSubject } from "./BankTransferQrPanel"
import type { BankTransferCheckout } from "@/features/booking/types/booking.types"

/**
 * Màn chờ chuyển khoản báo "đã nhận được thanh toán" khi nào.
 *
 * Cái bẫy: khoản phát sinh cuối phiên (gia hạn, đồ ăn tại quầy, đền bù) diễn ra
 * lúc đơn đặt ĐÃ rời khỏi PENDING từ lâu. Dùng chung cách nhận biết của tiền
 * đặt lịch — "đơn đã rời PENDING chưa" — thì điều kiện đúng ngay lần hỏi đầu,
 * và khách thấy báo thành công trước khi quét mã.
 *
 * Nói với khách rằng họ đã trả tiền trong khi chưa là hỏng nặng nhất ở đây:
 * họ đóng máy đi về, còn quán thì không nhận được đồng nào.
 */
vi.mock("@/features/booking/api/booking.api", () => ({
  bookingApi: {
    getBooking: vi.fn(),
    getPaymentTransaction: vi.fn(),
  },
}))
vi.mock("@/features/customer-packages/api/customer-package.api", () => ({
  customerPackageApi: { listMine: vi.fn().mockResolvedValue([]) },
}))
vi.mock("@/features/notifications/hooks/useWebSocket", () => ({
  useWebSocket: vi.fn(),
}))

const checkout: BankTransferCheckout = {
  qr_payload: "x",
  qr_image_data_url: "data:image/png;base64,AAA",
  ref_code: "RCFD1234",
  bank_name: "MB Bank",
  account_number: "0372899192",
  account_name: "QUAN RC",
  amount: 85000,
  expires_at: new Date(Date.now() + 20 * 60_000).toISOString(),
  is_sandbox: false,
}

function renderPanel(subject: PaymentSubject) {
  const onPaid = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <BankTransferQrPanel subject={subject} checkout={checkout} onPaid={onPaid} />
    </QueryClientProvider>,
  )
  return { onPaid }
}

beforeEach(() => vi.clearAllMocks())

describe("khoản phát sinh cuối phiên", () => {
  it("KHÔNG báo thành công chỉ vì đơn đã rời PENDING", async () => {
    const { bookingApi } = await import("@/features/booking/api/booking.api")
    // Đơn đã CONFIRMED — trạng thái bình thường lúc tất toán.
    vi.mocked(bookingApi.getBooking).mockResolvedValue({ status: "CONFIRMED" } as never)
    // Giao dịch vẫn đang chờ tiền về.
    vi.mocked(bookingApi.getPaymentTransaction).mockResolvedValue({ status: "PENDING" } as never)

    const { onPaid } = renderPanel({ kind: "settlement", bookingId: "b1", txnRef: "ctr_abc" })

    await waitFor(() => expect(bookingApi.getPaymentTransaction).toHaveBeenCalled())
    expect(onPaid).not.toHaveBeenCalled()
    expect(screen.queryByText(/Đã nhận được thanh toán/i)).toBeNull()
  })

  it("báo thành công khi GIAO DỊCH chuyển sang SUCCESS", async () => {
    const { bookingApi } = await import("@/features/booking/api/booking.api")
    vi.mocked(bookingApi.getBooking).mockResolvedValue({ status: "CONFIRMED" } as never)
    vi.mocked(bookingApi.getPaymentTransaction).mockResolvedValue({ status: "SUCCESS" } as never)

    const { onPaid } = renderPanel({ kind: "settlement", bookingId: "b1", txnRef: "ctr_abc" })

    await waitFor(() => expect(onPaid).toHaveBeenCalledTimes(1))
  })

  it("không hỏi trạng thái đơn — trạng thái đó không nói gì về khoản này", async () => {
    const { bookingApi } = await import("@/features/booking/api/booking.api")
    vi.mocked(bookingApi.getPaymentTransaction).mockResolvedValue({ status: "PENDING" } as never)

    renderPanel({ kind: "settlement", bookingId: "b1", txnRef: "ctr_abc" })

    await waitFor(() => expect(bookingApi.getPaymentTransaction).toHaveBeenCalled())
    expect(bookingApi.getBooking).not.toHaveBeenCalled()
  })
})

describe("tiền đặt lịch ban đầu giữ nguyên hành vi cũ", () => {
  it("đơn rời khỏi PENDING nghĩa là đã trả", async () => {
    const { bookingApi } = await import("@/features/booking/api/booking.api")
    vi.mocked(bookingApi.getBooking).mockResolvedValue({ status: "CONFIRMED" } as never)

    const { onPaid } = renderPanel({ kind: "booking", bookingId: "b1" })
    await waitFor(() => expect(onPaid).toHaveBeenCalledTimes(1))
  })

  it("đơn còn PENDING thì vẫn chờ", async () => {
    const { bookingApi } = await import("@/features/booking/api/booking.api")
    vi.mocked(bookingApi.getBooking).mockResolvedValue({ status: "PENDING" } as never)

    const { onPaid } = renderPanel({ kind: "booking", bookingId: "b1" })
    await waitFor(() => expect(bookingApi.getBooking).toHaveBeenCalled())
    expect(onPaid).not.toHaveBeenCalled()
  })
})
