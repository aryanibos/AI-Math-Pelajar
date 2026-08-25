export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_TEXT_CHARS = 10_000
export const MAX_MESSAGES = 10
export const MAX_BODY_BYTES = 8 * 1024 * 1024

export function estimateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1]
  if (!base64) return dataUrl.length
  return Math.ceil((base64.length * 3) / 4)
}
