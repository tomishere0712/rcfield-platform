import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useParams, useSearchParams } from "react-router"
import { toast } from "sonner"
import { routePaths } from "@/app/router/route-paths"
import {
  cafeApi,
  cafeQueryKeys,
  trackConfigApi,
  trackTypeApi,
  trackTypeQueryKeys,
} from "@/features/cafes/api/cafe.api"
import type { TrackConfig, TrackType } from "@/features/cafes/types"
import {
  contestApi,
  contestQueryKeys,
} from "@/features/contests/api/contest.api"
import { contestUpsertSchema } from "@/features/contests/schemas/contest.schema"
import type { ContestItem, ContestUpsertBody } from "@/features/contests/types"
import {
  buildResourceLocks,
  getErrorMessage,
  getRuntimeFormatFromCode,
  stripManagedContestConfig,
  toInputDateTime,
} from "./contest-form-utils"
import type {
  ContestFormState,
  PrizeTierState,
  ResourceLockState,
} from "./contest-form-types"
import { defaultForm, defaultPrizeTiers } from "./contest-form-types"
import {
  CONTEST_WIZARD_STEPS,
  LAST_STEP_INDEX,
  findFirstInvalidStep,
  validateContestStep,
  type StepValidationContext,
} from "./contest-wizard"

/**
 * Đọc cơ cấu giải thưởng đã lưu về dạng form.
 *
 * Dữ liệu cũ có thể nằm dưới khoá `items` hoặc `tiers` — trang công khai chấp
 * nhận cả hai nên phần nhập cũng phải đọc được cả hai, nếu không mở giải cũ ra
 * sửa là mất sạch giải thưởng đã nhập.
 */
function readPrizeTiers(
  config: Record<string, unknown> | null | undefined,
): PrizeTierState[] {
  const structure = config?.prize_structure as
    | { items?: unknown; tiers?: unknown }
    | undefined
  const raw = Array.isArray(structure?.items)
    ? structure.items
    : Array.isArray(structure?.tiers)
      ? structure.tiers
      : null
  if (!raw || raw.length === 0) {
    return defaultPrizeTiers.map((tier) => ({ ...tier }))
  }
  return (raw as Array<Record<string, unknown>>).map((item) => ({
    position: String(item.position ?? item.rank ?? ""),
    reward: String(item.label ?? item.reward ?? item.prize ?? ""),
    note: item.note ? String(item.note) : "",
  }))
}

export function useContestForm() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { contestId } = useParams()
  const [searchParams] = useSearchParams()
  const isEdit = Boolean(contestId)
  // Gói do màn giới thiệu chọn, mang sang qua query param.
  const selectedFeePlanId = searchParams.get("plan")

  const [form, setForm] = useState<ContestFormState>(defaultForm)
  // Bước nào đã bấm "Tiếp tục" một lần thì từ đó trở đi validate ngay khi gõ.
  // Trước khi bấm lần đầu thì im lặng — không tô đỏ những ô người dùng chưa đụng tới.
  const [attemptedSteps, setAttemptedSteps] = useState<number[]>([])
  // Lỗi từ schema dùng chung với API (lưới an toàn cuối), không gắn với bước nào.
  const [submitErrors, setSubmitErrors] = useState<Record<string, string>>({})
  const [trackConfigsByCafe, setTrackConfigsByCafe] = useState<
    Record<string, TrackConfig[]>
  >({})
  const [resourceLocks, setResourceLocks] = useState<ResourceLockState>({})
  const [extraConfig, setExtraConfig] = useState<Record<string, unknown>>({})
  // Giải vừa tạo xong (chỉ ở luồng tạo mới) — có giá trị nghĩa là 5 bước đã
  // xong, hiện màn thanh toán ngay tại trang này thay vì điều hướng đi luôn.
  // `createContest` đã trả về nguyên object giải nên không cần fetch lại.
  const [createdContest, setCreatedContest] = useState<ContestItem | null>(
    null,
  )

  // Bước đang xem và bước xa nhất đã mở khoá. Ở chế độ sửa, dữ liệu đã đầy đủ
  // nên mở hết ngay từ đầu — bắt provider đi lại từ bước 1 chỉ để đổi lệ phí là vô lý.
  const [stepIndex, setStepIndex] = useState(() => (isEdit ? LAST_STEP_INDEX : 0))
  const [maxUnlockedIndex, setMaxUnlockedIndex] = useState(() =>
    isEdit ? LAST_STEP_INDEX : 0,
  )

  const typesQuery = useQuery({
    queryKey: contestQueryKeys.catalogTypes(),
    queryFn: contestApi.listContestTypes,
  })
  const formatsQuery = useQuery({
    queryKey: contestQueryKeys.catalogFormats(),
    queryFn: contestApi.listContestFormats,
  })
  // Tải TOÀN BỘ mẫu vận hành, không lọc theo loại giải/hình thức đã chọn.
  // Bước 3 giờ cho chọn thẳng mẫu rồi suy ngược ra loại giải + hình thức, nên lọc
  // ở đây sẽ khiến danh sách rỗng lúc chưa chọn gì.
  const templatesQuery = useQuery({
    queryKey: contestQueryKeys.catalogTemplates({}),
    queryFn: () => contestApi.listContestTemplates(),
  })
  const trackTypesQuery = useQuery({
    queryKey: trackTypeQueryKeys.all,
    queryFn: trackTypeApi.listAll,
  })
  const cafesQuery = useQuery({
    queryKey: cafeQueryKeys.list({ scope: "managed", limit: 100 }),
    queryFn: () => cafeApi.listCafes({ scope: "managed", limit: 100 }),
  })
  const contestQuery = useQuery({
    queryKey: contestQueryKeys.detail(contestId),
    queryFn: () => contestApi.getContest(contestId!),
    enabled: Boolean(contestId),
  })

  const selectedTemplate = useMemo(
    () =>
      templatesQuery.data?.find(
        (item) => item.id === form.contest_template_id,
      ) ?? null,
    [form.contest_template_id, templatesQuery.data],
  )
  const selectedFormat = useMemo(
    () =>
      formatsQuery.data?.find((item) => item.id === form.contest_format_id) ??
      null,
    [form.contest_format_id, formatsQuery.data],
  )
  const runtimeFormat = useMemo(
    () => getRuntimeFormatFromCode(selectedFormat?.code),
    [selectedFormat?.code],
  )

  useEffect(() => {
    if (!contestQuery.data) return
    const contest = contestQuery.data
    queueMicrotask(() => {
      setForm({
        name: contest.name,
        description: contest.description ?? "",
        contest_type_id: contest.contest_type?.id ?? "",
        contest_format_id: contest.contest_format?.id ?? "",
        contest_template_id: contest.contest_template?.id ?? "",
        track_type_id: contest.track_type?.id ?? "",
        participating_cafe_ids: contest.participating_branches.map(
          (item) => item.cafe_id,
        ),
        starts_at: toInputDateTime(contest.starts_at),
        ends_at: toInputDateTime(contest.ends_at),
        registration_opens_at: toInputDateTime(
          contest.registration_opens_at ?? contest.starts_at,
        ),
        registration_closes_at: toInputDateTime(
          contest.registration_closes_at ?? contest.starts_at,
        ),
        capacity: String(contest.capacity ?? 16),
        entry_fee: String(contest.entry_fee ?? 0),
        banner_image_url: contest.banner_image_url ?? "",
        vehicle_policy:
          (contest.vehicle_rule
            ?.vehicle_policy as ContestFormState["vehicle_policy"]) ??
          "RENTAL_ONLY",
        assignment_policy:
          (contest.vehicle_rule
            ?.assignment_policy as ContestFormState["assignment_policy"]) ??
          "AT_CHECK_IN",
        finalists: String(contest.config?.finalists ?? 4),
        runs_per_driver: String(contest.config?.runs_per_driver ?? 3),
        prizes: readPrizeTiers(contest.config),
      })
      setExtraConfig(stripManagedContestConfig(contest.config))

      const existingLocks = Array.isArray(contest.config?.resource_locks)
        ? contest.config.resource_locks
        : []
      setResourceLocks(
        existingLocks.reduce<ResourceLockState>((map, lock) => {
          const value = lock as {
            cafe_id?: string
            scope?: import("../contest-form/contest-form-types").ResourceLockScope
            track_config_ids?: string[]
          }
          if (!value.cafe_id) return map
          map[value.cafe_id] = {
            scope:
              value.scope === "SELECTED_TRACKS"
                ? "SELECTED_TRACKS"
                : "FULL_BRANCH",
            track_config_ids: Array.isArray(value.track_config_ids)
              ? value.track_config_ids
              : [],
          }
          return map
        }, {}),
      )
    })
  }, [contestQuery.data])

  useEffect(() => {
    if (form.participating_cafe_ids.length === 0) {
      queueMicrotask(() => setTrackConfigsByCafe({}))
      return
    }

    let cancelled = false
    void Promise.all(
      form.participating_cafe_ids.map(
        async (cafeId) =>
          [cafeId, await trackConfigApi.listTrackConfigs(cafeId)] as const,
      ),
    ).then((entries) => {
      if (cancelled) return
      setTrackConfigsByCafe(Object.fromEntries(entries))
    })

    return () => {
      cancelled = true
    }
  }, [form.participating_cafe_ids])

  useEffect(() => {
    if (form.participating_cafe_ids.length === 0) return
    queueMicrotask(() =>
      setResourceLocks((current) => {
        const next = { ...current }
        for (const cafeId of form.participating_cafe_ids) {
          const configs = (trackConfigsByCafe[cafeId] ?? []).filter(
            (item) => item.is_active,
          )
          if (configs.length <= 1) {
            next[cafeId] = {
              scope: "FULL_BRANCH",
              track_config_ids: configs.map((item) => item.id),
            }
            continue
          }
          if (!next[cafeId]) {
            next[cafeId] = { scope: "FULL_BRANCH", track_config_ids: [] }
          } else if (next[cafeId].scope === "SELECTED_TRACKS") {
            // Sân đúng loại đường đua của giải luôn phải nằm trong danh sách khoá:
            // backend chặn booking trùng loại đường đua dù provider có tick hay không,
            // nên bỏ nó ra khỏi đây chỉ khiến giao diện nói sai so với thực tế.
            const requiredIds = configs
              .filter((item) => item.track_type_id === form.track_type_id)
              .map((item) => item.id)
            next[cafeId] = {
              ...next[cafeId],
              track_config_ids: Array.from(
                new Set([
                  ...requiredIds,
                  ...next[cafeId].track_config_ids.filter((trackId) =>
                    configs.some((item) => item.id === trackId),
                  ),
                ]),
              ),
            }
          }
        }

        for (const cafeId of Object.keys(next)) {
          if (!form.participating_cafe_ids.includes(cafeId)) {
            delete next[cafeId]
          }
        }

        return next
      }),
    )
  }, [form.participating_cafe_ids, form.track_type_id, trackConfigsByCafe])

  // Giao (intersection) loại đường đua mà TẤT CẢ chi nhánh đã chọn đều có
  // (chỉ tính track config ACTIVE). null = chưa chọn chi nhánh hoặc đang tải
  // cấu hình sân.
  const trackTypesIntersection = useMemo<TrackType[] | null>(() => {
    const cafeIds = form.participating_cafe_ids
    if (cafeIds.length === 0) return null
    if (!cafeIds.every((cafeId) => trackConfigsByCafe[cafeId])) return null
    const activeTypeIds = cafeIds.map(
      (cafeId) =>
        new Set(
          (trackConfigsByCafe[cafeId] ?? [])
            .filter((config) => config.is_active)
            .map((config) => config.track_type_id),
        ),
    )
    const commonIds = activeTypeIds.reduce(
      (common, ids) => new Set([...common].filter((id) => ids.has(id))),
      activeTypeIds[0],
    )
    return (trackTypesQuery.data ?? []).filter((type) => commonIds.has(type.id))
  }, [form.participating_cafe_ids, trackConfigsByCafe, trackTypesQuery.data])

  // Loại đường đua đang chọn không còn hợp lệ với các chi nhánh mới → reset.
  useEffect(() => {
    if (!trackTypesIntersection || !form.track_type_id) return
    if (trackTypesIntersection.some((type) => type.id === form.track_type_id))
      return
    queueMicrotask(() =>
      setForm((current) => ({ ...current, track_type_id: "" })),
    )
  }, [trackTypesIntersection, form.track_type_id])

  const stepContext = useMemo<StepValidationContext>(
    () => ({ isEdit, runtimeFormat, resourceLocks, trackConfigsByCafe }),
    [isEdit, runtimeFormat, resourceLocks, trackConfigsByCafe],
  )

  /**
   * Lỗi hiển thị cho bước đang xem — tính lại mỗi lần render nên người dùng sửa
   * tới đâu là lỗi biến mất tới đó, không phải bấm "Tiếp tục" lần nữa mới biết.
   */
  const validationErrors = useMemo<Record<string, string>>(() => {
    if (!attemptedSteps.includes(stepIndex)) return submitErrors
    return {
      ...submitErrors,
      ...validateContestStep(
        CONTEST_WIZARD_STEPS[stepIndex].id,
        form,
        stepContext,
      ),
    }
  }, [attemptedSteps, stepIndex, submitErrors, form, stepContext])

  const goToStep = (index: number) => {
    if (index < 0 || index > maxUnlockedIndex) return
    setSubmitErrors({})
    setStepIndex(index)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const goBack = () => goToStep(stepIndex - 1)

  const goNext = () => {
    const errors = validateContestStep(
      CONTEST_WIZARD_STEPS[stepIndex].id,
      form,
      stepContext,
    )
    if (Object.keys(errors).length > 0) {
      setAttemptedSteps((current) =>
        current.includes(stepIndex) ? current : [...current, stepIndex],
      )
      toast.error("Còn thông tin chưa hợp lệ ở bước này")
      return
    }
    setSubmitErrors({})
    const nextIndex = Math.min(stepIndex + 1, LAST_STEP_INDEX)
    setMaxUnlockedIndex((current) => Math.max(current, nextIndex))
    setStepIndex(nextIndex)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const saveMutation = useMutation({
    mutationFn: async (payload: ContestUpsertBody) =>
      isEdit && contestId
        ? contestApi.updateContest(contestId, payload)
        : contestApi.createContest(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contestQueryKeys.all })
    },
  })

  const handleSubmit = async () => {
    // Sửa chi nhánh sau khi đã đi qua các bước sau có thể làm hỏng ngược một
    // bước trước đó, nên chạy lại toàn bộ và nhảy về đúng chỗ hỏng.
    const invalid = findFirstInvalidStep(form, stepContext)
    if (invalid) {
      setAttemptedSteps((current) =>
        current.includes(invalid.index) ? current : [...current, invalid.index],
      )
      setMaxUnlockedIndex((current) => Math.max(current, invalid.index))
      setStepIndex(invalid.index)
      window.scrollTo({ top: 0, behavior: "smooth" })
      toast.error(
        `Bước "${CONTEST_WIZARD_STEPS[invalid.index].label}" còn thông tin chưa hợp lệ`,
      )
      return
    }

    const derivedLocks = buildResourceLocks(
      form.participating_cafe_ids,
      trackConfigsByCafe,
      resourceLocks,
    )

    const templateDefaults = (selectedTemplate?.defaultConfig ?? {}) as Record<
      string,
      unknown
    >
    const finalists = Math.min(
      16,
      Math.max(2, Number.parseInt(form.finalists, 10) || 4),
    )
    const runsPerDriver = Math.min(
      5,
      Math.max(1, Number.parseInt(form.runs_per_driver, 10) || 3),
    )
    const hasTimedRuns =
      runtimeFormat === "TIME_TRIAL" || runtimeFormat === "QUALIFYING_FINAL"
    // `format` và `runtime_format` cố tình KHÔNG gửi: backend tự suy từ mã format
    // trong catalog rồi ghi đè (`stripRuntimeManagedConfig` + `mergeContestConfig`).
    // Gửi lên chỉ tạo ảo giác là FE quyết định được.
    // Chỉ gửi hạng đã điền phần thưởng; hạng bỏ trống là ban tổ chức chưa quyết.
    const prizeItems = form.prizes
      .map((tier) => ({
        position: tier.position.trim(),
        label: tier.reward.trim(),
        note: tier.note.trim() || undefined,
      }))
      .filter((tier) => tier.position && tier.label)

    const derivedConfig = {
      ...templateDefaults,
      ...extraConfig,
      leaderboard_mode:
        runtimeFormat === "TIME_TRIAL"
          ? (templateDefaults.leaderboard_mode ?? "BEST_LAP")
          : "KNOCKOUT_WINS",
      drivers_per_match:
        runtimeFormat === "TIME_TRIAL"
          ? Number(templateDefaults.drivers_per_match ?? 1)
          : Number(templateDefaults.drivers_per_match ?? 2),
      ...(runtimeFormat === "QUALIFYING_FINAL" ? { finalists } : {}),
      ...(hasTimedRuns ? { runs_per_driver: runsPerDriver } : {}),
      // Bỏ hẳn khoá khi chưa nhập gì, để trang công khai hiện dòng "sẽ công bố
      // trong điều lệ" thay vì một danh sách rỗng.
      ...(prizeItems.length > 0
        ? { prize_structure: { items: prizeItems } }
        : { prize_structure: null }),
      resource_locks: derivedLocks,
    }

    const rawData = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      contest_type_id: form.contest_type_id,
      contest_format_id: form.contest_format_id,
      contest_template_id: form.contest_template_id,
      track_type_id: form.track_type_id,
      participating_cafe_ids: form.participating_cafe_ids,
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: new Date(form.ends_at).toISOString(),
      registration_opens_at: new Date(form.registration_opens_at).toISOString(),
      registration_closes_at: new Date(
        form.registration_closes_at,
      ).toISOString(),
      capacity: Number(form.capacity),
      entry_fee: Number(form.entry_fee),
      banner_image_url: form.banner_image_url.trim() || null,
      vehicle_rule: {
        vehicle_policy: form.vehicle_policy,
        assignment_policy: form.assignment_policy,
      },
      config: derivedConfig,
    }

    // Lưới an toàn cuối: schema dùng chung với API, bắt những sai lệch mà
    // validate theo bước chưa phủ (ví dụ id không đúng dạng uuid).
    const result = contestUpsertSchema.safeParse(rawData)
    if (!result.success) {
      const newErrors: Record<string, string> = {}
      result.error.issues.forEach((issue) => {
        newErrors[issue.path.map(String).join(".")] = issue.message
      })
      setSubmitErrors(newErrors)
      toast.error(`Dữ liệu chưa hợp lệ: ${result.error.issues[0].message}`)
      return
    }
    setSubmitErrors({})

    try {
      const saved = await saveMutation.mutateAsync(
        result.data as ContestUpsertBody,
      )
      toast.success(isEdit ? "Đã cập nhật giải đấu" : "Đã tạo giải đấu")

      // Gói đã chọn ở màn giới thiệu được đặt luôn thành đơn phí, để provider
      // không phải chọn lại lần hai. Đặt đơn hỏng thì giải vẫn tạo xong — họ
      // chọn lại được ngay ở màn thanh toán bên dưới, không mất công điền năm bước.
      if (!isEdit && selectedFeePlanId && saved?.id) {
        try {
          await contestApi.createContestFeeOrder(saved.id, selectedFeePlanId)
        } catch (error) {
          toast.warning("Chưa đặt được gói tổ chức", {
            description: `${getErrorMessage(error)} Bạn chọn lại gói ở bước này.`,
          })
        }
      }

      // Tạo mới xong thì ở lại ngay trang này, hiện màn thanh toán tiếp nối —
      // không điều hướng đi đâu cả. Trước đây redirect thẳng ra danh sách
      // (hoặc màn vận hành nếu có sẵn `?plan=`), khiến việc trả phí trở thành
      // một việc rời rạc phải tự mò vào lại mới thấy.
      if (!isEdit && saved?.id) {
        setCreatedContest(saved)
        window.scrollTo({ top: 0, behavior: "smooth" })
        return
      }
      navigate(routePaths.providerContests)
    } catch (error) {
      toast.error("Không thể lưu giải đấu", {
        description: getErrorMessage(error),
      })
    }
  }

  return {
    contestId,
    isEdit,
    createdContest,
    form,
    setForm,
    validationErrors,
    trackConfigsByCafe,
    trackTypesIntersection,
    resourceLocks,
    setResourceLocks,
    extraConfig,
    setExtraConfig,
    typesQuery,
    formatsQuery,
    templatesQuery,
    trackTypesQuery,
    cafesQuery,
    contestQuery,
    selectedTemplate,
    selectedFormat,
    runtimeFormat,
    saveMutation,
    handleSubmit,
    stepIndex,
    maxUnlockedIndex,
    goToStep,
    goNext,
    goBack,
  }
}
