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
  const forwardedHostRaw = trustProxy
    ? req.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
    : undefined
  // Empty XFH segment must not block fallback to `Host` (?? only skips null/undefined).
  const forwardedHost = forwardedHostRaw ? forwardedHostRaw : undefined
  const hostHeader = forwardedHost ?? req.headers.get("host")?.trim()
  // Browsers send Host on same-origin POSTs; Origin without Host cannot be verified.
  if (!hostHeader) {
    return respond({ error: "Invalid request" }, { status: 403 })
  }

  const isHttps = originUrl.protocol === "https:"
  const requestHost = canonicalRequestHost(hostHeader, isHttps)
  const normalizedOriginHost = canonicalRequestHost(originHost, isHttps)
  if (normalizedOriginHost.toLowerCase() !== requestHost.toLowerCase()) {
    return respond({ error: "Invalid request" }, { status: 403 })
  }
  return null
}