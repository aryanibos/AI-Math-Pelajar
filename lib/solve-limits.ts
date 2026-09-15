/** Vercel/serverless hard request-body cap (4.5 MB). */
const PLATFORM_MAX_BODY_BYTES = Math.floor(4.5 * 1024 * 1024)

/**
 * Max decoded image size. Base64 expands ~4/3 and JSON adds scaffolding,
 * so 5 MB images cannot fit in a 4.5 MB serverless payload.
 */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024
export const MAX_TEXT_CHARS = 10_000
export const MAX_MESSAGES = 1
export const MAX_BODY_BYTES = PLATFORM_MAX_BODY_BYTES
export const BODY_READ_TIMEOUT_MS = 15_000
export const MAX_JSON_DEPTH = 32
export const RATE_LIMIT_REQUESTS = 15
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000

export const ALLOWED_IMAGE_MIME_REGEX = /^image\/(jpeg|jpg|png|webp|gif)$/i
export const ALLOWED_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif"

export function normalizeImageMime(mime: string): string {
  const base = mime.split(";", 1)[0].trim().toLowerCase()
  return base === "image/jpg" ? "image/jpeg" : base
}

export function isAllowedImageMime(mime: string): boolean {
  return ALLOWED_IMAGE_MIME_REGEX.test(normalizeImageMime(mime))
}

/** Reject deeply nested JSON before parse (DoS guard; string-aware). */
export function exceedsMaxJsonDepth(raw: string, maxDepth: number): boolean {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (inString) {
      if (escaped) escaped = false
      else if (c === "\\") escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') {
      inString = true
      continue
    }
    if (c === "{" || c === "[") {
      depth++
      if (depth > maxDepth) return true
    } else if (c === "}" || c === "]") {
      depth--
    }
  }
  return false
}

export function estimateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1]
  if (!base64) return 0
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - padding
}

/** Upper-bound serialized /api/solve JSON body (text + optional image data URL). */
export function estimateSolveRequestBodyBytes(
  assembledText: string,
  imageDataUrl?: string | null,
): number {
  const parts: Array<
    | { type: "text"; text: string }
    | { type: "file"; mediaType: string; url: string }
  > = [{ type: "text", text: assembledText }]
  if (imageDataUrl) {
    const mimeMatch = imageDataUrl.match(/^data:(image\/[^;]+);base64,/)
    const mediaType = mimeMatch ? normalizeImageMime(mimeMatch[1]) : "image/jpeg"
    parts.push({ type: "file", mediaType, url: imageDataUrl })
  }
  // Match useChat payload shape; JSON.stringify accounts for escape overhead.
  const body = {
    id: "00000000-0000-0000-0000-000000000000",
    messages: [
      {
        role: "user",
        id: "00000000-0000-0000-0000-000000000000",
        parts,
      },
    ],
  }
  return new TextEncoder().encode(JSON.stringify(body)).length
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

/** Full base64 decode (Node Buffer on server, atob on client). Returns null on failure or oversize. */
export function decodeImageDataUrlBytes(dataUrl: string): Uint8Array | null {
  const comma = dataUrl.indexOf(",")
  if (comma === -1) return null
  const base64 = dataUrl.slice(comma + 1)
  if (!base64) return null
  try {
    if (typeof Buffer !== "undefined") {
      const buf = Buffer.from(base64, "base64")
      if (buf.length > MAX_IMAGE_BYTES) return null
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
    }
    const binary = atob(base64)
    if (binary.length > MAX_IMAGE_BYTES) return null
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

/** Cheap base64 integrity probe — decodes head/mid/tail samples (not full image). */
export function hasValidBase64Sample(base64: string): boolean {
  if (!base64) return false
  const head = base64.slice(0, 64)
  const tail = base64.length > 64 ? base64.slice(-64) : ""
  const midStart = Math.max(0, Math.floor(base64.length / 2) - 32)
  const mid =
    base64.length > 128 ? base64.slice(midStart, midStart + 64) : ""
  const samples = mid ? [head, mid, tail] : tail ? [head, tail] : [head]
  for (const sample of samples) {
    const padded = sample + "=".repeat((4 - (sample.length % 4)) % 4)
    try {
      atob(padded)
    } catch {
      return false
    }
  }
  return true
}

/** Sniff image MIME from a data URL (client-safe; decodes only magic-byte prefix). */
export function sniffImageMimeFromDataUrl(dataUrl: string): string | null {
  const comma = dataUrl.indexOf(",")
  if (comma === -1) return null
  const base64 = dataUrl.slice(comma + 1)
  if (!base64) return null
  // 16 bytes of magic fit in ~24 base64 chars — avoid full-image atob on main thread.
  const prefix = base64.slice(0, 24)
  const padded = prefix + "=".repeat((4 - (prefix.length % 4)) % 4)
  try {
    const binary = atob(padded)
    const len = Math.min(binary.length, 16)
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i)
    return sniffImageMimeFromBytes(bytes)
  } catch {
    return null
  }
}
