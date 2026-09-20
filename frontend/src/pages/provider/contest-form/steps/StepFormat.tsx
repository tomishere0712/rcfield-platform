import type { Dispatch, SetStateAction } from "react"
import { Flag, Swords, Timer, type LucideIcon } from "lucide-react"

import type {
  ContestCatalogFormat,
  ContestCatalogType,
  ContestTemplate,
} from "@/features/contests/types"
import { cn } from "@/shared/lib/utils"
import { Input } from "@/shared/ui/input"

import { ContestFormField } from "../ContestFormField"
import type { ContestFormState } from "../contest-form-types"
import type { ContestRuntimeFormat } from "../contest-form-utils"

const FORMAT_META: Record<
  ContestRuntimeFormat,
  { icon: LucideIcon; steps: string[] }
> = {
  TIME_TRIAL: {
    icon: Timer,
    steps: [
      "Mỗi VĐV được vài lượt chạy riêng, số lượt do bạn đặt bên dưới",
      "Nhân viên nhập thời gian cho từng lượt",
      "Xếp hạng theo lượt chạy nhanh nhất của mỗi người, các lượt còn lại không tính",
    ],
  },
  KNOCKOUT: {
    icon: Swords,
    steps: [
      "Đóng đăng ký xong, hệ thống bốc thăm sơ đồ đấu và công bố cho khách xem trước",
      "Mỗi trận chốt người thắng, người thắng tự vào vòng trong",
      "Xếp hạng theo vòng bị loại: vô địch, á quân, rồi tới các vòng trước đó",
    ],
  },
  QUALIFYING_FINAL: {
    icon: Flag,
    steps: [
      "Vòng loại: mỗi VĐV vài lượt tính giờ, lấy lượt nhanh nhất của từng người",
      "Chung kết: những người dẫn đầu vào nhánh đấu loại, hạng nhất gặp hạng cuối",
      "Ai không hoàn thành lượt nào thì không vào chung kết, kể cả khi còn trống suất",
    ],
  },
}

type VehiclePolicy = ContestFormState["vehicle_policy"]

const VEHICLE_POLICY_OPTIONS: Array<{
  value: VehiclePolicy
  label: string
  hint: string
}> = [
  {
    value: "BYOC_ONLY",
    label: "Khách tự mang xe",
    hint: "VĐV khai báo xe khi đăng ký, nhân viên kiểm tra xe lúc check-in.",
  },
  {
    value: "RENTAL_ONLY",
    label: "Thuê xe của quán",
    hint: "VĐV chọn dòng xe khi đăng ký và nhận xe lúc check-in. Không thu thêm tiền thuê.",
  },
]

/*
  "Xe thuê hoặc xe cá nhân" (MIXED) không còn là lựa chọn cho giải mới: nó bắt
  nhân viên ngày thi đấu chạy song song hai quy trình check-in khác nhau trong
  cùng một giải. Backend vẫn chấp nhận giá trị này, nên giải cũ đang để MIXED vẫn
  hiện đúng thẻ của nó — không âm thầm đổi chế độ của một giải đang mở đăng ký.
*/
const LEGACY_MIXED_OPTION = {
  value: "MIXED" as const,
  label: "Xe thuê hoặc xe cá nhân",
  hint: "Chế độ cũ — nhân viên phải chạy hai quy trình check-in trong cùng một giải.",
}

/**
 * Bước 3 — thể thức thi đấu và luật xe.
 *
 * Thể thức trình bày thành MỘT danh sách mẫu vận hành thay vì ba dropdown rời
 * (loại giải / hình thức / mẫu). Ba dropdown cũ cho ra 18 tổ hợp nhưng chỉ 3 tổ
 * hợp có template thật; chọn nhầm thì ô mẫu vận hành rỗng và provider kẹt ở đó
 * không có thông báo nào. Mỗi mẫu đã gắn cứng một cặp (loại giải, hình thức) nên
 * chọn mẫu là xác định xong cả ba — tổ hợp sai không dựng được nữa.
 */
export function StepFormat({
  form,
  setForm,
  errors,
  contestTypes,
  contestFormats,
  contestTemplates,
  runtimeFormat,
}: {
  form: ContestFormState
  setForm: Dispatch<SetStateAction<ContestFormState>>
  errors: Record<string, string>
  contestTypes: ContestCatalogType[]
  contestFormats: ContestCatalogFormat[]
  contestTemplates: ContestTemplate[]
  runtimeFormat: ContestRuntimeFormat
}) {
  const formatById = new Map(contestFormats.map((item) => [item.id, item]))
  const typeById = new Map(contestTypes.map((item) => [item.id, item]))

  const selectTemplate = (template: ContestTemplate) => {
    setForm((current) => ({
      ...current,
      contest_template_id: template.id,
      contest_type_id: template.contestTypeId ?? "",
      contest_format_id: template.contestFormatId ?? "",
    }))
  }

  const allowsRental = form.vehicle_policy !== "BYOC_ONLY"
  // Hai thể thức có pha chạy tính giờ dùng chung ô số lượt.
  const hasTimedRuns =
    runtimeFormat === "TIME_TRIAL" || runtimeFormat === "QUALIFYING_FINAL"
  const vehiclePolicyOptions =
    form.vehicle_policy === "MIXED"
      ? [...VEHICLE_POLICY_OPTIONS, LEGACY_MIXED_OPTION]
      : VEHICLE_POLICY_OPTIONS

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-black uppercase tracking-[0.14em] text-[#adaaaa]">
          Thể thức thi đấu
        </h3>
        {errors.contest_template_id ? (
          <p className="mt-2 text-sm font-bold text-red-600">
            {errors.contest_template_id}
          </p>
        ) : null}

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {contestTemplates.map((template) => {
            const format = template.contestFormatId
              ? formatById.get(template.contestFormatId)
              : undefined
            const type = template.contestTypeId
              ? typeById.get(template.contestTypeId)
              : undefined
            const meta =
              FORMAT_META[
                (format?.code as ContestRuntimeFormat) ?? "KNOCKOUT"
              ] ?? FORMAT_META.KNOCKOUT
            const Icon = meta.icon
            const isSelected = template.id === form.contest_template_id
            // Mẫu gắn cứng vào một thể thức, nên thể thức chưa mở thì mẫu của nó
            // cũng chưa chạy được. Vẫn bày ra để provider biết đang có gì trên
            // đường tới, nhưng bấm không ăn — backend cũng chặn bằng
            // CONTEST_FORMAT_NOT_RELEASED nên đây chỉ là lớp hiển thị.
            const isComingSoon = format?.isReleased === false

            return (
              <button
                key={template.id}
                type="button"
                disabled={isComingSoon}
                aria-disabled={isComingSoon}
                onClick={() => selectTemplate(template)}
                className={cn(
                  "flex flex-col rounded-xl border p-4 text-left transition",
                  isComingSoon
                    ? "cursor-not-allowed border-dashed border-[#e5e2e1] bg-[#faf9f9]"
                    : isSelected
                      ? "border-[#1c1b1b] bg-[#fcf8f8] ring-1 ring-[#1c1b1b]"
                      : "border-[#e5e2e1] bg-white hover:border-[#c4c7c8]",
                )}
              >
                <span className="flex items-start justify-between gap-2">
                  <span
                    className={cn(
                      "flex size-10 items-center justify-center rounded-xl",
                      isComingSoon
                        ? "bg-[#f0eded] text-[#adaaaa]"
                        : isSelected
                          ? "bg-[#1c1b1b] text-white"
                          : "bg-[#f0eded] text-[#5d5f5f]",
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  {isComingSoon ? (
                    <span className="rounded-full bg-[#f0eded] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#747878]">
                      Sắp có
                    </span>
                  ) : null}
                </span>

                <span
                  className={cn(
                    "mt-3 block text-base font-bold",
                    isComingSoon ? "text-[#8a8d8d]" : "text-[#1c1b1b]",
                  )}
                >
                  {template.name}
                </span>
                {template.description ? (
                  <span
                    className={cn(
                      "mt-1 block text-xs leading-5",
                      isComingSoon ? "text-[#adaaaa]" : "text-[#747878]",
                    )}
                  >
                    {template.description}
                  </span>
                ) : null}
                {isComingSoon ? (
                  <span className="mt-2 block text-xs font-semibold leading-5 text-[#8a8d8d]">
                    Thể thức này đang được hoàn thiện, chưa mở để tạo giải.
                  </span>
                ) : null}

                {/*
                  Chỉ hiện chip nào nói thêm được điều gì so với tên mẫu. Sau khi
                  catalog được dịch, tên hình thức trùng luôn tên mẫu ở hai mẫu
                  đầu và tên loại giải trùng tên mẫu ở mẫu Grand Prix — lặp lại y
                  nguyên chỉ làm thẻ rối chứ không cho provider thêm thông tin.
                */}
                <span className="mt-3 flex flex-wrap gap-1.5">
                  {[type?.name, format?.name]
                    .filter(
                      (chip): chip is string =>
                        Boolean(chip) && chip !== template.name,
                    )
                    .map((chip) => (
                      <span
                        key={chip}
                        className="rounded-full bg-[#f0eded] px-2 py-0.5 text-[11px] font-bold text-[#5d5f5f]"
                      >
                        {chip}
                      </span>
                    ))}
                </span>
              </button>
            )
          })}
        </div>

        {form.contest_template_id ? (
          <div className="mt-4 rounded-xl border border-[#e5e2e1] bg-[#fcf8f8] p-4">
            <p className="text-sm font-bold text-[#1c1b1b]">
              Hệ thống sẽ vận hành như sau
            </p>
            <ol className="mt-2 space-y-1.5">
              {FORMAT_META[runtimeFormat].steps.map((line, index) => (
                <li key={line} className="text-sm leading-6 text-[#5d5f5f]">
                  {index + 1}. {line}
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {hasTimedRuns && form.contest_template_id ? (
          <div className="mt-4 max-w-xs">
            <ContestFormField
              label="Số lượt chạy mỗi VĐV"
              error={errors.runs_per_driver}
            >
              <Input
                type="number"
                min={1}
                max={5}
                className="h-11"
                value={form.runs_per_driver}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    runs_per_driver: event.target.value,
                  }))
                }
              />
              <p className="text-xs leading-5 text-[#747878]">
                Từ 1 đến 5. Xếp hạng lấy lượt nhanh nhất, nên nhiều lượt giúp
                một cú trượt tay không làm hỏng cả giải của VĐV.
              </p>
            </ContestFormField>
          </div>
        ) : null}

        {runtimeFormat === "QUALIFYING_FINAL" && form.contest_template_id ? (
          <div className="mt-4 max-w-xs">
            <ContestFormField
              label="Số VĐV vào chung kết"
              error={errors.finalists}
            >
              <Input
                type="number"
                min={2}
                max={16}
                className="h-11"
                value={form.finalists}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    finalists: event.target.value,
                  }))
                }
              />
              <p className="text-xs leading-5 text-[#747878]">
                Từ 2 đến 16. Sau vòng loại, top N theo lap tốt nhất vào nhánh
                chung kết.
              </p>
            </ContestFormField>
          </div>
        ) : null}
      </section>

      <section>
        <h3 className="text-sm font-black uppercase tracking-[0.14em] text-[#adaaaa]">
          Xe thi đấu
        </h3>
        {errors.vehicle_policy ? (
          <p className="mt-2 text-sm font-bold text-red-600">
            {errors.vehicle_policy}
          </p>
        ) : null}

        {form.vehicle_policy === "MIXED" ? (
          <p className="mt-3 border-l-2 border-amber-300 bg-amber-50/60 py-2.5 pl-4 text-sm leading-6 text-amber-900">
            Giải này đang dùng chế độ hỗn hợp — chế độ đã ngừng đề xuất. Chọn
            một trong hai chế độ bên dưới để nhân viên ngày thi đấu chỉ phải
            chạy một quy trình check-in.
          </p>
        ) : null}

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {vehiclePolicyOptions.map((option) => {
            const isSelected = option.value === form.vehicle_policy
            return (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    vehicle_policy: option.value,
                  }))
                }
                className={cn(
                  "rounded-xl border p-4 text-left transition",
                  isSelected
                    ? "border-[#1c1b1b] bg-[#fcf8f8] ring-1 ring-[#1c1b1b]"
                    : "border-[#e5e2e1] bg-white hover:border-[#c4c7c8]",
                )}
              >
                <span className="block text-base font-bold text-[#1c1b1b]">
                  {option.label}
                </span>
                <span className="mt-1 block text-xs leading-5 text-[#747878]">
                  {option.hint}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {allowsRental ? (
        <p className="border-l-2 border-emerald-300 bg-emerald-50/60 py-2.5 pl-4 text-sm leading-6 text-emerald-900">
          VĐV thuê xe của quán không trả thêm đồng nào — lệ phí giải là khoản
          duy nhất. Khi đăng ký họ chọn dòng xe muốn mượn, và nhận xe đúng lúc
          check-in vào giờ thi đấu.
        </p>
      ) : null}
    </div>
  )
}
