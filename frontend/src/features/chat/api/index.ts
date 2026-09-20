import { api } from '@/shared/lib/axios'
import { env } from '@/shared/lib/env'
import type { SystemWidgetConfig, HistoryMessage, ChatDonePayload, ChatQuickRepliesPayload, KbDocument, KbContentType } from '../types'

// TODO: replace with API call once seed-cafes.ts is run and system cafe is seeded
const HARDCODED_SYSTEM_CAFE_ID = '7a00648b-c247-47d0-8f24-799ec5e38413'

export async function getSystemWidgetConfig(): Promise<SystemWidgetConfig> {
  try {
    const res = await api.get<{ success: boolean; data: SystemWidgetConfig }>('/v1/system/widget-config')
    return res.data.data
  } catch {
    // TODO: remove fallback once system cafe is seeded
    return {
      cafeId: HARDCODED_SYSTEM_CAFE_ID,
      cafeSlug: 'rcfield-system',
      greetingMessage: 'Xin chào! Tôi là trợ lý AI của RCField. Hỏi tôi về nền tảng, tính năng hoặc cách đăng ký nhé!',
      position: 'BOTTOM_RIGHT',
      primaryColor: '#EA580C',
      quickReplies: ['RCField là gì?', 'Cách đăng ký', 'Tính năng nổi bật', 'Chi phí sử dụng'],
      isEnabled: true,
      fullPageEnabled: false,
    }
  }
}

export type UpdateWidgetConfigPayload = {
  greetingMessage?: string
  position?: string
  primaryColor?: string
  quickReplies?: string[]
  systemPrompt?: string | null
  isEnabled?: boolean
  fullPageEnabled?: boolean
}

export async function updateSystemWidgetConfig(payload: UpdateWidgetConfigPayload): Promise<void> {
  await api.put('/v1/system/widget-config', payload)
}

export async function listKbDocuments(cafeId: string): Promise<KbDocument[]> {
  const res = await api.get<{ data: KbDocument[]; total: number }>(
    `/v1/cafes/${cafeId}/kb/documents`,
  )
  return res.data.data
}

export async function uploadKbDocument(
  cafeId: string,
  file: File,
  title: string,
  contentType: KbContentType,
): Promise<KbDocument> {
  const form = new FormData()
  form.append('file', file)
  form.append('title', title)
  form.append('content_type', contentType)
  const res = await api.post<KbDocument>(`/v1/cafes/${cafeId}/kb/documents`, form)
  return res.data
}

export async function deleteKbDocument(cafeId: string, documentId: string): Promise<void> {
  await api.delete(`/v1/cafes/${cafeId}/kb/documents/${documentId}`)
}

export async function* streamChat(
  cafeId: string,
  message: string,
  history: HistoryMessage[],
): AsyncGenerator<
  | { event: 'chunk'; text: string }
  | { event: 'done'; payload: ChatDonePayload }
  | { event: 'quick_replies'; payload: ChatQuickRepliesPayload }
> {
  const response = await fetch(`${env.apiUrl}/v1/cafes/${cafeId}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history }),
  })

  if (!response.ok || !response.body) {
    throw new Error(`Chat request failed: ${response.status}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // SSE events are separated by \n\n
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      const lines = part.split('\n')
      let eventName = ''
      let dataStr = ''

      for (const line of lines) {
        if (line.startsWith('event: ')) eventName = line.slice(7).trim()
        if (line.startsWith('data: ')) dataStr = line.slice(6).trim()
      }

      if (!eventName || !dataStr) continue

      try {
        const parsed = JSON.parse(dataStr)
        if (eventName === 'chunk') {
          yield { event: 'chunk', text: parsed.text ?? '' }
        } else if (eventName === 'done') {
          yield { event: 'done', payload: parsed as ChatDonePayload }
        } else if (eventName === 'quick_replies') {
          yield { event: 'quick_replies', payload: parsed as ChatQuickRepliesPayload }
        }
      } catch {
        // malformed SSE chunk — skip
      }
    }
  }
}
