/**
 * Read a request body up to maxBytes without buffering excess data.
 * Rejects oversized bodies even when Content-Length is missing or wrong.
 */
export async function readRequestBodyWithLimit(
  req: Request,
  maxBytes: number,
): Promise<{ ok: true; text: string } | { ok: false }> {
  const declaredRaw = req.headers.get("content-length")
  if (declaredRaw != null) {
    const declared = Number(declaredRaw)
    if (!Number.isFinite(declared) || declared < 0) return { ok: false }
    if (declared > maxBytes) return { ok: false }
  }

  const body = req.body
  if (!body) return { ok: true, text: "" }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return { ok: false }
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }

  return { ok: true, text: new TextDecoder().decode(merged) }
}
