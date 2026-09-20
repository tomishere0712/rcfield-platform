import { useState } from "react"
import { useNavigate } from "react-router"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { motion } from "framer-motion"
import {
  Mail,
  Lock,
  User,
  Phone,
  ChevronLeft,
  Car,
  Sparkles,
  CheckCircle2,
  Eye,
  EyeOff
} from "lucide-react"

import { AppLogo } from "@/shared/components/AppLogo"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Checkbox } from "@/shared/ui/checkbox"
import { toast } from "sonner"
import { registerWithPassword, checkExists } from "@/features/auth/api/auth.api"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { storageKeys } from "@/shared/lib/storage"

const registerSchema = z.object({
  fullName: z.string().min(2, { message: "Họ và tên phải chứa ít nhất 2 ký tự" }),
  email: z.string().email({ message: "Địa chỉ email không hợp lệ" }),
  phoneNumber: z.string()
    .regex(/(84|0[3|5|7|8|9])+([0-9]{8})\b/, { message: "Số điện thoại không đúng định dạng" }),
  password: z.string().min(6, { message: "Mật khẩu phải chứa ít nhất 6 ký tự" }),
  confirmPassword: z.string().min(6, { message: "Vui lòng xác nhận mật khẩu" }),
  agreeToTerms: z.boolean().refine(val => val === true, {
    message: "Bạn chưa đồng ý với điều khoản"
  })
}).refine((data) => data.password === data.confirmPassword, {
  message: "Mật khẩu xác nhận không khớp",
  path: ["confirmPassword"],
})

type RegisterFormValues = z.infer<typeof registerSchema>

export function RegisterPage() {
  const navigate = useNavigate()
  const setAuthenticated = useAuthStore((state) => state.setAuthenticated)
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const { register, handleSubmit, control, setError, clearErrors, formState: { errors } } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phoneNumber: "",
      password: "",
      confirmPassword: "",
      agreeToTerms: false
    }
  })

  const handleCheckEmail = async (val: string) => {
    if (!val || !val.includes("@")) return
    try {
      const res = await checkExists({ email: val })
      if (res.emailExists) {
        setError("email", {
          type: "manual",
          message: "Email này đã được sử dụng"
        })
      } else {
        clearErrors("email")
      }
    } catch {
      // Bỏ qua lỗi mạng khi check trùng
    }
  }

  const handleCheckPhone = async (val: string) => {
    if (!val || val.length < 8) return
    try {
      const res = await checkExists({ phone: val })
      if (res.phoneExists) {
        setError("phoneNumber", {
          type: "manual",
          message: "Số điện thoại này đã được sử dụng"
        })
      } else {
        clearErrors("phoneNumber")
      }
    } catch {
      // Bỏ qua
    }
  }

  const onSubmit = async (data: RegisterFormValues) => {
    setIsLoading(true)
    try {
      // Gọi API checkExists kiểm tra trùng email/SĐT trước để hiển thị lỗi inline lập tức
      const checkRes = await checkExists({
        email: data.email.trim().toLowerCase(),
        phone: data.phoneNumber.trim()
      })

      if (checkRes.emailExists || checkRes.phoneExists) {
        if (checkRes.emailExists) {
          setError("email", {
            type: "manual",
            message: "Email này đã được sử dụng"
          })
        }
        if (checkRes.phoneExists) {
          setError("phoneNumber", {
            type: "manual",
            message: "Số điện thoại này đã được sử dụng"
          })
        }
        setIsLoading(false)
        return
      }

      const auth = await registerWithPassword({
        fullName: data.fullName.trim(),
        email: data.email.trim().toLowerCase(),
        phone: data.phoneNumber.trim() || undefined,
        password: data.password,
        role: "customer",
      })

      setAuthenticated(auth.user.role, {
        id: auth.user.id,
        fullName: auth.user.fullName,
        email: auth.user.email,
        role: auth.user.role,
        phone: auth.user.phone ?? undefined,
        avatarUrl: auth.user.avatarUrl ?? undefined,
        registrationStatus: auth.user.registrationStatus,
        assignedCafeId: auth.user.assignedCafeId,
      })

      sessionStorage.setItem(
        storageKeys.auth,
        JSON.stringify({
          accessToken: auth.accessToken,
          refreshToken: auth.refreshToken,
          user: auth.user,
          role: auth.user.role,
          email: auth.user.email,
        }),
      )

      toast.success("Đăng ký tài khoản thành công!", {
        description: `Chào mừng ${auth.user.fullName} tham gia cộng đồng RCField!`,
      })

      navigate("/cafes")
    } catch (error: unknown) {
      const err = error as {
        response?: {
          data?: {
            code?: string;
            message?: string;
            details?: Record<string, string>;
          };
        };
      };
      const code = err?.response?.data?.code
      const message = err?.response?.data?.message
      const details = err?.response?.data?.details

      if (code === "REGISTRATION_CONFLICT" && details) {
        if (details.email) {
          setError("email", {
            type: "manual",
            message: details.email
          })
        }
        if (details.phone) {
          setError("phoneNumber", {
            type: "manual",
            message: details.phone
          })
        }
      } else if (code === "EMAIL_TAKEN" || code === "EMAIL_ALREADY_EXISTS") {
        setError("email", {
          type: "manual",
          message: "Email này đã được sử dụng"
        })
      } else if (code === "PHONE_ALREADY_EXISTS") {
        setError("phoneNumber", {
          type: "manual",
          message: "Số điện thoại này đã được sử dụng"
        })
      } else if (code === "VALIDATION_ERROR") {
        toast.error("Thông tin không hợp lệ", { description: message })
      } else {
        toast.error("Không thể đăng ký", {
          description: message ?? "Không kết nối được máy chủ. Vui lòng thử lại.",
        })
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-stretch overflow-hidden font-sans">

      {/* LEFT PANEL */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-950 text-white relative flex-col justify-between p-12 overflow-hidden select-none">

        <div className="absolute top-[-20%] left-[-20%] w-[600px] h-[600px] rounded-full bg-orange-600/15 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[600px] h-[600px] rounded-full bg-indigo-600/15 blur-[120px] pointer-events-none" />

        <AppLogo variant="dark" className="self-start relative z-10" />

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative z-10 my-auto max-w-md space-y-6"
        >
          <div className="inline-flex h-12 w-12 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 items-center justify-center text-white shadow-lg">
            <Car className="h-6 w-6" />
          </div>
          <div className="space-y-3">
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight leading-tight">
              Trải Nghiệm Đua Xe Đỉnh Cao
            </h2>
            <p className="text-sm font-medium leading-relaxed text-slate-400">
              Đăng ký để đặt chỗ sân đua, thuê các dòng xe cao cấp và lưu trữ lịch sử đua chuyên nghiệp.
            </p>
          </div>

          <div className="pt-6 border-t border-slate-900 space-y-2 text-xs font-semibold text-slate-400">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Tạo tài khoản cá nhân & đội đua hoàn toàn miễn phí
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Tích hợp Serious Inspection giải quyết tranh chấp thông minh
            </div>
          </div>
        </motion.div>

        <div className="relative z-10 text-[10px] font-bold text-slate-500 flex items-center justify-between">
          <span>Khám phá & Chinh phục Đường đua RC</span>
          <span>© 2024 RCField</span>
        </div>
      </div>

      {/* RIGHT PANEL — FORM */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-12 bg-white relative overflow-y-auto">

        <button
          onClick={() => navigate("/")}
          className="absolute top-6 left-6 inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Về Trang chủ
        </button>

        <div className="w-full max-w-md space-y-6 pt-10 pb-8">

          <div className="space-y-2">
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-950 tracking-tight">
              Đăng ký tài khoản mới
            </h1>
            <p className="text-xs font-semibold text-slate-500">
              Nhập đầy đủ thông tin cá nhân của bạn để trải nghiệm hệ sinh thái RC chuyên nghiệp.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-2">

            <div className="space-y-1.5">
              <Label htmlFor="fullName" className="text-xs font-bold text-slate-700">Họ và tên</Label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="h-4.5 w-4.5" />
                </div>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Nguyễn Văn A"
                  className={`pl-10 h-11 rounded-xl border-slate-200 focus:border-orange-500 focus:ring-orange-500/20 ${errors.fullName ? 'border-red-500 focus:border-red-500' : ''}`}
                  {...register("fullName")}
                />
              </div>
              <div className="min-h-[20px] flex items-center mt-1">
                {errors.fullName && (
                  <p className="text-[11px] font-bold text-red-500 leading-tight">{errors.fullName.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-bold text-slate-700">Email</Label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-4.5 w-4.5" />
                </div>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  className={`pl-10 h-11 rounded-xl border-slate-200 focus:border-orange-500 focus:ring-orange-500/20 ${errors.email ? 'border-red-500 focus:border-red-500' : ''}`}
                  {...register("email", {
                    onBlur: (e) => handleCheckEmail(e.target.value)
                  })}
                />
              </div>
              <div className="min-h-[20px] flex items-center mt-1">
                {errors.email && (
                  <p className="text-[11px] font-bold text-red-500 leading-tight">{errors.email.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phoneNumber" className="text-xs font-bold text-slate-700">Số điện thoại</Label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Phone className="h-4.5 w-4.5" />
                </div>
                <Input
                  id="phoneNumber"
                  type="tel"
                  placeholder="0987654321"
                  className={`pl-10 h-11 rounded-xl border-slate-200 focus:border-orange-500 focus:ring-orange-500/20 ${errors.phoneNumber ? 'border-red-500 focus:border-red-500' : ''}`}
                  {...register("phoneNumber", {
                    onBlur: (e) => handleCheckPhone(e.target.value)
                  })}
                />
              </div>
              <div className="min-h-[20px] flex items-center mt-1">
                {errors.phoneNumber && (
                  <p className="text-[11px] font-bold text-red-500 leading-tight">{errors.phoneNumber.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-bold text-slate-700">Mật khẩu</Label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="h-4.5 w-4.5" />
                  </div>
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    className={`pl-10 pr-10 h-11 rounded-xl border-slate-200 focus:border-orange-500 focus:ring-orange-500/20 ${errors.password ? 'border-red-500 focus:border-red-500' : ''}`}
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <div className="min-h-[20px] flex items-center mt-1">
                  {errors.password && (
                    <p className="text-[11px] font-bold text-red-500 leading-tight">{errors.password.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword" className="text-xs font-bold text-slate-700">Xác nhận</Label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="h-4.5 w-4.5" />
                  </div>
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="••••••••"
                    className={`pl-10 pr-10 h-11 rounded-xl border-slate-200 focus:border-orange-500 focus:ring-orange-500/20 ${errors.confirmPassword ? 'border-red-500 focus:border-red-500' : ''}`}
                    {...register("confirmPassword")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <div className="min-h-[20px] flex items-center mt-1">
                  {errors.confirmPassword && (
                    <p className="text-[11px] font-bold text-red-500 leading-tight">{errors.confirmPassword.message}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-start gap-2.5 pt-1 select-none">
                <Controller
                  name="agreeToTerms"
                  control={control}
                  render={({ field }) => (
                    <Checkbox
                      id="agreeToTerms"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      className="mt-0.5 border-slate-300 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
                    />
                  )}
                />
                <Label htmlFor="agreeToTerms" className="text-xs font-bold text-slate-600 cursor-pointer whitespace-nowrap">
                  Tôi đồng ý với{" "}
                  <a href="#" className="text-orange-600 hover:underline">Điều khoản dịch vụ</a>
                  {" "}và{" "}
                  <a href="#" className="text-orange-600 hover:underline">Chính sách bảo mật</a>
                </Label>
              </div>
              <div className="min-h-[20px] flex items-center mt-1">
                {errors.agreeToTerms && (
                  <p className="text-[11px] font-bold text-red-500 leading-tight">{errors.agreeToTerms.message}</p>
                )}
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="group w-full h-11 rounded-xl bg-slate-950 text-white font-bold shadow-[0_10px_24px_rgba(15,23,42,0.18)] flex items-center justify-center gap-2 pt-1 transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-900 hover:shadow-[0_16px_34px_rgba(15,23,42,0.24),0_0_0_3px_rgba(249,115,22,0.10)] focus-visible:ring-3 focus-visible:ring-orange-500/20 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoading ? (
                <>
                  <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Đang thiết lập tài khoản...
                </>
              ) : (
                <>
                  Đăng Ký Thành Viên
                  <Sparkles className="h-4 w-4 text-orange-400 group-hover:scale-110 transition-transform" />
                </>
              )}
            </Button>

          </form>

          <div className="relative my-4 text-center">
            <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-slate-200/80" />
            <span className="relative bg-white px-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
              Đã có tài khoản?
            </span>
          </div>

          <Button
            variant="outline"
            className="group w-full h-11 rounded-xl border-slate-200 bg-white px-3.5 text-slate-700 font-bold shadow-[0_10px_24px_rgba(15,23,42,0.10)] transition-all duration-300 hover:-translate-y-0.5 hover:border-orange-400 hover:bg-orange-50/25 hover:text-slate-800 hover:shadow-[0_16px_34px_rgba(15,23,42,0.16),0_0_0_3px_rgba(249,115,22,0.10)] focus-visible:ring-3 focus-visible:ring-orange-500/20"
            onClick={() => navigate("/auth/login")}
          >
            Quay lại Đăng nhập
          </Button>

        </div>
      </div>

    </div>
  )
}
