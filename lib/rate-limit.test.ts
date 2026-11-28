import { describe, it, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"
import {
  UNVERIFIED_RATE_LIMIT_KEY,
  checkRateLimit,
  getClientIp,
  getRateLimitForKey,
  getRateLimitKey,
  refundRateLimit,
} from "./rate-limit.ts"
import {
  RATE_LIMIT_REQUESTS,
  RATE_LIMIT_UNVERIFIED_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
} from "./solve-limits.ts"

const WINDOW_MS = 60_000

function uniqueKey(label: string): string {
  return `test:${label}:${Date.now()}:${Math.random()}`
}

describe("checkRateLimit", () => {
  it("allows requests under the per-key limit", () => {
    const key = uniqueKey("under-limit")
    const limit = 3
    assert.deepEqual(checkRateLimit(key, limit, WINDOW_MS), { ok: true })
    assert.deepEqual(checkRateLimit(key, limit, WINDOW_MS), { ok: true })
    assert.deepEqual(checkRateLimit(key, limit, WINDOW_MS), { ok: true })
    const blocked = checkRateLimit(key, limit, WINDOW_MS)
    assert.equal(blocked.ok, false)
    if (!blocked.ok) {
      assert.equal(blocked.reason, "rate_limited")
      assert.ok(blocked.retryAfterSec > 0)
    }
  })
})

describe("refundRateLimit", () => {
  it("refunds a charged request within the active window", () => {
    const key = uniqueKey("refund-once")
    const limit = 2
    assert.deepEqual(checkRateLimit(key, limit, WINDOW_MS), { ok: true })
    assert.deepEqual(checkRateLimit(key, limit, WINDOW_MS), { ok: true })
    const blocked = checkRateLimit(key, limit, WINDOW_MS)
    assert.equal(blocked.ok, false)

    refundRateLimit(key, WINDOW_MS)
    assert.deepEqual(checkRateLimit(key, limit, WINDOW_MS), { ok: true })
  })

  it("caps refunds at MAX_REFUNDS_PER_WINDOW per key", () => {
    const key = uniqueKey("refund-cap")
    const limit = 2

    for (let i = 0; i < 3; i++) {
      assert.deepEqual(checkRateLimit(key, limit, WINDOW_MS), { ok: true })
      refundRateLimit(key, WINDOW_MS)
    }

    assert.deepEqual(checkRateLimit(key, limit, WINDOW_MS), { ok: true })
    refundRateLimit(key, WINDOW_MS)

    assert.deepEqual(checkRateLimit(key, limit, WINDOW_MS), { ok: true })
    const blocked = checkRateLimit(key, limit, WINDOW_MS)
    assert.equal(blocked.ok, false)
    if (!blocked.ok) assert.equal(blocked.reason, "rate_limited")

    refundRateLimit(key, WINDOW_MS)
    const stillBlocked = checkRateLimit(key, limit, WINDOW_MS)
    assert.equal(stillBlocked.ok, false)
  })
})

describe("getRateLimitKey", () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
    delete process.env.VERCEL
    delete process.env.TRUST_PROXY_HEADERS
  })

  afterEach(() => {
    process.env = env
  })

  it("uses dev bucket outside production when IP is unknown", () => {
    process.env.NODE_ENV = "development"
    const req = new Request("https://example.com/api/solve", { method: "POST" })
    assert.equal(getRateLimitKey(req), "solve:dev")
  })

  it("uses shared unverified bucket in production without verifiable IP", () => {
    process.env.NODE_ENV = "production"
    const req = new Request("https://example.com/api/solve", { method: "POST" })
    assert.equal(getRateLimitKey(req), UNVERIFIED_RATE_LIMIT_KEY)
  })

  it("uses Vercel forwarded IP when VERCEL=1", () => {
    process.env.NODE_ENV = "production"
    process.env.VERCEL = "1"
    const req = new Request("https://example.com/api/solve", {
      method: "POST",
      headers: {
        "x-vercel-forwarded-for": "203.0.113.7, 198.51.100.2",
      },
    })
    assert.equal(getRateLimitKey(req), "solve:203.0.113.7")
  })
})

describe("getClientIp", () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
    delete process.env.VERCEL
    delete process.env.TRUST_PROXY_HEADERS
  })

  afterEach(() => {
    process.env = env
  })

  it("normalizes IPv4-mapped IPv6 from x-vercel-forwarded-for", () => {
    process.env.VERCEL = "1"
    const req = new Request("https://example.com/api/solve", {
      method: "POST",
      headers: {
        "x-vercel-forwarded-for": "::ffff:192.0.2.1",
      },
    })
    assert.equal(getClientIp(req), "192.0.2.1")
  })
})

describe("getRateLimitForKey", () => {
  it("applies stricter limit for the unverified shared bucket", () => {
    assert.equal(
      getRateLimitForKey(UNVERIFIED_RATE_LIMIT_KEY),
      RATE_LIMIT_UNVERIFIED_REQUESTS,
    )
    assert.equal(getRateLimitForKey("solve:203.0.113.7"), RATE_LIMIT_REQUESTS)
  })
})