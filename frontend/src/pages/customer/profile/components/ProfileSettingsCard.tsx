import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as z from "zod"
import { toast } from "sonner"
import { Camera, LockKeyhole, Trash2 } from "lucide-react"

import { getMe, updateMe } from "@/features/auth/api/auth.api"
import { useAuthStore } from "@/features/auth/stores/auth.store"
import { racingApi, racingQueryKeys } from "@/features/racing/api/racing.api"
import { uploadImage } from "@/features/uploads/api/upload.api"
import { storageKeys } from "@/shared/lib/storage"
import { Button } from "@/shared/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Separator } from "@/shared/ui/separator"
import { Switch } from "@/shared/ui/switch"

/**
 * Toàn bộ phần chỉnh sửa hồ sơ khách, gộp về MỘT thẻ và MỘT nút lưu.
 *
 * Trước đây trang này có hai thẻ và hai nút lưu — "Lưu hồ sơ tay đua" ở thẻ
 * trên, "Lưu thay đổi" ở thẻ dưới — mà nhìn vào không có gì cho biết nút nào
 * lưu ô nào. Sửa tên hiển thị rồi bấm nhầm nút dưới là mất thay đổi mà không
 * báo lỗi gì cả.
 *
 * Hai nhóm dữ liệu vẫn nằm ở hai API khác nhau (tài khoản và hồ sơ tay đua),
 * nhưng đó là chuyện của backend — người dùng chỉ thấy một biểu mẫu, nên chỉ
 * nên có một nút.
 */

const phoneSchema = z.object({
  phone: z
    .string()
    .refine((val) => !val || /^(84|0[3|5|7|8|9])([0-9]{8})$/.test(val), {
      message: "Số điện thoại không đúng định dạng. Định dạng hợp lệ ví dụ: 0987654321",
    }),
})

export function ProfileSettingsCard() {
  const user = useAuthStore((state) => state.user)
  const role = useAuthStore((state) => state.role)
  const setUser = useAuthStore((state) => state.setUser)
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const phoneInputRef = useRef<HTMLInputElement | null>(null)
  const [searchParams] = useSearchParams()
  const [phoneError, setPhoneError] = useState("")
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const { data: passport } = useQuery({
    queryKey: racingQueryKeys.passport(),
    queryFn: () => racingApi.getMyPassport(),
    retry: false,
  })

  /**
   * Bản nháp phủ lên giá trị máy chủ, thay vì chép giá trị máy chủ vào state.
   *
   * Bản cũ dùng `useEffect` để đồng bộ hai chiều, và nó có một lỗi lặng: hai
   * truy vấn (`getMe` và hồ sơ tay đua) tự làm mới nền: đúng lúc người dùng
   * đang gõ dở là effect chạy và ghi đè lại ô nhập bằng giá trị cũ từ máy chủ.
   *
   * Ở đây chỉ những ô người dùng ĐÃ CHẠM mới nằm trong `draft`; còn lại luôn
   * đọc thẳng từ máy chủ. Không có effect nào, nên không có gì ghi đè.
   */
  const [draft, setDraft] = useState<{
    fullName?: string
    phone?: string
    /** Chuỗi rỗng nghĩa là người dùng chủ ý gỡ ảnh, khác hẳn "chưa đụng tới". */
    avatarUrl?: string
    displayName?: string
    driverHandle?: string
    leaderboardOptIn?: boolean
    publicProfile?: boolean
  }>({})

  const form = {
    fullName: draft.fullName ?? user?.fullName ?? "",
    phone: draft.phone ?? user?.phone ?? "",
    avatarUrl: draft.avatarUrl ?? user?.avatarUrl ?? "",
  }
  const racer = {
    displayName: draft.displayName ?? passport?.display_name ?? "",
    driverHandle: draft.driverHandle ?? passport?.driver_handle ?? "",
    leaderboardOptIn: draft.leaderboardOptIn ?? passport?.leaderboard_opt_in ?? true,
    publicProfile: draft.publicProfile ?? passport?.public_profile_enabled ?? true,
  }

  useEffect(() => {
    let mounted = true
    getMe()
      .then((profile) => {
        if (!mounted) return
        setUser(profile)
        persistUser(profile)
      })
      .catch(() => undefined)
    return () => {
      mounted = false
    }
  }, [setUser])

  useEffect(() => {
    if (searchParams.get("focus") !== "phone") return
    const timer = setTimeout(() => {
      phoneInputRef.current?.focus()
      phoneInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 300)
    return () => clearTimeout(timer)
  }, [searchParams])

  /**
   * Lưu cả hai nhóm.
   *
   * Chạy tuần tự chứ không song song: nếu nhóm tài khoản hỏng thì dừng luôn,
   * khỏi ghi nửa vời. Và khi nhóm sau hỏng thì nói rõ nhóm trước ĐÃ lưu — báo
   * "lưu thất bại" chung chung sẽ khiến người dùng nhập lại từ đầu những thứ
   * thực ra đã vào rồi.
   */
  const save = async (nextAvatarUrl = form.avatarUrl) => {
    const validation = phoneSchema.safeParse({ phone: form.phone })
    if (!validation.success) {
      setPhoneError(validation.error.format().phone?._errors[0] ?? "")
      toast.error("Vui lòng sửa số điện thoại trước khi lưu.")
      return
    }

    setSaving(true)
    try {
      const profile = await updateMe({
        fullName: form.fullName.trim(),
        phone: form.phone.trim() || null,
        avatarUrl: nextAvatarUrl || null,
      })
      setUser({ ...profile, role: profile.role ?? role ?? "customer" })
      persistUser(profile)
      setPhoneError("")

      if (passport) {
        try {
          await racingApi.updateMyPassport({
            display_name: racer.displayName.trim() || undefined,
            driver_handle: racer.driverHandle.trim() || undefined,
            leaderboard_opt_in: racer.leaderboardOptIn,
            public_profile_enabled: racer.publicProfile,
          })
          await queryClient.invalidateQueries({ queryKey: racingQueryKeys.passport() })
        } catch (error) {
          toast.error("Đã lưu thông tin tài khoản, nhưng phần tay đua thì chưa", {
            description: readMessage(error) ?? "Vui lòng thử lại phần tay đua.",
          })
          return
        }
      }

      // Bỏ nháp: từ đây các ô đọc thẳng giá trị máy chủ vừa lưu được.
      setDraft({})
      toast.success("Đã lưu hồ sơ.")
    } catch (error) {
      const code = (error as { response?: { data?: { code?: string } } })?.response?.data?.code
      if (code === "PHONE_ALREADY_EXISTS") {
        setPhoneError("Số điện thoại này đã được dùng bởi tài khoản khác")
        toast.error("Số điện thoại này đã được dùng bởi tài khoản khác.")
      } else {
        toast.error(readMessage(error) ?? "Lưu hồ sơ thất bại. Vui lòng thử lại.")
      }
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarChange = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      const uploaded = await uploadImage(file, "profile-avatar")
      setDraft((current) => ({ ...current, avatarUrl: uploaded.url }))
      await save(uploaded.url)
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader>
        <CardTitle>Hồ sơ</CardTitle>
      </CardHeader>

      <CardContent className="space-y-8">
        <section className="space-y-4">
          <SectionLabel>Thông tin cơ bản</SectionLabel>

          {/*
            Ảnh đại diện thu về một hàng gọn: ảnh nhỏ, một nút đổi, một liên kết
            gỡ. Thẻ danh tính bên trái đã hiện ảnh cỡ lớn rồi — bày thêm một ảnh
            96px kèm hai nút và một dòng hướng dẫn ở đây chỉ là in lại lần hai.
          */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group relative size-16 shrink-0 overflow-hidden rounded-full border"
              aria-label="Đổi ảnh đại diện"
            >
              {form.avatarUrl ? (
                <img
                  alt=""
                  src={form.avatarUrl}
                  className="size-full object-cover transition-opacity group-hover:opacity-60"
                />
              ) : (
                <span className="flex size-full items-center justify-center bg-muted text-lg font-semibold text-muted-foreground">
                  {getInitials(form.fullName || user?.email || "")}
                </span>
              )}
              <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="size-5 text-foreground" />
              </span>
            </button>
            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/jpg"
              onChange={(event) => void handleAvatarChange(event.target.files?.[0])}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? "Đang tải..." : "Đổi ảnh"}
                </Button>
                {form.avatarUrl ? (
                  <button
                    type="button"
                    className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                    onClick={() => {
                      setDraft((current) => ({ ...current, avatarUrl: "" }))
                      void save("")
                    }}
                  >
                    Gỡ ảnh
                  </button>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">JPG, PNG hoặc WEBP, tối đa 5MB.</p>
            </div>
          </div>

          {/*
            MỘT ô họ tên, không phải hai.
            Tên tiếng Việt không tách được thành họ/tên bằng khoảng trắng: bản cũ
            cắt ở khoảng trắng đầu tiên nên "Bùi Trọng Trí" ra Họ="Bùi",
            Tên="Trọng Trí" — còn tên đã lưu theo thứ tự phương Tây thì ra sai
            hẳn. Ghép lại lúc lưu cũng chỉ trả về đúng chuỗi ban đầu, nên hai ô
            đó không mang thêm thông tin gì, chỉ thêm chỗ để sai.
          */}
          <label className="block space-y-2">
            <Label>Họ và tên</Label>
            <Input
              value={form.fullName}
              onChange={(event) =>
                setDraft((current) => ({ ...current, fullName: event.target.value }))
              }
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email ?? ""} disabled />
            </label>
            <label className="space-y-2">
              <Label>Số điện thoại</Label>
              <Input
                ref={phoneInputRef}
                value={form.phone}
                onChange={(event) => {
                  const val = event.target.value
                  setDraft((current) => ({ ...current, phone: val }))
                  const res = phoneSchema.safeParse({ phone: val })
                  setPhoneError(res.success ? "" : (res.error.format().phone?._errors[0] ?? ""))
                }}
              />
              {phoneError ? <p className="text-xs text-destructive">{phoneError}</p> : null}
            </label>
          </div>
        </section>

        {passport ? (
          <>
            <Separator />
            <section className="space-y-4">
              <SectionLabel>Tay đua</SectionLabel>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <Label>Tên hiển thị</Label>
                  <Input
                    value={racer.displayName}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, displayName: event.target.value }))
                    }
                  />
                </label>
                <label className="space-y-2">
                  <Label>Tên tay đua</Label>
                  <Input
                    value={racer.driverHandle}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, driverHandle: event.target.value }))
                    }
                  />
                </label>
              </div>

              <div className="space-y-3">
                <Toggle
                  label="Hiển thị trên bảng xếp hạng"
                  checked={racer.leaderboardOptIn}
                  onChange={(v) => setDraft((c) => ({ ...c, leaderboardOptIn: v }))}
                />
                <Toggle
                  label="Cho phép người khác xem hồ sơ"
                  checked={racer.publicProfile}
                  onChange={(v) => setDraft((c) => ({ ...c, publicProfile: v }))}
                />
              </div>

              {/*
                Danh hiệu chỉ hiện khi CÓ. Bản cũ luôn dựng sẵn khối này kèm câu
                "Chưa có danh hiệu nào được mở khóa" — chiếm nguyên nửa thẻ để
                nói rằng không có gì.
              */}
              {passport.achievements.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {passport.achievements.map((achievement) => (
                    <span
                      key={achievement.code}
                      title={achievement.description ?? undefined}
                      className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium"
                    >
                      {achievement.name}
                    </span>
                  ))}
                </div>
              ) : null}
            </section>
          </>
        ) : null}

        <Separator />

        <section className="space-y-4">
          <SectionLabel>Bảo mật</SectionLabel>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm">
              <LockKeyhole className="size-4" /> Đổi mật khẩu
            </Button>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
              <Trash2 className="size-4" /> Xóa tài khoản
            </Button>
          </div>
        </section>

        <div className="flex justify-end border-t pt-6">
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? "Đang lưu..." : "Lưu thay đổi"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-medium text-muted-foreground">{children}</p>
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function readMessage(error: unknown): string | undefined {
  return (error as { response?: { data?: { message?: string } } })?.response?.data?.message
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(-2)
    .toUpperCase()
}

function persistUser(user: {
  id: string
  email: string
  fullName: string
  phone?: string
  avatarUrl?: string
  role?: string
  registrationStatus?: string
}) {
  const storage = localStorage.getItem(storageKeys.auth) ? localStorage : sessionStorage
  const raw = storage.getItem(storageKeys.auth)
  if (!raw) return
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    storage.setItem(storageKeys.auth, JSON.stringify({ ...parsed, user }))
  } catch {
    // ignore malformed storage
  }
}
