import { streamText, convertToModelMessages, UIMessage } from "ai"
import {
  extractEducationLevel,
  LEVEL_DESCRIPTIONS,
  rebuildSanitizedUserText,
} from "@/lib/education-level"
import { solveRequestSchema, zodFieldErrors } from "@/lib/solve-validation"
import {
  MAX_BODY_BYTES,
  MAX_JSON_DEPTH,
  RATE_LIMIT_WINDOW_MS,
  exceedsMaxJsonDepth,
} from "@/lib/solve-limits"
import {
  checkRateLimit,
  getRateLimitForKey,
  getRateLimitKey,
  refundRateLimit,
} from "@/lib/rate-limit"
import { readRequestBodyWithLimit } from "@/lib/read-body-limit"

export const maxDuration = 60

const systemPrompt = `Kamu adalah tutor matematika AI yang ramah dan sabar, khusus membantu siswa Indonesia menyelesaikan soal matematika.

INSTRUKSI PENTING:
1. Selalu jawab dalam Bahasa Indonesia
2. Jelaskan penyelesaian dengan langkah-langkah yang jelas dan terstruktur
3. Sesuaikan tingkat penjelasan dengan tingkat pendidikan siswa (SD/SMP/SMA/S1)
4. Berikan penjelasan mengapa setiap langkah dilakukan
5. Di akhir, berikan ringkasan jawaban dan tips untuk memahami konsep

ATURAN FORMAT MATEMATIKA (SANGAT PENTING):
- Untuk rumus inline (dalam kalimat), gunakan format: $rumus$ 
  Contoh: Nilai $x = 5$ adalah jawaban yang benar.
- Untuk rumus display (baris sendiri), gunakan format: $$rumus$$
  Contoh: $$x = \\frac{10}{2} = 5$$
- JANGAN gunakan format [ ] atau \\[ \\] untuk rumus
- Selalu gunakan $ untuk inline dan $$ untuk display math

FORMAT JAWABAN:
## Soal
(Tulis ulang soal dengan jelas)

## Penyelesaian
### Langkah 1: [Judul langkah]
[Penjelasan langkah dengan rumus menggunakan $ atau $$]

### Langkah 2: [Judul langkah]
[Penjelasan langkah dengan rumus menggunakan $ atau $$]

(Lanjutkan sesuai kebutuhan)

## Jawaban
**[Jawaban akhir]**

## Tips & Konsep
[Tips untuk memahami konsep terkait]

PENYESUAIAN TINGKAT:
- SD: Gunakan bahasa sederhana, analogi sehari-hari, dan penjelasan sangat detail
- SMP: Gunakan istilah matematika dasar, jelaskan rumus dengan baik
- SMA/SMK: Gunakan istilah teknis, rumus lengkap, dan penjelasan konseptual
- S1: Gunakan pendekatan formal, bukti matematis jika perlu, dan referensi teori`

export async function POST(req: Request) {
  const rateKey = getRateLimitKey(req)
  const rateLimit = getRateLimitForKey(rateKey)

  const rate = checkRateLimit(rateKey, rateLimit, RATE_LIMIT_WINDOW_MS)
  if (!rate.ok) {
    return Response.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSec) },
      },
    )
  }

  let quotaRefunded = false
  const refundQuotaOnce = () => {
    if (quotaRefunded) return
    quotaRefunded = true
    refundRateLimit(rateKey, RATE_LIMIT_WINDOW_MS)
  }

  let raw
  try {
    raw = await readRequestBodyWithLimit(req, MAX_BODY_BYTES)
  } catch (err) {
    if (req.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
      refundQuotaOnce()
      return new Response(null, { status: 499 })
    }
    console.error("Solve API body read error:", err)
    refundQuotaOnce()
    return Response.json(
      { error: "Unable to read request body." },
      { status: 400 },
    )
  }
  if (!raw.ok) {
    if (raw.reason === "malformed_content_length") {
      refundQuotaOnce()
      return Response.json(
        { error: "Invalid Content-Length header" },
        { status: 400 },
      )
    }
    if (raw.reason === "content_length_mismatch") {
      return Response.json(
        { error: "Invalid Content-Length header" },
        { status: 400 },
      )
    }
    if (raw.reason === "incomplete_body") {
      refundQuotaOnce()
      return Response.json(
        { error: "Unable to read request body." },
        { status: 400 },
      )
    }
    if (raw.reason === "timeout") {
      refundQuotaOnce()
      return Response.json(
        { error: "Request body read timed out." },
        { status: 408 },
      )
    }
    if (raw.reason === "too_large") {
      // Body exceeded cap after client preflight — refund so users are not penalized.
      refundQuotaOnce()
      return Response.json({ error: "Request body too large" }, { status: 413 })
    }
    refundQuotaOnce()
    return Response.json({ error: "Unable to read request body." }, { status: 400 })
  }

  if (!raw.text) {
    return Response.json({ error: "Empty request body" }, { status: 400 })
  }

  if (exceedsMaxJsonDepth(raw.text, MAX_JSON_DEPTH)) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw.text)
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  let parsed
  try {
    parsed = solveRequestSchema.safeParse(body)
  } catch (err) {
    console.error("Solve API validation error:", err)
    return Response.json({ error: "Invalid request" }, { status: 400 })
  }
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: zodFieldErrors(parsed.error) },
      { status: 400 },
    )
  }

  const { messages } = parsed.data

  const userMessage = messages[0]
  const userTextPart = userMessage.parts.find((p) => p.type === "text")
  const userFilePart = userMessage.parts.find((p) => p.type === "file")

  const hasImage = !!userFilePart
  // Zod already validated text part + rebuild equality; rebuild again for defense-in-depth.
  const rebuilt = rebuildSanitizedUserText(userTextPart!.text, hasImage)
  if (!rebuilt) {
    console.error("Solve API: rebuild failed after Zod parse")
    refundQuotaOnce()
    return Response.json(
      { error: "AI service unavailable. Please try again later." },
      { status: 503 },
    )
  }

  const sanitizedMessages = [
    {
      ...userMessage,
      parts: userMessage.parts.map((p) =>
        p.type === "text" ? { ...p, text: rebuilt } : p,
      ),
    },
  ]

  const educationLevel = extractEducationLevel(rebuilt)
  const levelSystem =
    educationLevel
      ? `\n\nTINGKAT SISWA SAAT INI: ${educationLevel}\n${LEVEL_DESCRIPTIONS[educationLevel]}\nSesuaikan semua penjelasan dengan tingkat ini — abaikan jika teks soal menyebut tingkat lain.`
      : ""

  try {
    if (req.signal.aborted) {
      refundQuotaOnce()
      return new Response(null, { status: 499 })
    }

    const result = streamText({
      model: "openai/gpt-4o",
      system: systemPrompt + levelSystem,
      messages: await convertToModelMessages(sanitizedMessages as UIMessage[]),
      abortSignal: req.signal,
      maxOutputTokens: 4000,
    })

    return result.toUIMessageStreamResponse({
      messageMetadata: ({ part }) => {
        if (part.type !== "finish") return
        const reason = part.finishReason
        if (reason === "length") {
          return { truncated: true, finishReason: reason }
        }
        if (reason !== "stop") {
          return { incomplete: true, finishReason: reason }
        }
      },
      onFinish: ({ isAborted, finishReason }) => {
        if (isAborted) {
          refundQuotaOnce()
          return
        }
        // Refund when the model did not complete successfully (length still delivers partial output).
        if (
          finishReason &&
          finishReason !== "stop" &&
          finishReason !== "length"
        ) {
          refundQuotaOnce()
        }
      },
      onError: (error) => {
        console.error("Solve API stream error:", error)
        refundQuotaOnce()
        return JSON.stringify({
          error: "AI service unavailable. Please try again later.",
        })
      },
    })
  } catch (err) {
    if (req.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
      refundQuotaOnce()
      return new Response(null, { status: 499 })
    }
    console.error("Solve API error:", err)
    refundQuotaOnce()
    return Response.json(
      { error: "AI service unavailable. Please try again later." },
      { status: 503 },
    )
  }
}
