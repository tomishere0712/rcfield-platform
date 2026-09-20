import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Eye, EyeOff, CalendarCheck, Bell, Ticket, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { Dialog, DialogContent } from "@/shared/ui/dialog"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { loginWithPassword, type LoginResponse } from "@/features/auth/api/auth.api"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { storageKeys } from "@/shared/lib/storage"
import { routePaths } from "@/app/router/route-paths"
import { useNavigate } from "react-router"

const schema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
})
type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

const PERKS = [
  { icon: CalendarCheck, text: "Lưu & quản lý lịch đặt dễ dàng" },
  { icon: Bell,          text: "Nhận nhắc nhở trước giờ chơi" },
  { icon: Ticket,        text: "Nhận ưu đãi dành riêng thành viên" },
]

export function LoginPromptDialog({ open, onClose, onSuccess }: Props) {
  const navigate = useNavigate()
  const setAuthenticated = useAuthStore((state) => state.setAuthenticated)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors }, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const handleLogin = async (data: FormValues) => {
    setLoading(true)
    try {
      const auth: LoginResponse = await loginWithPassword({
        email: data.email.trim().toLowerCase(),
        password: data.password,
      })

      if (auth.user.role !== "customer") {
        toast.error("Vui lòng đăng nhập bằng tài khoản khách hàng.")
        setLoading(false)
        return
      }

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

      localStorage.setItem(storageKeys.auth, JSON.stringify({
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        user: auth.user,
        role: auth.user.role,
        email: auth.user.email,
      }))

      toast.success(`Chào mừng, ${auth.user.fullName || auth.user.email}!`)
      reset()
      onClose()
      onSuccess()
    } catch (error: unknown) {
      const code = (error as { response?: { data?: { code?: string } } })?.response?.data?.code
      if (code === "INVALID_CREDENTIALS") {
        toast.error("Email hoặc mật khẩu không đúng.")
      } else if (code === "ACCOUNT_LOCKED") {
        toast.error("Tài khoản đang bị khóa. Vui lòng liên hệ hỗ trợ.")
      } else {
        toast.error("Không thể đăng nhập. Vui lòng thử lại.")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose() } }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden gap-0">

        {/* Hero banner */}
        <div className="relative bg-gradient-to-br from-orange-500 to-orange-600 px-6 pt-8 pb-6 text-white">
          <div className="absolute inset-0 opacity-10"
            style={{ backgroundImage: "radial-gradient(circle at 80% 20%, white 1px, transparent 1px), radial-gradient(circle at 20% 80%, white 1px, transparent 1px)", backgroundSize: "32px 32px" }}
          />
          <div className="relative">
            <h2 className="text-xl font-bold leading-snug">Sắp xong rồi!</h2>
            <p className="text-sm text-orange-100 mt-1">
              Đăng nhập nhanh để giữ slot — chỉ mất 10 giây.
            </p>
            <div className="mt-4 flex flex-col gap-1.5">
              {PERKS.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-2 text-xs text-orange-50">
                  <Icon className="size-3.5 shrink-0 text-orange-200" />
                  {text}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Form section */}
        <div className="px-6 py-5 space-y-4">
          <form onSubmit={handleSubmit(handleLogin)} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="lp-email" className="text-slate-700">Email</Label>
              <Input
                id="lp-email"
                type="email"
                placeholder="email@example.com"
                autoComplete="email"
                className="h-10"
                {...register("email")}
              />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lp-password" className="text-slate-700">Mật khẩu</Label>
              <div className="relative">
                <Input
                  id="lp-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="h-10 pr-10"
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm gap-2 mt-1"
            >
              {loading ? (
                <>
                  <span className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Đang đăng nhập...
                </>
              ) : (
                <>Đăng nhập & Tiếp tục <ChevronRight className="size-4" /></>
              )}
            </Button>
          </form>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-100" />
            <span className="text-xs text-slate-400">chưa có tài khoản?</span>
            <div className="h-px flex-1 bg-slate-100" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full h-10 text-sm font-semibold border-slate-200 hover:bg-slate-50"
            onClick={() => { reset(); onClose(); navigate(routePaths.register) }}
          >
            Tạo tài khoản miễn phí
          </Button>

          <p className="text-center text-xs text-slate-400 pb-1">
            Dùng Google?{" "}
            <button
              type="button"
              className="text-orange-600 hover:underline font-medium"
              onClick={() => { reset(); onClose(); navigate(routePaths.login) }}
            >
              Vào trang đăng nhập
            </button>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
