---
name: audiophile-compare-build-history-02
description: Build step 2 — Auth — Supabase Auth, middleware, magic link, callback route.
---

# ✅ 2 — Auth — Supabase Auth, middleware, magic link, callback route

`middleware.ts` refreshes session cookies on every request and protects
`/systems`, `/tracks`, `/profile`, `/tests/new`. `app/auth/callback/route.ts`
exchanges the code for a session and handles `?type=recovery` redirects (→ `/profile?reset=true`).

**`app/auth/confirm/route.ts`** (added in step 17) handles the `token_hash` +
`type` verification pattern instead of `code` — needed for any link issued via
the Admin API (`generateLink`), which can't carry a PKCE `code_verifier` since
there's no client-side `signInWithOtp` call to pair one with. Calls
`supabase.auth.verifyOtp({ token_hash, type })` server-side. E2E test auth uses
this route; it's also the correct target for any future admin/service-issued
email link (e.g. an ingestion-bot invite).
