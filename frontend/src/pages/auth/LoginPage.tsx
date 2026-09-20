import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate, Link, useSearchParams } from "react-router"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { motion, AnimatePresence } from "framer-motion"
import {
  Zap,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ChevronLeft,
  Car,
  Sparkles
} from "lucide-react"

import { routePaths } from "@/app/router/route-paths"
import { loginWithGoogle, loginWithPassword, type LoginResponse } from "@/features/auth/api/auth.api"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { AppLogo } from "@/shared/components/AppLogo"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Checkbox } from "@/shared/ui/checkbox"
import { env } from "@/shared/lib/env"
import { storageKeys } from "@/shared/lib/storage"
import { getApiErrorInfo } from "@/shared/lib/utils"
import type { UserRole } from "@/shared/types/common"
import { toast } from "sonner"

// Form validation schema with Zod
const loginSchema = z.object({
  email: z.string().min(1, { message: "Vui lòng nhập Email" }).email({ message: "Email không hợp lệ" }),
  password: z.string().min(6, { message: "Mật khẩu phải chứa ít nhất 6 ký tự" }),
  rememberMe: z.boolean().optional(),
})

type LoginFormValues = z.infer<typeof loginSchema>
const roleRedirects: Record<UserRole, string> = {
  customer: routePaths.cafes,
  staff: routePaths.staffDashboard,
  provider: routePaths.providerDashboard,
  admin: routePaths.adminDashboard,
}

const rotatingTaglines = [
  {
    title: "Đặt Lịch Rảnh Tay",
    desc: "Khám phá hàng chục sân đua RC Cafe và giữ chỗ chỉ trong 30 giây.",
    icon: Car,
    color: "from-orange-500 to-red-500"
  },
  {
    title: "Serious Inspection",
    desc: "Bàn giao xe thuê minh bạch tuyệt đối qua quy trình đối chiếu ảnh 4 góc.",
    icon: Sparkles,
    color: "from-red-500 to-pink-500"
  },
  {
    title: "Quản Trị Doanh Thu",
    desc: "Tự động phân tách phí dịch vụ, thuê xe và đồ ăn thức uống qua hệ thống sổ cái chi tiết.",
    icon: Zap,
    color: "from-indigo-500 to-blue-500"
  }
]

export function LoginPage() {
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [isGoogleReady, setIsGoogleReady] = useState(false)
  const [taglineIndex, setTaglineIndex] = useState(0)
  const googleButtonRef = useRef<HTMLDivElement>(null)
  const [searchParams] = useSearchParams()
  const setAuthenticated = useAuthStore((state) => state.setAuthenticated)

  // Auto rotate the taglines on the left panel
  useEffect(() => {
    const interval = setInterval(() => {
      setTaglineIndex(prev => (prev + 1) % rotatingTaglines.length)
    }, 4500)
    return () => clearInterval(interval)
  }, [])

  const { register, handleSubmit, setValue, control, formState: { errors } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: localStorage.getItem(storageKeys.lastEmail) ?? "",
      password: "",
      rememberMe: localStorage.getItem(storageKeys.rememberMe) === "true",
    },
  })
  const rememberMe = useWatch({ control, name: "rememberMe" })

  const completeLogin = useCallback(
    (auth: LoginResponse, remember: boolean) => {
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

      const authPayload = JSON.stringify({
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        user: auth.user,
        role: auth.user.role,
        email: auth.user.email,
      })
      const storage = remember ? localStorage : sessionStorage
      const staleStorage = remember ? sessionStorage : localStorage
      staleStorage.removeItem(storageKeys.auth)
      staleStorage.removeItem(storageKeys.legacyAuth)
      localStorage.removeItem(storageKeys.legacyAuth)
      sessionStorage.removeItem(storageKeys.legacyAuth)
      storage.setItem(storageKeys.auth, authPayload)

      toast.success(`Chào mừng quay trở lại, ${auth.user.email}!`)

      const redirectUrl = searchParams.get("redirect")
      if (redirectUrl) {
        navigate(redirectUrl)
      } else {
        navigate(roleRedirects[auth.user.role])
      }
    },
    [navigate, setAuthenticated, searchParams],
  )
  const handleGoogleCredential = useCallback(
    async (credential: string) => {
      setIsGoogleLoading(true)

      try {
        const auth = await loginWithGoogle({ idToken: credential })
        completeLogin(auth, rememberMe === true)
      } catch (error: unknown) {
        const { code, message } = getApiErrorInfo(error)

        if (code === "GOOGLE_AUTH_FAILED") {
          toast.error("Không thể xác thực Google", {
            description: "Vui lòng kiểm tra Google Client ID và thử lại.",
          })
        } else if (code === "ACCOUNT_LOCKED") {
          toast.error("Tài khoản đang bị khóa", {
            description: message ?? "Vui lòng liên hệ quản trị viên để được hỗ trợ.",
          })
        } else {
          toast.error("Không thể đăng nhập Google", {
            description: message ?? "Không kết nối được tới máy chủ xác thực.",
          })
        }
      } finally {
        setIsGoogleLoading(false)
      }
    },
    [completeLogin, rememberMe],
  )

  useEffect(() => {
    if (!env.googleClientId) return

    const initializeGoogleIdentity = () => {
      if (!window.google || !env.googleClientId) return

      window.google.accounts.id.initialize({
        client_id: env.googleClientId,
        callback: (response) => {
          if (response.credential) {
            void handleGoogleCredential(response.credential)
          } else {
            toast.error("Google không trả về token đăng nhập.")
          }
        },
      })

      if (googleButtonRef.current) {
        googleButtonRef.current.innerHTML = ""
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: "outline",
          size: "large",
          type: "standard",
          shape: "rectangular",
          text: "continue_with",
          logo_alignment: "center",
          width: 400,
        })
      }

      setIsGoogleReady(true)
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]',
    )

    if (window.google) {
      initializeGoogleIdentity()
      return
    }

    if (existingScript) {
      existingScript.addEventListener("load", initializeGoogleIdentity)
      return () => existingScript.removeEventListener("load", initializeGoogleIdentity)
    }

    const script = document.createElement("script")
    script.src = "https://accounts.google.com/gsi/client"
    script.async = true
    script.defer = true
    script.onload = initializeGoogleIdentity
    script.onerror = () => {
      toast.error("Không tải được Google Sign-In.")
    }
    document.head.appendChild(script)
  }, [handleGoogleCredential])

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true)

    try {
      const auth = await loginWithPassword({
        email: data.email.trim().toLowerCase(),
        password: data.password,
      })

      completeLogin(auth, data.rememberMe === true)
    } catch (error: unknown) {
      const { code, message } = getApiErrorInfo(error)

      if (code === "INVALID_CREDENTIALS") {
        toast.error("Email hoặc mật khẩu không đúng", {
          description: "Vui lòng kiểm tra lại thông tin đăng nhập từ hệ thống.",
        })
      } else if (code === "ACCOUNT_LOCKED") {
        toast.error("Tài khoản đang bị khóa", {
          description: message ?? "Vui lòng liên hệ quản trị viên để được hỗ trợ.",
        })
      } else if (code === "VALIDATION_ERROR") {
        toast.error("Thông tin đăng nhập không hợp lệ", {
          description: "Backend hiện hỗ trợ đăng nhập bằng email và mật khẩu.",
        })
      } else {
        toast.error("Không thể đăng nhập", {
          description: message ?? "Không kết nối được tới máy chủ xác thực. Vui lòng thử lại.",
        })
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleSignInClick = () => {
    if (!window.google || !isGoogleReady) {
      toast.info("Google Sign-In đang tải. Vui lòng thử lại sau giây lát.")
      return
    }

    window.google.accounts.id.prompt()
  }

  const ActiveIcon = rotatingTaglines[taglineIndex].icon

  return (
    <div className="min-h-screen bg-slate-50 flex items-stretch overflow-hidden font-sans">
      
      {/* LEFT SPLIT PANEL: PREMIUM SHOWCASE */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-950 text-white relative flex-col justify-between p-12 overflow-hidden select-none">
        
        {/* Glow Effects */}
        <div className="absolute top-[-20%] left-[-20%] w-[600px] h-[600px] rounded-full bg-orange-600/20 blur-[130px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[600px] h-[600px] rounded-full bg-red-600/10 blur-[130px] pointer-events-none" />

        {/* Header brand info */}
        <AppLogo variant="dark" className="self-start relative z-10" />

        {/* Rotating animated showcase content */}
        <div className="relative z-10 my-auto max-w-md space-y-12">
          <AnimatePresence mode="wait">
            <motion.div 
              key={taglineIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.5 }}
              className="space-y-6"
            >
              <div className={`inline-flex h-12 w-12 rounded-2xl bg-gradient-to-br ${rotatingTaglines[taglineIndex].color} items-center justify-center text-white shadow-lg`}>
                <ActiveIcon className="h-6 w-6" />
              </div>
              <div className="space-y-3">
                <h2 className="text-3xl font-black tracking-tight leading-tight">
                  {rotatingTaglines[taglineIndex].title}
                </h2>
                <p className="text-sm font-medium leading-relaxed text-slate-400">
                  {rotatingTaglines[taglineIndex].desc}
                </p>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Stepper Dots Indicator */}
          <div className="flex items-center gap-2">
            {rotatingTaglines.map((_, idx) => (
              <button 
                key={idx}
                className={`h-2 rounded-full transition-all ${taglineIndex === idx ? 'w-8 bg-orange-500' : 'w-2 bg-slate-800'}`}
                onClick={() => setTaglineIndex(idx)}
              />
            ))}
          </div>
        </div>

        {/* Footer legal placeholder */}
        <div className="relative z-10 text-[10px] font-bold text-slate-500 flex items-center justify-between">
          <span>Hệ thống booking & vận hành RC Cafe số 1</span>
          <span>© 2024 RCField</span>
        </div>
      </div>

      {/* RIGHT SPLIT PANEL: GORGEOUS FORM */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 md:p-12 bg-white relative">
        
        {/* Mobile Go Back button */}
        <button 
          onClick={() => navigate("/")}
          className="absolute top-6 left-6 inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Về Trang chủ
        </button>

        <div className="w-full max-w-md space-y-8">
          
          {/* Header titles */}
          <div className="space-y-2">
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-950 tracking-tight">
              Chào mừng quay trở lại
            </h1>
            <p className="text-xs font-semibold text-slate-500">
              Đăng nhập tài khoản để đặt sân đua và quản lý phiên chơi của bạn.
            </p>
          </div>

          {/* LOGIN FORM */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            
            {/* Input Email */}
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
                  className={`pl-10 h-11 rounded-xl border-slate-200 focus:border-orange-500 focus:ring-orange-500/20 bg-white ${errors.email ? 'border-red-500 focus:border-red-500' : ''}`}
                  {...register("email")}
                />
              </div>
              {errors.email && (
                <p className="text-[11px] font-bold text-red-500 flex items-center gap-1">
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Input Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-bold text-slate-700">Mật khẩu</Label>
                <Link to="/auth/forgot-password" className="text-xs font-bold text-orange-600 hover:text-orange-700 transition-colors">
                  Quên mật khẩu?
                </Link>
              </div>
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
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                >
                  {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-[11px] font-bold text-red-500 flex items-center gap-1">
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Remember Me checkbox */}
            <div className="flex items-center gap-2 select-none">
              <Checkbox 
                id="rememberMe" 
                checked={rememberMe === true}
                className="border-slate-300 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
                onCheckedChange={(checked) => {
                  const val = checked === true
                  setValue("rememberMe", val, { shouldDirty: true, shouldValidate: true })
                  localStorage.setItem(storageKeys.rememberMe, String(val))
                }}
              />
              <Label htmlFor="rememberMe" className="text-xs font-bold text-slate-600 cursor-pointer">
                Ghi nhớ tài khoản này trên thiết bị
              </Label>
            </div>

            {/* Submit Button */}
            <Button 
              type="submit" 
              disabled={isLoading}
              className="group w-full h-11 rounded-xl bg-slate-950 text-white font-bold shadow-[0_10px_24px_rgba(15,23,42,0.18)] flex items-center justify-center gap-2 transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-900 hover:shadow-[0_16px_34px_rgba(15,23,42,0.24),0_0_0_3px_rgba(249,115,22,0.10)] focus-visible:ring-3 focus-visible:ring-orange-500/20 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoading ? (
                <>
                  <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Đang xử lý đăng nhập...
                </>
              ) : (
                <>
                  Đăng Nhập
                </>
              )}
            </Button>

          </form>

          {/* Social Sign In Divider */}
          <div className="relative my-6 text-center">
            <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-slate-200/80" />
            <span className="relative bg-white px-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
              Hoặc tiếp tục với
            </span>
          </div>

          {/* Google Sign-in */}
          {env.googleClientId ? (
            <div className="group/google relative h-11 overflow-hidden rounded-xl">
              <div
                ref={googleButtonRef}
                className={`absolute inset-0 z-10 flex items-center justify-center overflow-hidden rounded-xl opacity-[0.01] ${isGoogleReady && !isGoogleLoading ? "" : "pointer-events-none"}`}
                aria-hidden="true"
              />
              <Button
                type="button"
                variant="outline"
                disabled={isGoogleLoading}
                onClick={handleGoogleSignInClick}
                className="pointer-events-none group w-full h-11 rounded-xl border-slate-200 bg-white px-3.5 text-slate-800 shadow-[0_10px_24px_rgba(15,23,42,0.10)] transition-all duration-300 hover:-translate-y-0.5 hover:border-orange-400 hover:bg-orange-50/25 hover:shadow-[0_16px_34px_rgba(15,23,42,0.16),0_0_0_3px_rgba(249,115,22,0.10)] group-hover/google:-translate-y-0.5 group-hover/google:border-orange-400 group-hover/google:bg-orange-50/25 group-hover/google:shadow-[0_16px_34px_rgba(15,23,42,0.16),0_0_0_3px_rgba(249,115,22,0.10)] focus-visible:ring-3 focus-visible:ring-orange-500/20 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
                aria-label="ÄÄƒng nháº­p báº±ng Google"
              >
                {isGoogleLoading ? (
                  <span className="h-4 w-4 shrink-0 rounded-full border-2 border-slate-300 border-t-slate-700 animate-spin" />
                ) : (
                  <svg className="h-5 w-5 shrink-0 transition-transform duration-300 group-hover:scale-110" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                  </svg>
                )}
              </Button>
            </div>
          ) : (
          <Button 
            variant="outline" 
            className="group w-full h-11 rounded-xl border-slate-200 bg-white px-3.5 text-slate-800 shadow-[0_10px_24px_rgba(15,23,42,0.10)] transition-all duration-300 hover:-translate-y-0.5 hover:border-orange-400 hover:bg-orange-50/25 hover:shadow-[0_16px_34px_rgba(15,23,42,0.16),0_0_0_3px_rgba(249,115,22,0.10)]"
            aria-label="Đăng nhập bằng Google"
            onClick={() => {
              toast.info("Đăng nhập bằng tài khoản Google đang được phát triển.")
            }}
          >
            <svg className="h-5 w-5 shrink-0 transition-transform duration-300 group-hover:scale-110" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
            </svg>
          </Button>
          )}

          {/* Go to Signup */}
          <p className="text-center text-xs font-semibold text-slate-500">
            Bạn chưa có tài khoản?{" "}
            <Link to="/auth/register" className="text-orange-600 hover:text-orange-700 font-extrabold hover:underline">
              Đăng ký tại đây
            </Link>
          </p>

        </div>
      </div>

    </div>
  )
}
