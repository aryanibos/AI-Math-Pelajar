import { streamText, convertToModelMessages, UIMessage } from "ai"
import { solveRequestSchema } from "@/lib/solve-validation"
import {
  MAX_BODY_BYTES,
  RATE_LIMIT_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
} from "@/lib/solve-limits"
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit"
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
  const raw = await readRequestBodyWithLimit(req, MAX_BODY_BYTES)
  if (!raw.ok) {
    if (raw.reason === "invalid_content_length") {
      return Response.json(
        { error: "Invalid Content-Length header" },
        { status: 400 },
      )
    }
    return Response.json({ error: "Request body too large" }, { status: 413 })
  }

  if (!raw.text) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw.text)
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = solveRequestSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const rateKey = getRateLimitKey(req)
  if (!rateKey) {
    return Response.json(
      { error: "Unable to verify client." },
      { status: 400 },
    )
  }

  const rate = checkRateLimit(rateKey, RATE_LIMIT_REQUESTS, RATE_LIMIT_WINDOW_MS)
  if (!rate.ok) {
    return Response.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSec) },
      },
    )
  }

  const { messages } = parsed.data

  try {
    const result = streamText({
      model: "openai/gpt-4o",
      system: systemPrompt,
      messages: await convertToModelMessages(messages as UIMessage[]),
      abortSignal: req.signal,
      maxOutputTokens: 4000,
    })

    return result.toUIMessageStreamResponse({
      messageMetadata: ({ part }) => {
        if (part.type === "finish" && part.finishReason === "length") {
          return { truncated: true }
        }
      },
      onError: (error) => {
        console.error("Solve API stream error:", error)
        return JSON.stringify({
          error: "AI service unavailable. Please try again later.",
        })
      },
    })
  } catch (err) {
    console.error("Solve API error:", err)
    return Response.json(
      { error: "AI service unavailable. Please try again later." },
      { status: 503 },
    )
  }
}
