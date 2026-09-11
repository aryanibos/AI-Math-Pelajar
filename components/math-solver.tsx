"use client"

import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { flushSync } from "react-dom"
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
  Calculator,
  Sparkles,
  RefreshCw
} from "lucide-react"
import { CameraCapture } from "@/components/camera-capture"
import { SolutionDisplay } from "@/components/solution-display"
import { Footer } from "@/components/footer"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  buildContextPrefix,
  containsForbiddenSoalMarkers,
  IMAGE_SOLVE_PROMPT,
  KETERANGAN_PREFIX,
  stripEmbeddedLevelTags,
  stripEmbeddedScaffolding,
  stripInvisibleChars,
} from "@/lib/education-level"
import { MAX_BODY_BYTES, MAX_IMAGE_BYTES, MAX_TEXT_CHARS, ALLOWED_IMAGE_ACCEPT, isAllowedImageMime, estimateDataUrlBytes, estimateSolveRequestBodyBytes, normalizeImageMime, sniffImageMimeFromBytes, sniffImageMimeFromDataUrl } from "@/lib/solve-limits"
import { isValidImageDataUrl } from "@/lib/solve-validation"
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

export function MathSolver({ level, onBack }: MathSolverProps) {
  const [inputMode, setInputMode] = useState<"text" | "upload" | "camera" | null>(null)
  const [textInput, setTextInput] = useState("")
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [showCamera, setShowCamera] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [streamAborted, setStreamAborted] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileReaderRef = useRef<FileReader | null>(null)
  const mountedRef = useRef(true)
  const submittingRef = useRef(false)

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/solve",
        fetch: async (input, init) => {
          const response = await fetch(input, init)
          if (!response.ok) {
            const text = (await response.text()) || ""
            if (response.status === 499) {
              throw new Error(JSON.stringify({ error: "Request cancelled." }))
            }
            const retryAfter = response.headers.get("Retry-After")
            const retryAfterSec =
              retryAfter !== null && Number.isFinite(Number(retryAfter))
                ? Number(retryAfter)
                : undefined
            try {
              const parsed = JSON.parse(text) as {
                error?: string
                details?: Record<string, string[] | undefined>
              }
              throw new Error(
                JSON.stringify({
                  error:
                    parsed.error ??
                    (response.status === 429
                      ? "Too many requests. Please try again later."
                      : response.status === 413
                        ? "Request body too large"
                        : "Failed to fetch the chat response."),
                  details: parsed.details,
                  retryAfterSec:
                    response.status === 429 ? retryAfterSec : undefined,
                }),
              )
            } catch (err) {
              if (err instanceof Error && err.message.startsWith("{")) throw err
              const fallbackError =
                response.status >= 500
                  ? "AI service unavailable. Please try again later."
                  : response.status === 429
                    ? "Too many requests. Please try again later."
                    : response.status === 413
                      ? "Request body too large"
                      : "Failed to fetch the chat response."
              throw new Error(
                JSON.stringify({
                  error: fallbackError,
                  retryAfterSec:
                    response.status === 429 ? retryAfterSec : undefined,
                }),
              )
            }
          }
          return response
        },
        // API accepts exactly one user message; filter role to allow retry after errors.
        prepareSendMessagesRequest: ({ messages: msgs, ...rest }) => ({
          body: {
            ...rest.body,
            messages: msgs.filter((m) => m.role === "user").slice(-1),
          },
        }),
      }),
    [],
  )

  const { messages, sendMessage, status, setMessages, error, clearError, stop } = useChat({
    transport,
  })

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      fileReaderRef.current?.abort()
      fileReaderRef.current = null
      stop()
    }
  }, [stop])

  const abortStream = useCallback(() => {
    if (status === "streaming" || status === "submitted") {
      setStreamAborted(true)
      clearError()
    }
    stop()
  }, [status, stop, clearError])

  const isLoading = status === "streaming" || status === "submitted"

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadError(null)
    clearError()

    const mimeFromExt = (name: string): string | null => {
      const ext = name.split(".").pop()?.toLowerCase()
      const map: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        gif: "image/gif",
      }
      return ext ? map[ext] ?? null : null
    }

    const fileMime = file.type
      ? normalizeImageMime(file.type)
      : mimeFromExt(file.name)

    if (!fileMime?.startsWith("image/")) {
      setUploadError("Hanya file gambar yang didukung.")
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    if (!isAllowedImageMime(fileMime)) {
      setUploadError("Format gambar harus JPEG, PNG, WebP, atau GIF.")
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError(`Ukuran gambar maksimal ${MAX_IMAGE_BYTES / (1024 * 1024)}MB.`)
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await file.arrayBuffer())
    } catch {
      setUploadError("Gagal membaca file gambar.")
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    const sniffed = sniffImageMimeFromBytes(bytes)
    if (!sniffed || !isAllowedImageMime(sniffed)) {
      setUploadError("Format gambar tidak valid.")
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    if (normalizeImageMime(fileMime) !== sniffed) {
      setUploadError("Format gambar tidak cocok dengan tipe file.")
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    fileReaderRef.current?.abort()
    const reader = new FileReader()
    fileReaderRef.current = reader
    reader.onload = (event) => {
      if (!mountedRef.current) return
      const dataUrl = event.target?.result as string
      if (estimateDataUrlBytes(dataUrl) > MAX_IMAGE_BYTES) {
        setUploadError(`Ukuran gambar maksimal ${MAX_IMAGE_BYTES / (1024 * 1024)}MB.`)
        if (fileInputRef.current) fileInputRef.current.value = ""
        return
      }
      if (!isValidImageDataUrl(dataUrl)) {
        setUploadError("Format gambar tidak valid.")
        if (fileInputRef.current) fileInputRef.current.value = ""
        return
      }
      setImagePreview(dataUrl)
      setInputMode("upload")
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
    reader.onerror = () => {
      if (!mountedRef.current) return
      if (reader.error?.name === "AbortError") return
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

    const sniffed = sniffImageMimeFromDataUrl(imageData)
    if (!sniffed || !isAllowedImageMime(sniffed)) {
      setUploadError("Format gambar tidak valid.")
      return
    }

    if (!isValidImageDataUrl(imageData)) {
      setUploadError("Format gambar tidak valid.")
      return
    }

    setImagePreview(imageData)
    setInputMode("camera")
    setShowCamera(false)
  }, [clearError])

  const handleSubmit = useCallback(async () => {
    if (submittingRef.current || isLoading) return
    submittingRef.current = true

    setUploadError(null)
    clearError()

    const trimmedText = stripInvisibleChars(textInput).trim()
    const contextText = buildContextPrefix(level)

    let assembledText = ""
    if (imagePreview) {
      if (trimmedText && containsForbiddenSoalMarkers(trimmedText)) {
        setUploadError("Keterangan tambahan mengandung format yang tidak diizinkan.")
        submittingRef.current = false
        return
      }
      const keterangan = trimmedText
        ? stripEmbeddedLevelTags(stripEmbeddedScaffolding(trimmedText))
        : ""
      assembledText = `${contextText}${IMAGE_SOLVE_PROMPT}${keterangan ? `${KETERANGAN_PREFIX}${keterangan}` : ""}`
    } else if (trimmedText) {
      if (containsForbiddenSoalMarkers(trimmedText)) {
        setUploadError("Teks soal mengandung format yang tidak diizinkan.")
        submittingRef.current = false
        return
      }
      const userSoal = stripEmbeddedLevelTags(stripEmbeddedScaffolding(trimmedText))
      if (!userSoal) {
        setUploadError("Teks soal wajib diisi.")
        submittingRef.current = false
        return
      }
      assembledText = `${contextText}\n${userSoal}`
    } else {
      setUploadError("Teks soal wajib diisi.")
      submittingRef.current = false
      return
    }

    if (assembledText.length > MAX_TEXT_CHARS) {
      setUploadError(`Teks soal maksimal ${MAX_TEXT_CHARS.toLocaleString("id-ID")} karakter (termasuk konteks tingkat).`)
      submittingRef.current = false
      return
    }

    const estimatedBodyBytes = estimateSolveRequestBodyBytes(
      assembledText,
      imagePreview,
    )
    if (estimatedBodyBytes > MAX_BODY_BYTES) {
      setUploadError(
        imagePreview
          ? "Ukuran permintaan terlalu besar. Coba ambil foto lebih dekat atau kurangi teks keterangan."
          : "Ukuran permintaan terlalu besar.",
      )
      submittingRef.current = false
      return
    }

    const parts: Array<{ type: "text"; text: string } | { type: "file"; mediaType: string; url: string }> = []
    
    if (imagePreview) {
      // Extract mime type from base64 data URL
      const mimeMatch = imagePreview.match(/^data:(image\/[^;]+);base64,/)
      const mimeType = normalizeImageMime(mimeMatch ? mimeMatch[1] : "image/jpeg")
      if (!isAllowedImageMime(mimeType)) {
        setUploadError("Format gambar harus JPEG, PNG, WebP, atau GIF.")
        submittingRef.current = false
        return
      }

      const sniffed = sniffImageMimeFromDataUrl(imagePreview)
      if (!sniffed || normalizeImageMime(mimeType) !== sniffed) {
        setUploadError("Format gambar tidak valid.")
        submittingRef.current = false
        return
      }

      if (!isValidImageDataUrl(imagePreview)) {
        setUploadError("Format gambar tidak valid.")
        submittingRef.current = false
        return
      }
      
      parts.push({ type: "text", text: assembledText })
      parts.push({ type: "file", mediaType: mimeType, url: imagePreview })
    } else {
      parts.push({ type: "text", text: assembledText })
    }

    try {
      const shouldClearHistory =
        status === "error" ||
        streamAborted ||
        messages.some((m) => m.role === "assistant")
      setStreamAborted(false)
      // Replace prior messages on retry so failed/aborted submits don't accumulate duplicates.
      if (shouldClearHistory) {
        // Flush empty state before sendMessage so prepareSendMessagesRequest sees fresh history.
        flushSync(() => setMessages([]))
      }
      await sendMessage({ parts })
    } finally {
      submittingRef.current = false
    }
  }, [isLoading, level, textInput, imagePreview, sendMessage, clearError, status, setMessages, messages, streamAborted])

  const handleReset = useCallback(() => {
    setStreamAborted(false)
    abortStream()
    fileReaderRef.current?.abort()
    fileReaderRef.current = null
    setTextInput("")
    setImagePreview(null)
    setInputMode(null)
    setUploadError(null)
    clearError()
    setMessages([])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [setMessages, clearError, abortStream])

  const hasAssistantContent = messages.some(
    (m) =>
      m.role === "assistant" &&
      m.parts.some(
        (p) => p.type === "text" && typeof p.text === "string" && p.text.trim().length > 0,
      ),
  )

  const hasAssistantMessage = messages.some((m) => m.role === "assistant")

  // Show solution view once the assistant message exists (incl. loading spinner before first token).
  // Keep partial content visible after stream errors; empty completions use ready status.
  const hasSolution =
    hasAssistantContent ||
    isLoading ||
    (hasAssistantMessage && status === "ready" && (!streamAborted || hasAssistantContent))

  useEffect(() => {
    if (isLoading || hasAssistantContent) return
    const hasEmptyAssistant = messages.some(
      (m) =>
        m.role === "assistant" &&
        !m.parts.some(
          (p) => p.type === "text" && typeof p.text === "string" && p.text.trim().length > 0,
        ),
    )
    if (!hasEmptyAssistant) return
    // Early abort: clear user + empty assistant so retry starts fresh.
    if (streamAborted) {
      setMessages([])
      return
    }
    // Drop orphan assistant messages after stream errors (empty completions stay visible).
    if (status === "error") {
      setMessages((prev) => prev.filter((m) => m.role !== "assistant"))
    }
  }, [status, streamAborted, hasAssistantContent, isLoading, messages, setMessages])

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              abortStream()
              onBack()
            }}
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
        {((error && !hasAssistantContent && !isLoading) || uploadError) && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>
              {error ? formatChatError(error.message) : uploadError}
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
                    disabled={!stripInvisibleChars(textInput).trim() || isLoading}
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
                        fileReaderRef.current?.abort()
                        fileReaderRef.current = null
                        setImagePreview(null)
                        setInputMode(null)
                        setUploadError(null)
                        clearError()
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
                streamErrorMessage={
                  streamAborted && hasAssistantContent
                    ? "Permintaan dibatalkan."
                    : error && hasAssistantContent
                      ? formatChatError(error.message)
                      : null
                }
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
