import React, { useEffect, useRef, useState, useCallback } from "react"
import jsQR from "jsqr"
import {
  Camera,
  CameraOff,
  X,
  RefreshCw,
  Upload,
  AlertTriangle,
  Loader2,
  CheckCircle2,
} from "lucide-react"
import { toast } from "sonner"
import { StaffButton } from "@/pages/staff/components/StaffUI"

interface StaffCameraQrScannerModalProps {
  isOpen: boolean
  onClose: () => void
  onScanSuccess: (code: string) => void
}

export const StaffCameraQrScannerModal: React.FC<StaffCameraQrScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animFrameIdRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isProcessingFile, setIsProcessingFile] = useState(false)
  const [scannedCode, setScannedCode] = useState<string | null>(null)
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("")

  // Stop camera tracks cleanly
  const stopCamera = useCallback(() => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current)
      animFrameIdRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop()
      })
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  // Process decoded QR text
  const handleCodeFound = useCallback(
    (rawCode: string) => {
      const clean = rawCode.trim()
      if (!clean) return

      setScannedCode(clean)
      stopCamera()

      // Play subtle confirmation toast
      toast.success(`Đã nhận diện mã QR: ${clean}`)

      // Small delay for user visual confirmation
      setTimeout(() => {
        onScanSuccess(clean)
        onClose()
      }, 400)
    },
    [stopCamera, onScanSuccess, onClose]
  )

  // QR Scanning Loop using requestAnimationFrame + jsQR
  const scanLoopRef = useRef<() => void>(() => {})

  const scanLoop = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas) return

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const ctx = canvas.getContext("2d", { willReadFrequently: true })
      if (ctx) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        })

        if (code && code.data) {
          handleCodeFound(code.data)
          return // Stop loop on detection
        }
      }
    }

    animFrameIdRef.current = requestAnimationFrame(() => scanLoopRef.current())
  }, [handleCodeFound])

  useEffect(() => {
    scanLoopRef.current = scanLoop
  }, [scanLoop])

  // Start Camera Stream
  const startCamera = useCallback(
    async (deviceId?: string) => {
      stopCamera()
      setErrorMessage(null)
      setScannedCode(null)

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setHasCameraPermission(false)
        setErrorMessage(
          "Trình duyệt hoặc thiết bị này không hỗ trợ truy cập camera qua giao thức hiện tại (cần HTTPS hoặc localhost)."
        )
        return
      }

      try {
        const constraints: MediaStreamConstraints = {
          video: deviceId
            ? { deviceId: { exact: deviceId } }
            : {
                facingMode: { ideal: "environment" },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
          audio: false,
        }

        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.setAttribute("playsinline", "true") // Essential for iOS
          await videoRef.current.play()
          setHasCameraPermission(true)
          animFrameIdRef.current = requestAnimationFrame(() => scanLoopRef.current())
        }

        // List available cameras if not yet fetched
        try {
          const devices = await navigator.mediaDevices.enumerateDevices()
          const videoInputs = devices.filter((d) => d.kind === "videoinput")
          setCameraDevices(videoInputs)
        } catch {
          // Ignore enumerate error
        }
      } catch (err: unknown) {
        console.error("Camera access error:", err)
        setHasCameraPermission(false)
        const e = err as { name?: string; message?: string }
        if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
          setErrorMessage(
            "Bạn chưa cấp quyền truy cập Camera cho trình duyệt. Vui lòng kiểm tra lại quyền trong cài đặt trình duyệt."
          )
        } else if (e.name === "NotFoundError" || e.name === "DevicesNotFoundError") {
          setErrorMessage("Không tìm thấy thiết bị Camera nào trên máy này.")
        } else {
          setErrorMessage(`Không thể khởi động camera: ${e.message || "Lỗi không xác định"}`)
        }
      }
    },
    [stopCamera]
  )

  // Handle uploaded QR image file fallback
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsProcessingFile(true)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        toast.error("Không thể xử lý ảnh.")
        setIsProcessingFile(false)
        return
      }

      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, img.width, img.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height)

      setIsProcessingFile(false)
      if (code && code.data) {
        handleCodeFound(code.data)
      } else {
        toast.error("Không tìm thấy mã QR hợp lệ trong ảnh tải lên.")
      }
      URL.revokeObjectURL(img.src)
    }

    img.onerror = () => {
      setIsProcessingFile(false)
      toast.error("Không thể đọc tệp hình ảnh.")
    }

    img.src = URL.createObjectURL(file)
  }

  // Switch camera toggle
  const handleSwitchCamera = () => {
    if (cameraDevices.length <= 1) return
    const currentIndex = cameraDevices.findIndex((d) => d.deviceId === selectedDeviceId)
    const nextIndex = (currentIndex + 1) % cameraDevices.length
    const nextDevice = cameraDevices[nextIndex]
    setSelectedDeviceId(nextDevice.deviceId)
    void startCamera(nextDevice.deviceId)
  }

  useEffect(() => {
    let active = true
    if (isOpen) {
      void (async () => {
        if (!active) return
        await startCamera(selectedDeviceId || undefined)
      })()
    } else {
      stopCamera()
    }
    return () => {
      active = false
      stopCamera()
    }
  }, [isOpen, startCamera, stopCamera, selectedDeviceId])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/20 bg-[#1c1b1b] text-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-orange-500/20 text-[#ea580c]">
              <Camera className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Quét mã QR qua Camera</h3>
              <p className="text-xs text-[#a09e9d]">Hướng camera về phía mã QR đặt lịch của khách</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Viewfinder / Camera View */}
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-black flex items-center justify-center">
          {/* Hidden Canvas for Decoding */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Video Feed */}
          <video
            ref={videoRef}
            muted
            playsInline
            className="h-full w-full object-cover"
          />

          {/* Viewfinder Target Overlay */}
          {hasCameraPermission && !errorMessage && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              {/* Scan box frame */}
              <div className="relative size-56 sm:size-64 rounded-2xl border-2 border-orange-500/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]">
                {/* 4 Corners */}
                <div className="absolute -top-1 -left-1 size-5 border-t-4 border-l-4 border-orange-500 rounded-tl-lg" />
                <div className="absolute -top-1 -right-1 size-5 border-t-4 border-r-4 border-orange-500 rounded-tr-lg" />
                <div className="absolute -bottom-1 -left-1 size-5 border-b-4 border-l-4 border-orange-500 rounded-bl-lg" />
                <div className="absolute -bottom-1 -right-1 size-5 border-b-4 border-r-4 border-orange-500 rounded-br-lg" />

                {/* Animated Laser Scanning Line */}
                <div className="absolute inset-x-2 top-2 h-0.5 bg-gradient-to-r from-transparent via-orange-400 to-transparent shadow-[0_0_8px_#f97316] animate-[pulse_1.5s_ease-in-out_infinite]" />

                {scannedCode && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm rounded-xl">
                    <CheckCircle2 className="size-12 text-emerald-400 animate-bounce mb-2" />
                    <p className="text-xs font-bold text-emerald-400">Đã đọc thành công!</p>
                    <p className="text-sm font-black text-white mt-1">{scannedCode}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Fallback / Permission Error State */}
          {errorMessage && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-[#1c1b1b]/95">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-rose-500/20 text-rose-400">
                {hasCameraPermission === false ? (
                  <CameraOff className="size-6" />
                ) : (
                  <AlertTriangle className="size-6" />
                )}
              </div>
              <h4 className="text-sm font-bold text-white mb-1">Không thể mở Camera</h4>
              <p className="text-xs text-white/70 max-w-xs leading-relaxed mb-4">
                {errorMessage}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => startCamera(selectedDeviceId || undefined)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                >
                  <RefreshCw className="size-3.5" />
                  Thử lại
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Actions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-[#141313] p-4 text-xs">
          {/* Switch Camera Button (if multi-camera exists) */}
          {cameraDevices.length > 1 && (
            <button
              type="button"
              onClick={handleSwitchCamera}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white/90 hover:bg-white/10 transition-colors"
            >
              <RefreshCw className="size-3.5" />
              Đổi Camera ({cameraDevices.length})
            </button>
          )}

          {/* Upload Image Alternative */}
          <label className="inline-flex items-center gap-1.5 cursor-pointer rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-white/90 hover:bg-white/10 transition-colors">
            {isProcessingFile ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Upload className="size-3.5 text-orange-400" />
            )}
            <span>Tải ảnh QR từ máy</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
              disabled={isProcessingFile}
            />
          </label>

          <StaffButton
            type="button"
            variant="ghost"
            className="text-white/70 hover:text-white ml-auto"
            onClick={onClose}
          >
            Đóng
          </StaffButton>
        </div>
      </div>
    </div>
  )
}
