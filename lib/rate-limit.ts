type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 500

/** Simple in-memory fixed-window rate limiter (per server instance). */
function pruneExpiredBuckets(now: number) {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key)
  }
}

/** Free one slot for a new bucket; returns false when at cap (new keys get 429). */
function ensureBucketCapacity(now: number): boolean {
  pruneExpiredBuckets(now)
  return buckets.size < MAX_BUCKETS
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
    if (!ensureBucketCapacity(now)) {
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

/** Undo one quota charge on client abort during body read only — not after validation, on 4xx, or mid-stream abort. */
export function refundRateLimit(key: string): void {
  const bucket = buckets.get(key)
  if (!bucket || bucket.count <= 0) return
  bucket.count -= 1
}

export function getClientIp(req: Request): string | null {
  const trustProxy =
    process.env.VERCEL === "1" || process.env.TRUST_PROXY_HEADERS === "1"

  if (!trustProxy) return null

  // Vercel-only header — do not fall back to x-forwarded-for (client-spoofable).
  if (process.env.VERCEL === "1") {
    const vercelIp = req.headers.get("x-vercel-forwarded-for")?.trim()
    if (vercelIp) return vercelIp.split(",")[0]?.trim() || null
    return null
  }

  // TRUST_PROXY_HEADERS: prefer XFF first hop (proxy-appended), then x-real-ip.
  if (process.env.TRUST_PROXY_HEADERS === "1") {
    const forwarded = req.headers.get("x-forwarded-for")?.trim()
    if (forwarded) return forwarded.split(",")[0]?.trim() || null
    const realIp = req.headers.get("x-real-ip")?.trim()
    if (realIp) return realIp
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
