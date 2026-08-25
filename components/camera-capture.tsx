"use client"

import { useRef, useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { X, Camera, SwitchCamera, Loader2 } from "lucide-react"

interface CameraCaptureProps {
  onCapture: (imageData: string) => void
  onClose: () => void
}

export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }, [])

  const startCamera = useCallback(async (mode: "user" | "environment" = facingMode) => {
    setIsLoading(true)
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

      streamRef.current = mediaStream

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
        await videoRef.current.play()
      }
    } catch {
      setError("Tidak dapat mengakses kamera. Pastikan izin kamera sudah diberikan.")
    } finally {
      setIsLoading(false)
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
    const canvas = canvasRef.current

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.drawImage(video, 0, 0)
      const imageData = canvas.toDataURL("image/jpeg", 0.9)
      stopStream()
      onCapture(imageData)
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
            disabled={isLoading || !!error}
          >
            <SwitchCamera className="h-5 w-5" />
          </Button>

          <Button
            size="lg"
            onClick={handleCapture}
            disabled={isLoading || !!error}
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
