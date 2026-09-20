import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { PaymentResultPage } from "./PaymentResultPage"

/**
 * Trang kết quả thanh toán vốn viết cho đơn đặt sân, rồi được dùng chung cho
 * mọi luồng tiền. Với phí dự thi thì lời lẽ cũ vừa lạc chỗ vừa SAI SỰ THẬT:
 * máy chủ huỷ đăng ký ngay khi khách bấm huỷ ở cổng (VNPay mã 24), trong khi
 * trang lại hứa "đơn vẫn được giữ chỗ".
 *
 * Nội dung lệch với hành vi thật còn tệ hơn nội dung xấu — khách tin là suất
 * còn đó nên không đăng ký lại, rồi mất chỗ thật.
 */
vi.mock("@/features/booking/api/booking.api", () => ({
  bookingApi: {
    getPaymentTransaction: vi.fn().mockRejectedValue(new Error("offline")),
    getBooking: vi.fn().mockRejectedValue(new Error("offline")),
    createCheckout: vi.fn(),
  },
}))

function renderAt(search: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/payment/result${search}`]}>
        <PaymentResultPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const CONTEST_REF = "contest_f8bfe738595f40d1a6_7504"
const BOOKING_REF = "abcdef0123456789abcdef0123456789"

describe("PaymentResultPage — phí dự thi", () => {
  it("khách tự huỷ thì nói rõ đăng ký đã bị huỷ, phải đăng ký lại", () => {
    renderAt(`?status=failed&txn_ref=${CONTEST_REF}&response_code=24`)

    expect(screen.getByText(/Đã huỷ đăng ký dự giải/)).toBeInTheDocument()
    expect(screen.getByText(/đăng ký lại từ đầu/i)).toBeInTheDocument()
    // Câu hứa của luồng đặt sân KHÔNG được xuất hiện — nó trái với việc máy chủ
    // vừa huỷ đăng ký.
    expect(screen.queryByText(/vẫn được giữ chỗ/i)).toBeNull()
  })

  it("lỗi ngoài ý muốn thì nói đăng ký vẫn còn, mời trả lại", () => {
    renderAt(`?status=failed&txn_ref=${CONTEST_REF}&response_code=75`)

    expect(screen.getByText(/Chưa thanh toán được phí dự thi/)).toBeInTheDocument()
    expect(screen.getByText(/vẫn được giữ/i)).toBeInTheDocument()
    expect(screen.queryByText(/đăng ký lại từ đầu/i)).toBeNull()
  })

  it("không mời đặt lịch mới hay xem đơn đặt — đây không phải đơn đặt sân", () => {
    renderAt(`?status=failed&txn_ref=${CONTEST_REF}&response_code=24`)

    expect(screen.queryByText(/Đặt lịch mới/)).toBeNull()
    expect(screen.queryByText(/Danh sách đơn đặt/)).toBeNull()
    expect(screen.getByText(/Đăng ký dự giải của tôi/)).toBeInTheDocument()
  })
})

describe("PaymentResultPage — đơn đặt sân giữ nguyên hành vi cũ", () => {
  it("vẫn nói giữ chỗ và vẫn mời đặt lịch mới", () => {
    renderAt(`?status=failed&txn_ref=${BOOKING_REF}&response_code=24`)

    expect(screen.getByText(/Thanh toán chưa hoàn tất/)).toBeInTheDocument()
    expect(screen.getByText(/vẫn được giữ chỗ/i)).toBeInTheDocument()
    expect(screen.queryByText(/đăng ký dự giải/i)).toBeNull()
  })
})

describe("PaymentResultPage — phí dự thi thanh toán thành công", () => {
  it("đối chiếu được giao dịch thì hiện biên nhận, không kẹt ở 'đang xác thực'", async () => {
    // Trước đây endpoint tra cứu chặn mọi giao dịch không gắn đơn đặt, nên phí
    // dự thi luôn rơi vào "Chưa thể xác thực thanh toán" dù tiền đã vào.
    const { bookingApi } = await import("@/features/booking/api/booking.api")
    vi.mocked(bookingApi.getPaymentTransaction).mockResolvedValueOnce({
      bookingId: null,
      amount: 150000,
      status: "SUCCESS",
      gateway: "VNPAY",
      type: "PAYMENT",
      additionalPayment: false,
      components: [{ type: "CONTEST_ENTRY_FEE", amount: 150000 }],
      createdAt: new Date().toISOString(),
      paidAt: new Date().toISOString(),
    } as never)

    renderAt(`?status=success&txn_ref=${CONTEST_REF}`)

    expect(await screen.findByText(/Đã thanh toán phí dự thi/)).toBeInTheDocument()
    expect(screen.getByText(/Phí tham gia giải đấu/)).toBeInTheDocument()
    expect(screen.queryByText(/Chưa thể xác thực/)).toBeNull()
  })
})
