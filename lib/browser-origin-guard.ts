/** Strip default ports so `Host: app.example:443` matches `Origin: https://app.example`. */
function canonicalRequestHost(hostHeader: string, isHttps: boolean): string {
  const trimmed = hostHeader.trim()
  if (!trimmed) return ""
  try {
    return new URL(`${isHttps ? "https" : "http"}://${trimmed}`).host
  } catch {
    return trimmed.toLowerCase()
  }
}

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

  let originUrl: URL
  try {
    originUrl = new URL(origin)
  } catch {
    return respond({ error: "Invalid request" }, { status: 403 })
  }
  const originHost = originUrl.host

  const trustProxy =
    process.env.VERCEL === "1" || process.env.TRUST_PROXY_HEADERS === "1"
  const forwardedHost = trustProxy
    ? req.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
    : undefined
  const hostHeader = forwardedHost ?? req.headers.get("host")?.trim()
  if (!hostHeader) return null

  const requestHost = canonicalRequestHost(
    hostHeader,
    originUrl.protocol === "https:",
  )
  if (originHost.toLowerCase() !== requestHost.toLowerCase()) {
    return respond({ error: "Invalid request" }, { status: 403 })
  }
  return null
}