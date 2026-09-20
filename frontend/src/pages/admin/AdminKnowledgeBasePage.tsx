import { useCallback, useRef, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { kbRefetchInterval } from "@/features/cafes/lib/kb-polling"
import { BookOpen, FileText, Plus, Trash2, Upload, X, CheckCircle2, Clock, AlertCircle } from "lucide-react"
import { toast } from "sonner"

import { AdminShell } from "@/pages/admin/components/AdminShell"
import { AdminHeader, AdminPanel, AdminPanelTitle } from "@/pages/admin/components/AdminPrimitives"
import { getSystemWidgetConfig, listKbDocuments, uploadKbDocument, deleteKbDocument } from "@/features/chat/api"
import type { KbDocument, KbContentType } from "@/features/chat/types"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"
import { Label } from "@/shared/ui/label"
import { cn } from "@/shared/lib/utils"

const CONTENT_TYPES: { value: KbContentType; label: string }[] = [
  { value: "FAQ", label: "FAQ" },
  { value: "POLICY", label: "Chính sách" },
  { value: "ANNOUNCEMENT", label: "Thông báo" },
  { value: "CUSTOM", label: "Tùy chỉnh" },
]

const ACCEPT = ".pdf,.docx,.txt,.md"
const MAX_MB = 10

function StatusBadge({ status }: { status: KbDocument["status"] }) {
  if (status === "INDEXED")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="size-3" /> Đã index
      </span>
    )
  if (status === "PENDING")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 border border-amber-200">
        <Clock className="size-3" /> Đang xử lý
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700 border border-red-200">
      <AlertCircle className="size-3" /> Lỗi
    </span>
  )
}

function ContentTypeBadge({ type }: { type: KbContentType }) {
  const map: Record<KbContentType, string> = {
    FAQ: "bg-blue-50 text-blue-700 border-blue-200",
    POLICY: "bg-violet-50 text-violet-700 border-violet-200",
    ANNOUNCEMENT: "bg-orange-50 text-orange-700 border-orange-200",
    CUSTOM: "bg-slate-100 text-slate-600 border-slate-200",
  }
  const label: Record<KbContentType, string> = {
    FAQ: "FAQ",
    POLICY: "Chính sách",
    ANNOUNCEMENT: "Thông báo",
    CUSTOM: "Tùy chỉnh",
  }
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-bold", map[type])}>
      {label[type]}
    </span>
  )
}

function UploadPanel({
  cafeId,
  onSuccess,
}: {
  cafeId: string
  onSuccess: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [contentType, setContentType] = useState<KbContentType>("CUSTOM")
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const { mutate, isPending } = useMutation({
    mutationFn: () => uploadKbDocument(cafeId, file!, title.trim(), contentType),
    onSuccess: () => {
      toast.success(`Đã upload "${title}" — đang index...`)
      setFile(null)
      setTitle("")
      setContentType("CUSTOM")
      onSuccess()
    },
    onError: () => toast.error("Upload thất bại. Kiểm tra lại file và thử lại."),
  })

  const pickFile = useCallback((f: File) => {
    if (f.size > MAX_MB * 1024 * 1024) {
      toast.error(`File quá lớn (tối đa ${MAX_MB}MB)`)
      return
    }
    setFile(f)
    if (!title) setTitle(f.name.replace(/\.[^/.]+$/, ""))
  }, [title])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const f = e.dataTransfer.files[0]
      if (f) pickFile(f)
    },
    [pickFile],
  )

  const canSubmit = !!file && title.trim().length > 0 && !isPending

  return (
    <AdminPanel>
      <AdminPanelTitle title="Upload tài liệu mới" subtitle="PDF, DOCX, TXT hoặc MD · tối đa 10MB" />
      <div className="space-y-4">
        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 transition-colors",
            dragging
              ? "border-orange-400 bg-orange-50"
              : file
              ? "border-emerald-400 bg-emerald-50/60"
              : "border-[#e5e2e1] bg-[#fcf8f8] hover:border-orange-300 hover:bg-orange-50/40",
          )}
        >
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f) }}
          />
          {file ? (
            <>
              <FileText className="size-8 text-emerald-600" />
              <p className="text-sm font-bold text-emerald-700">{file.name}</p>
              <p className="text-xs text-[#747878]">{(file.size / 1024).toFixed(0)} KB</p>
              <button
                onClick={(e) => { e.stopPropagation(); setFile(null) }}
                className="mt-1 flex items-center gap-1 rounded-full border border-[#e5e2e1] bg-white px-3 py-0.5 text-xs font-bold text-[#444748] hover:border-red-300 hover:text-red-600"
              >
                <X className="size-3" /> Đổi file
              </button>
            </>
          ) : (
            <>
              <Upload className="size-8 text-[#747878]" />
              <p className="text-sm font-bold text-[#444748]">Kéo thả hoặc click để chọn file</p>
              <p className="text-xs text-[#747878]">PDF · DOCX · TXT · MD</p>
            </>
          )}
        </div>

        {/* Metadata */}
        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-[#747878]">
              Tiêu đề <span className="text-red-500">*</span>
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ví dụ: Chính sách hoàn tiền 2025"
              className="font-medium"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-[#747878]">Loại nội dung</Label>
            <select
              value={contentType}
              onChange={(e) => setContentType(e.target.value as KbContentType)}
              className="h-10 w-full rounded-lg border border-[#e5e2e1] bg-white px-3 text-sm font-medium text-[#1c1b1b] focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400/20"
            >
              {CONTENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        <Button
          onClick={() => mutate()}
          disabled={!canSubmit}
          className="h-10 w-full bg-orange-600 font-bold text-white hover:bg-orange-700 disabled:opacity-50"
        >
          {isPending ? (
            <span className="flex items-center gap-2">
              <Clock className="size-4 animate-spin" /> Đang upload...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Plus className="size-4" /> Upload tài liệu
            </span>
          )}
        </Button>
      </div>
    </AdminPanel>
  )
}

function DocumentRow({
  doc,
  cafeId,
  onDeleted,
}: {
  doc: KbDocument
  cafeId: string
  onDeleted: () => void
}) {
  const [confirming, setConfirming] = useState(false)

  const { mutate: remove, isPending } = useMutation({
    mutationFn: () => deleteKbDocument(cafeId, doc.id),
    onSuccess: () => {
      toast.success(`Đã xóa "${doc.title}"`)
      onDeleted()
    },
    onError: () => toast.error("Xóa thất bại."),
  })

  return (
    <div className="flex items-center gap-3 border-b border-[#e5e2e1] px-4 py-3.5 last:border-0 hover:bg-[#fcf8f8]/60 transition-colors">
      <FileText className="size-5 shrink-0 text-[#747878]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-[#1c1b1b]">{doc.title}</p>
        <p className="mt-0.5 truncate text-xs text-[#747878]">{doc.original_filename}</p>
      </div>
      <ContentTypeBadge type={doc.content_type} />
      <StatusBadge status={doc.status} />
      <span className="w-16 text-right text-xs font-semibold text-[#747878]">
        {doc.chunk_count} chunk
      </span>
      <span className="hidden w-24 text-right text-xs text-[#747878] sm:block">
        {new Date(doc.created_at).toLocaleDateString("vi-VN")}
      </span>
      {confirming ? (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => remove()}
            disabled={isPending}
            className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            Xóa
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="rounded-lg border border-[#e5e2e1] px-2.5 py-1 text-xs font-bold text-[#444748] hover:bg-[#f6f3f2]"
          >
            Hủy
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="rounded-lg p-1.5 text-[#747878] hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  )
}

export function AdminKnowledgeBasePage() {
  const queryClient = useQueryClient()

  const { data: widgetConfig, isLoading: loadingConfig } = useQuery({
    queryKey: ["system-widget-config"],
    queryFn: getSystemWidgetConfig,
    staleTime: Infinity,
  })

  const cafeId = widgetConfig?.cafeId ?? ""

  const { data: docs = [], isLoading: loadingDocs, isError: docsError } = useQuery({
    queryKey: ["kb-documents", cafeId],
    queryFn: () => listKbDocuments(cafeId),
    enabled: !!cafeId,
    refetchInterval: (query) => kbRefetchInterval(query.state.data),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["kb-documents", cafeId] })

  const indexed = docs.filter((d) => d.status === "INDEXED").length
  const pending = docs.filter((d) => d.status === "PENDING").length
  const failed = docs.filter((d) => d.status === "FAILED").length
  const totalChunks = docs.reduce((s, d) => s + d.chunk_count, 0)

  if (loadingConfig) {
    return (
      <AdminShell>
        <div className="flex h-64 items-center justify-center text-sm font-semibold text-[#747878]">
          Đang tải...
        </div>
      </AdminShell>
    )
  }

  return (
    <AdminShell>
      <AdminHeader
        title="Kho kiến thức"
        description="Tài liệu AI sẽ dùng để trả lời câu hỏi trong chat widget của landing page."
      />

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Tổng tài liệu", value: docs.length, icon: BookOpen, color: "text-orange-600 bg-orange-50" },
          { label: "Đã index", value: indexed, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
          { label: "Đang xử lý", value: pending, icon: Clock, color: "text-amber-600 bg-amber-50" },
          { label: "Tổng chunks", value: totalChunks, icon: FileText, color: "text-slate-600 bg-slate-100" },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-3 rounded-xl border border-[#e5e2e1] bg-white p-4 shadow-sm">
            <div className={cn("flex size-9 items-center justify-center rounded-lg", s.color)}>
              <s.icon className="size-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#747878]">{s.label}</p>
              <p className="text-xl font-black text-[#1c1b1b]">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Upload panel */}
        <div className="lg:sticky lg:top-8 lg:self-start">
          {cafeId && <UploadPanel cafeId={cafeId} onSuccess={invalidate} />}
          {failed > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <AlertCircle className="size-4 shrink-0 text-red-600" />
              <p className="text-xs font-semibold text-red-700">
                {failed} tài liệu index thất bại. Thử xóa và upload lại.
              </p>
            </div>
          )}
        </div>

        {/* Documents list */}
        <AdminPanel className="p-0">
          <div className="flex items-center justify-between border-b border-[#e5e2e1] px-4 py-3">
            <AdminPanelTitle title="Tài liệu đã upload" />
            {pending > 0 && (
              <span className="flex items-center gap-1 text-xs font-bold text-amber-600">
                <Clock className="size-3.5 animate-spin" />
                Đang index {pending} tài liệu...
              </span>
            )}
          </div>

          {loadingDocs ? (
            <div className="flex h-40 items-center justify-center text-sm text-[#747878]">
              Đang tải danh sách...
            </div>
          ) : docsError ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
              <AlertCircle className="size-10 text-red-300" />
              <p className="text-sm font-bold text-red-600">Không thể tải danh sách tài liệu</p>
              <p className="text-xs text-[#747878]">Token hết hạn hoặc không có quyền. Đăng nhập lại và thử lại.</p>
            </div>
          ) : docs.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
              <BookOpen className="size-10 text-[#c4c7c8]" />
              <p className="text-sm font-bold text-[#747878]">Chưa có tài liệu nào</p>
              <p className="text-xs text-[#747878]">Upload tài liệu đầu tiên để AI có thể trả lời câu hỏi.</p>
            </div>
          ) : (
            <div>
              {docs.map((doc) => (
                <DocumentRow key={doc.id} doc={doc} cafeId={cafeId} onDeleted={invalidate} />
              ))}
            </div>
          )}
        </AdminPanel>
      </div>
    </AdminShell>
  )
}
