type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

/** Simple in-memory sliding-window rate limiter (per server instance). */
function pruneExpiredBuckets(now: number) {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key)
  }
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now()
  if (buckets.size > 500) pruneExpiredBuckets(now)
  const bucket = buckets.get(key)

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true }
  }

  if (bucket.count >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) }
  }

  bucket.count += 1
  return { ok: true }
}

export function getClientIp(req: Request): string {
  // Prefer platform-set x-real-ip (e.g. Vercel) over x-forwarded-for,
  // whose first hop can be spoofed by the client when not behind a trusted proxy.
  const realIp = req.headers.get("x-real-ip")?.trim()
  if (realIp) return realIp

  const forwarded = req.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown"

  return "unknown"
}
