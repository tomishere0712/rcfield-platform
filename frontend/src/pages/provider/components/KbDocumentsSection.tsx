import { useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { cafeApi, cafeQueryKeys } from "@/features/cafes/api/cafe.api"
import { kbRefetchInterval } from "@/features/cafes/lib/kb-polling"
import type { KbContentType, KbDocument } from "@/features/cafes/types"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"

const CONTENT_TYPE_OPTIONS: { value: KbContentType; label: string }[] = [
  { value: "FAQ", label: "Câu hỏi thường gặp" },
  { value: "POLICY", label: "Chính sách / Quy định" },
  { value: "ANNOUNCEMENT", label: "Thông báo" },
  { value: "CUSTOM", label: "Khác" },
]

const STATUS_CONFIG = {
  PENDING: {
    label: "Đang xử lý",
    icon: Clock,
    className: "text-amber-600 bg-amber-50",
  },
  INDEXED: {
    label: "Sẵn sàng",
    icon: CheckCircle2,
    className: "text-emerald-600 bg-emerald-50",
  },
  FAILED: { label: "Lỗi", icon: XCircle, className: "text-red-600 bg-red-50" },
}

const ACCEPTED = ".pdf,.docx,.txt,.md"

const KB_TEMPLATES: Record<string, { filename: string; content: string }> = {
  FAQ: {
    filename: "rcfield-faq-template.txt",
    content: `# [TÊN CƠ SỞ] — Câu hỏi thường gặp (FAQ)
# Hướng dẫn: Thay thế nội dung trong [dấu ngoặc vuông] bằng thông tin thực tế của cơ sở bạn.

Q: Tôi có cần biết chạy xe RC trước không?
A: Không cần. Staff sẽ hướng dẫn cơ bản trước khi chơi.

Q: Cơ sở cho thuê loại xe RC nào?
A: [VD: Xe drift 1/10, xe địa hình 1/10 — đầy đủ phụ kiện và pin sạc sẵn.]

Q: Đặt lịch như thế nào?
A: Đặt qua app RCField: chọn cơ sở → chọn sân → chọn giờ → thanh toán online. Cũng có thể liên hệ trực tiếp qua [SĐT / Fanpage].

Q: Có thể đặt lịch cho nhóm không?
A: Được. Chọn số người chơi khi đặt, mỗi người sẽ được phân 1 xe thuê.

Q: Tôi có thể mang xe cá nhân vào không?
A: [Có — phí mang xe cá nhân là X.000đ/slot. Xe cần đáp ứng: pin tối đa 3S, không dùng xe xăng. / Không hỗ trợ mang xe cá nhân.]

Q: Thanh toán bằng gì?
A: Qua app: VNPay, MoMo, thẻ ngân hàng. Tại quán: tiền mặt hoặc chuyển khoản.

Q: Slot kéo dài bao lâu?
A: [VD: 1 slot = 30 phút. Có thể gia hạn thêm nếu sân còn trống.]

Q: Giờ mở cửa?
A: [VD: Thứ Ba – Thứ Sáu: 14:00–22:00. Thứ Bảy – Chủ Nhật: 10:00–22:00. Thứ Hai nghỉ.]

Q: Wifi có không?
A: [Có — mật khẩu nhân viên cung cấp tại quán. / Không có Wifi công cộng.]

Q: Có chỗ đậu xe không?
A: [VD: Đậu xe trước cơ sở hoặc bãi giữ xe gần đó tại địa chỉ X.]

Q: Trẻ em có chơi được không?
A: [VD: Trẻ từ 8 tuổi trở lên có thể chơi khi có người lớn đi kèm.]

Q: Có thể mua đồ ăn uống tại cơ sở không?
A: [Có — cơ sở phục vụ cà phê, trà, nước ngọt và đồ ăn nhẹ. / Không có đồ ăn, thức uống tại chỗ.]
`,
  },
  POLICY: {
    filename: "rcfield-policy-template.txt",
    content: `# [TÊN CƠ SỞ] — Chính sách & Quy định
# Hướng dẫn: Thay thế nội dung trong [dấu ngoặc vuông] bằng thông tin thực tế của cơ sở bạn.

## Quy định sử dụng sân
- Đến muộn quá [VD: 15 phút] mà không báo trước, slot có thể bị hủy và không hoàn tiền.
- Không tháo lắp xe trong khu vực đường đua. Khu pit dành riêng cho việc này.
- Không sử dụng pin LiPo vượt quá [VD: 4S] trong sân.
- Không dùng xe xăng (nitro) trong cơ sở.
- Không hút thuốc trong khu vực sân và khu pit.
- Trẻ em dưới [VD: 12 tuổi] cần có người lớn đi kèm.

## Bồi thường hư hỏng xe thuê
- Không thu tiền cọc xe khi đặt lịch.
- Nếu xe phát sinh hư hỏng: staff lập biên bản ghi nhận linh kiện hỏng và mức bồi thường. Khách xác nhận trước khi rời đi.

## Chính sách hủy lịch & hoàn tiền
- Hủy trước [VD: 24 giờ]: hoàn 100%.
- Hủy trong vòng [VD: 2–24 giờ]: hoàn [VD: 50%].
- Hủy dưới [VD: 2 giờ] hoặc không đến: không hoàn tiền.
- Yêu cầu hủy qua: [SĐT / Fanpage / app RCField].
- Cơ sở chủ động hủy (sự cố kỹ thuật...): hoàn 100% và ưu tiên đặt lại.

## Chính sách gia hạn slot
- Gia hạn tối đa [VD: 2 slot/lần] nếu sân còn trống.
- Yêu cầu báo staff trước khi slot hiện tại kết thúc.

## Chính sách mang xe cá nhân
- Phí mang xe cá nhân: [VD: 30.000đ/slot].
- Xe cần đáp ứng: [VD: pin tối đa 3S, không xe xăng].
- Staff có quyền từ chối xe không đạt tiêu chuẩn.

## Liên hệ & khiếu nại
- SĐT: [VD: 0901 234 567]
- Fanpage: [VD: facebook.com/rcfield.xxx]
`,
  },
  ANNOUNCEMENT: {
    filename: "rcfield-announcement-template.txt",
    content: `# [TÊN CƠ SỞ] — Thông báo
# Hướng dẫn: Thay thế nội dung trong [dấu ngoặc vuông]. Xóa các mục không áp dụng.

## Tiêu đề thông báo
[VD: Lịch nghỉ Tết Nguyên Đán 2026 / Khai trương sân mới / Cập nhật bảng giá tháng 8]

## Nội dung
[Viết nội dung thông báo rõ ràng. AI sẽ dùng thông tin này để trả lời khách hỏi về sự thay đổi.]

VD — Lịch nghỉ lễ:
Cơ sở tạm nghỉ từ ngày [X/X] đến hết ngày [X/X] nhân dịp [lý do].
Mở cửa trở lại từ ngày [X/X], giờ hoạt động bình thường.

VD — Cập nhật giá:
Kể từ ngày [X/X/XXXX], bảng giá slot được cập nhật:
- Slot thường (T2–T6): [giá mới]đ (trước: [giá cũ]đ)
- Slot cuối tuần: [giá mới]đ (trước: [giá cũ]đ)
Lý do: [VD: chi phí vận hành tăng].

## Thời gian áp dụng
Từ ngày: [DD/MM/YYYY]
Đến ngày: [DD/MM/YYYY hoặc "cho đến thông báo tiếp theo"]

## Liên hệ nếu có thắc mắc
[VD: Nhắn tin Fanpage hoặc gọi 0901 234 567 trong giờ hoạt động.]
`,
  },
  CUSTOM: {
    filename: "rcfield-custom-template.txt",
    content: `# [TÊN CƠ SỞ] — [Tên tài liệu]
# Hướng dẫn: File này dành cho nội dung tùy chỉnh. Viết rõ ràng để AI hiểu được.
# Gợi ý: dùng ## cho tiêu đề section, gạch đầu dòng (-) cho danh sách, Q:/A: cho hỏi đáp.

## [Section 1: Tên chủ đề]
[Nội dung...]

## [Section 2: Tên chủ đề]
[Nội dung...]

## Gợi ý các chủ đề có thể bổ sung
- Giới thiệu cơ sở và đội ngũ
- Lịch sử và thành tích giải đấu
- Hướng dẫn kỹ thuật cho người mới
- Danh sách phụ kiện bán tại quán
- Chương trình thành viên / tích điểm
- Bảng giá combo (VD: 3 slot + 1 ly cà phê)
- Thông tin giải đấu định kỳ
`,
  },
}

function downloadTemplate(contentType: string) {
  const tpl = KB_TEMPLATES[contentType] ?? KB_TEMPLATES.CUSTOM
  const blob = new Blob([tpl.content], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = tpl.filename
  a.click()
  URL.revokeObjectURL(url)
}

export function KbDocumentsSection({ cafeId }: { cafeId: string }) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState("")
  const [contentType, setContentType] = useState<KbContentType>("FAQ")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const { data: docs = [], isLoading } = useQuery({
    queryKey: cafeQueryKeys.kbDocuments(cafeId),
    queryFn: () => cafeApi.listKbDocuments(cafeId),
    refetchInterval: (query) => kbRefetchInterval(query.state.data),
  })

  const uploadMutation = useMutation({
    mutationFn: () =>
      cafeApi.uploadKbDocument(
        cafeId,
        selectedFile!,
        title.trim(),
        contentType,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: cafeQueryKeys.kbDocuments(cafeId),
      })
      toast.success("Đã tải lên tài liệu", {
        description: "Đang lập chỉ mục trong nền...",
      })
      setTitle("")
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
    },
    onError: () => toast.error("Tải lên thất bại"),
  })

  const deleteMutation = useMutation({
    mutationFn: (doc: KbDocument) => cafeApi.deleteKbDocument(cafeId, doc.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: cafeQueryKeys.kbDocuments(cafeId),
      })
      toast.success("Đã xóa tài liệu")
    },
    onError: () => toast.error("Không thể xóa tài liệu"),
  })

  const canUpload =
    !!selectedFile && title.trim().length > 0 && !uploadMutation.isPending

  return (
    <div className="space-y-5 rounded-xl border border-[#c4c7c8] bg-white p-5">
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#747878]">
        <BookOpen className="size-3.5" />
        Knowledge Base
      </div>

      {/* Upload form */}
      <div className="rounded-xl border border-[#e5e2e1] bg-[#faf9f8] p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-semibold text-[#444748]">
            Tải lên tài liệu để AI học về cơ sở của bạn (PDF, DOCX, TXT, MD —
            tối đa 10MB)
          </p>
          <button
            type="button"
            onClick={() => downloadTemplate(contentType)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#c4c7c8] bg-white px-3 py-1.5 text-xs font-bold text-[#444748] transition hover:border-orange-400 hover:text-orange-600"
          >
            <Download className="size-3.5" />
            Tải file mẫu
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-[#1c1b1b]">
              Tiêu đề tài liệu
            </span>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Bảng giá dịch vụ 2025"
              maxLength={200}
              className="rounded-lg border-[#c4c7c8] text-sm"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-[#1c1b1b]">
              Loại tài liệu
            </span>
            <select
              value={contentType}
              onChange={(e) => setContentType(e.target.value as KbContentType)}
              className="w-full rounded-lg border border-[#c4c7c8] bg-white px-3 py-2 text-sm font-medium text-[#1c1b1b] outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-200"
            >
              {CONTENT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED}
            className="hidden"
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 rounded-lg border border-dashed border-[#c4c7c8] bg-white px-4 py-2 text-sm font-medium text-[#444748] transition hover:border-orange-400 hover:text-orange-600"
          >
            <FileText className="size-4" />
            {selectedFile ? selectedFile.name : "Chọn file..."}
          </button>

          <Button
            type="button"
            disabled={!canUpload}
            onClick={() => uploadMutation.mutate()}
            className="gap-2 bg-orange-600 text-white hover:bg-orange-700"
          >
            <Upload className="size-4" />
            {uploadMutation.isPending ? "Đang tải..." : "Tải lên"}
          </Button>
        </div>
      </div>

      {/* Document list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-lg bg-[#f6f3f2]"
            />
          ))}
        </div>
      ) : docs.length === 0 ? (
        <p className="text-center text-sm text-[#747878] py-6">
          Chưa có tài liệu nào. Tải lên để AI có thể trả lời chính xác hơn.
        </p>
      ) : (
        <div className="divide-y divide-[#f0edec] rounded-xl border border-[#e5e2e1] bg-white overflow-hidden">
          {docs.map((doc) => {
            const s = STATUS_CONFIG[doc.status]
            const StatusIcon = s.icon
            return (
              <div key={doc.id} className="flex items-center gap-3 px-4 py-3">
                <FileText className="size-4 shrink-0 text-[#747878]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#1c1b1b]">
                    {doc.title}
                  </p>
                  <p className="truncate text-xs text-[#747878]">
                    {doc.original_filename}
                    {doc.chunk_count > 0 && ` · ${doc.chunk_count} đoạn`}
                    {" · "}
                    {CONTENT_TYPE_OPTIONS.find(
                      (o) => o.value === doc.content_type,
                    )?.label ?? doc.content_type}
                  </p>
                </div>
                <span
                  className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${s.className}`}
                >
                  <StatusIcon className="size-3" />
                  {s.label}
                </span>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(doc)}
                  disabled={deleteMutation.isPending}
                  className="ml-1 rounded p-1 text-[#747878] transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
