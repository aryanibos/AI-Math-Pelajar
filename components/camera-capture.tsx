"use client"

import { useRef, useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { X, Camera, SwitchCamera, Loader2 } from "lucide-react"
import { MAX_IMAGE_BYTES, estimateDataUrlBytes } from "@/lib/solve-limits"

interface CameraCaptureProps {
  onCapture: (imageData: string) => void
  onClose: () => void
}

export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const startRequestRef = useRef(0)
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment")
  const [isLoading, setIsLoading] = useState(true)
  const [isVideoReady, setIsVideoReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }, [])

  const startCamera = useCallback(async (mode: "user" | "environment" = facingMode) => {
    const requestId = ++startRequestRef.current
    // Defer state updates so camera init stays out of the effect's sync path.
    await Promise.resolve()
    if (requestId !== startRequestRef.current) return

    setIsLoading(true)
    setIsVideoReady(false)
    setError(null)

    try {
      stopStream()

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })

      if (requestId !== startRequestRef.current) {
        mediaStream.getTracks().forEach((track) => track.stop())
        return
      }

      streamRef.current = mediaStream

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
        await videoRef.current.play()
      }
    } catch {
      if (requestId !== startRequestRef.current) return
      stopStream()
      setError("Tidak dapat mengakses kamera. Pastikan izin kamera sudah diberikan.")
    } finally {
      if (requestId === startRequestRef.current) {
        setIsLoading(false)
      }
    }
  }, [facingMode, stopStream])

  useEffect(() => {
    startCamera(facingMode)

    return () => {
      stopStream()
    }
  }, [facingMode, startCamera, stopStream])

  const handleSwitchCamera = useCallback(() => {
    setFacingMode(prev => (prev === "user" ? "environment" : "user"))
  }, [])

  const handleCapture = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setError("Kamera belum siap. Tunggu sebentar lalu coba lagi.")
      return
    }
    const canvas = canvasRef.current

    const maxEdge = 1600
    let { videoWidth: width, videoHeight: height } = video
    if (width > maxEdge || height > maxEdge) {
      const scale = maxEdge / Math.max(width, height)
      width = Math.round(width * scale)
      height = Math.round(height * scale)
    }

    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.drawImage(video, 0, 0, width, height)

      let imageData = ""
      for (let quality = 0.9; quality >= 0.5; quality -= 0.1) {
        imageData = canvas.toDataURL("image/jpeg", quality)
        if (estimateDataUrlBytes(imageData) <= MAX_IMAGE_BYTES) break
      }

      if (estimateDataUrlBytes(imageData) > MAX_IMAGE_BYTES) {
        setError(
          `Gambar masih terlalu besar (maks. ${MAX_IMAGE_BYTES / (1024 * 1024)}MB). Coba ambil foto lebih dekat atau kurangi detail.`,
        )
        return
      }

      stopStream()
      onCapture(imageData)
    } else {
      setError("Gagal menangkap gambar. Coba lagi.")
    }
  }, [onCapture, stopStream])

  const handleClose = useCallback(() => {
    stopStream()
    onClose()
  }, [stopStream, onClose])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/90 p-4"
    >
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-background">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="font-semibold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
            Ambil Foto Soal
          </h3>
          <Button variant="ghost" size="icon" onClick={handleClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Camera View */}
        <div className="relative aspect-[4/3] w-full bg-muted">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
              <div>
                <p className="mb-4 text-destructive">{error}</p>
                <Button onClick={() => startCamera(facingMode)}>Coba Lagi</Button>
              </div>
            </div>
          )}

          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onLoadedMetadata={(e) => {
              const video = e.currentTarget
              if (video.srcObject === streamRef.current && streamRef.current) {
                setIsVideoReady(true)
              }
            }}
            className={`h-full w-full object-cover ${isLoading || error ? 'invisible' : ''}`}
          />

          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 border-t border-border p-4">
          <Button
            variant="outline"
            size="icon"
            onClick={handleSwitchCamera}
            disabled={isLoading || !!error || !isVideoReady}
          >
            <SwitchCamera className="h-5 w-5" />
          </Button>

          <Button
            size="lg"
            onClick={handleCapture}
            disabled={isLoading || !!error || !isVideoReady}
            className="h-14 w-14 rounded-full"
          >
            <Camera className="h-6 w-6" />
          </Button>

          <div className="h-10 w-10" /> {/* Spacer for alignment */}
        </div>
      </div>
    </motion.div>
  )
}
