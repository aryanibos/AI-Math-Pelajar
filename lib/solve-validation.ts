import { z } from "zod"
import {
  ALLOWED_IMAGE_MIME_REGEX,
  estimateDataUrlBytes,
  MAX_IMAGE_BYTES,
  MAX_MESSAGES,
  MAX_TEXT_CHARS,
} from "./solve-limits"

const dataUrlImageSchema = z
  .string()
  .regex(/^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/i, "Invalid image data URL")
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
    mediaType: z.string().regex(ALLOWED_IMAGE_MIME_REGEX),
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

const uiMessageSchema = z
  .object({
    // Reject client-supplied assistant/system messages (prompt injection).
    role: z.literal("user"),
    parts: z.array(messagePartSchema).min(1).max(2),
  })
  .superRefine((msg, ctx) => {
    const textParts = msg.parts.filter((p) => p.type === "text")
    const fileParts = msg.parts.filter((p) => p.type === "file")
    if (textParts.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exactly one text part required",
        path: ["parts"],
      })
    }
    if (fileParts.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At most one image allowed",
        path: ["parts"],
      })
    }
  })

export const solveRequestSchema = z.object({
  messages: z.array(uiMessageSchema).min(1).max(MAX_MESSAGES),
})

export type SolveRequest = z.infer<typeof solveRequestSchema>
