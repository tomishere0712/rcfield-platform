import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, Loader2, Unplug, Wifi, Zap } from "lucide-react"
import { toast } from "sonner"

import { AdminShell } from "@/pages/admin/components/AdminShell"
import { AdminHeader, AdminPanel, AdminPanelTitle } from "@/pages/admin/components/AdminPrimitives"
import { channelApi } from "@/features/channels/api/channel.api"
import { FacebookConnectButton } from "@/features/channels/components/FacebookConnectButton"
import { routePaths } from "@/app/router/route-paths"

const PLATFORM_CAFE_ID = import.meta.env.VITE_PLATFORM_CAFE_ID as string

export function AdminChannelSettingsPage() {
  const queryClient = useQueryClient()
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  const { data: status, isLoading } = useQuery({
    queryKey: ["channel-status", PLATFORM_CAFE_ID],
    queryFn: () => channelApi.getStatus(PLATFORM_CAFE_ID),
    enabled: !!PLATFORM_CAFE_ID,
  })

  const testMutation = useMutation({
    mutationFn: () => channelApi.testConnection(PLATFORM_CAFE_ID),
    onSuccess: (data) => {
      toast.success(`Kết nối hoạt động tốt`, { description: `Page: ${data.pageName}` })
    },
    onError: () => {
      toast.error("Kết nối thất bại", { description: "Token có thể đã hết hạn. Hãy kết nối lại." })
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: () => channelApi.disconnect(PLATFORM_CAFE_ID),
    onSuccess: () => {
      toast.success("Đã ngắt kết nối Facebook Page")
      void queryClient.invalidateQueries({ queryKey: ["channel-status", PLATFORM_CAFE_ID] })
      setConfirmDisconnect(false)
    },
    onError: () => {
      toast.error("Ngắt kết nối thất bại, vui lòng thử lại.")
    },
  })

  return (
    <AdminShell>
      <AdminHeader
        title="Kênh Messenger"
        description="Kết nối Facebook Page chính thức của RCField để tiếp nhận tin nhắn marketing từ khách hàng."
      />

      {!PLATFORM_CAFE_ID ? (
        <AdminPanel>
          <p className="text-sm font-semibold text-red-500">
            Thiếu biến môi trường <code className="rounded bg-red-50 px-1.5 py-0.5 font-mono text-xs">VITE_PLATFORM_CAFE_ID</code>.
          </p>
        </AdminPanel>
      ) : (
        <AdminPanel>
          <AdminPanelTitle
            title="Facebook Messenger"
            subtitle="Page chính thức của RCField trên Facebook."
          />

          <div className="mt-4 flex items-center gap-4 rounded-xl border border-[#e5e2e1] bg-[#f6f3f2]/50 p-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#1877F2]/10">
              <svg className="size-5 text-[#1877F2]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.268h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-[#1c1b1b]">Facebook Messenger</p>
              <p className="text-xs font-semibold text-[#747878]">Nhắn tin qua Facebook Page của nền tảng</p>
            </div>
            {!isLoading && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${
                  status?.connected
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-zinc-200 bg-zinc-100 text-zinc-500"
                }`}
              >
                <span className={`size-1.5 rounded-full ${status?.connected ? "bg-emerald-500" : "bg-zinc-400"}`} />
                {status?.connected ? "Đã kết nối" : "Chưa kết nối"}
              </span>
            )}
          </div>

          <div className="mt-5">
            {isLoading ? (
              <div className="h-10 w-48 animate-pulse rounded-lg bg-[#f6f3f2]" />
            ) : status?.connected ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
                  <CheckCircle2 className="size-4" />
                  <span>
                    Đang kết nối: <strong>{status.pageName}</strong>
                  </span>
                </div>
                {status.connectedAt && (
                  <p className="text-xs font-semibold text-[#747878]">
                    Kết nối lúc {new Date(status.connectedAt).toLocaleString("vi-VN")}
                  </p>
                )}

                <button
                  onClick={() => testMutation.mutate()}
                  disabled={testMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#e5e2e1] bg-white px-4 py-2 text-sm font-bold text-[#444748] hover:bg-[#f6f3f2] disabled:opacity-60"
                >
                  {testMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Zap className="size-4 text-orange-500" />
                  )}
                  Test kết nối
                </button>

                {confirmDisconnect ? (
                  <div className="space-y-3 rounded-xl border border-red-100 bg-red-50 p-4">
                    <p className="text-sm font-semibold text-red-700">
                      Xác nhận ngắt kết nối? Tin nhắn gửi đến Page sẽ không còn được xử lý tự động.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => disconnectMutation.mutate()}
                        disabled={disconnectMutation.isPending}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        {disconnectMutation.isPending ? "Đang xử lý..." : "Xác nhận ngắt kết nối"}
                      </button>
                      <button
                        onClick={() => setConfirmDisconnect(false)}
                        className="rounded-lg border border-[#e5e2e1] bg-white px-4 py-2 text-sm font-bold text-[#444748] hover:bg-[#f6f3f2]"
                      >
                        Huỷ
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDisconnect(true)}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50"
                  >
                    <Unplug className="size-4" />
                    Ngắt kết nối
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#747878]">
                  <Wifi className="size-4" />
                  <span>Chưa có kết nối nào. Nhấn bên dưới để bắt đầu.</span>
                </div>
                <FacebookConnectButton cafeId={PLATFORM_CAFE_ID} returnPath={routePaths.adminChannels} />
              </div>
            )}
          </div>
        </AdminPanel>
      )}
    </AdminShell>
  )
}
