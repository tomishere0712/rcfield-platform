import { useRef, useState } from "react"
import { FileText, ImageIcon, Upload, X, AlertCircle } from "lucide-react"
import type { KycBusinessType, KycDocumentType } from "../types"
import { DOCUMENT_TYPE_LABELS } from "../types"

interface FileField {
  fieldName: string
  docType: KycDocumentType
  accept: string
  hint: string
}

const INDIVIDUAL_FIELDS: FileField[] = [
  { fieldName: "cccd_front", docType: "CCCD_FRONT", accept: "image/jpeg,image/png", hint: "JPEG hoặc PNG, tối đa 10MB" },
  { fieldName: "cccd_back", docType: "CCCD_BACK", accept: "image/jpeg,image/png", hint: "JPEG hoặc PNG, tối đa 10MB" },
  { fieldName: "venue_photo", docType: "VENUE_PHOTO", accept: "image/jpeg,image/png", hint: "Ảnh không gian sân RC thực tế" },
]

const BUSINESS_FIELDS: FileField[] = [
  { fieldName: "gpkd", docType: "GPKD", accept: "image/jpeg,image/png,application/pdf", hint: "JPEG, PNG hoặc PDF, tối đa 10MB" },
  { fieldName: "representative_id", docType: "REPRESENTATIVE_ID", accept: "image/jpeg,image/png", hint: "CCCD/CMND người đại diện, JPEG hoặc PNG" },
  { fieldName: "venue_photo", docType: "VENUE_PHOTO", accept: "image/jpeg,image/png", hint: "Ảnh không gian sân RC thực tế" },
]

export interface KycFiles {
  [fieldName: string]: File | undefined
}

interface Props {
  businessType: KycBusinessType
  files: KycFiles
  errors: Partial<Record<string, string>>
  onChange: (fieldName: string, file: File | undefined) => void
}

export function KycDocumentUpload({ businessType, files, errors, onChange }: Props) {
  const fields = businessType === "INDIVIDUAL" ? INDIVIDUAL_FIELDS : BUSINESS_FIELDS

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 leading-relaxed bg-amber-50 border border-amber-100 rounded-xl p-3">
        <AlertCircle className="size-3.5 inline mr-1 text-amber-600" />
        Tài liệu sẽ được xem xét bởi đội ngũ RCField. Đảm bảo ảnh rõ nét, không bị mờ hoặc che khuất thông tin.
      </p>
      {fields.map((field) => (
        <FileDropZone
          key={field.fieldName}
          field={field}
          file={files[field.fieldName]}
          error={errors[field.fieldName]}
          onChange={(f) => onChange(field.fieldName, f)}
        />
      ))}
    </div>
  )
}

function FileDropZone({
  field,
  file,
  error,
  onChange,
}: {
  field: FileField
  file: File | undefined
  error: string | undefined
  onChange: (f: File | undefined) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const isPdf = file?.type === "application/pdf"

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-slate-700">
        {DOCUMENT_TYPE_LABELS[field.docType]} <span className="text-red-500">*</span>
      </label>

      {file ? (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
          <div className="flex-shrink-0 size-10 rounded-lg bg-emerald-100 flex items-center justify-center">
            {isPdf ? (
              <FileText className="size-5 text-emerald-700" />
            ) : (
              <ImageIcon className="size-5 text-emerald-700" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-slate-800 truncate">{file.name}</p>
            <p className="text-[11px] text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="p-1 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div
          className={`relative border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
            dragging
              ? "border-orange-400 bg-orange-50"
              : error
              ? "border-red-300 bg-red-50"
              : "border-slate-200 hover:border-orange-300 hover:bg-orange-50/30"
          }`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const dropped = e.dataTransfer.files[0]
            if (dropped) onChange(dropped)
          }}
        >
          <Upload className="size-5 text-slate-400 mx-auto mb-2" />
          <p className="text-xs font-bold text-slate-600">Nhấn để chọn file hoặc kéo thả vào đây</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{field.hint}</p>
          <input
            ref={inputRef}
            type="file"
            accept={field.accept}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              onChange(f)
              e.target.value = ""
            }}
          />
        </div>
      )}

      {error && (
        <p className="text-[11px] font-bold text-red-500 flex items-center gap-1">
          <AlertCircle className="size-3" /> {error}
        </p>
      )}
    </div>
  )
}
