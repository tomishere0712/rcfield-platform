import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, Unplug, Wifi } from "lucide-react"
import { toast } from "sonner"
import { channelApi } from "@/features/channels/api/channel.api"
import { FacebookConnectButton } from "@/features/channels/components/FacebookConnectButton"

export function ChannelSettingsTab({ cafeId }: { cafeId: string }) {
  const queryClient = useQueryClient()
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  const { data: status, isLoading } = useQuery({
    queryKey: ["channel-status", cafeId],
    queryFn: () => channelApi.getStatus(cafeId),
  })

  const disconnectMutation = useMutation({
    mutationFn: () => channelApi.disconnect(cafeId),
    onSuccess: () => {
      toast.success("Đã ngắt kết nối Facebook Page")
      void queryClient.invalidateQueries({ queryKey: ["channel-status", cafeId] })
      setConfirmDisconnect(false)
    },
    onError: () => {
      toast.error("Ngắt kết nối thất bại, vui lòng thử lại.")
    },
  })

  return (
    <div className="w-full rounded-xl border border-[#c4c7c8] bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-[#1877F2]/10">
          <svg className="size-5 text-[#1877F2]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.268h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
          </svg>
        </div>
        <div>
          <p className="font-bold text-[#1c1b1b]">Facebook Messenger</p>
          <p className="text-sm text-[#444748] font-semibold">Kết nối Facebook Page để AI tự động trả lời tin nhắn từ khách hàng.</p>
        </div>
      </div>

      <div className="mt-5">
        {isLoading ? (
          <div className="h-10 w-40 animate-pulse rounded-lg bg-gray-100" />
        ) : status?.connected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-green-600">
              <CheckCircle2 className="size-4" />
              <span>
                Đã kết nối: <strong className="font-bold">{status.pageName}</strong>
              </span>
            </div>
            {status.connectedAt && (
              <p className="text-xs font-semibold text-[#747878]">
                Kết nối lúc {new Date(status.connectedAt).toLocaleString("vi-VN")}
              </p>
            )}
            {confirmDisconnect ? (
              <div className="space-y-2">
                <p className="text-sm font-bold text-red-600">
                  Xác nhận ngắt kết nối? AI sẽ ngừng trả lời tin nhắn từ Page này ngay lập tức.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {disconnectMutation.isPending ? "Đang xử lý..." : "Xác nhận ngắt kết nối"}
                  </button>
                  <button
                    onClick={() => setConfirmDisconnect(false)}
                    className="rounded-lg border border-[#c4c7c8] px-3 py-1.5 text-sm font-bold text-[#1c1b1b] hover:bg-[#e5e2e1] bg-[#fcf8f8]"
                  >
                    Huỷ
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDisconnect(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-bold text-red-600 hover:bg-red-50"
              >
                <Unplug className="size-4" />
                Ngắt kết nối
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-[#747878]">
              <Wifi className="size-4" />
              <span>Chưa kết nối</span>
            </div>
            <FacebookConnectButton cafeId={cafeId} returnPath={`/provider/cafes/${cafeId}?tab=channel`} />
          </div>
        )}
      </div>
    </div>
  )
}
