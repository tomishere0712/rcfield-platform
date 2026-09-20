import { useEffect, useRef } from "react"
import { env } from "@/shared/lib/env"
import { storageKeys } from "@/shared/lib/storage"

export type WsMessage<T = unknown> = { event: string; data: T }

function getAccessToken(): string | null {
  const stored =
    localStorage.getItem(storageKeys.auth) ??
    sessionStorage.getItem(storageKeys.auth)
  if (!stored) return null
  try {
    const parsed = JSON.parse(stored) as { accessToken?: string }
    return parsed.accessToken ?? null
  } catch {
    return null
  }
}

/**
 * Dựng địa chỉ WebSocket từ địa chỉ API.
 *
 * Phân tích URL thật thay vì cắt chuỗi. Cách cũ dùng
 * `apiUrl.replace(/\/api.*$/, "")` để bỏ phần `/api/v1`, nhưng biểu thức đó
 * khớp vào chuỗi `/api` XUẤT HIỆN ĐẦU TIÊN — với tên miền `api.rcfield.site`
 * thì đó là `//api…` nằm ngay trong tên miền, nên nó cắt luôn cả máy chủ và
 * địa chỉ thành `wss://ws?token=…`. Máy lập trình không lộ lỗi vì tên miền là
 * `localhost`, không chứa chuỗi `/api`.
 *
 * Tách riêng khỏi hook để kiểm thử được — đây là chỗ đã âm thầm làm hỏng
 * WebSocket trên production.
 */
export function buildWsUrl(
  apiUrl: string | null | undefined,
  token: string | null,
  origin: string = typeof window === "undefined" ? "" : window.location.origin,
): string | null {
  if (!token) return null
  try {
    // Tham số thứ hai cho phép địa chỉ API là đường dẫn tương đối (vd `/api/v1`)
    // khi frontend và backend chung một tên miền.
    const parsed = new URL(apiUrl ?? "", origin || undefined)
    parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:"
    parsed.pathname = "/ws"
    parsed.hash = ""
    parsed.search = ""
    return `${parsed.toString()}?token=${encodeURIComponent(token)}`
  } catch {
    return null
  }
}

export function useWebSocket(
  onMessage: (msg: WsMessage) => void,
  enabled = true,
): void {
  const handlerRef = useRef(onMessage)

  useEffect(() => {
    handlerRef.current = onMessage
  }, [onMessage])

  const url = enabled ? buildWsUrl(env.apiUrl, getAccessToken()) : null

  useEffect(() => {
    if (!enabled || !url) return

    let ws: WebSocket
    let reconnectTimer: ReturnType<typeof setTimeout>
    let stopped = false

    function connect() {
      ws = new WebSocket(url!)
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as WsMessage
          handlerRef.current(msg)
        } catch {
          // ignore malformed frames
        }
      }
      ws.onclose = () => {
        if (!stopped) reconnectTimer = setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      stopped = true
      clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [enabled, url])
}
