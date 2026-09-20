import { useState } from "react"
import { useNavigate } from "react-router"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { 
  Lock, 
  ShieldCheck, 
  ChevronLeft
} from "lucide-react"

import { AppLogo } from "@/shared/components/AppLogo"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { toast } from "sonner"

const resetPasswordSchema = z.object({
  password: z.string().min(6, { message: "Mật khẩu mới phải chứa ít nhất 6 ký tự" }),
  confirmPassword: z.string().min(6, { message: "Vui lòng nhập lại mật khẩu xác nhận" }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Mật khẩu xác nhận không trùng khớp",
  path: ["confirmPassword"]
})

type ResetPasswordValues = z.infer<typeof resetPasswordSchema>

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" }
  })

  const onSubmit = () => {
    setIsLoading(true)
    
    // Simulate password reset api
    setTimeout(() => {
      setIsLoading(false)
      toast.success("Thay đổi mật khẩu thành công!", {
        description: "Vui lòng sử dụng mật khẩu mới để đăng nhập."
      })
      navigate("/auth/login")
    }, 1500)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-6 relative font-sans">
      
      {/* Background glowing rings */}
      <div className="absolute top-[10%] left-[10%] w-[450px] h-[450px] rounded-full bg-orange-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[10%] right-[10%] w-[450px] h-[450px] rounded-full bg-indigo-600/10 blur-[120px] pointer-events-none" />

      {/* Brand logo header */}
      <AppLogo variant="dark" className="relative z-10 mb-8" />

      <div className="w-full max-w-md relative z-10">
        
        {/* BACK TO LOGIN */}
        <button 
          onClick={() => navigate("/auth/login")}
          className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-white transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Về trang Đăng nhập
        </button>

        <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-6 md:p-8 shadow-2xl space-y-6">
          
          {/* Form titles */}
          <div className="space-y-2 text-center md:text-left">
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              Đặt lại mật khẩu mới
            </h1>
            <p className="text-xs font-semibold text-slate-400 leading-relaxed">
              Nhập mật khẩu bảo mật mới cho tài khoản RCField của bạn bên dưới.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            
            {/* Input Password */}
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-bold text-slate-300">Mật khẩu mới</Label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="h-4.5 w-4.5" />
                </div>
                <Input 
                  id="password" 
                  type="password" 
                  placeholder="••••••••" 
                  className={`bg-slate-950 border-slate-800 text-white pl-10 h-11 rounded-xl focus:border-orange-500 focus:ring-orange-500/20 ${errors.password ? 'border-red-500 focus:border-red-500' : ''}`}
                  {...register("password")}
                />
              </div>
              {errors.password && (
                <p className="text-[11px] font-bold text-red-500">{errors.password.message}</p>
              )}
            </div>

            {/* Input Confirm Password */}
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className="text-xs font-bold text-slate-300">Xác nhận mật khẩu mới</Label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="h-4.5 w-4.5" />
                </div>
                <Input 
                  id="confirmPassword" 
                  type="password" 
                  placeholder="••••••••" 
                  className={`bg-slate-950 border-slate-800 text-white pl-10 h-11 rounded-xl focus:border-orange-500 focus:ring-orange-500/20 ${errors.confirmPassword ? 'border-red-500 focus:border-red-500' : ''}`}
                  {...register("confirmPassword")}
                />
              </div>
              {errors.confirmPassword && (
                <p className="text-[11px] font-bold text-red-500">{errors.confirmPassword.message}</p>
              )}
            </div>

            {/* Submit */}
            <Button 
              type="submit" 
              disabled={isLoading}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold h-11 rounded-xl shadow-md shadow-orange-500/10 flex items-center justify-center gap-2 group transition-all"
            >
              {isLoading ? (
                <>
                  <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Đang đổi mật khẩu...
                </>
              ) : (
                <>
                  Đặt Lại Mật Khẩu
                  <ShieldCheck className="h-4 w-4 text-white group-hover:scale-110 transition-transform" />
                </>
              )}
            </Button>

          </form>

        </div>
      </div>

    </div>
  )
}
