/**
 * Reject browser cross-origin POSTs before rate-limiting (no quota charge).
 * Non-browser clients typically omit `Origin`.
 */
export function rejectCrossOriginBrowserPost(
  req: Request,
  respond: (body: unknown, init?: ResponseInit) => Response,
): Response | null {
  const origin = req.headers.get("origin")?.trim()
  if (!origin) return null

  let originHost: string
  try {
    originHost = new URL(origin).host.toLowerCase()
  } catch {
    return respond({ error: "Invalid request" }, { status: 403 })
  }

  const forwardedHost = req.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim()
  const hostHeader = forwardedHost ?? req.headers.get("host")?.trim()
  if (!hostHeader) return null

  if (originHost !== hostHeader.toLowerCase()) {
    return respond({ error: "Invalid request" }, { status: 403 })
  }
  return null
}