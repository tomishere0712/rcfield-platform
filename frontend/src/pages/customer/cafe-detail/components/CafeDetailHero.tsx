import { useMemo, useState, useEffect } from "react"
import { CarFront, Clock3, Heart, MapPin, Share2, Star } from "lucide-react"
import { toast } from "sonner"
import type { Cafe } from "@/shared/data/explore-data"
import { cn } from "@/shared/lib/utils"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { favoriteApi } from "@/features/explore/api/favorite.api"
import { CAFE_PLACEHOLDER_IMAGE } from "@/features/cafes/lib/cafe.mappers"

/** Mặc định ổn định — viết `= []` ngay trong tham số sẽ tạo mảng mới mỗi lần
 *  render và làm `useMemo` tính lại album liên tục. */
const NO_IMAGES: string[] = []

export function CafeDetailHero({
  cafe,
  trackImages = NO_IMAGES,
}: {
  cafe: Cafe
  /** Ảnh chụp từng loại sân — cũng là ảnh của chính cơ sở, xem `images` bên dưới. */
  trackImages?: string[]
}) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [isFavorite, setIsFavorite] = useState(() => {
    try {
      const favs = localStorage.getItem("rcfield_favorite_cafes")
      const list = favs ? JSON.parse(favs) : []
      return Array.isArray(list) && list.includes(cafe.id)
    } catch {
      return false
    }
  })

  useEffect(() => {
    const loadFav = async () => {
      let localFavs: string[] = []
      try {
        const favsStr = localStorage.getItem("rcfield_favorite_cafes")
        if (favsStr) {
          const parsed = JSON.parse(favsStr)
          if (Array.isArray(parsed)) localFavs = parsed
        }
      } catch (e) {
        console.warn("Failed to parse local favorites", e)
      }

      if (isAuthenticated) {
        try {
          const isSynced = localStorage.getItem("rcfield_favorites_synced") === "true"
          let latestFavs = localFavs
          if (!isSynced) {
            latestFavs = await favoriteApi.syncFavorites(localFavs)
            localStorage.setItem("rcfield_favorites_synced", "true")
          } else {
            latestFavs = await favoriteApi.getFavorites()
          }
          localStorage.setItem("rcfield_favorite_cafes", JSON.stringify(latestFavs))
          setIsFavorite(latestFavs.includes(cafe.id))
        } catch (e) {
          console.error("Failed to load favorites from backend", e)
          setIsFavorite(localFavs.includes(cafe.id))
        }
      } else {
        localStorage.removeItem("rcfield_favorites_synced")
        setIsFavorite(localFavs.includes(cafe.id))
      }
    }

    loadFav()
  }, [isAuthenticated, cafe.id])

  const toggleFavorite = async () => {
    try {
      const favs = localStorage.getItem("rcfield_favorite_cafes")
      let list: string[] = favs ? JSON.parse(favs) : []
      if (!Array.isArray(list)) list = []

      const isFav = list.includes(cafe.id)
      let updatedList = [...list]

      if (isFav) {
        updatedList = updatedList.filter((id) => id !== cafe.id)
        setIsFavorite(false)
        toast.success("Đã xóa khỏi danh sách yêu thích")
        if (isAuthenticated) {
          await favoriteApi.removeFavorite(cafe.id)
        }
      } else {
        updatedList.push(cafe.id)
        setIsFavorite(true)
        toast.success("Đã thêm vào danh sách yêu thích")
        if (isAuthenticated) {
          await favoriteApi.addFavorite(cafe.id)
        }
      }
      localStorage.setItem("rcfield_favorite_cafes", JSON.stringify(updatedList))
    } catch (error) {
      console.error("Failed to toggle favorite:", error)
      // Rollback
      try {
        const favs = localStorage.getItem("rcfield_favorite_cafes")
        const list = favs ? JSON.parse(favs) : []
        setIsFavorite(Array.isArray(list) && list.includes(cafe.id))
      } catch {
        // ignore
      }
    }
  }

  const handleShare = async () => {
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({ title: cafe.name, url })
      } catch {
        // user cancelled — do nothing
      }
    } else {
      await navigator.clipboard.writeText(url)
      toast.success("Đã sao chép link chi nhánh")
    }
  }

  /**
   * Album gồm ảnh cơ sở + ảnh từng loại sân — cả hai đều là ảnh chụp tại chỗ.
   *
   * KHÔNG lấy ảnh của các mẫu xe cho thuê: phần lớn là ảnh sản phẩm chụp trên nền
   * trắng, trộn vào làm album "cơ sở" trông như trang bán hàng, mà xe đã có mục
   * riêng bên dưới. Ảnh placeholder cũng bị loại, chỉ giữ lại khi không còn gì khác.
   */
  const images = useMemo(() => {
    const real = dedupeImages([
      cafe.image,
      ...(cafe.images ?? []),
      ...trackImages,
    ]).filter((image) => image !== CAFE_PLACEHOLDER_IMAGE)
    return real.length > 0 ? real : [CAFE_PLACEHOLDER_IMAGE]
  }, [cafe.image, cafe.images, trackImages])

  const targetFirstImage = images[0]
  const [activeImage, setActiveImage] = useState(targetFirstImage)
  const [prevFirstImage, setPrevFirstImage] = useState(targetFirstImage)

  if (targetFirstImage !== prevFirstImage) {
    setPrevFirstImage(targetFirstImage)
    setActiveImage(targetFirstImage)
  }

  const slotLabel = formatSlotDuration(cafe.slotDurationMinutes)

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {cafe.trackTypes.map((track) => (
              <Badge key={track} variant="secondary" className="rounded-full px-2.5 py-1 text-xs">
                {track}
              </Badge>
            ))}
          </div>
          <h1 className="mt-2.5 text-3xl font-black tracking-tight text-slate-950 md:text-4xl">
            {cafe.name}
          </h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-600">
            <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {cafe.address}</span>
            <span className="flex items-center gap-1.5 font-semibold text-amber-600">
              <Star className="h-4 w-4 fill-amber-500" /> {cafe.rating} ({cafe.reviewsCount} đánh giá)
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="outline" size="icon" className="rounded-full" onClick={() => void handleShare()}>
            <Share2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn("rounded-full transition-colors", isFavorite && "bg-red-50 text-red-500 border-red-200 hover:bg-red-100")}
            onClick={toggleFavorite}
          >
            <Heart className={cn("h-4 w-4", isFavorite && "fill-red-500 text-red-500")} />
          </Button>
        </div>
      </div>

      {/*
        Một khung xem chính + dải chọn ảnh bên dưới.
        `object-contain` chứ không phải `object-cover`: ảnh do quán tự chụp thường
        nhỏ và tỉ lệ lung tung, `cover` sẽ cắt rồi phóng to phần còn lại nên nhìn nhoè.
        `contain` giữ nguyên tỉ lệ và cho thấy trọn tấm ảnh — có viền nền hai bên
        nhưng sắc nét, đổi lại đúng thứ người xem cần.
      */}
      <div className="flex h-[280px] items-center justify-center overflow-hidden rounded-2xl bg-slate-100 md:h-[420px]">
        <img
          src={activeImage}
          alt={`${cafe.name} — ảnh cơ sở`}
          className="max-h-full max-w-full object-contain"
        />
      </div>

      {images.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {images.map((image, index) => (
            <button
              key={image}
              type="button"
              aria-label={`Xem ảnh ${index + 1}`}
              aria-pressed={image === activeImage}
              onClick={() => setActiveImage(image)}
              className={cn(
                "h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-100 transition",
                image === activeImage
                  ? "ring-2 ring-slate-950 ring-offset-2"
                  : "opacity-60 hover:opacity-100",
              )}
            >
              <img src={image} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
          <span className="ml-1 shrink-0 whitespace-nowrap text-sm font-semibold text-slate-400">
            {images.length} ảnh
          </span>
        </div>
      )}

      {/*
        Chỉ giữ hai thông tin chưa nói ở đâu khác. "Giá tham khảo" và "Đánh giá"
        từng nằm ở đây nhưng trùng với thẻ đặt lịch bên phải và dòng sao ngay trên,
        nên đã bỏ. Trình bày bằng dấu chấm ngăn thay vì bốn ô có viền.
      */}
      <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600">
        <InlineFact icon={Clock3} label="Slot tiêu chuẩn" value={slotLabel} />
        <span aria-hidden className="hidden h-4 w-px bg-slate-200 sm:block" />
        <InlineFact
          icon={CarFront}
          label="Xe cho thuê"
          value={`${cafe.availableVehicles.length} mẫu sẵn sàng`}
        />
      </dl>
    </section>
  )
}

function InlineFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Star
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-slate-400" />
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-bold text-slate-950">{value}</dd>
    </div>
  )
}

function formatSlotDuration(minutes: number | undefined) {
  if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes <= 0) {
    return "Chưa cấu hình"
  }
  return minutes === 60 ? "60 phút" : `${minutes} phút`
}

function dedupeImages(images: string[]) {
  return Array.from(new Set(images.filter(Boolean)))
}
