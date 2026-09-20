import { useMemo } from "react"
import { ArrowLeft, ArrowRight, Check, PlayCircle, Save } from "lucide-react"
import { useNavigate } from "react-router"

import { routePaths } from "@/app/router/route-paths"
import { ProviderPageHeader } from "@/pages/provider/components/ProviderPrimitives"
import { ProviderShell } from "@/pages/provider/components/ProviderShell"
import { Button } from "@/shared/ui/button"
import { getContestWorkspacePath } from "./contest-runtime/contest-workspace"
import { ContestFeePanel } from "./contest-runtime/components/ContestFeePanel"
import { ContestRuntimePanel } from "./contest-form/ContestRuntimePanel"
import { ContestWizardNav } from "./contest-form/ContestWizardNav"
import {
  CONTEST_WIZARD_STEPS,
  LAST_STEP_INDEX,
} from "./contest-form/contest-wizard"
import { StepBranches } from "./contest-form/steps/StepBranches"
import { StepFormat } from "./contest-form/steps/StepFormat"
import { StepIntro, type SummaryRow } from "./contest-form/steps/StepIntro"
import { StepSchedule } from "./contest-form/steps/StepSchedule"
import { StepTrack } from "./contest-form/steps/StepTrack"
import { useContestForm } from "./contest-form/useContestForm"

const VEHICLE_POLICY_LABEL: Record<string, string> = {
  RENTAL_ONLY: "Thuê xe của quán",
  MIXED: "Xe thuê hoặc xe cá nhân",
  BYOC_ONLY: "Khách tự mang xe",
}

export function ProviderContestFormPage() {
  const navigate = useNavigate()
  const {
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
  } = useContestForm()

  const cafes = useMemo(() => cafesQuery.data?.data ?? [], [cafesQuery.data])
  const step = CONTEST_WIZARD_STEPS[stepIndex]
  const isLastStep = stepIndex === LAST_STEP_INDEX

  const summaryRows = useMemo<SummaryRow[]>(() => {
    const selectedCafes = form.participating_cafe_ids
      .map((id) => cafes.find((cafe) => cafe.id === id)?.name)
      .filter((name): name is string => Boolean(name))
    const trackType = (trackTypesQuery.data ?? []).find(
      (item) => item.id === form.track_type_id,
    )
    const lockSummary = form.participating_cafe_ids
      .map((cafeId) => {
        const cafeName = cafes.find((cafe) => cafe.id === cafeId)?.name ?? "--"
        const lock = resourceLocks[cafeId]
        if (lock?.scope === "SELECTED_TRACKS") {
          return `${cafeName}: ${lock.track_config_ids.length} sân`
        }
        return `${cafeName}: cả chi nhánh`
      })
      .join(" · ")

    return [
      {
        label: "Chi nhánh tổ chức",
        value:
          selectedCafes.length > 0
            ? `${selectedCafes[0]} (chủ nhà)${selectedCafes.length > 1 ? ` + ${selectedCafes.length - 1} chi nhánh` : ""}`
            : "--",
        stepIndex: 0,
      },
      {
        label: "Loại đường đua",
        value: trackType?.name ?? "--",
        stepIndex: 1,
      },
      {
        label: "Phạm vi khoá sân",
        value: lockSummary || "--",
        stepIndex: 1,
      },
      {
        label: "Thể thức thi đấu",
        value: selectedTemplate
          ? `${selectedTemplate.name}${selectedFormat ? ` · ${selectedFormat.name}` : ""}`
          : "--",
        stepIndex: 2,
      },
      ...(runtimeFormat === "QUALIFYING_FINAL"
        ? [
            {
              label: "Số VĐV vào chung kết",
              value: form.finalists,
              stepIndex: 2,
            },
          ]
        : []),
      {
        label: "Xe thi đấu",
        value: VEHICLE_POLICY_LABEL[form.vehicle_policy] ?? "--",
        stepIndex: 2,
      },
      ...(form.vehicle_policy !== "BYOC_ONLY"
        ? [
            {
              label: "Tiền thuê xe",
              value: "Miễn phí — lệ phí giải đã bao gồm",
              stepIndex: 2,
            },
          ]
        : []),
      {
        label: "Cổng đăng ký",
        value: `${formatDateTime(form.registration_opens_at)} → ${formatDateTime(form.registration_closes_at)}`,
        stepIndex: 3,
      },
      {
        label: "Thời gian thi đấu",
        value: `${formatDateTime(form.starts_at)} → ${formatDateTime(form.ends_at)}`,
        stepIndex: 3,
      },
      {
        label: "Quy mô & lệ phí",
        value: `Tối đa ${form.capacity || "--"} VĐV · ${formatFee(form.entry_fee)}`,
        stepIndex: 3,
      },
    ]
  }, [
    cafes,
    form,
    resourceLocks,
    runtimeFormat,
    selectedFormat,
    selectedTemplate,
    trackTypesQuery.data,
  ])

  // 5 bước đã xong, giải vừa tạo — nối tiếp luôn màn thanh toán tại đây thay
  // vì điều hướng đi nơi khác, để "trả phí" đọc như bước cuối của cùng một
  // luồng chứ không phải một việc rời rạc phải tự mò vào lại mới thấy.
  if (createdContest) {
    return (
      <ProviderShell>
        <ProviderPageHeader
          title="Tạo giải đấu"
          description="Đi lần lượt từng bước — mỗi bước chỉ hỏi những gì cần cho bước tiếp theo."
        />

        <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#c4c7c8] bg-white px-5 py-4 shadow-sm">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <Check className="size-4" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-600">
              Bước 6/6
            </p>
            <h2 className="text-lg font-black tracking-tight text-[#1c1b1b]">
              Đã tạo "{createdContest.name}" — còn bước trả phí tổ chức
            </h2>
          </div>
        </div>

        <div className="mt-4">
          <ContestFeePanel contest={createdContest} />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-[#c4c7c8] bg-white px-5 py-4 shadow-sm">
          <p className="mr-auto text-xs font-semibold text-[#747878]">
            Chưa trả phí thì giải vẫn ở dạng nháp — bạn trả sau ở đây cũng
            được, không mất gì đã điền.
          </p>
          <Button
            type="button"
            variant="outline"
            className="h-10 gap-2 rounded-lg border-[#c4c7c8] bg-white text-[#1c1b1b] hover:bg-[#f6f3f2]"
            onClick={() => navigate(routePaths.providerContests)}
          >
            Để sau, về danh sách giải
          </Button>
          <Button
            type="button"
            className="h-10 gap-2 rounded-lg bg-orange-600 px-5 font-bold text-white hover:bg-orange-700"
            onClick={() =>
              navigate(getContestWorkspacePath(createdContest.id, "overview"))
            }
          >
            Vào trang quản lý giải
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </ProviderShell>
    )
  }

  return (
    <ProviderShell>
      <ProviderPageHeader
        title={isEdit ? "Chỉnh sửa giải đấu" : "Tạo giải đấu"}
        description="Đi lần lượt từng bước — mỗi bước chỉ hỏi những gì cần cho bước tiếp theo."
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#c4c7c8] bg-white px-5 py-4 shadow-sm">
        <ContestWizardNav
          currentIndex={stepIndex}
          maxUnlockedIndex={maxUnlockedIndex}
          onSelect={goToStep}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-10 gap-2 rounded-lg border-[#c4c7c8] bg-[#f6f3f2] text-[#1c1b1b] hover:bg-[#ebe7e7]"
            onClick={() => navigate(routePaths.providerContests)}
          >
            <ArrowLeft className="size-4" />
            Thoát
          </Button>
          {isEdit && contestId ? (
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-2 rounded-lg border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
              onClick={() =>
                navigate(getContestWorkspacePath(contestId, "overview"))
              }
            >
              <PlayCircle className="size-4" />
              Mở vận hành giải đấu
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[#c4c7c8] bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-600">
            Bước {stepIndex + 1}/{CONTEST_WIZARD_STEPS.length}
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-[#1c1b1b]">
            {step.title}
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#5d5f5f]">
            {step.subtitle}
          </p>
        </div>

        {step.id === "branches" ? (
          <StepBranches
            form={form}
            setForm={setForm}
            errors={validationErrors}
            cafes={cafes}
            isLoading={cafesQuery.isLoading}
            isEdit={isEdit}
            contestStatus={contestQuery.data?.status}
          />
        ) : null}

        {step.id === "track" ? (
          <StepTrack
            form={form}
            setForm={setForm}
            errors={validationErrors}
            cafes={cafes}
            trackTypes={trackTypesQuery.data ?? []}
            trackTypesIntersection={trackTypesIntersection}
            trackConfigsByCafe={trackConfigsByCafe}
            resourceLocks={resourceLocks}
            setResourceLocks={setResourceLocks}
          />
        ) : null}

        {step.id === "format" ? (
          <StepFormat
            form={form}
            setForm={setForm}
            errors={validationErrors}
            contestTypes={typesQuery.data ?? []}
            contestFormats={formatsQuery.data ?? []}
            contestTemplates={templatesQuery.data ?? []}
            runtimeFormat={runtimeFormat}
          />
        ) : null}

        {step.id === "schedule" ? (
          <StepSchedule
            form={form}
            setForm={setForm}
            errors={validationErrors}
            isEdit={isEdit}
            runtimeFormat={runtimeFormat}
          />
        ) : null}

        {step.id === "intro" ? (
          <StepIntro
            form={form}
            setForm={setForm}
            errors={validationErrors}
            contestId={contestId}
            summaryRows={summaryRows}
            onEditStep={goToStep}
          />
        ) : null}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e2e1] pt-6">
          <Button
            type="button"
            variant="outline"
            className="h-11 gap-2 rounded-lg border-[#c4c7c8] bg-white text-[#1c1b1b] hover:bg-[#f6f3f2]"
            disabled={stepIndex === 0}
            onClick={goBack}
          >
            <ArrowLeft className="size-4" />
            Bước trước
          </Button>

          {isLastStep ? (
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={saveMutation.isPending}
              className="h-11 gap-2 rounded-lg bg-orange-600 px-6 font-bold text-white hover:bg-orange-700"
            >
              {isEdit ? (
                <Save className="size-4" />
              ) : (
                <ArrowRight className="size-4" />
              )}
              {saveMutation.isPending
                ? "Đang lưu..."
                : isEdit
                  ? "Lưu thay đổi"
                  : "Tiếp tục thanh toán"}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={goNext}
              className="h-11 gap-2 rounded-lg bg-[#1c1b1b] px-6 font-bold text-white hover:bg-[#313030]"
            >
              Tiếp tục
              <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {isEdit && contestId ? (
        <div className="mt-4">
          <ContestRuntimePanel contestId={contestId} />
        </div>
      ) : null}
    </ProviderShell>
  )
}

function formatDateTime(value: string) {
  if (!value) return "--"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "--"
  return date.toLocaleString("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  })
}

function formatFee(value: string) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return "--"
  if (amount === 0) return "Miễn phí"
  return `${new Intl.NumberFormat("vi-VN").format(amount)}đ`
}
