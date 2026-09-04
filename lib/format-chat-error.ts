const ERROR_MESSAGES: Record<string, string> = {
  "Too many requests. Please try again later.":
    "Terlalu banyak permintaan. Silakan coba lagi nanti.",
  "Request body too large": "Ukuran permintaan terlalu besar.",
  "Invalid JSON body": "Permintaan tidak valid.",
  "Empty request body": "Permintaan kosong. Silakan kirim soal Anda.",
  "Invalid Content-Length header":
    "Permintaan tidak valid (header Content-Length).",
  "Invalid request": "Permintaan tidak valid. Periksa soal atau gambar Anda.",
  "Unable to verify client.":
    "Permintaan tidak dapat diverifikasi. Silakan coba lagi.",
  "AI service unavailable. Please try again later.":
    "Layanan AI sedang tidak tersedia. Silakan coba lagi nanti.",
}

const DETAIL_MESSAGES: Record<string, string> = {
  "Invalid image data URL": "Format gambar tidak valid.",
  "Image must be at most 5MB": "Gambar maksimal 5MB.",
  "mediaType must match the image data URL":
    "Format gambar tidak cocok dengan data yang dikirim.",
  "Exactly one text part required": "Teks soal wajib diisi.",
  "At most one image allowed": "Maksimal satu gambar per permintaan.",
  "Invalid request structure": "Struktur permintaan tidak valid.",
}

function translateDetail(detail: string): string {
  if (DETAIL_MESSAGES[detail]) return DETAIL_MESSAGES[detail]
  const textLengthMatch = detail.match(
    /^Teks soal maksimal ([\d.,]+) karakter\.$/,
  )
  if (textLengthMatch) {
    return `Teks soal maksimal ${textLengthMatch[1]} karakter.`
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

export function formatChatError(message: string | undefined): string {
  if (!message) {
    return "Terjadi kesalahan saat memproses soal. Silakan coba lagi."
  }

  try {
    const parsed = JSON.parse(message) as {
      error?: string
      details?: Record<string, string[] | undefined>
    }
    if (typeof parsed.error === "string") {
      const base =
        ERROR_MESSAGES[parsed.error] ??
        "Terjadi kesalahan saat memproses soal. Silakan coba lagi."
      const detail = firstDetail(parsed.details)
      return detail ? `${base} ${detail}` : base
    }
    const detailOnly = firstDetail(parsed.details)
    if (detailOnly) return detailOnly
  } catch {
    // Not JSON — fall through.
  }

  return ERROR_MESSAGES[message] ?? "Terjadi kesalahan saat memproses soal. Silakan coba lagi."
}
