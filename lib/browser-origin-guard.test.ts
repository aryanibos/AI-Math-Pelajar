import { describe, it, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"
import { rejectCrossOriginBrowserPost } from "./browser-origin-guard.ts"

function jsonResponder(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, init)
}

function post(
  url: string,
  headers: Record<string, string>,
): Request {
  return new Request(url, { method: "POST", headers })
}

describe("rejectCrossOriginBrowserPost", () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
    delete process.env.VERCEL
    delete process.env.TRUST_PROXY_HEADERS
    delete process.env.ALLOW_SOLVE_WITHOUT_ORIGIN
  })

  afterEach(() => {
    process.env = env
  })

  it("allows same-origin POST when Origin matches Host", () => {
    const req = post("https://app.example/api/solve", {
      Origin: "https://app.example",
      Host: "app.example",
    })
    assert.equal(rejectCrossOriginBrowserPost(req, jsonResponder), null)
  })

  it("allows POST without Origin in non-production", () => {
    process.env.NODE_ENV = "development"
    const req = post("https://app.example/api/solve", {
      Host: "app.example",
    })
    assert.equal(rejectCrossOriginBrowserPost(req, jsonResponder), null)
  })

  it("rejects POST without Origin in production", () => {
    process.env.NODE_ENV = "production"
    const req = post("https://app.example/api/solve", {
      Host: "app.example",
    })
    const res = rejectCrossOriginBrowserPost(req, jsonResponder)
    assert.ok(res)
    assert.equal(res.status, 403)
  })

  it("allows POST without Origin in production when ALLOW_SOLVE_WITHOUT_ORIGIN=1", () => {
    process.env.NODE_ENV = "production"
    process.env.ALLOW_SOLVE_WITHOUT_ORIGIN = "1"
    const req = post("https://app.example/api/solve", {
      Host: "app.example",
    })
    assert.equal(rejectCrossOriginBrowserPost(req, jsonResponder), null)
  })

  it("rejects cross-origin browser POST", () => {
    const req = post("https://app.example/api/solve", {
      Origin: "https://evil.example",
      Host: "app.example",
    })
    const res = rejectCrossOriginBrowserPost(req, jsonResponder)
    assert.ok(res)
    assert.equal(res.status, 403)
  })

  it("rejects when Origin is present but Host is missing", () => {
    const req = post("https://app.example/api/solve", {
      Origin: "https://app.example",
    })
    const res = rejectCrossOriginBrowserPost(req, jsonResponder)
    assert.ok(res)
    assert.equal(res.status, 403)
  })

  it("normalizes default HTTPS port on Host", () => {
    const req = post("https://app.example/api/solve", {
      Origin: "https://app.example",
      Host: "app.example:443",
    })
    assert.equal(rejectCrossOriginBrowserPost(req, jsonResponder), null)
  })

  it("ignores spoofable x-forwarded-host when not on Vercel", () => {
    const req = post("https://app.example/api/solve", {
      Origin: "https://app.example",
      Host: "app.example",
      "x-forwarded-host": "evil.example",
    })
    assert.equal(rejectCrossOriginBrowserPost(req, jsonResponder), null)
  })

  it("falls back to Host when x-forwarded-host is empty on Vercel", () => {
    process.env.VERCEL = "1"
    const req = post("https://app.example/api/solve", {
      Origin: "https://app.example",
      Host: "app.example",
      "x-forwarded-host": " , ",
    })
    assert.equal(rejectCrossOriginBrowserPost(req, jsonResponder), null)
  })

  it("uses x-forwarded-host on Vercel when present", () => {
    process.env.VERCEL = "1"
    const req = post("https://app.example/api/solve", {
      Origin: "https://app.example",
      Host: "wrong.internal",
      "x-forwarded-host": "app.example",
    })
    assert.equal(rejectCrossOriginBrowserPost(req, jsonResponder), null)
  })
})