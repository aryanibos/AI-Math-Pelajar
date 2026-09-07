import { BODY_READ_TIMEOUT_MS } from "@/lib/solve-limits"

/**
 * Read a request body up to maxBytes without buffering excess data.
 * Rejects oversized bodies even when Content-Length is missing or wrong.
 */
export type BodyReadFailureReason =
  | "invalid_content_length"
  | "too_large"
  | "timeout"

export async function readRequestBodyWithLimit(
  req: Request,
  maxBytes: number,
  timeoutMs = BODY_READ_TIMEOUT_MS,
): Promise<
  { ok: true; text: string } | { ok: false; reason: BodyReadFailureReason }
> {
  const declaredRaw = req.headers.get("content-length")
  if (declaredRaw != null) {
    const declared = Number(declaredRaw)
    if (!Number.isInteger(declared) || declared < 0) {
      return { ok: false, reason: "invalid_content_length" }
    }
    if (declared > maxBytes) return { ok: false, reason: "too_large" }
  }

  const body = req.body
  if (!body) {
    if (declaredRaw != null && Number(declaredRaw) > 0) {
      return { ok: false, reason: "invalid_content_length" }
    }
    return { ok: true, text: "" }
  }

  const reader = body.getReader()
  const signal = req.signal
  let buffer = new Uint8Array(Math.min(64 * 1024, maxBytes))
  let total = 0
  const deadline = Date.now() + timeoutMs

  function appendChunk(chunk: Uint8Array) {
    const nextTotal = total + chunk.byteLength
    if (nextTotal > buffer.byteLength) {
      const nextSize = Math.min(maxBytes, Math.max(buffer.byteLength * 2, nextTotal))
      const next = new Uint8Array(nextSize)
      next.set(buffer.subarray(0, total))
      buffer = next
    }
    buffer.set(chunk, total)
    total = nextTotal
  }

  async function readChunk(remainingMs: number) {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    let abortHandler: (() => void) | undefined

    const cleanup = () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
      if (abortHandler && signal) {
        signal.removeEventListener("abort", abortHandler)
      }
    }

    try {
      return await Promise.race([
        reader.read().then((result) => {
          cleanup()
          return result
        }),
        new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => {
          timeoutId = setTimeout(() => {
            cleanup()
            reader.cancel().catch(() => {})
            reject(new DOMException("Body read timeout", "TimeoutError"))
          }, remainingMs)

          if (!signal) return

          abortHandler = () => {
            cleanup()
            reader.cancel().catch(() => {})
            const err =
              signal.reason instanceof Error
                ? signal.reason
                : new DOMException("Aborted", "AbortError")
            reject(err)
          }
          if (signal.aborted) {
            abortHandler()
            return
          }
          signal.addEventListener("abort", abortHandler, { once: true })
        }),
      ])
    } catch (err) {
      cleanup()
      throw err
    }
  }

  try {
    while (true) {
      const remainingMs = deadline - Date.now()
      if (remainingMs <= 0) {
        await reader.cancel().catch(() => {})
        return { ok: false, reason: "timeout" }
      }
      const { done, value } = await readChunk(remainingMs)
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return { ok: false, reason: "too_large" }
      }
      appendChunk(value)
    }
  } catch (err) {
    await reader.cancel().catch(() => {})
    if (err instanceof Error && err.name === "TimeoutError") {
      return { ok: false, reason: "timeout" }
    }
    throw err
  } finally {
    reader.releaseLock()
  }

  if (declaredRaw != null) {
    const declared = Number(declaredRaw)
    if (total !== declared) {
      return { ok: false, reason: "invalid_content_length" }
    }
  }

  return { ok: true, text: new TextDecoder().decode(buffer.subarray(0, total)) }
}
