const ERROR_MESSAGES: Record<string, string> = {
  "Too many requests. Please try again later.":
    "Terlalu banyak permintaan. Silakan coba lagi nanti.",
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
  for (const messages of Object.values(details)) {
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

function isExplicitCancellation(parsed: {
  error?: string
  name?: string
}): boolean {
  return (
    parsed.error === "Request cancelled." ||
    parsed.name === "AbortError"
  )
}

export function formatChatError(message: string | undefined): string {
  if (!message) {
    return "Terjadi kesalahan saat memproses soal. Silakan coba lagi."
  }

  if (message.trimStart().startsWith("{")) {
    try {
      const parsed = JSON.parse(message) as {
        error?: string
        name?: string
        details?: Record<string, string[] | undefined>
        retryAfterSec?: number
      }
      if (isExplicitCancellation(parsed)) {
        return ERROR_MESSAGES["Request cancelled."]
      }
      if (typeof parsed.error === "string") {
        const base =
          ERROR_MESSAGES[parsed.error] ??
          "Terjadi kesalahan saat memproses soal. Silakan coba lagi."
        const detail = firstDetail(parsed.details)
        const retryHint =
          typeof parsed.retryAfterSec === "number" &&
          Number.isFinite(parsed.retryAfterSec) &&
          parsed.retryAfterSec >= 0
            ? formatRetryAfter(parsed.retryAfterSec)
            : null
        if (detail && retryHint) return `${base} ${detail} ${retryHint}`
        if (detail) return `${base} ${detail}`
        if (retryHint) return `${base} ${retryHint}`
        return base
      }
      const detailOnly = firstDetail(parsed.details)
      if (detailOnly) return detailOnly
    } catch {
      // Not JSON — fall through.
    }
  }

  if (message === "Request cancelled." || message === "AbortError") {
    return ERROR_MESSAGES["Request cancelled."]
  }

  return ERROR_MESSAGES[message] ?? "Terjadi kesalahan saat memproses soal. Silakan coba lagi."
}
