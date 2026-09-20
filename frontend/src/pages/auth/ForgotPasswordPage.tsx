import { useRef, useState } from "react"
import { useNavigate } from "react-router"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { AnimatePresence, motion } from "framer-motion"
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  Eye,
  EyeOff,
  Lock,
  Mail,
  RotateCcw,
  ShieldCheck,
} from "lucide-react"

import { routePaths } from "@/app/router/route-paths"
import {
  requestPasswordReset,
  resetPasswordWithCode,
  verifyPasswordResetCode,
} from "@/features/auth/api/auth.api"
import { AppLogo } from "@/shared/components/AppLogo"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { env } from "@/shared/lib/env"
import { getApiErrorInfo } from "@/shared/lib/utils"
import { toast } from "sonner"

const emailSchema = z.object({
  email: z
    .string()
    .min(1, { message: "Vui lòng nhập địa chỉ email" })
    .email({ message: "Địa chỉ email không hợp lệ" }),
})

const codeSchema = z.object({
  code: z
    .string()
    .min(1, { message: "Vui lòng nhập mã xác nhận" })
    .regex(/^\d{6}$/, { message: "Mã xác nhận phải gồm đúng 6 chữ số" }),
})

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(6, { message: "Mật khẩu mới phải có ít nhất 6 ký tự" }),
    confirmPassword: z.string().min(1, { message: "Vui lòng xác nhận lại mật khẩu" }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Mật khẩu xác nhận không trùng khớp",
    path: ["confirmPassword"],
  })

type EmailValues = z.infer<typeof emailSchema>
type CodeValues = z.infer<typeof codeSchema>
type PasswordValues = z.infer<typeof passwordSchema>
type ResetStep = "email" | "code" | "password" | "done"

const stepLabels: Record<Exclude<ResetStep, "done">, string> = {
  email: "Email",
  code: "Mã xác nhận",
  password: "Mật khẩu mới",
}

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<ResetStep>("email")
  const [email, setEmail] = useState("")
  const [verificationCode, setVerificationCode] = useState("")
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [isVerifyingCode, setIsVerifyingCode] = useState(false)
  const [isResettingPassword, setIsResettingPassword] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [otpDigits, setOtpDigits] = useState<string[]>(() => Array(6).fill(""))
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([])

  const emailForm = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  })

  const codeForm = useForm<CodeValues>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: "" },
  })

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  })

  const updateOtpDigits = (nextDigits: string[]) => {
    setOtpDigits(nextDigits)
    codeForm.setValue("code", nextDigits.join(""), {
      shouldDirty: true,
      shouldValidate: nextDigits.every(Boolean),
    })
  }

  const handleOtpChange = (index: number, rawValue: string) => {
    const digits = rawValue.replace(/\D/g, "")
    if (!digits) {
      const nextDigits = [...otpDigits]
      nextDigits[index] = ""
      updateOtpDigits(nextDigits)
      return
    }

    const nextDigits = [...otpDigits]
    digits.slice(0, 6 - index).split("").forEach((digit, offset) => {
      nextDigits[index + offset] = digit
    })
    updateOtpDigits(nextDigits)

    const nextFocusIndex = Math.min(index + digits.length, 5)
    otpInputRefs.current[nextFocusIndex]?.focus()
  }

  const handleOtpKeyDown = (index: number, key: string) => {
    if (key !== "Backspace") return

    if (otpDigits[index]) {
      const nextDigits = [...otpDigits]
      nextDigits[index] = ""
      updateOtpDigits(nextDigits)
      return
    }

    if (index > 0) {
      const nextDigits = [...otpDigits]
      nextDigits[index - 1] = ""
      updateOtpDigits(nextDigits)
      otpInputRefs.current[index - 1]?.focus()
    }
  }

  const handleOtpPaste = (index: number, pastedText: string) => {
    const digits = pastedText.replace(/\D/g, "").slice(0, 6 - index)
    if (!digits) return

    const nextDigits = [...otpDigits]
    digits.split("").forEach((digit, offset) => {
      nextDigits[index + offset] = digit
    })
    updateOtpDigits(nextDigits)
    otpInputRefs.current[Math.min(index + digits.length, 5)]?.focus()
  }

  const handleSendEmail = async (values: EmailValues) => {
    const normalizedEmail = values.email.trim().toLowerCase()
    setIsSendingEmail(true)

    try {
      await requestPasswordReset({ email: normalizedEmail })
      setEmail(normalizedEmail)
      setOtpDigits(Array(6).fill(""))
      codeForm.reset({ code: "" })
      setStep("code")
      toast.success("Đã gửi mã xác nhận", {
        description: `Vui lòng kiểm tra email ${normalizedEmail}.`,
      })
    } catch (error: unknown) {
      toast.error("Không thể gửi mã xác nhận", {
        description: getApiErrorInfo(error).message ?? "Vui lòng kiểm tra email và thử lại.",
      })
    } finally {
      setIsSendingEmail(false)
    }
  }

  const handleVerifyCode = async (values: CodeValues) => {
    setIsVerifyingCode(true)

    try {
      await verifyPasswordResetCode({ email, code: values.code })
      setVerificationCode(values.code)
      setStep("password")
      toast.success("Mã xác nhận hợp lệ")
    } catch (error: unknown) {
      toast.error("Mã xác nhận không hợp lệ", {
        description: getApiErrorInfo(error).message ?? "Vui lòng kiểm tra lại mã 6 chữ số trong email.",
      })
    } finally {
      setIsVerifyingCode(false)
    }
  }

  const handleResetPassword = async (values: PasswordValues) => {
    setIsResettingPassword(true)

    try {
      await resetPasswordWithCode({
        email,
        code: verificationCode,
        password: values.password,
      })
      setStep("done")
      toast.success("Đặt lại mật khẩu thành công", {
        description: "Bạn có thể đăng nhập bằng mật khẩu mới.",
      })
    } catch (error: unknown) {
      toast.error("Không thể đặt lại mật khẩu", {
        description: getApiErrorInfo(error).message ?? "Mã xác nhận có thể đã hết hạn. Vui lòng thử lại.",
      })
    } finally {
      setIsResettingPassword(false)
    }
  }

  const resetFlow = () => {
    setStep("email")
    setEmail("")
    setVerificationCode("")
    emailForm.reset({ email: "" })
    codeForm.reset({ code: "" })
    passwordForm.reset({ password: "", confirmPassword: "" })
    setOtpDigits(Array(6).fill(""))
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-950 p-6 font-sans text-slate-100">
      <div className="pointer-events-none absolute left-[8%] top-[10%] h-[450px] w-[450px] rounded-full bg-orange-600/10 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-[10%] right-[8%] h-[450px] w-[450px] rounded-full bg-indigo-600/10 blur-[120px]" />

      <AppLogo variant="dark" className="relative z-10 mb-8" />

      <div className="relative z-10 w-full max-w-md">
        <button
          type="button"
          onClick={() => navigate(routePaths.login)}
          className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-slate-400 transition-colors hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
          Quay lại đăng nhập
        </button>

        <div className="space-y-6 rounded-2xl border border-slate-800/80 bg-slate-900 p-6 shadow-2xl md:p-8">
          {step !== "done" && (
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(stepLabels) as Exclude<ResetStep, "done">[]).map((item, index) => {
                const activeIndex = Object.keys(stepLabels).indexOf(step)
                const isActive = step === item
                const isComplete = index < activeIndex

                return (
                  <div key={item} className="space-y-1">
                    <div
                      className={`h-1.5 rounded-full ${
                        isActive || isComplete ? "bg-orange-500" : "bg-slate-800"
                      }`}
                    />
                    <p className={`text-[10px] font-bold ${isActive ? "text-white" : "text-slate-500"}`}>
                      {stepLabels[item]}
                    </p>
                  </div>
                )
              })}
            </div>
          )}

          <AnimatePresence mode="wait">
            {step === "email" && (
              <motion.div
                key="email"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <AuthHeading
                  title="Quên mật khẩu"
                  description="Nhập email đã đăng ký. Hệ thống sẽ gửi mã xác nhận 6 chữ số qua email."
                />

                <form onSubmit={emailForm.handleSubmit(handleSendEmail)} className="space-y-4">
                  <Field label="Địa chỉ email" error={emailForm.formState.errors.email?.message}>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-500" />
                      <Input
                        type="email"
                        placeholder="name@example.com"
                        className="h-11 rounded-xl border-slate-800 bg-slate-950 pl-10 text-white focus:border-orange-500 focus:ring-orange-500/20"
                        {...emailForm.register("email")}
                      />
                    </div>
                  </Field>

                  <SubmitButton loading={isSendingEmail} icon={<ArrowRight className="h-4 w-4" />}>
                    Gửi mã xác nhận
                  </SubmitButton>
                </form>
              </motion.div>
            )}

            {step === "code" && (
              <motion.div
                key="code"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <AuthHeading
                  title="Nhập mã xác nhận"
                  description={`Brevo đã gửi mã 6 chữ số đến ${email}. Mã có hiệu lực trong ${env.passwordResetCodeTtlMinutes} phút.`}
                />

                <form onSubmit={codeForm.handleSubmit(handleVerifyCode)} className="space-y-4">
                  <Field label="Mã xác nhận" error={codeForm.formState.errors.code?.message}>
                    <input type="hidden" {...codeForm.register("code")} />
                    <div className="grid grid-cols-6 gap-2">
                      {otpDigits.map((digit, index) => (
                        <Input
                          key={index}
                          ref={(node) => {
                            otpInputRefs.current[index] = node
                          }}
                          type="text"
                          inputMode="numeric"
                          autoComplete={index === 0 ? "one-time-code" : "off"}
                          maxLength={1}
                          value={digit}
                          onChange={(event) => handleOtpChange(index, event.target.value)}
                          onKeyDown={(event) => handleOtpKeyDown(index, event.key)}
                          onPaste={(event) => {
                            event.preventDefault()
                            handleOtpPaste(index, event.clipboardData.getData("text"))
                          }}
                          aria-label={`Mã xác nhận số ${index + 1}`}
                          className="aspect-square h-12 rounded-xl border-slate-800 bg-slate-950 p-0 text-center text-lg font-black text-white focus:border-orange-500 focus:ring-orange-500/20"
                        />
                      ))}
                    </div>
                  </Field>

                  <SubmitButton loading={isVerifyingCode} icon={<ShieldCheck className="h-4 w-4" />}>
                    Xác nhận mã
                  </SubmitButton>

                  <button
                    type="button"
                    onClick={emailForm.handleSubmit(handleSendEmail)}
                    disabled={isSendingEmail}
                    className="flex w-full items-center justify-center gap-2 text-xs font-bold text-slate-400 transition-colors hover:text-white disabled:pointer-events-none disabled:opacity-60"
                  >
                    <RotateCcw className={`h-3.5 w-3.5 ${isSendingEmail ? "animate-spin" : ""}`} />
                    Gửi lại mã
                  </button>
                </form>
              </motion.div>
            )}

            {step === "password" && (
              <motion.div
                key="password"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <AuthHeading
                  title="Tạo mật khẩu mới"
                  description="Mật khẩu mới cần có ít nhất 6 ký tự."
                />

                <form onSubmit={passwordForm.handleSubmit(handleResetPassword)} className="space-y-4">
                  <Field label="Mật khẩu mới" error={passwordForm.formState.errors.password?.message}>
                    <PasswordInput
                      placeholder="••••••••"
                      visible={showPassword}
                      onVisibilityChange={() => setShowPassword((value) => !value)}
                      registration={passwordForm.register("password")}
                    />
                  </Field>

                  <Field label="Xác nhận mật khẩu mới" error={passwordForm.formState.errors.confirmPassword?.message}>
                    <PasswordInput
                      placeholder="••••••••"
                      visible={showConfirmPassword}
                      onVisibilityChange={() => setShowConfirmPassword((value) => !value)}
                      registration={passwordForm.register("confirmPassword")}
                    />
                  </Field>

                  <SubmitButton loading={isResettingPassword} icon={<Lock className="h-4 w-4" />}>
                    Đặt lại mật khẩu
                  </SubmitButton>
                </form>
              </motion.div>
            )}

            {step === "done" && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="space-y-6 py-4 text-center"
              >
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/15 text-emerald-500">
                  <CheckCircle2 className="h-7 w-7" />
                </div>

                <div className="space-y-2">
                  <h1 className="text-2xl font-extrabold tracking-tight text-white">Mật khẩu đã được cập nhật</h1>
                  <p className="mx-auto max-w-sm text-xs font-semibold leading-relaxed text-slate-400">
                    Bạn có thể đăng nhập lại bằng mật khẩu mới vừa tạo.
                  </p>
                </div>

                <Button
                  type="button"
                  onClick={() => navigate(routePaths.login)}
                  className="h-11 w-full rounded-xl bg-orange-600 font-bold text-white shadow-md shadow-orange-500/10 hover:bg-orange-700"
                >
                  Về trang đăng nhập
                </Button>

                <button
                  type="button"
                  onClick={resetFlow}
                  className="text-xs font-bold text-slate-500 transition-colors hover:text-slate-300"
                >
                  Đặt lại mật khẩu cho email khác
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

function AuthHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-2 text-center md:text-left">
      <h1 className="text-2xl font-extrabold tracking-tight text-white">{title}</h1>
      <p className="text-xs font-semibold leading-relaxed text-slate-400">{description}</p>
    </div>
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
    <div className="space-y-1.5">
      <Label className="text-xs font-bold text-slate-300">{label}</Label>
      {children}
      {error && <p className="text-[11px] font-bold text-red-500">{error}</p>}
    </div>
  )
}

function PasswordInput({
  placeholder,
  visible,
  onVisibilityChange,
  registration,
}: {
  placeholder: string
  visible: boolean
  onVisibilityChange: () => void
  registration: ReturnType<ReturnType<typeof useForm<PasswordValues>>["register"]>
}) {
  return (
    <div className="relative">
      <Lock className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-500" />
      <Input
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        className="h-11 rounded-xl border-slate-800 bg-slate-950 pl-10 pr-10 text-white focus:border-orange-500 focus:ring-orange-500/20"
        {...registration}
      />
      <button
        type="button"
        onClick={onVisibilityChange}
        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-slate-300 focus:outline-none"
        aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
      >
        {visible ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
      </button>
    </div>
  )
}

function SubmitButton({
  loading,
  icon,
  children,
}: {
  loading: boolean
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Button
      type="submit"
      disabled={loading}
      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 font-bold text-white shadow-md shadow-orange-500/10 transition-all hover:bg-orange-700"
    >
      {loading ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          Đang xử lý...
        </>
      ) : (
        <>
          {children}
          {icon}
        </>
      )}
    </Button>
  )
}
