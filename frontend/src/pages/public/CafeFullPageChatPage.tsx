import { useState, useRef, useEffect, type KeyboardEvent } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link, useParams } from "react-router"
import { motion } from "framer-motion"
import { Bot, ChevronLeft, RotateCcw, Send, Zap } from "lucide-react"
import ReactMarkdown from "react-markdown"

import { routePaths } from "@/app/router/route-paths"
import { cafeApi, cafeQueryKeys } from "@/features/cafes/api/cafe.api"
import { useSystemChat } from "@/features/chat/hooks/useSystemChat"
import { Button } from "@/shared/ui/button"
import { Textarea } from "@/shared/ui/textarea"

/**
 * Chọn màu chữ đọc được trên nền `primaryColor`.
 *
 * Màu này do chủ chi nhánh tự đặt trong widget config, nên có thể là vàng nhạt
 * hay pastel — lúc đó chữ trắng cứng gần như tàng hình. Tính độ sáng cảm nhận
 * rồi đổi sang chữ tối khi nền quá sáng.
 */
function readableOn(background: string): {
  fg: string
  fgSoft: string
  overlay: string
} {
  const hex = background.replace("#", "")
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : hex
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  if ([r, g, b].some(Number.isNaN))
    return {
      fg: "#ffffff",
      fgSoft: "rgba(255,255,255,0.8)",
      overlay: "rgba(255,255,255,0.25)",
    }

  // Hệ số theo cảm nhận mắt người: xanh lá sáng hơn đỏ, đỏ sáng hơn xanh dương.
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6
    ? {
        fg: "#1c1b1b",
        fgSoft: "rgba(28,27,27,0.7)",
        overlay: "rgba(28,27,27,0.12)",
      }
    : {
        fg: "#ffffff",
        fgSoft: "rgba(255,255,255,0.8)",
        overlay: "rgba(255,255,255,0.25)",
      }
}

function TypingDots({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-1 px-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="block h-2 w-2 rounded-full"
          style={{ backgroundColor: color }}
          animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  )
}

export function CafeFullPageChatPage() {
  const { cafeSlug } = useParams<{ cafeSlug: string }>()
  const [input, setInput] = useState("")
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { data: cafeList } = useQuery({
    queryKey: cafeQueryKeys.list({ slug: cafeSlug, limit: 1 }),
    queryFn: () => cafeApi.listCafes({ slug: cafeSlug, limit: 1 }),
    enabled: !!cafeSlug,
  })
  const cafe = cafeList?.data[0]
  const cafeId = cafe?.id
  const cafeName = cafe?.name ?? cafeSlug?.replace(/-/g, " ") ?? ""

  const {
    messages,
    isLoading,
    config,
    configLoading,
    isError,
    sendMessage,
    reset,
  } = useSystemChat(cafeId)

  const primaryColor = config?.primaryColor ?? "#EA580C"
  const onPrimary = readableOn(primaryColor)
  const unavailable =
    !configLoading &&
    (isError || !config?.isEnabled || !config?.fullPageEnabled)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

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

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      {/* Thanh tiêu đề riêng của trang chat. Trước đây gần như trống rỗng vì
          mọi thành phần bị comment lại, chỉ còn một nút reset lơ lửng. */}
      <header
        className="flex shrink-0 items-center gap-3 px-4 py-3 shadow-sm"
        style={{ background: primaryColor }}
      >
        <Link
          to={routePaths.cafeDetail.replace(":cafeSlug", cafeSlug ?? "")}
          aria-label="Về trang chi nhánh"
          className="rounded-lg p-1.5 transition-opacity hover:opacity-100"
          style={{ color: onPrimary.fgSoft }}
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>

        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: onPrimary.overlay }}
        >
          <Bot className="h-5 w-5" style={{ color: onPrimary.fg }} />
        </div>

        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-bold leading-none"
            style={{ color: onPrimary.fg }}
          >
            Trợ lý AI
          </p>
          <p
            className="mt-1 truncate text-xs"
            style={{ color: onPrimary.fgSoft }}
          >
            {cafeName}
          </p>
        </div>

        <button
          onClick={reset}
          aria-label="Bắt đầu cuộc trò chuyện mới"
          className="rounded-lg p-1.5 transition-opacity hover:opacity-100"
          style={{ color: onPrimary.fgSoft }}
          title="Cuộc trò chuyện mới"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scroll-smooth px-4 py-6">
        {/* Cùng max-width với ô nhập bên dưới. Trước đây tin nhắn trải hết bề
            ngang màn hình còn ô nhập bị bó ở giữa — hai khối lệch trục nhau. */}
        <div className="mx-auto max-w-2xl space-y-4">
          {unavailable ? (
            <div className="flex h-full items-center justify-center text-center text-sm text-slate-400 px-8">
              Dịch vụ chat hiện chưa khả dụng. Vui lòng thử lại sau.
            </div>
          ) : configLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Đang tải...
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                >
                  {msg.role === "bot" && (
                    <div
                      className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-sm"
                      style={{ background: primaryColor }}
                    >
                      <Bot
                        className="h-4 w-4"
                        style={{ color: onPrimary.fg }}
                      />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                      msg.role === "user"
                        ? "rounded-tr-sm"
                        : "rounded-tl-sm bg-white text-slate-800 border border-slate-100"
                    }`}
                    style={
                      msg.role === "user"
                        ? { background: primaryColor, color: onPrimary.fg }
                        : undefined
                    }
                  >
                    {msg.isStreaming && msg.content === "" ? (
                      <TypingDots color={primaryColor} />
                    ) : msg.role === "bot" ? (
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => (
                            <p className="mb-1.5 last:mb-0">{children}</p>
                          ),
                          strong: ({ children }) => (
                            <strong className="font-semibold">
                              {children}
                            </strong>
                          ),
                          ul: ({ children }) => (
                            <ul className="mb-1.5 list-disc pl-4 space-y-0.5 last:mb-0">
                              {children}
                            </ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="mb-1.5 list-decimal pl-4 space-y-0.5 last:mb-0">
                              {children}
                            </ol>
                          ),
                          li: ({ children }) => <li>{children}</li>,
                          code: ({ children }) => (
                            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">
                              {children}
                            </code>
                          ),
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

              {/* Quick replies */}
              {(() => {
                const last = messages[messages.length - 1]
                const qr =
                  last?.role === "bot" && !last.isStreaming
                    ? last.quickReplies
                    : undefined
                return qr?.length ? (
                  <div className="flex flex-wrap gap-2 pl-11">
                    {qr.map((reply) => (
                      <button
                        key={reply}
                        onClick={() => !isLoading && sendMessage(reply)}
                        disabled={isLoading}
                        className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-orange-400 hover:text-orange-600 disabled:opacity-50"
                      >
                        {reply}
                      </button>
                    ))}
                  </div>
                ) : null
              })()}
            </>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nhập câu hỏi..."
              rows={1}
              disabled={isLoading || unavailable}
              className="max-h-28 min-h-[44px] resize-none rounded-xl border-slate-200 bg-slate-50 text-sm focus-visible:ring-1"
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim() || isLoading || unavailable}
              className="h-11 w-11 shrink-0 rounded-xl shadow-none"
              style={{ background: primaryColor, color: onPrimary.fg }}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>

          {/* Powered by */}
          <div className="mt-2 flex items-center justify-center gap-1 text-[10px] font-bold text-slate-400">
            <Zap className="h-3 w-3 fill-orange-400 text-orange-400" />
            Powered by RCField
          </div>
        </div>
      </div>
    </div>
  )
}
