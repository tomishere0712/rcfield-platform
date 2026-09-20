import type { Dispatch, SetStateAction } from "react"
import { useMutation } from "@tanstack/react-query"
import { Upload } from "lucide-react"
import { toast } from "sonner"

import { contestApi } from "@/features/contests/api/contest.api"
import { uploadImage } from "@/features/uploads/api/upload.api"
import { BANNER_MIN_WIDTH, BANNER_RECOMMENDED } from "@/shared/lib/cloudinary"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Textarea } from "@/shared/ui/textarea"

import { ContestFormField } from "../ContestFormField"
import type { ContestFormState } from "../contest-form-types"

function updatePrizeTier(
  setForm: Dispatch<SetStateAction<ContestFormState>>,
  index: number,
  patch: Partial<ContestFormState["prizes"][number]>,
) {
  setForm((current) => ({
    ...current,
    prizes: current.prizes.map((tier, tierIndex) =>
      tierIndex === index ? { ...tier, ...patch } : tier,
    ),
  }))
}

export type SummaryRow = {
  label: string
  value: string
  stepIndex: number
}

const MAX_BANNER_BYTES = 5 * 1024 * 1024
const ACCEPTED_BANNER_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
]

/**
 * Bước 5 — phần khách nhìn thấy, kèm bảng kiểm lại toàn bộ cấu hình.
 *
 * Bảng tóm tắt có nút "Sửa" nhảy thẳng về đúng bước liên quan, để provider không
 * phải bấm Quay lại nhiều lần chỉ để đổi một giá trị.
 */
export function StepIntro({
  form,
  setForm,
  errors,
  contestId,
  summaryRows,
  onEditStep,
}: {
  form: ContestFormState
  setForm: Dispatch<SetStateAction<ContestFormState>>
  errors: Record<string, string>
  contestId?: string
  summaryRows: SummaryRow[]
  onEditStep: (index: number) => void
}) {
  /*
    Giải CHƯA tạo thì chưa có contestId để gọi POST /contests/:id/banner, nên
    trước đây nút upload bị khoá và provider phải tự đi tìm link ảnh ở đâu đó.
    Kho ảnh dùng chung (POST /uploads/images) không cần contestId — đẩy ảnh lên
    đó lấy URL là xong, còn endpoint riêng của contest chỉ dùng khi sửa giải đã
    tồn tại để ảnh gắn đúng thư mục của giải.
  */
  const uploadBannerMutation = useMutation({
    mutationFn: async (file: File) => {
      if (contestId) {
        const result = await contestApi.uploadBanner(contestId, file)
        return result.banner_image_url
      }
      const result = await uploadImage(file, "contest-banner")
      return result.url
    },
    onSuccess: (bannerImageUrl) => {
      setForm((current) => ({ ...current, banner_image_url: bannerImageUrl }))
      toast.success("Upload banner thành công")
    },
    onError: () => {
      toast.error("Không thể upload banner")
    },
  })

  /**
   * Đọc kích thước thật của ảnh trước khi upload.
   *
   * Ảnh nhỏ hơn khung hiển thị sẽ bị phóng to và vỡ nét — chặn từ đây rẻ hơn
   * nhiều so với để provider phát hiện lúc giải đã lên trang.
   */
  const readImageSize = (file: File) =>
    new Promise<{ width: number; height: number } | null>((resolve) => {
      const objectUrl = URL.createObjectURL(file)
      const image = new Image()
      image.onload = () => {
        URL.revokeObjectURL(objectUrl)
        resolve({ width: image.naturalWidth, height: image.naturalHeight })
      }
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl)
        resolve(null)
      }
      image.src = objectUrl
    })

  const handleBannerFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > MAX_BANNER_BYTES) {
      toast.error("Ảnh tối đa 5MB")
      return
    }
    if (!ACCEPTED_BANNER_TYPES.includes(file.type)) {
      toast.error("Chỉ hỗ trợ JPG, PNG, WEBP")
      return
    }

    const size = await readImageSize(file)
    if (size && size.width < BANNER_MIN_WIDTH) {
      toast.error(
        `Ảnh rộng ${size.width}px, quá nhỏ nên sẽ bị vỡ nét. Cần tối thiểu ${BANNER_MIN_WIDTH}px.`,
      )
      return
    }
    // Ảnh dọc vẫn upload được nhưng cảnh báo, vì mọi khung hiển thị đều nằm
    // ngang — cắt ra sẽ mất phần lớn nội dung.
    if (size && size.height > size.width) {
      toast.warning("Ảnh đang dạng dọc. Banner hiển thị dạng ngang nên sẽ bị cắt nhiều.")
    }

    uploadBannerMutation.mutate(file)
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <ContestFormField label="Tên giải đấu" error={errors.name}>
          <Input
            className="h-11"
            placeholder="Ví dụ: RCField Drift Cup 2026"
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
          />
        </ContestFormField>

        <ContestFormField label="Mô tả giải đấu" error={errors.description}>
          <Textarea
            rows={5}
            placeholder="Thể lệ tóm tắt, giải thưởng, lưu ý cho VĐV..."
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
          <p className="text-xs leading-5 text-[#747878]">
            Hiển thị ở phần "Đôi nét về giải đấu" trên trang công khai.
          </p>
        </ContestFormField>

        <ContestFormField label="Cơ cấu giải thưởng">
          <div className="space-y-2">
            {form.prizes.map((tier, index) => (
              <div
                key={index}
                className="grid gap-2 md:grid-cols-[minmax(0,9rem)_minmax(0,1fr)_minmax(0,12rem)]"
              >
                <Input
                  className="h-11"
                  placeholder="Hạng"
                  value={tier.position}
                  onChange={(event) =>
                    updatePrizeTier(setForm, index, {
                      position: event.target.value,
                    })
                  }
                />
                <Input
                  className="h-11"
                  placeholder="Phần thưởng, ví dụ: 2.000.000đ + cúp"
                  value={tier.reward}
                  onChange={(event) =>
                    updatePrizeTier(setForm, index, {
                      reward: event.target.value,
                    })
                  }
                />
                <Input
                  className="h-11"
                  placeholder="Ghi chú (không bắt buộc)"
                  value={tier.note}
                  onChange={(event) =>
                    updatePrizeTier(setForm, index, {
                      note: event.target.value,
                    })
                  }
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-lg text-xs font-bold"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  prizes: [
                    ...current.prizes,
                    { position: "", reward: "", note: "" },
                  ],
                }))
              }
            >
              Thêm hạng
            </Button>
            {form.prizes.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                className="h-9 rounded-lg text-xs font-bold text-[#747878]"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    prizes: current.prizes.slice(0, -1),
                  }))
                }
              >
                Bớt một hạng
              </Button>
            ) : null}
          </div>
          <p className="text-xs leading-5 text-[#747878]">
            Hiện ở phần "Vinh danh người về đích". Hạng nào bỏ trống phần thưởng
            thì không hiển thị; để trống hết thì trang công khai báo "sẽ công bố
            trong điều lệ giải".
          </p>
        </ContestFormField>

        <ContestFormField
          label="Banner giải đấu"
          error={errors.banner_image_url}
        >
          <div className="space-y-3">
            <Input
              className="h-11"
              placeholder="https://..."
              value={form.banner_image_url}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  banner_image_url: event.target.value,
                }))
              }
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-10 gap-2 rounded-lg"
                disabled={uploadBannerMutation.isPending}
                onClick={() =>
                  document.getElementById("contest-banner-file")?.click()
                }
              >
                <Upload className="size-4" />
                {uploadBannerMutation.isPending
                  ? "Đang upload..."
                  : "Upload ảnh"}
              </Button>
              <input
                id="contest-banner-file"
                type="file"
                accept={ACCEPTED_BANNER_TYPES.join(",")}
                className="hidden"
                onChange={handleBannerFileChange}
              />
              <p className="text-sm text-[#747878]">
                Chọn ảnh từ máy, hoặc dán sẵn đường dẫn ảnh vào ô trên. JPG, PNG
                hoặc WEBP, tối đa 5MB.
              </p>
            </div>
            <div className="rounded-xl border border-[#e5e2e1] bg-[#fcf8f8] px-3 py-2.5 text-xs leading-5 text-[#5d5f5f]">
              <span className="font-bold text-[#1c1b1b]">
                Khuyến nghị {BANNER_RECOMMENDED.width}×{BANNER_RECOMMENDED.height}px
                (tỉ lệ 16:9), ảnh nằm ngang.
              </span>{" "}
              Banner được cắt lại theo từng vị trí hiển thị, nên hãy để nội dung
              quan trọng (tên giải, logo) vào giữa khung. Ảnh hẹp hơn{" "}
              {BANNER_MIN_WIDTH}px sẽ bị từ chối vì hiển thị sẽ vỡ nét.
            </div>
            {form.banner_image_url ? (
              <div className="overflow-hidden rounded-xl border border-[#e5e2e1]">
                <img
                  src={form.banner_image_url}
                  alt="Xem trước banner"
                  className="h-40 w-full object-cover"
                />
              </div>
            ) : null}
          </div>
        </ContestFormField>
      </section>

      <section>
        <h3 className="text-sm font-black uppercase tracking-[0.14em] text-[#adaaaa]">
          Kiểm lại cấu hình
        </h3>
        <dl className="mt-4 divide-y divide-[#e5e2e1] border-y border-[#e5e2e1]">
          {summaryRows.map((row) => (
            <div
              key={row.label}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3"
            >
              <dt className="w-44 shrink-0 text-sm font-semibold text-[#747878]">
                {row.label}
              </dt>
              <dd className="min-w-0 flex-1 text-sm font-bold text-[#1c1b1b]">
                {row.value}
              </dd>
              <button
                type="button"
                onClick={() => onEditStep(row.stepIndex)}
                className="shrink-0 text-sm font-bold text-orange-600 hover:text-orange-700"
              >
                Sửa
              </button>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
