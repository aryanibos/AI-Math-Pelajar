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
  const chunks: Uint8Array[] = []
  let total = 0
  const deadline = Date.now() + timeoutMs

  function throwIfAborted() {
    if (!signal?.aborted) return
    const err = new DOMException("Aborted", "AbortError")
    throw signal.reason instanceof Error ? signal.reason : err
  }

  function throwIfTimedOut() {
    if (Date.now() <= deadline) return
    const err = new DOMException("Body read timeout", "TimeoutError")
    throw err
  }

  try {
    while (true) {
      throwIfAborted()
      throwIfTimedOut()
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return { ok: false, reason: "too_large" }
      }
      chunks.push(value)
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

  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }

  return { ok: true, text: new TextDecoder().decode(merged) }
}
