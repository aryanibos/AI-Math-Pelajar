# MathGenius (AI Math Pelajar)

AI math tutor for Indonesian students — step-by-step solutions in Bahasa Indonesia, with SD/SMP/SMA/S1 level scaffolding and optional camera/image upload.

Stack: **Next.js 16**, **AI SDK v6**, OpenAI **GPT-4o** via `/api/solve`.

## Local development

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes (local / non-Vercel) | API key for the OpenAI provider used by the AI SDK (`openai/gpt-4o` in `app/api/solve/route.ts`). On Vercel, configure the key in the project dashboard. |
| `TRUST_PROXY_HEADERS` | Self-hosted only | Set to `1` when the app sits behind a trusted reverse proxy so rate limiting can use `X-Forwarded-For` / `X-Real-IP`. **Do not enable** on Vercel (use `x-vercel-forwarded-for` instead). |
| `VERCEL` | Set by Vercel | When `1`, client IP for rate limits comes from `x-vercel-forwarded-for` only. |

Rate limits (per server instance): **15** requests/hour per verified IP, **5** requests/hour for the shared unverified bucket when IP cannot be verified in production.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run lint` | ESLint |
| `npm run build` | Production build |
| `npm run check:main-commit-limit` | Count first-parent commits to `origin/main` for the current **Asia/Jakarta** day (max **5**/day). |

`npm ci` runs `prepare`, which sets `core.hooksPath` to `.githooks`. The **pre-push** hook runs the commit-limit check with the number of commits being pushed to `main`.

Cron / automation gate (stop when already at quota):

```bash
STOP_WHEN_AT_LIMIT=1 npm run check:main-commit-limit
```

Pre-push / merge projection (exit 1 only when push would exceed the cap):

```bash
PENDING_MAIN_COMMITS=1 npm run check:main-commit-limit
```

## Deployment

- **Vercel**: connect this repo, set `OPENAI_API_KEY`, deploy. Camera capture needs `Permissions-Policy: camera=(self)` (already set in `next.config.mjs`).
- **Self-hosted**: run `npm run build` && `npm start` behind a reverse proxy; set `TRUST_PROXY_HEADERS=1` only if the proxy strips/spoofs client IPs correctly.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs `npm ci`, `lint`, and `build` on push/PR to `main`.
