export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_TEXT_CHARS = 10_000
export const MAX_MESSAGES = 1
export const MAX_BODY_BYTES = 8 * 1024 * 1024
export const RATE_LIMIT_REQUESTS = 15
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000

export const ALLOWED_IMAGE_MIME_REGEX = /^image\/(jpeg|jpg|png|webp|gif)$/i
export const ALLOWED_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif"

export function isAllowedImageMime(mime: string): boolean {
  return ALLOWED_IMAGE_MIME_REGEX.test(mime)
}

export function estimateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1]
  if (!base64) return dataUrl.length
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - padding
}
