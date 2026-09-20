import { useState } from "react"
import { useNavigate } from "react-router"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import {
  Mail,
  Lock,
  User,
  Phone,
  Building2,
  Receipt,
  ChevronLeft,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  Loader2,
} from "lucide-react"

import { AppLogo } from "@/shared/components/AppLogo"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Textarea } from "@/shared/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { toast } from "sonner"
import { subscriptionApi } from "@/features/subscriptions/api/subscription.api"
import type { TaxLookupResult } from "@/features/subscriptions/types"
import { routePaths } from "@/app/router/route-paths"
import { KycDocumentUpload } from "@/features/provider-kyc/components/KycDocumentUpload"
import type { KycBusinessType } from "@/features/provider-kyc/types"
import type { KycFiles } from "@/features/provider-kyc/components/KycDocumentUpload"

const schema = z
  .object({
    full_name: z.string().min(2, "Họ tên tối thiểu 2 ký tự"),
    email: z.string().email("Email không hợp lệ"),
    phone: z
      .string()
      .min(9, "Số điện thoại không hợp lệ")
      .optional()
      .or(z.literal("")),
    password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự"),
    confirm_password: z.string(),
    business_name: z.string().min(2, "Tên doanh nghiệp tối thiểu 2 ký tự"),
    business_description: z.string().max(1000).optional(),
    // Khớp luật backend: 10 số, hoặc 10 số kèm mã đơn vị phụ thuộc (-001).
    tax_code: z
      .string()
      .trim()
      .regex(/^\d{10}(-\d{3})?$/, "Mã số thuế gồm 10 số, hoặc 10 số kèm -001"),
    business_email: z.string().trim().email("Email doanh nghiệp không hợp lệ"),
  })
  .refine((d) => d.password === d.confirm_password, {
    message: "Mật khẩu xác nhận không trùng",
    path: ["confirm_password"],
  })

type FormValues = z.infer<typeof schema>

const REQUIRED_FIELDS: Record<KycBusinessType, string[]> = {
  INDIVIDUAL: ["cccd_front", "cccd_back", "venue_photo"],
  BUSINESS: ["gpkd", "representative_id", "venue_photo"],
}

const FIELD_LABELS: Record<string, string> = {
  cccd_front: "CCCD mặt trước",
  cccd_back: "CCCD mặt sau",
  gpkd: "Giấy phép kinh doanh",
  representative_id: "CCCD người đại diện",
  venue_photo: "Ảnh mặt bằng",
}

export function ProviderRegisterPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [showTerms, setShowTerms] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [businessType, setBusinessType] =
    useState<KycBusinessType>("INDIVIDUAL")
  const [kycFiles, setKycFiles] = useState<KycFiles>({})
  const [fileErrors, setFileErrors] = useState<Partial<Record<string, string>>>(
    {},
  )

  const {
    register,
    handleSubmit,
    trigger,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const [taxLookup, setTaxLookup] = useState<TaxLookupResult | null>(null)
  const [taxLookupLoading, setTaxLookupLoading] = useState(false)
  const taxCodeField = register("tax_code")

  /**
   * Tra mã số thuế ngay khi rời ô nhập.
   *
   * Điền sẵn tên doanh nghiệp giúp người đăng ký khỏi gõ lại tên pháp lý dài
   * dòng, nhưng KHÔNG đè lên tên họ đã tự nhập — nhiều quán để tên thương hiệu
   * khác tên trên giấy phép.
   *
   * Đây chỉ là lớp hiển thị: backend tra lại lần nữa lúc nhận hồ sơ, nên bỏ qua
   * bước này bằng cách gọi thẳng API cũng không lọt.
   */
  const handleTaxLookup = async (
    rawTaxCode: string,
  ): Promise<TaxLookupResult | null> => {
    const taxCode = rawTaxCode.trim()
    if (!/^\d{10}(-\d{3})?$/.test(taxCode)) {
      setTaxLookup(null)
      return null
    }

    setTaxLookupLoading(true)
    try {
      const result = await subscriptionApi.lookupBusiness(taxCode)
      setTaxLookup(result)
      if (result.status === "ACTIVE" && !getValues("business_name")?.trim()) {
        setValue("business_name", result.business.legalName, {
          shouldValidate: true,
        })
      }
      return result
    } catch {
      const fallback: TaxLookupResult = { status: "UNAVAILABLE" }
      setTaxLookup(fallback)
      return fallback
    } finally {
      setTaxLookupLoading(false)
    }
  }

  const handleNextStep = async () => {
    const fieldsToValidate: Array<keyof FormValues> = [
      "full_name",
      "email",
      "phone",
      "password",
      "confirm_password",
    ]
    const isValid = await trigger(fieldsToValidate)
    if (!isValid) return

    if (!agreed) {
      toast.error(
        "Vui lòng đồng ý với điều khoản sử dụng và chính sách đối tác.",
      )
      return
    }

    setStep(2)
  }

  const handleStep2Next = async () => {
    const isValid = await trigger([
      "business_name",
      "business_description",
      "tax_code",
      "business_email",
    ])
    if (!isValid) return

    // Chưa tra thì tra ngay tại đây, tránh trường hợp người dùng dán mã rồi bấm
    // tiếp mà không hề rời ô nhập.
    const result = taxLookup ?? (await handleTaxLookup(getValues("tax_code")))
    if (!result) return

    if (result.status === "NOT_FOUND" || result.status === "INVALID") {
      toast.error("Mã số thuế không tra được trên dữ liệu Cục Thuế.")
      return
    }
    if (result.status === "INACTIVE") {
      toast.error(`Cơ sở đang ở trạng thái "${result.business.taxStatus}".`)
      return
    }

    setStep(3)
  }

  const validateFiles = (): boolean => {
    const required = REQUIRED_FIELDS[businessType]
    const newErrors: Partial<Record<string, string>> = {}
    for (const field of required) {
      if (!kycFiles[field]) {
        newErrors[field] = `${FIELD_LABELS[field]} là bắt buộc`
      }
    }
    setFileErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const onSubmit = async (data: FormValues) => {
    if (!validateFiles()) return

    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append("email", data.email)
      formData.append("password", data.password)
      formData.append("full_name", data.full_name)
      if (data.phone) formData.append("phone", data.phone)
      formData.append("business_name", data.business_name)
      if (data.business_description)
        formData.append("business_description", data.business_description)
      formData.append("tax_code", data.tax_code)
      formData.append("business_email", data.business_email)
      formData.append("business_type", businessType)

      for (const [fieldName, file] of Object.entries(kycFiles)) {
        if (file) formData.append(fieldName, file)
      }

      await subscriptionApi.registerProvider(formData)
      setSuccess(true)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message
      toast.error(msg ?? "Đăng ký thất bại. Vui lòng thử lại.")
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md space-y-6 bg-white rounded-2xl border border-slate-100 shadow-xl shadow-slate-100/50 p-8 text-center">
          <div className="flex justify-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-emerald-50 border border-emerald-100">
              <CheckCircle2 className="size-8 text-emerald-600" />
            </div>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Đăng ký thành công!
            </h2>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">
              Tài khoản của bạn đã được tạo thành công và đang chờ duyệt. Vui
              lòng đăng nhập để theo dõi trạng thái hồ sơ của bạn.
            </p>
          </div>
          <Button
            className="w-full h-11 bg-orange-600 hover:bg-orange-700 rounded-xl font-bold shadow-md shadow-orange-600/20 active:translate-y-[1px]"
            onClick={() => navigate(routePaths.login)}
          >
            Đăng nhập ngay
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-stretch overflow-hidden">
      {/* Sidebar background */}
      <div className="hidden lg:flex lg:w-2/5 bg-slate-950 text-white flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute top-[-20%] left-[-20%] w-[500px] h-[500px] rounded-full bg-orange-600/15 blur-[100px] pointer-events-none" />
        <AppLogo variant="dark" className="relative z-10" />
        <div className="relative z-10 space-y-8">
          <div>
            <h2 className="text-2xl font-extrabold leading-tight">
              Đăng ký đối tác RCField
            </h2>
            <p className="mt-3 text-sm text-slate-400 leading-relaxed">
              Số hóa hoạt động vận hành sân RC của bạn. Quản lý chi nhánh, đặt
              lịch, nhân viên — tất cả trong một nền tảng quản trị thông minh.
            </p>
          </div>
          <div className="space-y-3 text-xs font-semibold text-slate-400">
            {[
              "30 ngày dùng thử miễn phí đầy đủ tính năng",
              "Hỗ trợ chatbot AI tự động hóa chăm sóc khách hàng",
              "Quản lý lịch đặt, kiểm tra xe rental bằng hình ảnh",
              "Tự động tính toán hoa hồng & doanh thu chi tiết",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </div>
        <p className="relative z-10 text-[10px] text-slate-500">
          © 2026 RCField. All rights reserved.
        </p>
      </div>

      {/* Register Form Main */}
      <div className="w-full lg:w-3/5 flex items-center justify-center p-6 md:p-12 bg-white overflow-y-auto">
        <button
          onClick={() => navigate(routePaths.login)}
          className="absolute top-6 left-6 lg:hidden inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-900"
        >
          <ChevronLeft className="size-4" />
          Đăng nhập
        </button>

        <div className="w-full max-w-lg space-y-6 pt-10 pb-8">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-950 tracking-tight">
              Đăng ký Đối tác liên kết
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              Bắt đầu phát triển kinh doanh cùng hệ sinh thái RCField.
            </p>
          </div>

          {/* Steps Indicator */}
          <div className="flex items-center justify-between bg-slate-50 border border-slate-100 p-3 rounded-2xl">
            <div className="flex items-center gap-2">
              <span
                className={`size-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                  step === 1
                    ? "bg-orange-600 text-white shadow-sm"
                    : "bg-emerald-100 text-emerald-700"
                }`}
              >
                {step > 1 ? <CheckCircle2 className="size-4" /> : "1"}
              </span>
              <span className="text-xs font-bold text-slate-700">
                Tài khoản
              </span>
            </div>
            <div className="flex-1 h-[2px] bg-slate-200 mx-3" />
            <div className="flex items-center gap-2">
              <span
                className={`size-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                  step === 2
                    ? "bg-orange-600 text-white shadow-sm"
                    : step > 2
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-200 text-slate-500"
                }`}
              >
                {step > 2 ? <CheckCircle2 className="size-4" /> : "2"}
              </span>
              <span className="text-xs font-bold text-slate-700">
                Doanh nghiệp
              </span>
            </div>
            <div className="flex-1 h-[2px] bg-slate-200 mx-3" />
            <div className="flex items-center gap-2">
              <span
                className={`size-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                  step === 3
                    ? "bg-orange-600 text-white shadow-sm"
                    : "bg-slate-200 text-slate-500"
                }`}
              >
                {step === 3 ? <ShieldCheck className="size-4" /> : "3"}
              </span>
              <span className="text-xs font-bold text-slate-700">Giấy tờ</span>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {step === 1 && (
              <div className="space-y-4 animate-fadeIn">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Họ và tên *" error={errors.full_name?.message}>
                    <InputIcon icon={User}>
                      <Input
                        placeholder="Nguyễn Văn A"
                        {...register("full_name")}
                        className="pl-10 h-11 rounded-xl"
                      />
                    </InputIcon>
                  </Field>
                  <Field label="Email *" error={errors.email?.message}>
                    <InputIcon icon={Mail}>
                      <Input
                        type="email"
                        placeholder="you@company.com"
                        {...register("email")}
                        className="pl-10 h-11 rounded-xl"
                      />
                    </InputIcon>
                  </Field>
                  <Field label="Số điện thoại" error={errors.phone?.message}>
                    <InputIcon icon={Phone}>
                      <Input
                        placeholder="0987654321"
                        {...register("phone")}
                        className="pl-10 h-11 rounded-xl"
                      />
                    </InputIcon>
                  </Field>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Mật khẩu *" error={errors.password?.message}>
                    <InputIcon icon={Lock}>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        {...register("password")}
                        className="pl-10 h-11 rounded-xl"
                      />
                    </InputIcon>
                  </Field>
                  <Field
                    label="Xác nhận mật khẩu *"
                    error={errors.confirm_password?.message}
                  >
                    <InputIcon icon={Lock}>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        {...register("confirm_password")}
                        className="pl-10 h-11 rounded-xl"
                      />
                    </InputIcon>
                  </Field>
                </div>

                <div className="flex items-start gap-3 mt-2 bg-slate-50/50 border border-slate-100 p-3.5 rounded-xl">
                  <input
                    type="checkbox"
                    id="terms"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5 size-4 rounded accent-orange-600 cursor-pointer"
                  />
                  <label
                    htmlFor="terms"
                    className="text-xs text-slate-500 leading-relaxed cursor-pointer select-none"
                  >
                    Tôi đồng ý với{" "}
                    <button
                      type="button"
                      onClick={() => setShowTerms(true)}
                      className="font-bold text-orange-600 hover:underline"
                    >
                      Điều khoản dịch vụ
                    </button>{" "}
                    và{" "}
                    <button
                      type="button"
                      onClick={() => setShowPrivacy(true)}
                      className="font-bold text-orange-600 hover:underline"
                    >
                      Chính sách bảo mật đối tác
                    </button>{" "}
                    của RCField.
                  </label>
                </div>

                <Button
                  type="button"
                  onClick={handleNextStep}
                  className="w-full h-11 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl gap-2 shadow-md shadow-orange-600/10"
                >
                  Tiếp tục bước 2 <ArrowRight className="size-4" />
                </Button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4 animate-fadeIn">
                <Field
                  label="Tên doanh nghiệp / Tên cơ sở sân đua *"
                  error={errors.business_name?.message}
                >
                  <InputIcon icon={Building2}>
                    <Input
                      placeholder="Ví dụ: RC Cafe Bình Thạnh"
                      {...register("business_name")}
                      className="pl-10 h-11 rounded-xl"
                    />
                  </InputIcon>
                </Field>

                <Field label="Mã số thuế *" error={errors.tax_code?.message}>
                  <InputIcon icon={Receipt}>
                    <Input
                      placeholder="Ví dụ: 0109283745"
                      inputMode="numeric"
                      {...taxCodeField}
                      onBlur={(event) => {
                        void taxCodeField.onBlur(event)
                        void handleTaxLookup(event.target.value)
                      }}
                      className="pl-10 h-11 rounded-xl"
                    />
                  </InputIcon>
                </Field>

                <TaxLookupPanel
                  loading={taxLookupLoading}
                  result={taxLookup}
                  onRetry={() => void handleTaxLookup(getValues("tax_code"))}
                />

                <Field
                  label="Email liên hệ doanh nghiệp *"
                  error={errors.business_email?.message}
                >
                  <InputIcon icon={Mail}>
                    <Input
                      type="email"
                      placeholder="lienhe@quancuaban.vn"
                      {...register("business_email")}
                      className="pl-10 h-11 rounded-xl"
                    />
                  </InputIcon>
                </Field>
                <p className="-mt-2 text-xs font-medium text-slate-500">
                  Email này dùng cho hoá đơn và trao đổi công việc, có thể khác
                  email đăng nhập.
                </p>

                <Field
                  label="Mô tả doanh nghiệp"
                  error={errors.business_description?.message}
                >
                  <Textarea
                    placeholder="Giới thiệu sơ lược về sân đua, số lượng xe rental, các dịch vụ ăn uống đi kèm..."
                    rows={4}
                    {...register("business_description")}
                    className="rounded-xl resize-none min-h-[100px]"
                  />
                </Field>

                <div className="flex gap-3">
                  <Button
                    type="button"
                    onClick={() => setStep(1)}
                    variant="outline"
                    className="w-1/3 h-11 border-slate-200 hover:bg-slate-50 rounded-xl text-slate-600 font-bold gap-2"
                  >
                    <ArrowLeft className="size-4" /> Quay lại
                  </Button>

                  <Button
                    type="button"
                    onClick={handleStep2Next}
                    className="w-2/3 h-11 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl gap-2 shadow-md shadow-orange-600/10"
                  >
                    Tiếp tục bước 3 <ArrowRight className="size-4" />
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5 animate-fadeIn">
                {/* Business type selector */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700">
                    Loại hình kinh doanh *
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    {(["INDIVIDUAL", "BUSINESS"] as KycBusinessType[]).map(
                      (type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setBusinessType(type)
                            setKycFiles({})
                            setFileErrors({})
                          }}
                          className={`h-11 rounded-xl border-2 text-xs font-bold transition-colors ${
                            businessType === type
                              ? "border-orange-500 bg-orange-50 text-orange-700"
                              : "border-slate-200 text-slate-600 hover:border-slate-300"
                          }`}
                        >
                          {type === "INDIVIDUAL" ? "Cá nhân" : "Doanh nghiệp"}
                        </button>
                      ),
                    )}
                  </div>
                </div>

                <KycDocumentUpload
                  businessType={businessType}
                  files={kycFiles}
                  errors={fileErrors}
                  onChange={(fieldName, file) => {
                    setKycFiles((prev) => ({ ...prev, [fieldName]: file }))
                    if (fileErrors[fieldName]) {
                      setFileErrors((prev) => {
                        const next = { ...prev }
                        delete next[fieldName]
                        return next
                      })
                    }
                  }}
                />

                <div className="flex gap-3">
                  <Button
                    type="button"
                    onClick={() => setStep(2)}
                    variant="outline"
                    className="w-1/3 h-11 border-slate-200 hover:bg-slate-50 rounded-xl text-slate-600 font-bold gap-2"
                  >
                    <ArrowLeft className="size-4" /> Quay lại
                  </Button>

                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-2/3 h-11 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl gap-2 shadow-md shadow-orange-600/10"
                  >
                    {submitting ? (
                      <>
                        <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{" "}
                        Đang gửi...
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-4 text-amber-200" /> Hoàn tất
                        đăng ký
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            <p className="text-center text-xs text-slate-500 mt-6">
              Đã có tài khoản đối tác?{" "}
              <button
                type="button"
                onClick={() => navigate(routePaths.login)}
                className="font-bold text-orange-600 hover:underline"
              >
                Đăng nhập ngay
              </button>
            </p>
          </form>
        </div>
      </div>

      <TermsDialog open={showTerms} onClose={() => setShowTerms(false)} />
      <PrivacyDialog open={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </div>
  )
}

function TermsDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Điều khoản dịch vụ Đối tác RCField</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 text-sm text-slate-600 leading-relaxed">
          <p className="text-xs text-slate-400">
            Phiên bản 1.0 — Có hiệu lực từ ngày 01/07/2026
          </p>

          <p>
            Vui lòng đọc kỹ Điều khoản dịch vụ này trước khi đăng ký trở thành
            Đối tác của Nền tảng RCField. Bằng việc hoàn tất đăng ký, bạn xác
            nhận đã đọc, hiểu và đồng ý bị ràng buộc bởi toàn bộ các điều khoản
            dưới đây.
          </p>

          <div className="space-y-1">
            <p className="font-semibold text-slate-800">1. Định nghĩa</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="font-medium text-slate-700">
                  "RCField" / "Nền tảng"
                </span>
                : Công ty vận hành phần mềm quản lý sân xe RC mô hình tại Việt
                Nam.
              </li>
              <li>
                <span className="font-medium text-slate-700">
                  "Đối tác" / "Provider"
                </span>
                : Cá nhân hoặc tổ chức kinh doanh sân xe RC mô hình đăng ký sử
                dụng Nền tảng.
              </li>
              <li>
                <span className="font-medium text-slate-700">"Khách hàng"</span>
                : Người dùng cuối đặt lịch chơi tại cơ sở của Đối tác thông qua
                Nền tảng.
              </li>
              <li>
                <span className="font-medium text-slate-700">"Dịch vụ"</span>:
                Toàn bộ tính năng phần mềm được cung cấp theo gói đăng ký, bao
                gồm quản lý đặt lịch, quản lý tài sản, thanh toán và báo cáo.
              </li>
            </ul>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-slate-800">
              2. Điều kiện tham gia
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Đối tác phải là cá nhân đủ 18 tuổi trở lên hoặc tổ chức được
                thành lập hợp pháp tại Việt Nam.
              </li>
              <li>
                Đối tác phải hoàn tất quy trình xác minh danh tính (KYC) bằng
                cách cung cấp giấy tờ hợp lệ theo yêu cầu của RCField.
              </li>
              <li>
                Đối tác phải có quyền hợp pháp để vận hành cơ sở kinh doanh tại
                địa điểm đăng ký.
              </li>
              <li>
                Việc phê duyệt tài khoản thuộc thẩm quyền quyết định cuối cùng
                của RCField và có thể bị từ chối mà không cần nêu lý do.
              </li>
            </ul>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-slate-800">
              3. Quyền và nghĩa vụ của Đối tác
            </p>
            <p className="font-medium text-slate-700">
              3.1. Quyền của Đối tác:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Được sử dụng đầy đủ tính năng theo gói đăng ký đã thanh toán.
              </li>
              <li>
                Được hỗ trợ kỹ thuật trong giờ hành chính qua các kênh chính
                thức.
              </li>
              <li>
                Được thông báo trước tối thiểu 30 ngày về mọi thay đổi lớn ảnh
                hưởng đến hoạt động kinh doanh.
              </li>
            </ul>
            <p className="font-medium text-slate-700 mt-2">
              3.2. Nghĩa vụ của Đối tác:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Cung cấp thông tin đăng ký chính xác, đầy đủ và cập nhật kịp
                thời khi có thay đổi.
              </li>
              <li>
                Tự chịu trách nhiệm về tính hợp pháp của hoạt động kinh doanh và
                tuân thủ mọi quy định pháp luật hiện hành.
              </li>
              <li>
                Bảo mật thông tin đăng nhập, không chia sẻ tài khoản cho bên thứ
                ba.
              </li>
              <li>
                Không sử dụng Nền tảng cho mục đích gian lận, rửa tiền hoặc các
                hành vi vi phạm pháp luật.
              </li>
              <li>
                Không cố tình phá hoại, tấn công hoặc khai thác lỗ hổng bảo mật
                của Nền tảng.
              </li>
              <li>Thanh toán phí dịch vụ đúng hạn theo gói đã đăng ký.</li>
            </ul>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-slate-800">
              4. Quyền và nghĩa vụ của RCField
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                RCField cam kết duy trì tính ổn định và bảo mật của Nền tảng
                theo tiêu chuẩn kỹ thuật hiện hành.
              </li>
              <li>
                RCField có quyền tạm ngưng hoặc chấm dứt tài khoản vi phạm Điều
                khoản mà không cần thông báo trước trong trường hợp vi phạm
                nghiêm trọng.
              </li>
              <li>
                RCField có quyền điều chỉnh tính năng, giao diện hoặc cấu trúc
                dịch vụ nhằm cải thiện trải nghiệm, với thông báo hợp lý.
              </li>
              <li>
                RCField không chịu trách nhiệm về các thiệt hại phát sinh từ
                việc Đối tác vi phạm điều khoản hoặc pháp luật.
              </li>
            </ul>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-slate-800">
              5. Phí dịch vụ và thanh toán
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                RCField thu phí theo mô hình đăng ký gói (SaaS) hàng tháng hoặc
                hàng năm, không thu hoa hồng trên từng giao dịch đặt lịch của
                Khách hàng.
              </li>
              <li>
                Phí có thể thay đổi với thông báo trước tối thiểu 30 ngày. Gói
                đang sử dụng được giữ nguyên giá đến hết chu kỳ thanh toán hiện
                tại.
              </li>
              <li>
                Không hoàn tiền cho thời gian sử dụng đã qua, trừ trường hợp lỗi
                kỹ thuật nghiêm trọng thuộc trách nhiệm của RCField.
              </li>
              <li>
                Tài khoản quá hạn thanh toán sẽ bị chuyển sang trạng thái gia
                hạn (Grace Period) 7 ngày trước khi tạm ngưng.
              </li>
            </ul>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-slate-800">
              6. Quyền sở hữu trí tuệ
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Toàn bộ phần mềm, giao diện, logo và tài liệu của RCField là tài
                sản trí tuệ thuộc quyền sở hữu của RCField.
              </li>
              <li>
                Đối tác không được sao chép, phân phối lại, dịch ngược hoặc tạo
                sản phẩm phái sinh từ Nền tảng.
              </li>
              <li>
                Dữ liệu kinh doanh (đặt lịch, khách hàng, tài sản) do Đối tác
                tạo ra thuộc sở hữu của Đối tác. RCField chỉ lưu trữ và xử lý
                theo ủy quyền.
              </li>
            </ul>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-slate-800">
              7. Giới hạn trách nhiệm
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                RCField không chịu trách nhiệm về lợi nhuận bị mất, gián đoạn
                kinh doanh hoặc thiệt hại gián tiếp phát sinh từ việc sử dụng
                Nền tảng.
              </li>
              <li>
                Tổng mức bồi thường tối đa của RCField không vượt quá tổng phí
                dịch vụ Đối tác đã thanh toán trong 3 tháng gần nhất.
              </li>
              <li>
                RCField không chịu trách nhiệm về tranh chấp giữa Đối tác và
                Khách hàng cuối.
              </li>
            </ul>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-slate-800">8. Chấm dứt hợp đồng</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Đối tác có thể chấm dứt bất kỳ lúc nào bằng cách gửi thông báo
                bằng văn bản. Dịch vụ tiếp tục đến hết chu kỳ thanh toán hiện
                tại.
              </li>
              <li>
                RCField có quyền chấm dứt ngay lập tức nếu Đối tác vi phạm
                nghiêm trọng Điều khoản, vi phạm pháp luật, hoặc có hành vi gây
                hại cho Nền tảng/người dùng khác.
              </li>
              <li>
                Sau khi chấm dứt, Đối tác có 30 ngày để xuất dữ liệu. Sau thời
                hạn này, dữ liệu sẽ bị xóa vĩnh viễn theo chính sách lưu trữ.
              </li>
            </ul>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-slate-800">
              9. Sửa đổi điều khoản
            </p>
            <p>
              RCField có quyền sửa đổi Điều khoản này bất kỳ lúc nào. Thay đổi
              sẽ được thông báo qua email đăng ký và trên Nền tảng trước ít nhất
              15 ngày. Việc tiếp tục sử dụng dịch vụ sau thời điểm có hiệu lực
              được xem là chấp thuận các thay đổi.
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-slate-800">
              10. Luật áp dụng và giải quyết tranh chấp
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Điều khoản này được điều chỉnh bởi pháp luật Việt Nam hiện hành.
              </li>
              <li>
                Các bên ưu tiên giải quyết tranh chấp thông qua thương lượng
                thiện chí trong vòng 30 ngày kể từ ngày phát sinh tranh chấp.
              </li>
              <li>
                Nếu thương lượng không thành, tranh chấp sẽ được đưa ra Tòa án
                nhân dân có thẩm quyền tại Thành phố Hồ Chí Minh để giải quyết.
              </li>
            </ul>
          </div>

          <p className="text-xs text-slate-400 pt-2 border-t border-slate-100">
            Cập nhật lần cuối: 01/07/2026 · Phiên bản 1.0 · Tài liệu này có thể
            được cập nhật. Mọi thắc mắc liên hệ: support@rcfield.vn
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PrivacyDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Chính sách bảo mật dành cho Đối tác RCField</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 text-sm text-slate-600 leading-relaxed">
          <p className="text-xs text-slate-400">
            Phiên bản 1.0 — Có hiệu lực từ ngày 01/07/2026
          </p>

          <p>
            Chính sách này mô tả cách RCField thu thập, sử dụng, lưu trữ và bảo
            vệ thông tin cá nhân của Đối tác trong quá trình đăng ký và sử dụng
            Nền tảng, phù hợp với Luật An ninh mạng 2018, Nghị định
            13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân và các quy định pháp luật
            hiện hành tại Việt Nam.
          </p>

          <div className="space-y-1">
            <p className="font-semibold text-slate-800">
              1. Thông tin chúng tôi thu thập
            </p>
            <p className="font-medium text-slate-700">
              1.1. Thông tin nhận dạng cá nhân:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Họ và tên đầy đủ, ngày tháng năm sinh</li>
              <li>Số Căn cước công dân / Chứng minh nhân dân (cả hai mặt)</li>
              <li>Địa chỉ email, số điện thoại liên lạc</li>
            </ul>
            <p className="font-medium text-slate-700 mt-2">
              1.2. Thông tin doanh nghiệp (áp dụng cho Đối tác doanh nghiệp):
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Tên doanh nghiệp, mã số thuế, địa chỉ trụ sở</li>
              <li>Giấy chứng nhận đăng ký kinh doanh</li>
              <li>
                Thông tin người đại diện pháp luật và CCCD của người đại diện
              </li>
            </ul>
            <p className="font-medium text-slate-700 mt-2">
              1.3. Thông tin cơ sở kinh doanh:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Ảnh thực tế mặt bằng kinh doanh</li>
              <li>Địa chỉ và thông tin liên hệ của từng chi nhánh</li>
            </ul>
            <p className="font-medium text-slate-700 mt-2">
              1.4. Dữ liệu hoạt động:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Lịch sử đặt lịch, giao dịch thanh toán, báo cáo doanh thu</li>
              <li>
                Nhật ký truy cập hệ thống (log), địa chỉ IP, loại trình duyệt
              </li>
            </ul>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-slate-800">
              2. Mục đích xử lý thông tin
            </p>
            <p>Thông tin được thu thập và xử lý cho các mục đích sau:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="font-medium text-slate-700">
                  Xác minh danh tính (KYC):
                </span>{" "}
                Đảm bảo Đối tác là cá nhân/tổ chức hợp pháp, phòng ngừa gian lận
                và rửa tiền theo quy định pháp luật.
              </li>
              <li>
                <span className="font-medium text-slate-700">
                  Cung cấp dịch vụ:
                </span>{" "}
                Thiết lập và quản lý tài khoản, xử lý thanh toán, hỗ trợ kỹ
                thuật.
              </li>
              <li>
                <span className="font-medium text-slate-700">
                  Liên lạc và thông báo:
                </span>{" "}
                Gửi thông tin về cập nhật dịch vụ, hóa đơn, cảnh báo bảo mật và
                thông báo quan trọng.
              </li>
              <li>
                <span className="font-medium text-slate-700">
                  Tuân thủ pháp lý:
                </span>{" "}
                Đáp ứng yêu cầu của cơ quan nhà nước có thẩm quyền khi được yêu
                cầu hợp pháp.
              </li>
              <li>
                <span className="font-medium text-slate-700">
                  Cải thiện dịch vụ:
                </span>{" "}
                Phân tích dữ liệu ẩn danh để nâng cao chất lượng Nền tảng.
              </li>
            </ul>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-slate-800">
              3. Nguyên tắc xử lý dữ liệu
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Chỉ thu thập dữ liệu cần thiết cho mục đích đã xác định (tối
                giản hóa dữ liệu).
              </li>
              <li>
                Không sử dụng dữ liệu ngoài các mục đích đã nêu mà không có sự
                đồng ý bổ sung.
              </li>
              <li>
                Không bán, cho thuê hoặc trao đổi thông tin cá nhân của Đối tác
                cho bên thứ ba vì mục đích thương mại.
              </li>
            </ul>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-slate-800">
              4. Chia sẻ thông tin với bên thứ ba
            </p>
            <p>
              Thông tin có thể được chia sẻ giới hạn trong các trường hợp sau:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="font-medium text-slate-700">
                  Nhà cung cấp dịch vụ kỹ thuật:
                </span>{" "}
                Cloudinary (lưu trữ tệp), nhà cung cấp dịch vụ thanh toán — chỉ
                chia sẻ dữ liệu tối thiểu cần thiết và ràng buộc bằng hợp đồng
                bảo mật.
              </li>
              <li>
                <span className="font-medium text-slate-700">
                  Cơ quan nhà nước:
                </span>{" "}
                Khi có yêu cầu bằng văn bản hợp pháp từ cơ quan công an, tòa án
                hoặc cơ quan thuế.
              </li>
              <li>
                <span className="font-medium text-slate-700">
                  Tình huống khẩn cấp:
                </span>{" "}
                Khi cần thiết để bảo vệ quyền lợi, tính mạng hoặc tài sản của
                các bên liên quan.
              </li>
            </ul>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-slate-800">5. Bảo mật dữ liệu</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Toàn bộ dữ liệu truyền tải được mã hóa bằng TLS 1.2 trở lên
                (HTTPS).
              </li>
              <li>
                Giấy tờ KYC được lưu trữ trên hạ tầng đám mây bảo mật
                (Cloudinary) với kiểm soát truy cập nghiêm ngặt — chỉ nhân viên
                được ủy quyền của RCField mới có quyền xem.
              </li>
              <li>
                Mật khẩu tài khoản được băm (hash) bằng thuật toán bcrypt, không
                được lưu dưới dạng văn bản thô.
              </li>
              <li>
                Hệ thống được kiểm tra bảo mật định kỳ. Khi phát hiện vi phạm dữ
                liệu có nguy cơ ảnh hưởng đến Đối tác, RCField sẽ thông báo
                trong vòng 72 giờ.
              </li>
            </ul>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-slate-800">6. Thời hạn lưu trữ</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Dữ liệu tài khoản và hoạt động: lưu trong suốt thời gian hợp
                đồng còn hiệu lực.
              </li>
              <li>
                Giấy tờ KYC và hồ sơ pháp lý: lưu tối thiểu 5 năm sau khi chấm
                dứt hợp đồng theo quy định Nghị định 13/2023/NĐ-CP.
              </li>
              <li>
                Nhật ký hệ thống: lưu tối đa 2 năm phục vụ mục đích kiểm toán và
                bảo mật.
              </li>
              <li>
                Sau khi hết thời hạn lưu trữ bắt buộc, dữ liệu sẽ được xóa an
                toàn và không thể phục hồi.
              </li>
            </ul>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-slate-800">
              7. Quyền của Đối tác đối với dữ liệu cá nhân
            </p>
            <p>Theo quy định pháp luật, Đối tác có các quyền sau:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="font-medium text-slate-700">
                  Quyền truy cập:
                </span>{" "}
                Yêu cầu xem bản sao thông tin cá nhân mà RCField đang lưu trữ.
              </li>
              <li>
                <span className="font-medium text-slate-700">
                  Quyền chỉnh sửa:
                </span>{" "}
                Yêu cầu cập nhật thông tin không chính xác hoặc không đầy đủ.
              </li>
              <li>
                <span className="font-medium text-slate-700">Quyền xóa:</span>{" "}
                Yêu cầu xóa dữ liệu cá nhân khi không còn cần thiết, trừ trường
                hợp pháp luật yêu cầu lưu trữ.
              </li>
              <li>
                <span className="font-medium text-slate-700">
                  Quyền rút đồng ý:
                </span>{" "}
                Rút lại sự đồng ý xử lý dữ liệu bất kỳ lúc nào (có thể ảnh hưởng
                đến khả năng sử dụng dịch vụ).
              </li>
              <li>
                <span className="font-medium text-slate-700">
                  Quyền phản đối:
                </span>{" "}
                Phản đối việc xử lý dữ liệu vì mục đích marketing trực tiếp.
              </li>
            </ul>
            <p className="mt-1">
              Để thực hiện các quyền trên, liên hệ qua email:{" "}
              <span className="font-medium text-slate-700">
                privacy@rcfield.vn
              </span>
              . RCField sẽ phản hồi trong vòng 15 ngày làm việc.
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-slate-800">
              8. Cookie và công nghệ theo dõi
            </p>
            <p>
              Nền tảng sử dụng cookie cần thiết để duy trì phiên đăng nhập và
              đảm bảo tính năng hoạt động bình thường. Không sử dụng cookie theo
              dõi hành vi vì mục đích quảng cáo bên thứ ba.
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-slate-800">
              9. Thay đổi chính sách
            </p>
            <p>
              RCField có thể cập nhật Chính sách này để phù hợp với thay đổi
              pháp lý hoặc vận hành. Mọi thay đổi quan trọng sẽ được thông báo
              qua email trước ít nhất 15 ngày. Phiên bản mới nhất luôn có hiệu
              lực và có thể truy cập trong mục Cài đặt tài khoản.
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-slate-800">
              10. Liên hệ về quyền riêng tư
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Email: privacy@rcfield.vn</li>
              <li>Địa chỉ: [Địa chỉ công ty RCField]</li>
              <li>
                Thời gian phản hồi: trong vòng 15 ngày làm việc kể từ ngày nhận
                yêu cầu.
              </li>
            </ul>
          </div>

          <p className="text-xs text-slate-400 pt-2 border-t border-slate-100">
            Cập nhật lần cuối: 01/07/2026 · Phiên bản 1.0 · Căn cứ pháp lý: Luật
            An ninh mạng 2018, Nghị định 13/2023/NĐ-CP
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5 w-full">
      <Label className="text-xs font-bold text-slate-700">{label}</Label>
      {children}
      {error && (
        <p className="text-[11px] font-bold text-red-500 animate-slideDown">
          {error}
        </p>
      )}
    </div>
  )
}

function InputIcon({
  icon: Icon,
  children,
}: {
  icon: React.ElementType
  children: React.ReactElement
}) {
  return (
    <div className="relative w-full">
      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
        <Icon className="size-4" />
      </div>
      {children}
    </div>
  )
}
export default ProviderRegisterPage

/**
 * Kết quả đối chiếu mã số thuế với dữ liệu Cục Thuế.
 *
 * Hiện đủ tên pháp lý và địa chỉ để người đăng ký tự thấy mình gõ đúng mã hay
 * chưa — nhanh hơn nhiều so với báo "mã không hợp lệ" rồi để họ tự dò.
 */
function TaxLookupPanel({
  loading,
  result,
  onRetry,
}: {
  loading: boolean
  result: TaxLookupResult | null
  onRetry: () => void
}) {
  if (loading) {
    return (
      <div className="-mt-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
        <Loader2 className="size-4 animate-spin" />
        Đang đối chiếu với dữ liệu Cục Thuế...
      </div>
    )
  }

  if (!result) return null

  if (result.status === "ACTIVE") {
    return (
      <div className="-mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-900">
          <CheckCircle2 className="size-4 shrink-0" />
          {result.business.legalName}
        </p>
        {result.business.address ? (
          <p className="mt-1 pl-[22px] text-xs font-medium leading-5 text-emerald-800">
            {result.business.address}
          </p>
        ) : null}
        <p className="mt-1 pl-[22px] text-xs font-semibold text-emerald-700">
          {result.business.taxStatus}
        </p>
      </div>
    )
  }

  if (result.status === "INACTIVE") {
    return (
      <div className="-mt-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
        <p className="flex items-center gap-1.5 text-sm font-bold text-red-900">
          <ShieldAlert className="size-4 shrink-0" />
          {result.business.legalName}
        </p>
        <p className="mt-1 pl-[22px] text-xs font-semibold leading-5 text-red-800">
          Cục Thuế ghi nhận: {result.business.taxStatus}. Cơ sở ở trạng thái này
          không đăng ký làm đối tác được.
        </p>
      </div>
    )
  }

  if (result.status === "UNAVAILABLE") {
    return (
      <div className="-mt-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-sm font-semibold leading-5 text-amber-900">
          Chưa đối chiếu được với Cục Thuế lúc này. Bạn vẫn đăng ký tiếp được,
          hồ sơ sẽ được kiểm tra kỹ hơn khi duyệt.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-1.5 text-xs font-bold text-amber-900 underline"
        >
          Thử lại
        </button>
      </div>
    )
  }

  return (
    <div className="-mt-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
      <p className="flex items-center gap-1.5 text-sm font-bold text-red-900">
        <ShieldAlert className="size-4 shrink-0" />
        Không tìm thấy mã số thuế này
      </p>
      <p className="mt-1 pl-[22px] text-xs font-semibold leading-5 text-red-800">
        Kiểm tra lại mã. Doanh nghiệp vừa thành lập có thể chưa xuất hiện — dữ
        liệu Cục Thuế cập nhật chậm khoảng hai tháng.
      </p>
    </div>
  )
}
