import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

import { CafeVehiclesSection } from "./CafeVehiclesSection"
import type { Cafe, Vehicle } from "@/shared/data/explore-data"

/**
 * Danh sách xe kéo dài trang là vấn đề thật khi quán có nhiều xe: các mục sau
 * nó — gói slot, đặt đồ ăn — bị đẩy xuống ngoài tầm mắt và người dùng không
 * biết là có.
 *
 * Cái bẫy khi gấp danh sách lại: xe đang chọn nằm ở phần bị giấu thì lựa chọn
 * biến mất khỏi màn hình trong khi vẫn đang được tính tiền ở khung bên phải.
 */
function makeVehicle(i: number): Vehicle {
  return {
    id: `xe-${i}`,
    name: `Mẫu xe ${i}`,
    type: "Đường nhựa (Asphalt)",
    scale: "1/10",
    image: "",
    pricePerHour: 30000,
    status: "available",
    specs: { battery: "2S LiPo", motor: "Brushless 2500KV", brand: "Traxxas" },
  } as Vehicle
}

function renderSection(count: number, selectedVehicleId?: string) {
  const cafe = { availableVehicles: Array.from({ length: count }, (_, i) => makeVehicle(i)) } as Cafe
  const onSelect = vi.fn()
  render(
    <CafeVehiclesSection
      cafe={cafe}
      selectedVehicleId={selectedVehicleId}
      onSelectVehicle={onSelect}
    />,
  )
  return { onSelect }
}

const shownNames = () => screen.queryAllByText(/^Mẫu xe \d+$/).map((el) => el.textContent)

describe("CafeVehiclesSection", () => {
  it("ít xe thì hiện hết, không có nút thừa", () => {
    renderSection(4)
    expect(shownNames()).toHaveLength(4)
    expect(screen.queryByText(/Xem thêm/)).toBeNull()
  })

  it("giấu đúng một chiếc thì KHÔNG gấp — nút chiếm chỗ ngang hàng nó vừa giấu", () => {
    renderSection(6)
    expect(shownNames()).toHaveLength(6)
    expect(screen.queryByText(/Xem thêm/)).toBeNull()
  })

  it("nhiều xe thì chỉ hiện 5 mẫu đầu và nói rõ còn bao nhiêu", () => {
    renderSection(12)
    expect(shownNames()).toHaveLength(5)
    expect(screen.getByText(/Xem thêm 7 mẫu xe/)).toBeInTheDocument()
  })

  it("bấm xem thêm thì hiện hết, bấm lại thì thu gọn", () => {
    renderSection(12)
    fireEvent.click(screen.getByText(/Xem thêm 7 mẫu xe/))
    expect(shownNames()).toHaveLength(12)

    fireEvent.click(screen.getByText(/Thu gọn danh sách/))
    expect(shownNames()).toHaveLength(5)
  })

  it("xe đang chọn ở phần bị giấu vẫn phải thấy được", () => {
    // Không kéo lên thì người dùng mở rộng, chọn mẫu cuối, thu gọn lại — và xe
    // họ chọn biến mất khỏi màn hình dù tiền vẫn đang được tính.
    renderSection(12, "xe-11")
    const names = shownNames()
    expect(names).toHaveLength(5)
    expect(names[0]).toBe("Mẫu xe 11")
  })

  it("chưa có xe nào thì báo rõ thay vì để trống", () => {
    renderSection(0)
    expect(screen.getByText(/chưa công khai dữ liệu xe thuê/i)).toBeInTheDocument()
  })
})
