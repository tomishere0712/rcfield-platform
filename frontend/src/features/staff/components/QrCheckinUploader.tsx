import { useState } from "react"
import jsQR from "jsqr"

interface QrCheckinUploaderProps {
  onDecoded: (bookingId: string) => void
}

export function QrCheckinUploader({ onDecoded }: QrCheckinUploaderProps) {
  const [error, setError] = useState<string | null>(null)

  const handleFile = (file: File) => {
    setError(null)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext("2d")!
      ctx.drawImage(img, 0, 0)
      const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height)
      const result = jsQR(data, width, height)
      if (result?.data) {
        onDecoded(result.data)
      } else {
        setError("Không đọc được mã QR. Hãy nhập booking ID thủ công.")
      }
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => {
      setError("Không thể tải ảnh. Vui lòng thử lại.")
    }
    img.src = URL.createObjectURL(file)
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700">Upload ảnh QR</label>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 cursor-pointer"
      />
      {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
    </div>
  )
}
