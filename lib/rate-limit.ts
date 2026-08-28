type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 500

/** Simple in-memory fixed-window rate limiter (per server instance). */
function pruneExpiredBuckets(now: number) {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key)
  }
}

function enforceMaxBuckets(now: number) {
  if (buckets.size <= MAX_BUCKETS) return
  pruneExpiredBuckets(now)
  if (buckets.size <= MAX_BUCKETS) return
  // Drop only expired buckets — never evict active rate-limit counters.
  const expired = [...buckets.entries()]
    .filter(([, bucket]) => now >= bucket.resetAt)
    .sort((a, b) => a[1].resetAt - b[1].resetAt)
  for (const [key] of expired) {
    buckets.delete(key)
    if (buckets.size <= MAX_BUCKETS) return
  }
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
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    enforceMaxBuckets(now)
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
