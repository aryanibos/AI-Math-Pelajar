import { z } from "zod"
import {
  buildContextPrefix,
  containsForbiddenSoalMarkers,
  extractEducationLevel,
  extractRawUserDisplayText,
  IMAGE_SOLVE_PROMPT,
  rebuildSanitizedUserText,
  SOAL_SEPARATOR,
} from "./education-level"
import {
  ALLOWED_IMAGE_MIME_REGEX,
  decodeImageDataUrlBytes,
  estimateDataUrlBytes,
  hasValidBase64Sample,
  MAX_IMAGE_BYTES,
  MAX_MESSAGES,
  MAX_TEXT_CHARS,
  normalizeImageMime,
  sniffImageMimeFromBytes,
  sniffImageMimeFromDataUrl,
} from "./solve-limits"

const DATA_URL_IMAGE_RE =
  /^data:image\/(jpeg|jpg|png|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/i

/** Shared client/server image data URL validation (strict shape + sniff). */
export function isValidImageDataUrl(url: string): boolean {
  if (!DATA_URL_IMAGE_RE.test(url)) return false
  if (estimateDataUrlBytes(url) > MAX_IMAGE_BYTES) return false

  const declared = url.match(/^data:(image\/[^;]+)/i)?.[1]
  const sniffed = sniffImageMimeFromDataUrl(url)
  if (!declared || !sniffed) return false
  if (normalizeImageMime(declared) !== sniffed) return false

  const base64 = url.slice(url.indexOf(",") + 1)
  if (!hasValidBase64Sample(base64)) return false

  // Server: full decode — rejects truncated/corrupt payloads that pass sampling.
  if (typeof window === "undefined") {
    const bytes = decodeImageDataUrlBytes(url)
    if (!bytes) return false
    if (bytes.length !== estimateDataUrlBytes(url)) return false
    const resniff = sniffImageMimeFromBytes(bytes)
    if (!resniff || normalizeImageMime(resniff) !== normalizeImageMime(declared)) {
      return false
    }
  }

  return true
}

const dataUrlImageSchema = z
  .string()
  .regex(DATA_URL_IMAGE_RE, "Invalid image data URL")
  .refine((url) => isValidImageDataUrl(url), {
    message: "Invalid image data URL",
  })
  .refine((url) => estimateDataUrlBytes(url) <= MAX_IMAGE_BYTES, {
    message: `Image must be at most ${MAX_IMAGE_BYTES / (1024 * 1024)}MB`,
  })

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
}

const textPartSchema = z.object({
  type: z.literal("text"),
  text: z
    .string()
    .transform((s) => normalizeLineEndings(s).trim())
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

/** Cheap structural checks before expensive image base64 decode. */
const rawPartLoose = z.object({ type: z.string() }).passthrough()

const messagePartsSchema = z
  .array(rawPartLoose)
  .min(1)
  .max(2)
  .superRefine((parts, ctx) => {
    const textParts = parts.filter((p) => p.type === "text")
    const fileParts = parts.filter((p) => p.type === "file")
    if (textParts.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exactly one text part required",
        path: [],
      })
    }
    if (fileParts.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At most one image allowed",
        path: [],
      })
    }
    if (parts.length === 2 && parts[0]?.type !== "text") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid request structure",
        path: [],
      })
    }
  })
  .pipe(z.array(messagePartSchema))

const uiMessageSchema = z
  .object({
    // Reject client-supplied assistant/system messages (prompt injection).
    role: z.literal("user"),
    parts: messagePartsSchema,
  })
  .superRefine((msg, ctx) => {
    const textParts = msg.parts.filter((p) => p.type === "text")
    const fileParts = msg.parts.filter((p) => p.type === "file")
    const textPart = textParts[0]
    if (textPart) {
      const hasImage = fileParts.length === 1
      const level = extractEducationLevel(textPart.text)
      if (!level || !textPart.text.startsWith(buildContextPrefix(level))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid request structure",
          path: ["parts"],
        })
      } else {
        const rawUserContent = extractRawUserDisplayText(textPart.text)
        if (containsForbiddenSoalMarkers(rawUserContent)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Invalid request structure",
            path: ["parts"],
          })
        } else {
          const soalIdx = textPart.text.indexOf(SOAL_SEPARATOR)
          if (
            !hasImage &&
            soalIdx !== -1 &&
            textPart.text
              .slice(soalIdx + SOAL_SEPARATOR.length)
              .startsWith(IMAGE_SOLVE_PROMPT)
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Invalid request structure",
              path: ["parts"],
            })
          } else {
            const sanitized = rebuildSanitizedUserText(textPart.text, hasImage)
            if (sanitized === null) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Teks soal wajib diisi.",
                path: ["parts"],
              })
            } else if (textPart.text !== sanitized) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Invalid request structure",
                path: ["parts"],
              })
            }
          }
        }
      }
    }
  })

export const solveRequestSchema = z.object({
  messages: z.array(uiMessageSchema).min(1).max(MAX_MESSAGES),
})

export type SolveRequest = z.infer<typeof solveRequestSchema>

/** Flatten Zod issues, including nested union branch errors, for API responses. */
export function zodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {}

  function collect(issues: z.ZodIssue[], prefix: (string | number)[] = []) {
    for (const issue of issues) {
      if (issue.code === "invalid_union" && issue.unionErrors) {
        // Report only the closest-matching branch — not every union arm.
        let best = issue.unionErrors[0]
        let bestCount = Number.POSITIVE_INFINITY
        for (const unionError of issue.unionErrors) {
          const count = unionError.issues.length
          if (count < bestCount) {
            bestCount = count
            best = unionError
          }
        }
        if (best) collect(best.issues, prefix)
        continue
      }
      const path = [...prefix, ...issue.path]
      const key = path.length > 0 ? path.join(".") : "messages"
      const messages = out[key] ?? []
      if (!messages.includes(issue.message)) {
        messages.push(issue.message)
      }
      out[key] = messages
    }
  }

  collect(error.issues)
  return out
}
