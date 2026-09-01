type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 500

/** Simple in-memory fixed-window rate limiter (per server instance). */
function pruneExpiredBuckets(now: number) {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key)
  }
}

function pruneToMaxBuckets(now: number) {
  if (buckets.size <= MAX_BUCKETS) return
  pruneExpiredBuckets(now)
}

function oldestActiveResetAt(now: number): number {
  let oldest = Number.POSITIVE_INFINITY
  for (const bucket of buckets.values()) {
    if (now < bucket.resetAt && bucket.resetAt < oldest) {
      oldest = bucket.resetAt
    }
  }
  return oldest === Number.POSITIVE_INFINITY ? now + 60_000 : oldest
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now()
  pruneExpiredBuckets(now)
  const bucket = buckets.get(key)

  if (!bucket || now >= bucket.resetAt) {
    pruneToMaxBuckets(now)
    if (buckets.size >= MAX_BUCKETS) {
      return {
        ok: false,
        retryAfterSec: Math.ceil((oldestActiveResetAt(now) - now) / 1000),
      }
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true }
  }

  if (bucket.count >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) }
  }

  bucket.count += 1
  return { ok: true }
}

export function getClientIp(req: Request): string | null {
  // Trust platform-set headers only (not client-spoofable X-Forwarded-For).
  const realIp = req.headers.get("x-real-ip")?.trim()
  if (realIp) return realIp

  // Vercel-only headers — trusting these off-platform lets clients spoof IPs and bypass rate limits.
  if (process.env.VERCEL === "1") {
    const vercelIp = req.headers.get("x-vercel-forwarded-for")?.trim()
    if (vercelIp) return vercelIp.split(",")[0]?.trim() || null

    const forwarded = req.headers.get("x-forwarded-for")?.trim()
    if (forwarded) return forwarded.split(",")[0]?.trim() || null
  }

  return null
}

/** Rate-limit bucket key; null in production when client IP cannot be verified. */
export function getRateLimitKey(req: Request): string | null {
  const ip = getClientIp(req)
  if (ip) return `solve:${ip}`
  if (process.env.NODE_ENV !== "production") return "solve:dev"
  return null
}
