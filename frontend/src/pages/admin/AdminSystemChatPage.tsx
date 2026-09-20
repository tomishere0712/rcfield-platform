import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import ReactMarkdown from "react-markdown"
import { Bot, CheckCircle2, Copy, ExternalLink, Plus, RotateCcw, Save, Send, Wand2, X } from "lucide-react"
import { toast } from "sonner"

import { AdminShell } from "@/pages/admin/components/AdminShell"
import { AdminHeader, AdminPanel, AdminPanelTitle } from "@/pages/admin/components/AdminPrimitives"
import { getSystemWidgetConfig, updateSystemWidgetConfig } from "@/features/chat/api"
import { useSystemChat } from "@/features/chat/hooks/useSystemChat"
import type { SystemWidgetConfig } from "@/features/chat/types"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { Textarea } from "@/shared/ui/textarea"
import { cn } from "@/shared/lib/utils"

const POSITIONS = [
  { value: "BOTTOM_RIGHT", label: "Dưới phải" },
  { value: "BOTTOM_LEFT", label: "Dưới trái" },
]

const PRESET_COLORS = [
  "#EA580C", "#DC2626", "#7C3AED", "#0EA5E9", "#10B981", "#F59E0B",
]

const SYSTEM_PROMPT_TEMPLATE = `Bạn là trợ lý AI chính thức của RCField — nền tảng đặt lịch sân xe RC tại Việt Nam.

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
❌ Không xử lý thanh toán hay đặt lịch trực tiếp qua chat.
❌ Không trả lời các chủ đề ngoài dịch vụ RCField.

## Giọng điệu
Nhiệt tình, dễ gần. Dùng emoji ở mức vừa phải (1–2 emoji/tin nhắn) để tạo cảm giác thân thiện.`.trim()

type FormState = {
  isEnabled: boolean
  fullPageEnabled: boolean
  greetingMessage: string
  position: string
  primaryColor: string
  quickReplies: string[]
  systemPrompt: string
}

function toForm(cfg: SystemWidgetConfig): FormState {
  return {
    isEnabled: cfg.isEnabled,
    fullPageEnabled: cfg.fullPageEnabled ?? false,
    greetingMessage: cfg.greetingMessage,
    position: cfg.position,
    primaryColor: cfg.primaryColor,
    quickReplies: cfg.quickReplies,
    systemPrompt: cfg.systemPrompt ?? "",
  }
}

function InlineChatPanel({ primaryColor }: { primaryColor: string }) {
  const { messages, isLoading, config, configLoading, sendMessage, reset } = useSystemChat()
  const [input, setInput] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = () => {
    const text = input.trim()
    if (!text || isLoading) return
    setInput("")
    sendMessage(text)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const color = primaryColor || config?.primaryColor || "#EA580C"

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-[#e5e2e1] bg-white shadow-sm" style={{ height: 520 }}>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: color }}>
        <div className="flex size-7 items-center justify-center rounded-full bg-white/20">
          <Bot className="size-3.5 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold leading-none text-white">RCField AI</p>
          <p className="mt-0.5 text-[10px] text-white/70">Chế độ thử nghiệm</p>
        </div>
        <button
          onClick={reset}
          title="Cuộc trò chuyện mới"
          className="rounded p-1 text-white/70 transition hover:bg-white/20 hover:text-white"
        >
          <RotateCcw className="size-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {configLoading && (
          <div className="flex h-full items-center justify-center text-xs text-[#747878]">
            Đang tải...
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex gap-2", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
            {msg.role === "bot" && (
              <div
                className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full"
                style={{ background: color }}
              >
                <Bot className="size-3 text-white" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[78%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                msg.role === "user"
                  ? "rounded-tr-sm text-white"
                  : "rounded-tl-sm bg-[#f6f3f2] text-[#1c1b1b]",
              )}
              style={msg.role === "user" ? { background: color } : undefined}
            >
              {msg.isStreaming && msg.content === "" ? (
                <span className="inline-flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="inline-block size-1.5 animate-bounce rounded-full bg-current opacity-60"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </span>
              ) : msg.role === "bot" ? (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                    ul: ({ children }) => <ul className="mb-1 list-disc pl-4 last:mb-0">{children}</ul>,
                    ol: ({ children }) => <ol className="mb-1 list-decimal pl-4 last:mb-0">{children}</ol>,
                    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                    code: ({ children }) => <code className="rounded bg-black/10 px-1 font-mono text-xs">{children}</code>,
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              ) : (
                <span className="whitespace-pre-wrap">{msg.content}</span>
              )}
            </div>
          </div>
        ))}

        {/* Quick replies of last bot message */}
        {(() => {
          const last = messages[messages.length - 1]
          const qr = last?.role === "bot" && !last.isStreaming ? last.quickReplies : undefined
          return qr?.length ? (
            <div className="flex flex-wrap gap-1.5 pl-8">
              {qr.map((r) => (
                <button
                  key={r}
                  onClick={() => sendMessage(r)}
                  disabled={isLoading}
                  className="rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50"
                  style={{ borderColor: color, color }}
                  onMouseEnter={(e) => {
                    ;(e.currentTarget as HTMLElement).style.backgroundColor = color
                    ;(e.currentTarget as HTMLElement).style.color = "#fff"
                  }}
                  onMouseLeave={(e) => {
                    ;(e.currentTarget as HTMLElement).style.backgroundColor = "transparent"
                    ;(e.currentTarget as HTMLElement).style.color = color
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          ) : null
        })()}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[#e5e2e1] px-3 py-2">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nhập câu hỏi để test..."
            rows={1}
            disabled={isLoading}
            className="max-h-20 min-h-[36px] resize-none rounded-xl bg-[#f6f3f2] text-sm"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="size-9 shrink-0 rounded-xl text-white"
            style={{ background: color }}
          >
            <Send className="size-4" />
          </Button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-[#747878]">
          AI phản ánh cấu hình đã lưu — Lưu trước khi test
        </p>
      </div>
    </div>
  )
}

export function AdminSystemChatPage() {
  const queryClient = useQueryClient()
  const { data: config, isLoading: loading } = useQuery({
    queryKey: ['system-widget-config'],
    queryFn: getSystemWidgetConfig,
    staleTime: Infinity,
    retry: 1,
  })

  const [form, setForm] = useState<FormState>({
    isEnabled: false,
    fullPageEnabled: false,
    greetingMessage: "Xin chào! Tôi có thể giúp gì cho bạn?",
    position: "BOTTOM_RIGHT",
    primaryColor: "#EA580C",
    quickReplies: [],
    systemPrompt: "",
  })
  const [saving, setSaving] = useState(false)
  const [newReply, setNewReply] = useState("")
  const colorRef = useRef<HTMLInputElement>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (config && !initialized.current) {
      initialized.current = true
      setForm(toForm(config))
    }
  }, [config])

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateSystemWidgetConfig({
        isEnabled: form.isEnabled,
        fullPageEnabled: form.fullPageEnabled,
        greetingMessage: form.greetingMessage,
        position: form.position,
        primaryColor: form.primaryColor,
        quickReplies: form.quickReplies,
        systemPrompt: form.systemPrompt || null,
      })
      await queryClient.invalidateQueries({ queryKey: ['system-widget-config'] })
      initialized.current = false
      toast.success("Đã lưu cấu hình chat widget!")
    } catch {
      toast.error("Lưu thất bại. Vui lòng kiểm tra kết nối và thử lại.")
    } finally {
      setSaving(false)
    }
  }

  const addReply = () => {
    const trimmed = newReply.trim()
    if (!trimmed || form.quickReplies.includes(trimmed)) return
    setForm((f) => ({ ...f, quickReplies: [...f.quickReplies, trimmed] }))
    setNewReply("")
  }

  const removeReply = (idx: number) => {
    setForm((f) => ({ ...f, quickReplies: f.quickReplies.filter((_, i) => i !== idx) }))
  }

  if (loading) {
    return (
      <AdminShell>
        <div className="flex h-64 items-center justify-center text-sm font-semibold text-[#747878]">
          Đang tải cấu hình...
        </div>
      </AdminShell>
    )
  }

  return (
    <AdminShell>
      <AdminHeader
        title="Chat Widget Trang chủ"
        description="Cấu hình AI chat widget hiển thị trên trang landing page của RCField."
      />

      {/* Controls Block */}
      <div className="mb-6 flex flex-wrap items-center justify-end gap-4 rounded-xl border border-[#e5e2e1] bg-white p-4 shadow-sm">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="h-10 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg shadow-none flex items-center gap-1.5"
        >
          <Save className="size-4" />
          {saving ? "Đang lưu..." : "Lưu thay đổi"}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Config panels */}
        <div className="space-y-6">
          {/* Enable / Disable */}
          <AdminPanel>
            <AdminPanelTitle title="Trạng thái Widget" />
            <div className="flex items-center justify-between rounded-xl border border-[#e5e2e1] p-4">
              <div>
                <p className="text-sm font-bold text-[#1c1b1b]">Hiển thị Chat Widget</p>
                <p className="text-xs font-semibold text-[#747878] mt-0.5">
                  Khi tắt, widget sẽ bị ẩn hoàn toàn khỏi trang chủ.
                </p>
              </div>
              <button
                onClick={() => setForm((f) => ({ ...f, isEnabled: !f.isEnabled }))}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none",
                  form.isEnabled ? "bg-orange-600" : "bg-[#c4c7c8]",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                    form.isEnabled ? "translate-x-6" : "translate-x-1",
                  )}
                />
              </button>
            </div>
          </AdminPanel>

          {/* Trang chat riêng của từng chi nhánh */}
          <AdminPanel>
            <AdminPanelTitle
              title="Trang chat riêng"
              subtitle="Mỗi cafe có trang chat riêng tại /cafes/:slug/chat để chia sẻ link hoặc dán QR code tại quán."
            />
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-[#e5e2e1] p-4">
                <div>
                  <p className="text-sm font-bold text-[#1c1b1b]">Bật Full-page Chat</p>
                  <p className="text-xs font-semibold text-[#747878] mt-0.5">
                    Khi bật, trang <code className="bg-slate-100 px-1 rounded text-orange-600">/cafes/{config?.cafeSlug}/chat</code> sẽ hoạt động.
                  </p>
                </div>
                <button
                  onClick={() => setForm((f) => ({ ...f, fullPageEnabled: !f.fullPageEnabled }))}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none",
                    form.fullPageEnabled ? "bg-orange-600" : "bg-[#c4c7c8]",
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                      form.fullPageEnabled ? "translate-x-6" : "translate-x-1",
                    )}
                  />
                </button>
              </div>

              {form.fullPageEnabled && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                    <p className="text-sm font-bold text-emerald-700">Trang chat riêng đang bật</p>
                  </div>
                  <p className="text-xs font-semibold text-emerald-600">
                    Trang chat có thể truy cập tại URL sau:
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={`${window.location.origin}/cafes/${config?.cafeSlug}/chat`}
                      className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-xs text-slate-700 focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/cafes/${config?.cafeSlug}/chat`)
                        toast.success("Đã sao chép URL!")
                      }}
                      title="Sao chép URL"
                      className="rounded-lg border border-emerald-200 bg-white p-2 text-emerald-600 transition-colors hover:bg-emerald-100"
                    >
                      <Copy className="size-4" />
                    </button>
                    <button
                      onClick={() => window.open(`${window.location.origin}/cafes/${config?.cafeSlug}/chat`, "_blank")}
                      title="Mở trong tab mới"
                      className="rounded-lg border border-emerald-200 bg-white p-2 text-emerald-600 transition-colors hover:bg-emerald-100"
                    >
                      <ExternalLink className="size-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </AdminPanel>

          {/* Appearance */}
          <AdminPanel>
            <AdminPanelTitle title="Giao diện" subtitle="Màu sắc và vị trí hiển thị của widget." />
            <div className="space-y-5">
              {/* Primary color */}
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-[#747878]">Màu chủ đạo</Label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => colorRef.current?.click()}
                    className="size-9 rounded-lg border-2 border-[#e5e2e1] shadow-sm transition-transform hover:scale-105"
                    style={{ backgroundColor: form.primaryColor }}
                  />
                  <input
                    ref={colorRef}
                    type="color"
                    value={form.primaryColor}
                    onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                    className="sr-only"
                  />
                  <div className="flex gap-2">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setForm((f) => ({ ...f, primaryColor: c }))}
                        className={cn(
                          "size-7 rounded-md border-2 transition-transform hover:scale-110",
                          form.primaryColor === c ? "border-[#1c1b1b]" : "border-transparent",
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <span className="font-mono text-xs text-[#747878]">{form.primaryColor}</span>
                </div>
              </div>

              {/* Position */}
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-[#747878]">Vị trí</Label>
                <div className="flex gap-2">
                  {POSITIONS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setForm((f) => ({ ...f, position: p.value }))}
                      className={cn(
                        "rounded-lg border px-4 py-2 text-sm font-bold transition-colors",
                        form.position === p.value
                          ? "border-orange-600 bg-orange-50 text-orange-700"
                          : "border-[#e5e2e1] bg-white text-[#444748] hover:bg-[#f6f3f2]",
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </AdminPanel>

          {/* Greeting */}
          <AdminPanel>
            <AdminPanelTitle title="Tin nhắn chào" subtitle="Tin nhắn AI gửi khi người dùng mở widget lần đầu." />
            <Input
              value={form.greetingMessage}
              onChange={(e) => setForm((f) => ({ ...f, greetingMessage: e.target.value }))}
              placeholder="Xin chào! Tôi có thể giúp gì cho bạn?"
              className="font-medium"
            />
          </AdminPanel>

          {/* Quick replies */}
          <AdminPanel>
            <AdminPanelTitle
              title="Gợi ý nhanh"
              subtitle="Hiển thị bên dưới tin nhắn chào để người dùng chọn nhanh."
            />
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {form.quickReplies.map((r, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1.5 rounded-full border border-[#e5e2e1] bg-[#f6f3f2] px-3 py-1 text-sm font-semibold text-[#444748]"
                  >
                    {r}
                    <button onClick={() => removeReply(i)} className="text-[#747878] hover:text-red-600 transition-colors">
                      <X className="size-3.5" />
                    </button>
                  </span>
                ))}
                {form.quickReplies.length === 0 && (
                  <p className="text-xs font-semibold text-[#747878]">Chưa có gợi ý nào.</p>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newReply}
                  onChange={(e) => setNewReply(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addReply()}
                  placeholder="Nhập gợi ý mới..."
                  className="font-medium"
                />
                <Button
                  onClick={addReply}
                  variant="outline"
                  className="shrink-0 border-[#e5e2e1] font-bold"
                  disabled={!newReply.trim()}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
          </AdminPanel>

          {/* System prompt */}
          <AdminPanel>
            <div className="mb-4 flex items-start justify-between gap-3">
              <AdminPanelTitle
                title="Chỉ dẫn cho trợ lý"
                subtitle="Mô tả cách trợ lý ảo trả lời khách. Để trống thì dùng chỉ dẫn mặc định."
              />
              <button
                onClick={() => setForm((f) => ({ ...f, systemPrompt: SYSTEM_PROMPT_TEMPLATE }))}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-700 transition-colors hover:bg-orange-100"
              >
                <Wand2 className="size-3.5" />
                Dùng mẫu
              </button>
            </div>
            <textarea
              value={form.systemPrompt}
              onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
              rows={12}
              placeholder="Ví dụ: Bạn là trợ lý AI của RCField. Hãy trả lời ngắn gọn, chuyên nghiệp bằng tiếng Việt..."
              className="w-full resize-y rounded-lg border border-[#e5e2e1] bg-white p-3 font-mono text-xs leading-relaxed text-[#1c1b1b] placeholder:text-[#747878] focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
            />
          </AdminPanel>
        </div>

        {/* Live chat test panel */}
        <div className="sticky top-8 self-start space-y-3">
          <InlineChatPanel primaryColor={form.primaryColor} />
          <div className="flex items-center justify-center">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold",
                form.isEnabled
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-zinc-200 bg-zinc-100 text-zinc-600",
              )}
            >
              <span className={cn("size-1.5 rounded-full", form.isEnabled ? "bg-emerald-500" : "bg-zinc-400")} />
              {form.isEnabled ? "Widget đang bật" : "Widget đang tắt"}
            </span>
          </div>
        </div>
      </div>
    </AdminShell>
  )
}
