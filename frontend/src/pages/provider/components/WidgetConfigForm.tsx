import { useEffect, useRef, useState, type FormEvent } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bot, ChevronDown, CheckCircle2, Copy, ExternalLink, Globe, MessageSquare, Palette, Plus, Trash2, Zap } from "lucide-react"
import { toast } from "sonner"

import { cafeApi, cafeQueryKeys } from "@/features/cafes/api/cafe.api"
import type { CafeWidgetConfig, WidgetConfigBody, WidgetPosition } from "@/features/cafes/types"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Textarea } from "@/shared/ui/textarea"
import { Switch } from "@/shared/ui/switch"

const POSITION_OPTIONS: { value: WidgetPosition; label: string }[] = [
  { value: "BOTTOM_RIGHT", label: "Góc dưới phải" },
  { value: "BOTTOM_LEFT", label: "Góc dưới trái" },
]

const PROMPT_TEMPLATES: { label: string; description: string; prompt: string }[] = [
  {
    label: "Trợ lý toàn diện",
    description: "Đặt lịch, giá cả, đồ ăn thức uống, chính sách",
    prompt: `Bạn là trợ lý AI chính thức của [tên chi nhánh] — chi nhánh thuộc hệ thống RCField, nền tảng đặt lịch sân xe RC tại Việt Nam.

## Vai trò
Hỗ trợ khách hàng tìm hiểu dịch vụ, kiểm tra lịch trống và giải đáp thắc mắc về chi nhánh.

## Nguyên tắc trả lời
- Luôn trả lời bằng tiếng Việt, thân thiện và chuyên nghiệp.
- Câu trả lời ngắn gọn, tối đa 3–4 câu trừ khi cần liệt kê chi tiết.
- Dùng danh sách gạch đầu dòng khi có từ 3 mục trở lên.
- Không bịa thông tin — nếu không chắc, hãy gợi ý khách liên hệ trực tiếp chi nhánh.

## Phạm vi hỗ trợ
✅ Giới thiệu dịch vụ, gói thuê xe, bảng giá.
✅ Kiểm tra lịch trống theo ngày/giờ khách yêu cầu.
✅ Hướng dẫn quy trình đặt lịch, thanh toán, hủy lịch.
✅ Chính sách hoàn tiền, bảo hiểm, quy định sân.
✅ Tư vấn dịch vụ đồ ăn và thức uống có tại chi nhánh.
❌ Không xử lý thanh toán hay đặt lịch trực tiếp qua chat.
❌ Không trả lời các chủ đề ngoài dịch vụ của chi nhánh.

## Giọng điệu
Nhiệt tình, dễ gần. Dùng emoji ở mức vừa phải (1–2 emoji/tin nhắn) để tạo cảm giác thân thiện.`,
  },
  {
    label: "Trợ lý đặt lịch",
    description: "Tập trung hỗ trợ đặt slot, hỏi giá",
    prompt: `Bạn là trợ lý AI của [tên chi nhánh], chuyên hỗ trợ đặt lịch sân xe RC.

## Vai trò
Hướng dẫn khách chọn ngày, giờ và loại slot phù hợp, sau đó điều hướng sang trang đặt lịch.

## Nguyên tắc trả lời
- Luôn trả lời bằng tiếng Việt, ngắn gọn và rõ ràng.
- Hỏi lại nếu khách chưa cung cấp đủ thông tin (ngày, số người, loại slot).
- Không bịa lịch trống — hướng dẫn khách kiểm tra trực tiếp trên trang đặt lịch.

## Phạm vi hỗ trợ
✅ Giải thích các loại slot: thuê xe và mang xe riêng.
✅ Thông tin giá slot, thời lượng, số người tối đa.
✅ Giờ mở cửa, địa chỉ, liên hệ chi nhánh.
✅ Hướng dẫn từng bước quy trình đặt và thanh toán.
❌ Không đặt lịch trực tiếp qua chat.
❌ Không xử lý hủy lịch hay hoàn tiền qua chat.

## Giọng điệu
Nhanh nhẹn, thực tế. Ưu tiên thông tin hành động (bước tiếp theo khách cần làm).`,
  },
  {
    label: "Tư vấn thành viên",
    description: "Giới thiệu gói hội viên, ưu đãi",
    prompt: `Bạn là trợ lý AI của [tên chi nhánh], chuyên tư vấn gói thành viên và ưu đãi.

## Vai trò
Giới thiệu các gói membership, giải thích lợi ích và hỗ trợ khách đăng ký hoặc nâng cấp gói.

## Nguyên tắc trả lời
- Luôn trả lời bằng tiếng Việt, thân thiện và có tính thuyết phục.
- Nhấn mạnh giá trị tiết kiệm khi so sánh với đặt lịch lẻ.
- Không bịa thông tin ưu đãi — chỉ đề cập những gói đang áp dụng.

## Phạm vi hỗ trợ
✅ Giới thiệu và so sánh các gói thành viên hiện có.
✅ Giải thích quyền lợi: giảm giá slot, ưu tiên đặt lịch, tích điểm.
✅ Hướng dẫn cách đăng ký hoặc nâng cấp gói.
✅ Trả lời câu hỏi về điều kiện áp dụng, thời hạn gói.
❌ Không xử lý thanh toán gói thành viên qua chat.
❌ Không điều chỉnh hay hủy gói thành viên qua chat.

## Giọng điệu
Nhiệt tình, tập trung vào lợi ích. Kết thúc mỗi tin nhắn bằng lời mời hành động cụ thể.`,
  },
  {
    label: "Hỗ trợ kỹ thuật RC",
    description: "Vận hành xe, an toàn, hướng dẫn người mới",
    prompt: `Bạn là trợ lý AI của [tên chi nhánh], chuyên về xe mô hình điều khiển từ xa (RC car).

## Vai trò
Hỗ trợ khách — đặc biệt người mới — về kỹ thuật vận hành, an toàn sân và lựa chọn xe phù hợp.

## Nguyên tắc trả lời
- Luôn trả lời bằng tiếng Việt, dễ hiểu, tránh thuật ngữ kỹ thuật khó.
- Giải thích bằng ví dụ thực tế khi cần.
- Không bịa thông tin về thông số xe — nếu không chắc, đề nghị khách hỏi nhân viên tại sân.

## Phạm vi hỗ trợ
✅ Giải thích sự khác biệt giữa các dòng xe RC tại chi nhánh.
✅ Hướng dẫn vận hành cơ bản cho người mới (điều khiển, sạc pin, bảo quản).
✅ Quy định an toàn và nội quy sân.
✅ Tư vấn chọn xe theo trình độ và mục đích (drift, leo dốc, vượt địa hình).
✅ Kết hợp hướng dẫn đặt lịch để khách trải nghiệm thực tế.
❌ Không sửa chữa hay bảo dưỡng xe qua chat.
❌ Không cam kết thông số kỹ thuật chính xác nếu chưa xác nhận với nhân viên.

## Giọng điệu
Chuyên nghiệp nhưng gần gũi. Khuyến khích người mới bằng thái độ cởi mở, không phán xét.`,
  },
]

const DEFAULT_CONFIG: CafeWidgetConfig = {
  cafeId: "",
  cafeSlug: "",
  greetingMessage: "Xin chào! Tôi có thể giúp gì cho bạn?",
  welcomeMessage: "Xin chào! Tôi có thể giúp gì cho bạn?",
  position: "BOTTOM_RIGHT",
  primaryColor: "#EA580C",
  avatarUrl: null,
  quickReplies: [],
  systemPrompt: null,
  isEnabled: false,
  fullPageEnabled: false,
}

type FormState = {
  greetingMessage: string
  welcomeMessage: string
  position: WidgetPosition
  primaryColor: string
  quickReplies: string[]
  systemPrompt: string
  isEnabled: boolean
  fullPageEnabled: boolean
}

function toFormState(config: CafeWidgetConfig): FormState {
  return {
    greetingMessage: config.greetingMessage,
    welcomeMessage: config.welcomeMessage,
    position: config.position,
    primaryColor: config.primaryColor,
    quickReplies: config.quickReplies,
    systemPrompt: config.systemPrompt ?? "",
    isEnabled: config.isEnabled,
    fullPageEnabled: config.fullPageEnabled ?? false,
  }
}

export function WidgetConfigForm({ cafeId }: { cafeId: string }) {
  const queryClient = useQueryClient()

  const { data: config, isLoading } = useQuery({
    queryKey: cafeQueryKeys.widgetConfig(cafeId),
    queryFn: () => cafeApi.getWidgetConfig(cafeId),
  })

  const cafeSlug = config?.cafeSlug

  const [form, setForm] = useState<FormState>(toFormState(DEFAULT_CONFIG))
  const [newReply, setNewReply] = useState("")
  const [templateOpen, setTemplateOpen] = useState(false)
  const templateRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!templateOpen) return
    function handleClick(e: MouseEvent) {
      if (templateRef.current && !templateRef.current.contains(e.target as Node)) {
        setTemplateOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [templateOpen])

  useEffect(() => {
    if (config) queueMicrotask(() => setForm(toFormState(config)))
  }, [config])

  const mutation = useMutation({
    mutationFn: (body: WidgetConfigBody) => cafeApi.updateWidgetConfig(cafeId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: cafeQueryKeys.widgetConfig(cafeId) })
      toast.success("Đã lưu cấu hình widget")
    },
    onError: () => toast.error("Không thể lưu cấu hình widget"),
  })

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const addReply = () => {
    const trimmed = newReply.trim()
    if (!trimmed || form.quickReplies.length >= 6) return
    setField("quickReplies", [...form.quickReplies, trimmed])
    setNewReply("")
  }

  const removeReply = (index: number) => {
    setField("quickReplies", form.quickReplies.filter((_, i) => i !== index))
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const body: WidgetConfigBody = {
      greeting_message: form.greetingMessage,
      welcome_message: form.welcomeMessage,
      position: form.position,
      primary_color: form.primaryColor,
      quick_replies: form.quickReplies,
      system_prompt: form.systemPrompt.trim() || null,
      is_enabled: form.isEnabled,
      full_page_enabled: form.fullPageEnabled,
    }
    mutation.mutate(body)
  }

  if (isLoading) {
    return <div className="space-y-3 rounded-xl border border-[#c4c7c8] bg-white p-5">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-[#f6f3f2]" />)}</div>
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-[#c4c7c8] bg-white p-5">

      {/* Enable toggle */}
      <div className="flex items-center justify-between rounded-xl border border-[#e5e2e1] bg-[#faf9f8] px-4 py-3">
        <div className="flex items-center gap-3">
          <Zap className="size-4 text-orange-600" />
          <div>
            <p className="text-sm font-bold text-[#1c1b1b]">Bật widget chat</p>
            <p className="text-xs text-[#747878]">Hiển thị nút chat trên trang đặt lịch của chi nhánh</p>
          </div>
        </div>
        <Switch
          checked={form.isEnabled}
          onCheckedChange={(v) => {
            setField("isEnabled", v)
            mutation.mutate({ is_enabled: v })
          }}
        />
      </div>

      {/* Full-page chat toggle */}
      <div className="flex items-center justify-between rounded-xl border border-[#e5e2e1] bg-[#faf9f8] px-4 py-3">
        <div className="flex items-center gap-3">
          <Globe className="size-4 text-orange-600" />
          <div>
            <p className="text-sm font-bold text-[#1c1b1b]">Trang chat toàn màn hình</p>
            <p className="text-xs text-[#747878]">
              Tạo trang chat riêng tại{" "}
              <code className="rounded bg-white px-1 text-orange-600">/cafes/{cafeSlug ?? ":slug"}/chat</code>
              {" "}để chia sẻ link hoặc dán QR tại quán
            </p>
          </div>
        </div>
        <Switch
          checked={form.fullPageEnabled}
          onCheckedChange={(v) => {
            setField("fullPageEnabled", v)
            mutation.mutate({ full_page_enabled: v })
          }}
        />
      </div>

      {/* Full-page chat URL — only when enabled */}
      {form.fullPageEnabled && cafeSlug && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
            <p className="text-sm font-bold text-emerald-700">Trang chat đang hoạt động</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={`${window.location.origin}/cafes/${cafeSlug}/chat`}
              className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 font-mono text-xs text-[#1c1b1b] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/cafes/${cafeSlug}/chat`)
                toast.success("Đã sao chép URL!")
              }}
              title="Sao chép URL"
              className="rounded-lg border border-emerald-200 bg-white p-1.5 text-emerald-600 transition hover:bg-emerald-100"
            >
              <Copy className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => window.open(`${window.location.origin}/cafes/${cafeSlug}/chat`, "_blank")}
              title="Mở trong tab mới"
              className="rounded-lg border border-emerald-200 bg-white p-1.5 text-emerald-600 transition hover:bg-emerald-100"
            >
              <ExternalLink className="size-4" />
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Left column */}
        <div className="space-y-4">
          <SectionHeading icon={<MessageSquare className="size-3.5" />} title="Tin nhắn" />

          <label className="block space-y-2">
            <span className="text-sm font-bold text-[#1c1b1b]">Lời chào (bubble)</span>
            <Input
              value={form.greetingMessage}
              onChange={(e) => setField("greetingMessage", e.target.value)}
              maxLength={500}
              placeholder="Xin chào! Tôi có thể giúp gì cho bạn?"
              className="rounded-lg border-[#c4c7c8]"
            />
            <p className="text-xs text-[#747878]">Hiển thị trên bong bóng chat trước khi khách mở.</p>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-bold text-[#1c1b1b]">Tin nhắn chào mừng</span>
            <Input
              value={form.welcomeMessage}
              onChange={(e) => setField("welcomeMessage", e.target.value)}
              maxLength={500}
              placeholder="Xin chào! Tôi có thể giúp gì cho bạn?"
              className="rounded-lg border-[#c4c7c8]"
            />
            <p className="text-xs text-[#747878]">Tin nhắn AI gửi đầu tiên khi khách mở chat.</p>
          </label>

          {/* Quick replies */}
          <div className="space-y-2">
            <Label className="text-sm font-bold text-[#1c1b1b]">
              Gợi ý trả lời nhanh
              <span className="ml-1 font-normal text-[#747878]">({form.quickReplies.length}/6)</span>
            </Label>
            <div className="space-y-1.5">
              {form.quickReplies.map((reply, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 rounded-lg border border-[#e5e2e1] bg-[#faf9f8] px-3 py-1.5 text-sm text-[#444748]">{reply}</span>
                  <button type="button" onClick={() => removeReply(i)} className="rounded p-1 text-[#747878] hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {form.quickReplies.length < 6 && (
              <div className="flex gap-2">
                <Input
                  value={newReply}
                  onChange={(e) => setNewReply(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addReply() } }}
                  placeholder="Thêm gợi ý..."
                  maxLength={100}
                  className="rounded-lg border-[#c4c7c8] text-sm"
                />
                <Button type="button" variant="outline" onClick={addReply} className="shrink-0 gap-1 border-[#c4c7c8]">
                  <Plus className="size-3.5" />
                  Thêm
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <SectionHeading icon={<Palette className="size-3.5" />} title="Giao diện" />

          <label className="block space-y-2">
            <span className="text-sm font-bold text-[#1c1b1b]">Vị trí widget</span>
            <select
              value={form.position}
              onChange={(e) => setField("position", e.target.value as WidgetPosition)}
              className="w-full rounded-lg border border-[#c4c7c8] bg-white px-3 py-2 text-sm font-medium text-[#1c1b1b] outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-200"
            >
              {POSITION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-bold text-[#1c1b1b]">Màu chủ đạo</span>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.primaryColor}
                onChange={(e) => setField("primaryColor", e.target.value)}
                className="h-9 w-14 cursor-pointer rounded-lg border border-[#c4c7c8] p-0.5"
              />
              <Input
                value={form.primaryColor}
                onChange={(e) => setField("primaryColor", e.target.value)}
                maxLength={7}
                placeholder="#EA580C"
                className="w-32 rounded-lg border-[#c4c7c8] font-mono text-sm"
              />
              <div className="flex-1 rounded-lg border border-[#e5e2e1] p-2">
                <div
                  className="flex size-8 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: form.primaryColor }}
                >
                  <MessageSquare className="size-4" />
                </div>
              </div>
            </div>
          </label>

          <SectionHeading icon={<Bot className="size-3.5" />} title="Chỉ dẫn cho trợ lý" />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-[#1c1b1b]">Chỉ dẫn hệ thống</span>
              <div ref={templateRef} className="relative">
                <button
                  type="button"
                  onClick={() => setTemplateOpen((v) => !v)}
                  className="flex items-center gap-1.5 rounded-lg border border-[#c4c7c8] bg-white px-3 py-1.5 text-xs font-semibold text-[#444748] transition hover:border-orange-400 hover:text-orange-600"
                >
                  Tải mẫu
                  <ChevronDown className={`size-3.5 transition-transform ${templateOpen ? "rotate-180" : ""}`} />
                </button>
                {templateOpen && (
                  <div className="absolute right-0 top-full z-20 mt-1.5 w-64 overflow-hidden rounded-xl border border-[#e5e2e1] bg-white shadow-lg">
                    {PROMPT_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.label}
                        type="button"
                        onClick={() => {
                          setField("systemPrompt", tpl.prompt)
                          setTemplateOpen(false)
                        }}
                        className="w-full px-4 py-3 text-left transition hover:bg-orange-50"
                      >
                        <p className="text-sm font-semibold text-[#1c1b1b]">{tpl.label}</p>
                        <p className="mt-0.5 text-xs text-[#747878]">{tpl.description}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <Textarea
              value={form.systemPrompt}
              onChange={(e) => setField("systemPrompt", e.target.value)}
              maxLength={4000}
              placeholder="Bạn là trợ lý AI của RC Arena. Hãy giúp khách hàng đặt lịch, hỏi giá, và tìm hiểu về các dịch vụ tại cơ sở..."
              className="min-h-[140px] rounded-lg border-[#c4c7c8] font-mono text-xs"
            />
            <p className="text-xs text-[#747878]">Hướng dẫn AI về cách trả lời, phong cách, thông tin cơ sở. Để trống để dùng prompt mặc định.</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end border-t border-[#e5e2e1] pt-4">
        <Button
          type="submit"
          disabled={mutation.isPending}
          className="bg-orange-600 text-white hover:bg-orange-700"
        >
          {mutation.isPending ? "Đang lưu..." : "Lưu cấu hình widget"}
        </Button>
      </div>
    </form>
  )
}

function SectionHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#747878]">
      {icon}
      {title}
    </div>
  )
}
