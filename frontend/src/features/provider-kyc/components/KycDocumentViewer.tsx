import { FileText, ExternalLink } from "lucide-react"
import type { KycDocumentType } from "../types"
import { DOCUMENT_TYPE_LABELS } from "../types"

interface KycDoc {
  documentType: KycDocumentType
  cloudinaryUrl: string
  originalFilename?: string | null
}

interface Props {
  businessType: string | null
  submittedAt: string | null
  documents: KycDoc[]
}

export function KycDocumentViewer({ businessType, submittedAt, documents }: Props) {
  if (!documents || documents.length === 0) {
    return (
      <p className="text-sm text-slate-400 font-semibold">Chưa có tài liệu KYC.</p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        {businessType && (
          <span className="font-semibold">
            Loại hình:{" "}
            <span className="text-slate-800 font-bold">
              {businessType === "INDIVIDUAL" ? "Cá nhân" : "Doanh nghiệp"}
            </span>
          </span>
        )}
        {submittedAt && (
          <span className="font-semibold">
            Ngày nộp:{" "}
            <span className="text-slate-800 font-bold">
              {new Date(submittedAt).toLocaleDateString("vi-VN", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {documents.map((doc) => (
          <DocumentCard key={doc.documentType} doc={doc} />
        ))}
      </div>
    </div>
  )
}

function DocumentCard({ doc }: { doc: KycDoc }) {
  const isPdf =
    doc.cloudinaryUrl.includes("/raw/") ||
    doc.originalFilename?.toLowerCase().endsWith(".pdf")

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
      <div className="px-3 py-2 bg-white border-b border-slate-100">
        <p className="text-xs font-bold text-slate-700">{DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}</p>
        {doc.originalFilename && (
          <p className="text-[11px] text-slate-400 truncate">{doc.originalFilename}</p>
        )}
      </div>

      {isPdf ? (
        <div className="flex flex-col items-center justify-center gap-3 py-6 px-4">
          <div className="size-12 rounded-xl bg-slate-200 flex items-center justify-center">
            <FileText className="size-6 text-slate-500" />
          </div>
          <a
            href={doc.cloudinaryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:underline"
          >
            <ExternalLink className="size-3" />
            Xem file PDF
          </a>
        </div>
      ) : (
        <a href={doc.cloudinaryUrl} target="_blank" rel="noopener noreferrer" className="block">
          <img
            src={doc.cloudinaryUrl}
            alt={DOCUMENT_TYPE_LABELS[doc.documentType]}
            className="w-full h-40 object-cover hover:opacity-90 transition-opacity"
            loading="lazy"
          />
        </a>
      )}
    </div>
  )
}
