import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

import { BookingVehiclePicker } from "./BookingVehiclePicker"
import type { Vehicle } from "@/shared/data/explore-data"

/**
 * Lưới xe trong luồng đặt lịch.
 *
 * Quán nhiều xe thì lưới đẩy nút đặt lịch xuống dưới tầm mắt. Gấp lại thì phải
 * giữ được xe đang chọn trong tầm nhìn — người dùng thu gọn xong mà mất dấu
 * chiếc mình vừa chọn là mất lòng tin vào cả bước thanh toán.
 */
function makeVehicle(i: number, status: Vehicle["status"] = "available"): Vehicle {
  return {
    id: `xe-${i}`,
    name: `Mẫu xe ${i}`,
    type: "Đường nhựa",
    scale: "1/10",
    image: "",
    pricePerHour: 30000,
    status,
    specs: { battery: "2S LiPo", motor: "Brushless", brand: "Traxxas" },
  } as Vehicle
}

function renderPicker(count: number, selectedId?: string) {
  const onSelect = vi.fn()
  render(
    <BookingVehiclePicker
      vehicles={Array.from({ length: count }, (_, i) => makeVehicle(i))}
      selectedId={selectedId}
      onSelect={onSelect}
    />,
  )
  return { onSelect }
}

const shown = () => screen.queryAllByText(/^Mẫu xe \d+$/).map((el) => el.textContent)

describe("BookingVehiclePicker", () => {
  it("không có xe thì không dựng gì cả", () => {
    const { container } = render(
      <BookingVehiclePicker vehicles={[]} onSelect={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("vừa đủ hai hàng thì hiện hết", () => {
    renderPicker(6)
    expect(shown()).toHaveLength(6)
    expect(screen.queryByText(/Xem thêm/)).toBeNull()
  })

  it("thẻ thứ bảy mở ra cả một hàng mới nên gấp ngay từ 7", () => {
    renderPicker(7)
    expect(shown()).toHaveLength(6)
    expect(screen.getByText(/Xem thêm 1 mẫu xe/)).toBeInTheDocument()
  })

  it("mở rộng rồi thu gọn trả về đúng hai hàng", () => {
    renderPicker(15)
    fireEvent.click(screen.getByText(/Xem thêm 9 mẫu xe/))
    expect(shown()).toHaveLength(15)
    fireEvent.click(screen.getByText(/Thu gọn/))
    expect(shown()).toHaveLength(6)
  })

  it("xe đang chọn ở phần bị giấu vẫn phải thấy được", () => {
    renderPicker(15, "xe-14")
    const names = shown()
    expect(names).toHaveLength(6)
    expect(names[0]).toBe("Mẫu xe 14")
  })

  it("bấm vào một mẫu thì báo đúng mã xe ra ngoài", () => {
    const { onSelect } = renderPicker(3)
    fireEvent.click(screen.getByText("Mẫu xe 1"))
    expect(onSelect).toHaveBeenCalledWith("xe-1")
  })
})
