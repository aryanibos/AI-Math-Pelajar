"use client"

import React from "react"

import { useState, useRef, useCallback, useEffect } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { motion, AnimatePresence } from "framer-motion"
import type { EducationLevel } from "@/app/page"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { 
  ArrowLeft, 
  Upload, 
  Camera, 
  Send, 
  Loader2, 
  X, 
  ImageIcon,
  Calculator,
  Sparkles,
  RefreshCw
} from "lucide-react"
import { CameraCapture } from "@/components/camera-capture"
import { SolutionDisplay } from "@/components/solution-display"
import { Footer } from "@/components/footer"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { MAX_IMAGE_BYTES, MAX_TEXT_CHARS, ALLOWED_IMAGE_ACCEPT, isAllowedImageMime, estimateDataUrlBytes } from "@/lib/solve-limits"
import { formatChatError } from "@/lib/format-chat-error"

interface MathSolverProps {
  level: NonNullable<EducationLevel>
  onBack: () => void
}

const levelColors = {
  SD: "bg-emerald-500",
  SMP: "bg-blue-500",
  "SMA/SMK": "bg-amber-500",
  S1: "bg-rose-500",
}

const levelDescriptions = {
  SD: "Matematika dasar: penjumlahan, pengurangan, perkalian, pembagian, pecahan, geometri dasar",
  SMP: "Aljabar dasar, geometri, statistika, persamaan linear, teorema Pythagoras",
  "SMA/SMK": "Trigonometri, logaritma, limit, turunan, integral, matriks, vektor",
  S1: "Kalkulus lanjut, aljabar linear, persamaan diferensial, statistika matematika",
}

export function MathSolver({ level, onBack }: MathSolverProps) {
  const [inputMode, setInputMode] = useState<"text" | "upload" | "camera" | null>(null)
  const [textInput, setTextInput] = useState("")
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [showCamera, setShowCamera] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { messages, sendMessage, status, setMessages, error, clearError, stop } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/solve",
      // API accepts exactly one message; send only the latest to allow retry after errors.
      prepareSendMessagesRequest: ({ messages: msgs, ...rest }) => ({
        body: { ...rest.body, messages: msgs.slice(-1) },
      }),
    }),
  })

  useEffect(() => {
    return () => {
      stop()
    }
  }, [stop])

  const isLoading = status === "streaming" || status === "submitted"

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadError(null)
    clearError()

    if (!file.type.startsWith("image/")) {
      setUploadError("Hanya file gambar yang didukung.")
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    if (!isAllowedImageMime(file.type)) {
      setUploadError("Format gambar harus JPEG, PNG, WebP, atau GIF.")
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError(`Ukuran gambar maksimal ${MAX_IMAGE_BYTES / (1024 * 1024)}MB.`)
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string
      if (estimateDataUrlBytes(dataUrl) > MAX_IMAGE_BYTES) {
        setUploadError(`Ukuran gambar maksimal ${MAX_IMAGE_BYTES / (1024 * 1024)}MB.`)
        if (fileInputRef.current) fileInputRef.current.value = ""
        return
      }
      setImagePreview(dataUrl)
      setInputMode("upload")
    }
    reader.onerror = () => {
      setUploadError("Gagal membaca file gambar.")
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
    reader.readAsDataURL(file)
  }, [clearError])

  const handleCameraCapture = useCallback((imageData: string) => {
    setUploadError(null)
    clearError()

    if (estimateDataUrlBytes(imageData) > MAX_IMAGE_BYTES) {
      setUploadError(`Ukuran gambar maksimal ${MAX_IMAGE_BYTES / (1024 * 1024)}MB. Coba ambil foto lebih dekat.`)
      return
    }

    setImagePreview(imageData)
    setInputMode("camera")
    setShowCamera(false)
  }, [clearError])

  const handleSubmit = useCallback(async () => {
    if (isLoading) return

    setUploadError(null)
    clearError()

    const trimmedText = textInput.trim()
    const contextText = `[Tingkat: ${level}] ${levelDescriptions[level]}\n\nSoal:`

    let assembledText = ""
    if (imagePreview) {
      assembledText = `${contextText}\nLihat dan analisis gambar soal matematika berikut, lalu selesaikan dengan langkah-langkah yang jelas:${trimmedText ? `\n\nKeterangan tambahan: ${trimmedText}` : ""}`
    } else if (trimmedText) {
      assembledText = `${contextText}\n${trimmedText}`
    } else {
      return
    }

    if (assembledText.length > MAX_TEXT_CHARS) {
      setUploadError(`Teks soal maksimal ${MAX_TEXT_CHARS.toLocaleString("id-ID")} karakter (termasuk konteks tingkat).`)
      return
    }

    const parts: Array<{ type: "text"; text: string } | { type: "file"; mediaType: string; url: string }> = []
    
    if (imagePreview) {
      // Extract mime type from base64 data URL
      const mimeMatch = imagePreview.match(/^data:(image\/[^;]+);base64,/)
      const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg"
      if (!isAllowedImageMime(mimeType)) {
        setUploadError("Format gambar harus JPEG, PNG, WebP, atau GIF.")
        return
      }
      
      parts.push({ type: "text", text: assembledText })
      parts.push({ type: "file", mediaType: mimeType, url: imagePreview })
    } else {
      parts.push({ type: "text", text: assembledText })
    }

    await sendMessage({ parts })
  }, [isLoading, level, textInput, imagePreview, sendMessage, clearError])

  const handleReset = useCallback(() => {
    stop()
    setTextInput("")
    setImagePreview(null)
    setInputMode(null)
    setUploadError(null)
    clearError()
    setMessages([])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [setMessages, clearError, stop])

  const hasSolution = messages.some(m => m.role === "assistant")

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali
          </Button>
          
          <div className="flex items-center gap-2">
            <div className={`h-3 w-3 rounded-full ${levelColors[level]}`} />
            <span className="font-semibold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
              {level}
            </span>
          </div>

          {hasSolution && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="gap-2 bg-transparent"
            >
              <RefreshCw className="h-4 w-4" />
              Soal Baru
            </Button>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-6">
        {(error || uploadError) && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>
              {uploadError ?? formatChatError(error?.message)}
            </AlertDescription>
          </Alert>
        )}

        <AnimatePresence mode="wait">
          {!hasSolution ? (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {/* Input Mode Selection */}
              {!inputMode && (
                <div className="space-y-6">
                  <div className="text-center">
                    <h2 
                      className="mb-2 text-2xl font-bold text-foreground md:text-3xl"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      Masukkan Soal Matematika
                    </h2>
                    <p className="text-muted-foreground">
                      Pilih cara untuk memasukkan soal kamu
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <Card 
                      className="cursor-pointer transition-all hover:border-primary hover:shadow-lg"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                          <Upload className="h-7 w-7 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
                            Upload Gambar
                          </h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Pilih dari galeri
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card 
                      className="cursor-pointer transition-all hover:border-primary hover:shadow-lg"
                      onClick={() => setShowCamera(true)}
                    >
                      <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/50">
                          <Camera className="h-7 w-7 text-secondary-foreground" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
                            Ambil Foto
                          </h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Gunakan kamera
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card 
                      className="cursor-pointer transition-all hover:border-primary hover:shadow-lg"
                      onClick={() => setInputMode("text")}
                    >
                      <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent">
                          <Calculator className="h-7 w-7 text-accent-foreground" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
                            Ketik Soal
                          </h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Tulis langsung
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}

              {/* Text Input Mode */}
              {inputMode === "text" && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
                      Ketik Soal Matematika
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setInputMode(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <Textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Contoh: Hitunglah nilai dari 2x + 5 = 15..."
                    className="min-h-[150px] resize-none text-base"
                  />
                  
                  <Button
                    onClick={handleSubmit}
                    disabled={!textInput.trim() || isLoading}
                    className="w-full gap-2"
                    size="lg"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Sedang mengerjakan...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-5 w-5" />
                        Selesaikan Soal
                      </>
                    )}
                  </Button>
                </motion.div>
              )}

              {/* Image Preview Mode */}
              {(inputMode === "upload" || inputMode === "camera") && imagePreview && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
                      Preview Gambar Soal
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setImagePreview(null)
                        setInputMode(null)
                        if (fileInputRef.current) fileInputRef.current.value = ""
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="relative overflow-hidden rounded-2xl border border-border bg-muted">
                    <img
                      src={imagePreview || "/placeholder.svg"}
                      alt="Preview soal"
                      className="mx-auto max-h-[400px] w-auto object-contain"
                    />
                  </div>

                  <Textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="(Opsional) Tambahkan keterangan atau pertanyaan spesifik..."
                    className="min-h-[80px] resize-none"
                  />
                  
                  <Button
                    onClick={handleSubmit}
                    disabled={isLoading}
                    className="w-full gap-2"
                    size="lg"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Sedang mengerjakan...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-5 w-5" />
                        Selesaikan Soal
                      </>
                    )}
                  </Button>
                </motion.div>
              )}

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_IMAGE_ACCEPT}
                onChange={handleFileUpload}
                className="hidden"
              />
            </motion.div>
          ) : (
            <motion.div
              key="solution"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <SolutionDisplay 
                messages={messages} 
                isLoading={isLoading}
                level={level}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Camera Modal */}
        {showCamera && (
          <CameraCapture
            onCapture={handleCameraCapture}
            onClose={() => setShowCamera(false)}
          />
        )}
      </div>

      <Footer />
    </div>
  )
}
