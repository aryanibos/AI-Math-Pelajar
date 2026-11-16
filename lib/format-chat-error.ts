import { stripUtf8Bom } from "@/lib/solve-limits"

/** Exact `error` strings returned by `/api/solve` (JSON or rare plain-text proxies). */
const ERROR_MESSAGES: Record<string, string> = {
  "Too many requests. Please try again later.":
    "Terlalu banyak permintaan. Silakan coba lagi nanti.",
  "Too many active clients. Please try again later.":
    "Server sibuk. Silakan coba lagi nanti.",
  "Request body too large": "Ukuran permintaan terlalu besar.",
  "Invalid JSON body": "Permintaan tidak valid.",
  "Empty request body": "Permintaan kosong. Silakan kirim soal Anda.",
  "Invalid Content-Length header":
    "Permintaan tidak valid (header Content-Length).",
  "Unable to read request body.":
    "Gagal membaca permintaan. Silakan coba lagi.",
  "Request body read timed out.":
    "Permintaan terlalu lama. Silakan coba lagi.",
  "Invalid request": "Permintaan tidak valid. Periksa soal atau gambar Anda.",
  "Unable to verify client.":
    "Permintaan tidak dapat diverifikasi. Silakan coba lagi.",
  "AI service unavailable. Please try again later.":
    "Layanan AI sedang tidak tersedia. Silakan coba lagi nanti.",
  "Failed to fetch the chat response.":
    "Gagal menghubungi server. Silakan coba lagi.",
  "Request cancelled.": "Permintaan dibatalkan.",
}

const DETAIL_MESSAGES: Record<string, string> = {
  "Invalid image data URL": "Format gambar tidak valid.",
  "mediaType must match the image data URL":
    "Format gambar tidak cocok dengan data yang dikirim.",
  "Exactly one text part required": "Teks soal wajib diisi.",
  "At most one image allowed": "Maksimal satu gambar per permintaan.",
  "Invalid request structure": "Struktur permintaan tidak valid.",
  "Teks soal wajib diisi.": "Teks soal wajib diisi.",
}

const API_PLAIN_ERROR_KEYS = new Set(Object.keys(ERROR_MESSAGES))

/** When a proxy returns a non-JSON body, recognize known API error copy for transport fallbacks. */
export function recognizeApiPlainError(text: string): string | undefined {
  const trimmed = stripUtf8Bom(text).trim()
  if (!trimmed || !API_PLAIN_ERROR_KEYS.has(trimmed)) return undefined
  return trimmed
}

const RATE_LIMIT_REASON_API_ERRORS: Record<string, string> = {
  bucket_capacity: "Too many active clients. Please try again later.",
  rate_limited: "Too many requests. Please try again later.",
}

/** Shared HTTP → `error` string for `/api/solve` transport (JSON and non-JSON bodies). */
export function solveHttpErrorMessage(status: number): string {
  if (status >= 500) return "AI service unavailable. Please try again later."
  if (status === 429) return RATE_LIMIT_REASON_API_ERRORS.rate_limited
  if (status === 413) return "Request body too large"
  if (status === 408) return "Request body read timed out."
  if (status === 400) return "Invalid request"
  return "Failed to fetch the chat response."
}

function normalizeApiErrorField(error: unknown): string | undefined {
  if (typeof error !== "string") return undefined
  const trimmed = error.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** Prefer API JSON `error`, then known plain-text bodies, then status fallbacks. */
export function resolveSolveTransportError(
  status: number,
  jsonError: unknown,
  plainBody = "",
  rateLimitReason?: string | null,
): string {
  const headerReason =
    status === 429 && rateLimitReason
      ? RATE_LIMIT_REASON_API_ERRORS[rateLimitReason]
      : undefined
  return (
    normalizeApiErrorField(jsonError) ??
    recognizeApiPlainError(plainBody) ??
    headerReason ??
    solveHttpErrorMessage(status)
  )
}

function translateDetail(detail: string): string {
  if (DETAIL_MESSAGES[detail]) return DETAIL_MESSAGES[detail]
  const textLengthMatch = detail.match(
    /^Teks soal maksimal ([\d.,]+) karakter\.$/,
  )
  if (textLengthMatch) {
    return `Teks soal maksimal ${textLengthMatch[1]} karakter.`
  }
  const imageSizeMatch = detail.match(/^Image must be at most (\d+)MB$/)
  if (imageSizeMatch) {
    return `Gambar maksimal ${imageSizeMatch[1]}MB.`
  }
  return "Detail permintaan tidak valid."
}

function firstDetail(details: Record<string, string[] | undefined> | undefined): string | undefined {
  if (!details) return undefined
  for (const key of Object.keys(details).sort()) {
    const messages = details[key]
    const first = messages?.find((m): m is string => typeof m === "string" && m.length > 0)
    if (first) return translateDetail(first)
  }
  return undefined
}

function formatRetryAfter(retryAfterSec: number): string {
  if (retryAfterSec < 60) {
    return `Coba lagi dalam ${retryAfterSec} detik.`
  }
  const minutes = Math.ceil(retryAfterSec / 60)
  return `Coba lagi dalam ${minutes} menit.`
}

function isFetchAbortMessage(message: string): boolean {
  const trimmed = message.trim()
  if (trimmed === "AbortError" || trimmed === "Request cancelled.") return true
  const core = trimmed.replace(/^(DOMException|AbortError):\s*/i, "").trim()
  if (core === "Aborted" || core === "AbortError") return true
  if (/^The user aborted a request\.?$/i.test(trimmed)) return true
  if (/^The operation was aborted\.?$/i.test(trimmed)) return true
  if (/^Fetch is aborted\.?$/i.test(trimmed)) return true
  return false
}

function isExplicitCancellation(parsed: {
  error?: string
  name?: string
}): boolean {
  return (
    parsed.error === "Request cancelled." ||
    parsed.name === "AbortError" ||
    (typeof parsed.error === "string" && isFetchAbortMessage(parsed.error))
  )
}

const OFFLINE_INTERNET_HINT =
  "Gagal menghubungi server. Periksa koneksi internet dan coba lagi."

/** Browser/network failures when `fetch` throws before our transport shapes JSON errors. */
function isBrowserOfflineError(message: string): boolean {
  const trimmed = message.trim()
  if (trimmed === "Network request failed") return true
  if (/NetworkError when attempting to fetch resource/i.test(trimmed)) {
    return true
  }
  if (/internet connection appears to be offline/i.test(trimmed)) return true
  if (
    /Failed to execute ['"]fetch['"] on /i.test(trimmed) &&
    /\bFailed to fetch\b/.test(trimmed)
  ) {
    return true
  }
  const core = trimmed.replace(/^(TypeError|Error):\s*/i, "").trim()
  if (core === "Failed to fetch" || core === "Load failed") return true
  if (core === "network error" || core === "Network connection lost") return true
  if (/^Failed to fetch \([^)]+\)$/i.test(core)) return true
  return /\bFailed to fetch\b/.test(core)
}

export function formatChatError(message: string | undefined): string {
  if (!message) {
    return "Terjadi kesalahan saat memproses soal. Silakan coba lagi."
  }

  const normalizedMessage = stripUtf8Bom(message)

  if (normalizedMessage.trimStart().startsWith("{")) {
    try {
      const parsed = JSON.parse(normalizedMessage) as {
        error?: string
        name?: string
        details?: Record<string, string[] | undefined>
        retryAfterSec?: number
        rateLimitReason?: string
      }
      if (isExplicitCancellation(parsed)) {
        return ERROR_MESSAGES["Request cancelled."]
      }
      const apiError = normalizeApiErrorField(parsed.error)
      if (apiError) {
        const mappedApiError = ERROR_MESSAGES[apiError]
        if (!mappedApiError && isBrowserOfflineError(apiError)) {
          return OFFLINE_INTERNET_HINT
        }
        if (isFetchAbortMessage(apiError)) {
          return ERROR_MESSAGES["Request cancelled."]
        }
        const base =
          mappedApiError ??
          "Terjadi kesalahan saat memproses soal. Silakan coba lagi."
        const detail = firstDetail(parsed.details)
        const retryHint =
          typeof parsed.retryAfterSec === "number" &&
          Number.isFinite(parsed.retryAfterSec) &&
          parsed.retryAfterSec > 0
            ? formatRetryAfter(parsed.retryAfterSec)
            : null
        if (detail && retryHint) return `${base} ${detail} ${retryHint}`
        if (detail) return `${base} ${detail}`
        if (retryHint) return `${base} ${retryHint}`
        return base
      }
      const detailOnly = firstDetail(parsed.details)
      const retryOnly =
        typeof parsed.retryAfterSec === "number" &&
        Number.isFinite(parsed.retryAfterSec) &&
        parsed.retryAfterSec > 0
          ? formatRetryAfter(parsed.retryAfterSec)
          : null
      if (detailOnly && retryOnly) return `${detailOnly} ${retryOnly}`
      if (detailOnly) return detailOnly
      if (retryOnly) {
        const reasonKey =
          parsed.rateLimitReason &&
          RATE_LIMIT_REASON_API_ERRORS[parsed.rateLimitReason]
        const retryBase =
          ERROR_MESSAGES[
            reasonKey ?? "Too many requests. Please try again later."
          ]
        return `${retryBase} ${retryOnly}`
      }
    } catch {
      // Not JSON — fall through.
    }
  }

  if (isFetchAbortMessage(normalizedMessage)) {
    return ERROR_MESSAGES["Request cancelled."]
  }

  if (isBrowserOfflineError(normalizedMessage)) {
    return OFFLINE_INTERNET_HINT
  }

  const plainApi = recognizeApiPlainError(normalizedMessage)
  if (plainApi) {
    return (
      ERROR_MESSAGES[plainApi] ??
      "Terjadi kesalahan saat memproses soal. Silakan coba lagi."
    )
  }

  return (
    ERROR_MESSAGES[normalizedMessage.trim()] ??
    "Terjadi kesalahan saat memproses soal. Silakan coba lagi."
  )
}
