export interface ChatMessage {
  id: string
  role: 'user' | 'bot'
  content: string
  isStreaming?: boolean
  quickReplies?: string[]
  sources?: string[]
}

export interface HistoryMessage {
  role: 'user' | 'model'
  content: string
}

export interface SystemWidgetConfig {
  cafeId: string
  cafeSlug: string
  greetingMessage: string
  position: string
  primaryColor: string
  quickReplies: string[]
  systemPrompt?: string | null
  isEnabled: boolean
  fullPageEnabled: boolean
}

export type KbContentType = 'POLICY' | 'FAQ' | 'ANNOUNCEMENT' | 'CUSTOM'
export type KbDocumentStatus = 'PENDING' | 'INDEXED' | 'FAILED'

export interface KbDocument {
  id: string
  title: string
  original_filename: string
  content_type: KbContentType
  status: KbDocumentStatus
  chunk_count: number
  created_at: string
  updated_at: string
}

export interface ChatDonePayload {
  response_type: string
  full_answer: string
  sources?: string[]
  data?: unknown
}

export interface ChatQuickRepliesPayload {
  quick_replies: string[]
}
