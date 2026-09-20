import { useEffect } from "react"
import {
  CAFE_CONFIGURATION_BROADCAST_CHANNEL,
  CAFE_CONFIGURATION_UPDATED_EVENT,
  type CafeConfigurationUpdatedDetail,
} from "@/features/cafes/api/cafe.api"

type Refetch = () => Promise<unknown>

/**
 * Refreshes a customer-facing cafe query immediately after a provider saves
 * its schedule in another tab. Periodic query refetching remains the fallback
 * for separate browser profiles or devices.
 */
export function useCafeConfigurationRefresh(cafeId: string | undefined, refetch: Refetch) {
  useEffect(() => {
    if (!cafeId || typeof window === "undefined") return

    const refreshIfCurrentCafe = (detail: CafeConfigurationUpdatedDetail) => {
      if (detail.cafeId === cafeId) void refetch()
    }
    const onWindowUpdate = (event: Event) => {
      const detail = (event as CustomEvent<CafeConfigurationUpdatedDetail>).detail
      if (detail) refreshIfCurrentCafe(detail)
    }

    window.addEventListener(CAFE_CONFIGURATION_UPDATED_EVENT, onWindowUpdate)

    if (typeof BroadcastChannel === "undefined") {
      return () => window.removeEventListener(CAFE_CONFIGURATION_UPDATED_EVENT, onWindowUpdate)
    }

    const channel = new BroadcastChannel(CAFE_CONFIGURATION_BROADCAST_CHANNEL)
    const onMessage = (event: MessageEvent<CafeConfigurationUpdatedDetail>) => {
      if (event.data) refreshIfCurrentCafe(event.data)
    }
    channel.addEventListener("message", onMessage)

    return () => {
      window.removeEventListener(CAFE_CONFIGURATION_UPDATED_EVENT, onWindowUpdate)
      channel.removeEventListener("message", onMessage)
      channel.close()
    }
  }, [cafeId, refetch])
}
