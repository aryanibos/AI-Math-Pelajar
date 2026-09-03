export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_TEXT_CHARS = 10_000
export const MAX_MESSAGES = 1
export const MAX_BODY_BYTES = 8 * 1024 * 1024
export const RATE_LIMIT_REQUESTS = 15
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000

export const ALLOWED_IMAGE_MIME_REGEX = /^image\/(jpeg|jpg|png|webp|gif)$/i
export const ALLOWED_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif"

export function normalizeImageMime(mime: string): string {
  const lower = mime.toLowerCase()
  return lower === "image/jpg" ? "image/jpeg" : lower
}

export function isAllowedImageMime(mime: string): boolean {
  return ALLOWED_IMAGE_MIME_REGEX.test(mime)
}

export function estimateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1]
  if (!base64) return 0
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - padding
}

/** Sniff image MIME from raw bytes (JPEG/PNG/GIF/WebP). */
export function sniffImageMimeFromBytes(buffer: Uint8Array): string | null {
  if (buffer.length < 4) return null
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg"
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png"
  }
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return "image/gif"
  }
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp"
  }
  return null
}

/** Sniff image MIME from a data URL (client-safe). */
export function sniffImageMimeFromDataUrl(dataUrl: string): string | null {
  const comma = dataUrl.indexOf(",")
  if (comma === -1) return null
  const base64 = dataUrl.slice(comma + 1)
  if (!base64 || base64.length % 4 !== 0) return null
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return sniffImageMimeFromBytes(bytes)
  } catch {
    return null
  }
}
