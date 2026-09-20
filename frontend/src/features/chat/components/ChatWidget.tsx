import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MessageCircle, X, Send, RotateCcw, Bot } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Button } from '@/shared/ui/button'
import { Textarea } from '@/shared/ui/textarea'
import { useSystemChat } from '../hooks/useSystemChat'

function BotMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => <ul className="mb-1.5 list-disc space-y-0.5 pl-4 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-1.5 list-decimal space-y-0.5 pl-4 last:mb-0">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        code: ({ children }) => (
          <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-xs">{children}</code>
        ),
        h1: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
        h2: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
        h3: ({ children }) => <p className="mb-1 font-medium">{children}</p>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-orange-600 underline underline-offset-2 hover:text-orange-700">
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="block h-1.5 w-1.5 rounded-full bg-current opacity-60"
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </div>
  )
}

export function ChatWidget({ cafeId }: { cafeId?: string } = {}) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { messages, isLoading, config, configLoading, isError, sendMessage, reset } = useSystemChat(cafeId)

  const primaryColor = config?.primaryColor ?? '#EA580C'

  useEffect(() => {
    if (open) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }, [messages, open])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300)
  }, [open])

  const handleSend = () => {
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    sendMessage(text)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleQuickReply = (text: string) => {
    if (isLoading) return
    sendMessage(text)
  }

  const unavailable = !configLoading && (isError || !config?.isEnabled)

  if (configLoading || unavailable) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="flex h-[520px] w-80 flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
          >
            {/* Header */}
            <div
              className="flex items-center gap-3 px-4 py-3"
              style={{ background: primaryColor }}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white leading-none">RCField AI</p>
                <p className="mt-0.5 text-xs text-white/70">Trợ lý thông minh</p>
              </div>
              <button
                onClick={reset}
                className="rounded p-1 text-white/70 transition hover:bg-white/20 hover:text-white"
                title="Cuộc trò chuyện mới"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-white/70 transition hover:bg-white/20 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3 scroll-smooth">
              {unavailable && (
                <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground px-4">
                  Dịch vụ chat hiện chưa khả dụng. Vui lòng thử lại sau.
                </div>
              )}
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {msg.role === 'bot' && (
                    <div
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                      style={{ background: primaryColor }}
                    >
                      <Bot className="h-3 w-3 text-white" />
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'rounded-tr-sm text-white'
                        : 'rounded-tl-sm bg-muted text-foreground'
                    }`}
                    style={msg.role === 'user' ? { background: primaryColor } : undefined}
                  >
                    {msg.isStreaming && msg.content === '' ? (
                      <TypingDots />
                    ) : msg.role === 'bot' ? (
                      <BotMarkdown content={msg.content} />
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
                  </div>
                </div>
              ))}

              {/* Quick replies */}
              {messages.length > 0 && (() => {
                const last = messages[messages.length - 1]
                const qr = last?.role === 'bot' && !last.isStreaming ? last.quickReplies : undefined
                return qr?.length ? (
                  <div className="flex flex-wrap gap-1.5 pl-8">
                    {qr.map((reply) => (
                      <button
                        key={reply}
                        onClick={() => handleQuickReply(reply)}
                        disabled={isLoading}
                        className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition hover:border-orange-500 hover:text-orange-600 disabled:opacity-50"
                      >
                        {reply}
                      </button>
                    ))}
                  </div>
                ) : null
              })()}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-border px-3 py-2">
              <div className="flex items-end gap-2">
                <Textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Nhập câu hỏi..."
                  rows={1}
                  className="max-h-24 min-h-[36px] resize-none rounded-xl border-border bg-muted/50 text-sm focus-visible:ring-1"
                  style={{ '--ring': primaryColor } as React.CSSProperties}
                  disabled={isLoading || unavailable}
                />
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading || unavailable}
                  className="h-9 w-9 shrink-0 rounded-xl"
                  style={{ background: primaryColor }}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                Powered by RCField AI · Gemini
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating button */}
      <motion.button
        onClick={() => setOpen((v) => !v)}
        className="flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95"
        style={{ background: primaryColor }}
        whileTap={{ scale: 0.92 }}
        animate={open ? {} : {
          boxShadow: ['0 4px 20px rgba(234,88,12,0.4)', '0 4px 28px rgba(234,88,12,0.7)', '0 4px 20px rgba(234,88,12,0.4)'],
        }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <X className="h-6 w-6 text-white" />
            </motion.div>
          ) : (
            <motion.div key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <MessageCircle className="h-6 w-6 text-white" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  )
}
