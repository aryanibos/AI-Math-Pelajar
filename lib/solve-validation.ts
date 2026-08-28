import { z } from "zod"
import {
  ALLOWED_IMAGE_MIME_REGEX,
  estimateDataUrlBytes,
  MAX_IMAGE_BYTES,
  MAX_MESSAGES,
  MAX_TEXT_CHARS,
  normalizeImageMime,
} from "./solve-limits"

const dataUrlImageSchema = z
  .string()
  .regex(/^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/i, "Invalid image data URL")
  .refine((url) => estimateDataUrlBytes(url) <= MAX_IMAGE_BYTES, {
    message: `Image must be at most ${MAX_IMAGE_BYTES / (1024 * 1024)}MB`,
  })

const textPartSchema = z.object({
  type: z.literal("text"),
  text: z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(1, { message: "Exactly one text part required" })
        .max(MAX_TEXT_CHARS, {
          message: `Teks soal maksimal ${MAX_TEXT_CHARS.toLocaleString("id-ID")} karakter.`,
        }),
    ),
})

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
  .transform((part) => ({
    ...part,
    mediaType: normalizeImageMime(part.mediaType),
  }))

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
