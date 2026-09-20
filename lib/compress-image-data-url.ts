import { MAX_IMAGE_BYTES, estimateDataUrlBytes } from "@/lib/solve-limits"

const MAX_EDGE_STEPS = [1600, 1200, 960, 720, 480, 360, 320] as const

/**
 * Downscale + JPEG re-encode until the data URL fits maxBytes (same policy as camera capture).
 */
export function compressCanvasToJpegDataUrl(
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
  srcWidth: number,
  srcHeight: number,
  maxBytes: number = MAX_IMAGE_BYTES,
): string | null {
  if (srcWidth <= 0 || srcHeight <= 0) return null

  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) return null

  let imageData = ""

  outer: for (const maxEdge of MAX_EDGE_STEPS) {
    let width = srcWidth
    let height = srcHeight
    if (width > maxEdge || height > maxEdge) {
      const scale = maxEdge / Math.max(width, height)
      width = Math.round(width * scale)
      height = Math.round(height * scale)
    }

    canvas.width = width
    canvas.height = height
    draw(ctx, width, height)

    for (let quality = 0.9; quality >= 0.3; quality -= 0.1) {
      try {
        imageData = canvas.toDataURL("image/jpeg", quality)
      } catch {
        imageData = ""
        break
      }
      if (estimateDataUrlBytes(imageData) <= maxBytes) break outer
    }
  }

  if (
    !imageData ||
    estimateDataUrlBytes(imageData) === 0 ||
    estimateDataUrlBytes(imageData) > maxBytes
  ) {
    return null
  }

  return imageData
}
