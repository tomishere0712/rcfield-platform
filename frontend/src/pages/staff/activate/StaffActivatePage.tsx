import { useState, useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { Loader2, AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"
import { staffApi } from "@/features/staff/api/staff.api"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { storageKeys } from "@/shared/lib/storage"
import { getApiErrorInfo } from "@/shared/lib/utils"
import { routePaths } from "@/app/router/route-paths"

type PageState = "loading" | "valid" | "invalid" | "expired" | "activating" | "done"

export function StaffActivatePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token") ?? ""
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated)

  const [state, setState] = useState<PageState>("loading")
  const [email, setEmail] = useState("")
  const [fullName, setFullName] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  useEffect(() => {
    if (!token) {
      queueMicrotask(() => setState("invalid"))
      return
    }

    staffApi
      .validateInviteToken(token)
      .then(({ email: e, fullName: n }) => {
        setEmail(e)
        setFullName(n)
        setState("valid")
      })
      .catch((err) => {
        const code = err?.response?.data?.code
        if (code === "INVITE_TOKEN_EXPIRED") {
          setState("expired")
        } else {
          setState("invalid")
        }
      })
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg("")

    if (password.length < 8) {
      setErrorMsg("Mật khẩu phải có ít nhất 8 ký tự.")
      return
    }
    if (password !== confirmPassword) {
      setErrorMsg("Xác nhận mật khẩu không khớp.")
      return
    }

    setState("activating")
    try {
      const result = await staffApi.activateAccount(token, password)

      setAuthenticated("staff", {
        id: result.user.id,
        fullName: result.user.fullName,
        email: result.user.email,
        role: "staff",
        assignedCafeId: result.user.cafeId,
      })

      sessionStorage.setItem(
        storageKeys.auth,
        JSON.stringify({
          accessToken: result.access_token,
          refreshToken: result.refresh_token,
          user: result.user,
          role: "staff",
          email: result.user.email,
        }),
      )

      setState("done")
      toast.success("Tài khoản đã được kích hoạt thành công!")
      setTimeout(() => navigate(routePaths.staffDashboard), 1500)
    } catch (err: unknown) {
      const { code } = getApiErrorInfo(err)
      if (code === "INVITE_TOKEN_EXPIRED") {
        setState("expired")
      } else if (code === "INVITE_TOKEN_INVALID") {
        setState("invalid")
      } else {
        setState("valid")
        setErrorMsg("Kích hoạt thất bại. Vui lòng thử lại.")
      }
    }
  }

  if (state === "loading") {
    return (
      <CenteredLayout>
        <Loader2 className="size-8 animate-spin text-[#747878]" />
        <p className="mt-3 text-sm text-[#747878]">Đang xác thực liên kết...</p>
      </CenteredLayout>
    )
  }

  if (state === "expired") {
    return (
      <CenteredLayout>
        <AlertCircle className="size-12 text-amber-500" />
        <h2 className="mt-4 text-xl font-bold text-[#1c1b1b]">Liên kết đã hết hạn</h2>
        <p className="mt-2 max-w-sm text-center text-sm text-[#747878]">
          Link kích hoạt này đã hết hạn (có hiệu lực 48 giờ). Vui lòng liên hệ Provider để được gửi lại lời mời.
        </p>
      </CenteredLayout>
    )
  }

  if (state === "invalid") {
    return (
      <CenteredLayout>
        <AlertCircle className="size-12 text-red-500" />
        <h2 className="mt-4 text-xl font-bold text-[#1c1b1b]">Liên kết không hợp lệ</h2>
        <p className="mt-2 max-w-sm text-center text-sm text-[#747878]">
          Link kích hoạt này không hợp lệ hoặc đã được sử dụng. Vui lòng liên hệ Provider để được hỗ trợ.
        </p>
      </CenteredLayout>
    )
  }

  if (state === "done") {
    return (
      <CenteredLayout>
        <CheckCircle2 className="size-12 text-green-500" />
        <h2 className="mt-4 text-xl font-bold text-[#1c1b1b]">Kích hoạt thành công!</h2>
        <p className="mt-2 text-sm text-[#747878]">Đang chuyển hướng đến trang làm việc...</p>
      </CenteredLayout>
    )
  }

  return (
    <CenteredLayout>
      <div className="w-full max-w-md rounded-xl border border-[#c4c7c8] bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-bold text-[#1c1b1b]">Kích hoạt tài khoản</h1>
        <p className="mb-6 text-sm text-[#747878]">
          Xin chào <span className="font-semibold text-[#1c1b1b]">{fullName}</span> ({email}), đặt mật khẩu để hoàn tất kích hoạt.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#444748]">
              Mật khẩu mới *
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                className="w-full rounded-lg border border-[#c4c7c8] px-3 py-2.5 pr-10 text-sm focus:border-[#1c1b1b] focus:outline-none focus:ring-1 focus:ring-[#1c1b1b]"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tối thiểu 8 ký tự"
                autoComplete="new-password"
              />
              <button
                type="button"
                className="absolute right-3 top-3 text-[#747878]"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#444748]">
              Xác nhận mật khẩu *
            </label>
            <input
              type={showPassword ? "text" : "password"}
              required
              className="w-full rounded-lg border border-[#c4c7c8] px-3 py-2.5 text-sm focus:border-[#1c1b1b] focus:outline-none focus:ring-1 focus:ring-[#1c1b1b]"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Nhập lại mật khẩu"
              autoComplete="new-password"
            />
          </div>

          {errorMsg && (
            <p className="flex items-center gap-1.5 text-sm text-red-600">
              <AlertCircle className="size-4 shrink-0" />
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={state === "activating"}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1c1b1b] py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#313030] disabled:opacity-60"
          >
            {state === "activating" ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Đang kích hoạt...
              </>
            ) : (
              "Kích hoạt tài khoản"
            )}
          </button>
        </form>
      </div>
    </CenteredLayout>
  )
}

function CenteredLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f6f3f2] p-4">
      {children}
    </div>
  )
}
