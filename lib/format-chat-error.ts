const ERROR_MESSAGES: Record<string, string> = {
  "Too many requests. Please try again later.":
    "Terlalu banyak permintaan. Silakan coba lagi nanti.",
  "Request body too large": "Ukuran permintaan terlalu besar.",
  "Invalid JSON body": "Permintaan tidak valid.",
  "Invalid request": "Permintaan tidak valid. Periksa soal atau gambar Anda.",
  "AI service unavailable. Please try again later.":
    "Layanan AI sedang tidak tersedia. Silakan coba lagi nanti.",
}

export function formatChatError(message: string | undefined): string {
  if (!message) {
    return "Terjadi kesalahan saat memproses soal. Silakan coba lagi."
  }

  try {
    const parsed = JSON.parse(message) as { error?: string }
    if (typeof parsed.error === "string") {
      return (
        ERROR_MESSAGES[parsed.error] ??
        "Terjadi kesalahan saat memproses soal. Silakan coba lagi."
      )
    }
  } catch {
    // Not JSON — fall through.
  }

  return ERROR_MESSAGES[message] ?? "Terjadi kesalahan saat memproses soal. Silakan coba lagi."
}
