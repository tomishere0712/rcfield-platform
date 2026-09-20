import type { Dispatch, SetStateAction } from "react"
import { AlertTriangle, Route } from "lucide-react"

import type {
  BackendCafe,
  TrackConfig,
  TrackType,
} from "@/features/cafes/types"
import { cn } from "@/shared/lib/utils"

import type { ContestFormState, ResourceLockState } from "../contest-form-types"

/**
 * Bước 2 — loại đường đua và phạm vi khoá tài nguyên.
 *
 * Chỉ hiện loại đường đua mà chi nhánh đã chọn thật sự có sân đang hoạt động.
 * Khi chi nhánh chưa có sân nào, liệt kê đích danh thay vì chỉ báo "không có
 * loại nào" — provider cần biết phải thêm sân ở đâu.
 */
export function StepTrack({
  form,
  setForm,
  errors,
  cafes,
  trackTypes,
  trackTypesIntersection,
  trackConfigsByCafe,
  resourceLocks,
  setResourceLocks,
}: {
  form: ContestFormState
  setForm: Dispatch<SetStateAction<ContestFormState>>
  errors: Record<string, string>
  cafes: BackendCafe[]
  trackTypes: TrackType[]
  trackTypesIntersection: TrackType[] | null
  trackConfigsByCafe: Record<string, TrackConfig[]>
  resourceLocks: ResourceLockState
  setResourceLocks: Dispatch<SetStateAction<ResourceLockState>>
}) {
  const isLoadingConfigs = trackTypesIntersection === null
  const options = trackTypesIntersection ?? []
  const selectedCafes = form.participating_cafe_ids
    .map((cafeId) => cafes.find((cafe) => cafe.id === cafeId))
    .filter((cafe): cafe is BackendCafe => Boolean(cafe))

  const activeConfigsOf = (cafeId: string) =>
    (trackConfigsByCafe[cafeId] ?? []).filter((item) => item.is_active)

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-black uppercase tracking-[0.14em] text-[#adaaaa]">
          Loại đường đua
        </h3>

        {isLoadingConfigs ? (
          <div className="mt-4 h-12 animate-pulse rounded-xl bg-[#f0eded]" />
        ) : options.length === 0 ? (
          <div className="mt-4 border-l-2 border-red-400 bg-red-50/60 py-4 pl-4">
            <p className="flex items-center gap-2 text-sm font-bold text-red-700">
              <AlertTriangle className="size-4 shrink-0" />
              Chi nhánh đã chọn chưa có sân nào dùng được cho giải
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-red-900">
              {selectedCafes.map((cafe) => {
                const names = activeConfigsOf(cafe.id).map(
                  (config) => config.track_type?.name ?? "Sân chưa đặt tên",
                )
                return (
                  <li key={cafe.id}>
                    <strong>{cafe.name}</strong>:{" "}
                    {names.length > 0
                      ? names.join(", ")
                      : "chưa có sân nào hoạt động"}
                  </li>
                )
              })}
            </ul>
            <p className="mt-3 text-sm font-medium text-red-900">
              Quay lại bước 1 để chọn chi nhánh khác, hoặc thêm sân ở phần quản
              lý chi nhánh.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {options.map((trackType) => {
                const isSelected = trackType.id === form.track_type_id
                return (
                  <button
                    key={trackType.id}
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        track_type_id: trackType.id,
                      }))
                    }
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-4 text-left transition",
                      isSelected
                        ? "border-[#1c1b1b] bg-[#fcf8f8]"
                        : "border-[#e5e2e1] bg-white hover:border-[#c4c7c8]",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-xl",
                        isSelected
                          ? "bg-[#1c1b1b] text-white"
                          : "bg-[#f0eded] text-[#5d5f5f]",
                      )}
                    >
                      <Route className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-[#1c1b1b]">
                        {trackType.name}
                      </span>
                      {trackType.description ? (
                        <span className="mt-0.5 block text-xs leading-5 text-[#747878]">
                          {trackType.description}
                        </span>
                      ) : null}
                    </span>
                  </button>
                )
              })}
            </div>
            {trackTypes.length > options.length ? (
              <p className="mt-3 text-sm text-[#747878]">
                {trackTypes.length - options.length} loại đường đua khác bị ẩn
                vì chi nhánh này chưa có sân loại đó.
              </p>
            ) : null}
          </>
        )}

        {errors.track_type_id ? (
          <p className="mt-3 text-sm font-bold text-red-600">
            {errors.track_type_id}
          </p>
        ) : null}
      </section>

      <section>
        <h3 className="text-sm font-black uppercase tracking-[0.14em] text-[#adaaaa]">
          Phạm vi khoá tài nguyên
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5d5f5f]">
          Trong khung giờ giải đấu, hệ thống chặn khách đặt sân thường trên tài
          nguyên bị khoá. Khoá càng rộng thì càng mất nhiều doanh thu khách lẻ.
        </p>

        {errors.resource_locks ? (
          <p className="mt-3 text-sm font-bold text-red-600">
            {errors.resource_locks}
          </p>
        ) : null}

        <div className="mt-4 space-y-4">
          {selectedCafes.map((cafe) => {
            const activeConfigs = activeConfigsOf(cafe.id)
            const lock = resourceLocks[cafe.id] ?? {
              scope: "FULL_BRANCH" as const,
              track_config_ids: [],
            }
            const hasChoice = activeConfigs.length > 1

            return (
              <div
                key={cafe.id}
                className="rounded-xl border border-[#e5e2e1] bg-white p-4"
              >
                <p className="text-base font-bold text-[#1c1b1b]">
                  {cafe.name}
                </p>

                {!hasChoice ? (
                  <p className="mt-2 text-sm leading-6 text-[#747878]">
                    Chi nhánh này chỉ có{" "}
                    {activeConfigs.length === 0 ? "chưa có" : "một"} sân đang
                    hoạt động nên bắt buộc khoá toàn bộ chi nhánh trong khung
                    giờ giải.
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <LockOption
                        label="Khoá toàn bộ chi nhánh"
                        hint="Mọi sân đều ngừng nhận khách đặt thường"
                        selected={lock.scope === "FULL_BRANCH"}
                        tone="warning"
                        onSelect={() =>
                          setResourceLocks((current) => ({
                            ...current,
                            [cafe.id]: {
                              scope: "FULL_BRANCH",
                              track_config_ids: [],
                            },
                          }))
                        }
                      />
                      <LockOption
                        label="Chỉ khoá sân thi đấu"
                        hint="Các sân còn lại vẫn nhận khách bình thường"
                        selected={lock.scope === "SELECTED_TRACKS"}
                        tone="neutral"
                        onSelect={() =>
                          setResourceLocks((current) => {
                            // Sân đúng loại đường đua của giải luôn phải nằm
                            // trong danh sách khoá (bắt buộc, không cho bỏ
                            // tick — xem checkbox bên dưới). Phải tự thêm ngay
                            // ở đây, không chờ effect đồng bộ chạy lại — effect
                            // đó chỉ chạy khi đổi chi nhánh/loại đường đua, còn
                            // đây là đổi scope, effect không hay biết.
                            const requiredIds = activeConfigs
                              .filter(
                                (item) =>
                                  item.track_type_id === form.track_type_id,
                              )
                              .map((item) => item.id)
                            return {
                              ...current,
                              [cafe.id]: {
                                scope: "SELECTED_TRACKS",
                                track_config_ids: Array.from(
                                  new Set([
                                    ...(current[cafe.id]?.track_config_ids ??
                                      []),
                                    ...requiredIds,
                                  ]),
                                ),
                              },
                            }
                          })
                        }
                      />
                    </div>

                    {lock.scope === "SELECTED_TRACKS" ? (
                      <ul className="space-y-2">
                        {activeConfigs.map((config) => {
                          // Sân đúng loại đường đua của giải: khoá bắt buộc, không cho bỏ tick.
                          // Backend chặn booking trùng loại đường đua dù có tick hay không
                          // (contest-lock.service.ts — contestLockBlocksTrack), nên để provider
                          // bỏ tick chỉ tạo cảm giác sai là sân đó vẫn nhận khách.
                          const isCompetitionTrack =
                            config.track_type_id === form.track_type_id
                          const checked =
                            isCompetitionTrack ||
                            lock.track_config_ids.includes(config.id)
                          return (
                            <li key={config.id}>
                              <label
                                className={cn(
                                  "flex items-start gap-3 rounded-lg border px-3 py-2.5",
                                  isCompetitionTrack
                                    ? "cursor-not-allowed border-orange-200 bg-orange-50/60"
                                    : "cursor-pointer border-[#e5e2e1]",
                                )}
                              >
                                <input
                                  type="checkbox"
                                  className="mt-0.5 size-4 accent-[#1c1b1b] disabled:opacity-60"
                                  checked={checked}
                                  disabled={isCompetitionTrack}
                                  onChange={(event) =>
                                    setResourceLocks((current) => {
                                      const existing = current[cafe.id] ?? {
                                        scope: "SELECTED_TRACKS" as const,
                                        track_config_ids: [],
                                      }
                                      return {
                                        ...current,
                                        [cafe.id]: {
                                          scope: "SELECTED_TRACKS",
                                          track_config_ids: event.target.checked
                                            ? [
                                                ...existing.track_config_ids,
                                                config.id,
                                              ]
                                            : existing.track_config_ids.filter(
                                                (id) => id !== config.id,
                                              ),
                                        },
                                      }
                                    })
                                  }
                                />
                                <span className="min-w-0">
                                  <span className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-bold text-[#1c1b1b]">
                                      {config.track_type?.name ?? "Sân thi đấu"}
                                    </span>
                                    {isCompetitionTrack ? (
                                      <span className="rounded-full bg-orange-600 px-2 py-0.5 text-[11px] font-bold text-white">
                                        Sân thi đấu · bắt buộc khoá
                                      </span>
                                    ) : null}
                                  </span>
                                  <span className="mt-0.5 block text-xs text-[#747878]">
                                    {isCompetitionTrack
                                      ? "Giải diễn ra trên loại đường đua này nên sân bị khoá dù có chọn hay không."
                                      : `Tối đa ${config.max_concurrent} lượt thuê cùng lúc`}
                                  </span>
                                </span>
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      <p className="border-l-2 border-amber-300 bg-amber-50/60 py-2.5 pl-3 text-sm font-medium leading-6 text-amber-900">
                        Toàn bộ {activeConfigs.length} sân của chi nhánh này sẽ
                        ngừng nhận khách đặt thường trong suốt thời gian giải.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function LockOption({
  label,
  hint,
  selected,
  tone,
  onSelect,
}: {
  label: string
  hint: string
  selected: boolean
  tone: "warning" | "neutral"
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "rounded-xl border px-3 py-3 text-left transition",
        selected
          ? tone === "warning"
            ? "border-amber-400 bg-amber-50"
            : "border-[#1c1b1b] bg-[#fcf8f8]"
          : "border-[#e5e2e1] bg-white hover:border-[#c4c7c8]",
      )}
    >
      <span className="block text-sm font-bold text-[#1c1b1b]">{label}</span>
      <span className="mt-0.5 block text-xs leading-5 text-[#747878]">
        {hint}
      </span>
    </button>
  )
}
