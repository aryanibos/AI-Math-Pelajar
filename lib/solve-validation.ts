import { z } from "zod"
import { estimateDataUrlBytes, MAX_IMAGE_BYTES, MAX_MESSAGES, MAX_TEXT_CHARS } from "./solve-limits"

const dataUrlImageSchema = z
  .string()
  .regex(/^data:image\/(jpeg|jpg|png|webp|gif);base64,[\w+/=]+$/i, "Invalid image data URL")
  .refine((url) => estimateDataUrlBytes(url) <= MAX_IMAGE_BYTES, {
    message: `Image must be at most ${MAX_IMAGE_BYTES / (1024 * 1024)}MB`,
  })

const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1).max(MAX_TEXT_CHARS),
})

function normalizeImageMime(mime: string): string {
  const lower = mime.toLowerCase()
  return lower === "image/jpg" ? "image/jpeg" : lower
}

const filePartSchema = z
  .object({
    type: z.literal("file"),
    mediaType: z
      .string()
      .regex(/^image\/(jpeg|jpg|png|webp|gif)$/i),
    url: dataUrlImageSchema,
  })
  .refine(
    (part) => {
      const fromUrl = part.url.match(/^data:(image\/[^;]+)/i)?.[1]
      if (!fromUrl) return false
      return normalizeImageMime(fromUrl) === normalizeImageMime(part.mediaType)
    },
    { message: "mediaType must match the image data URL" },
  )

const messagePartSchema = z.union([textPartSchema, filePartSchema])

const uiMessageSchema = z.object({
  // Reject client-supplied assistant/system messages (prompt injection).
  role: z.literal("user"),
  parts: z.array(messagePartSchema).min(1).max(20),
})

export const solveRequestSchema = z.object({
  messages: z.array(uiMessageSchema).min(1).max(MAX_MESSAGES),
})

export type SolveRequest = z.infer<typeof solveRequestSchema>
