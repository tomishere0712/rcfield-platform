import type { Cafe } from "@/shared/data/explore-data"

export type CafeGalleryImage = {
  id: string
  src: string
  alt: string
  type: "track" | "interior" | "vehicle" | "exterior"
}

/** Mở rộng Cafe detail để có nhiều ảnh gallery như khách sạn */
export type CafeDetail = Omit<Cafe, "amenities"> & {
  gallery: CafeGalleryImage[]
  operatingHours: string
  cancellationPolicy: string
  trackDescription: string
  amenities: string[]
}

export const mockCafeDetail: CafeDetail = {
  id: "cafe-1",
  name: "Drift Town Sài Gòn",
  slug: "drift-town-sai-gon",
  rating: 4.9,
  reviewsCount: 124,
  address: "Số 24 Đường 11, Phường Tân Hưng, Quận 7",
  district: "Quận 7",
  city: "Hồ Chí Minh",
  image: "https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&q=80&w=800",
  priceRange: "80k - 250k / giờ",
  trackTypes: ["Drift Pro", "Touring"],
  features: ["Serious Inspection", "Đồ ăn & Nước uống", "Pit Lane chuyên nghiệp", "Hệ thống Đèn đêm"],
  description: "Đường chạy epoxy trong nhà dành cho drift RC, có khu cafe quan sát, pit lane và đội xe thuê sẵn sàng cho người mới.",
  coordinates: { x: 35, y: 65 },
  availableVehicles: [
    {
      id: "veh-101",
      name: "Mazda RX-7 FD3S Drift Spec",
      scale: "1:10",
      type: "Drift Spec",
      image: "https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&q=80&w=300",
      pricePerHour: 150000,
      status: "available",
      specs: { battery: "2S Lipo 5000mAh", motor: "Brushless 13.5T", brand: "Yokomo YD-2" },
    },
    {
      id: "veh-102",
      name: "Nissan GT-R R35 Red Flame",
      scale: "1:10",
      type: "Drift Spec",
      image: "https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&q=80&w=300",
      pricePerHour: 150000,
      status: "available",
      specs: { battery: "2S Lipo 4500mAh", motor: "Brushless 10.5T", brand: "MST RMX 2.0" },
    },
    {
      id: "veh-103",
      name: "Toyota AE86 Trueno Retro",
      scale: "1:10",
      type: "Drift Spec",
      image: "https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&q=80&w=300",
      pricePerHour: 120000,
      status: "rented",
      specs: { battery: "2S Lipo 4000mAh", motor: "Brushed 27T", brand: "Tamiya TT-02D" },
    },
  ],
  gallery: [
    { id: "g1", src: "https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&q=80&w=800", alt: "Đường đua Drift Pro", type: "track" },
    { id: "g2", src: "https://images.unsplash.com/photo-1531384441138-2736e62e0919?auto=format&fit=crop&q=80&w=800", alt: "Khu vực Pit Lane", type: "track" },
    { id: "g3", src: "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&q=80&w=800", alt: "Khu cafe quan sát", type: "interior" },
    { id: "g4", src: "https://images.unsplash.com/photo-1594787318286-3d835c1d207f?auto=format&fit=crop&q=80&w=800", alt: "Xe Drift RC", type: "vehicle" },
    { id: "g5", src: "https://images.unsplash.com/photo-1531384441138-2736e62e0919?auto=format&fit=crop&q=80&w=800", alt: "Bảng điều khiển đèn đêm", type: "exterior" },
    { id: "g6", src: "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&q=80&w=800", alt: "Khu kỹ thuật", type: "interior" },
  ],
  operatingHours: "09:00 - 22:00 • T2-CN",
  cancellationPolicy: "Hủy miễn phí trước 4 giờ. Sau đó mất 50% phí slot.",
  trackDescription: "Đường đua epoxy 300m² trong nhà, phù hợp drift RC tỉ lệ 1:10 và touring. Có hệ thống đèn đêm, barrier an toàn và khu vực quan sát VIP.",
  amenities: ["WiFi", "Điều hòa", "Chỗ đậu xe", "Đồ uống", "Cho thuê xe", "Pit Lane", "Kỹ thuật hỗ trợ", "Tổ chức giải"],
}
