---
name: audiophile-compare-build-history-71
description: Build step 71 — Eliminate the page's redundant supabase.auth.getUser() call by forwarding the validated user via a middleware-set request header.
---

# ✅ 71 — Eliminate the page's redundant `getUser()` call

**The gap this closes:** `middleware.ts` already calls
`supabase.auth.getUser()` once per request — a real network round trip to
Supabase Auth (unlike `getSession()`, `getUser()` always revalidates the
JWT over the network rather than decoding the session cookie locally) —
to refresh the session and gate protected routes. `app/page.tsx` and
`app/tests/[id]/page.tsx` (both public, non-protected routes) then called
`supabase.auth.getUser()` **again**, a second Auth-server round trip
before either page's own DB query could even start. Investigated as part
of reviewing PageSpeed field data showing mobile TTFB (~1.7s) dominating
the LCP budget on both pages.

**The fix:** `middleware.ts` forwards the already-validated user's `id`/
`email` to the Server Component via request headers
(`x-user-id`/`x-user-email`), and both pages read those via a new
`getRequestUser()` helper (`lib/auth/get-request-user.ts`,
`components.md §17`) instead of calling `getUser()` a second time. On
`app/tests/[id]/page.tsx`, this also means the main `tests` select — no
longer needing `Promise.all([getUser(), select])` (step 69's pairing) —
goes out immediately on its own, one round trip earlier than before.

**Security, load-bearing:** `middleware.ts` **unconditionally** strips any
client-supplied `x-user-id`/`x-user-email` header before conditionally
re-setting them from the freshly-validated user — never conditionally
skipped, so a forged header can never survive through. Belt-and-braces:
even if it somehow did, this header only ever feeds UI-level branching
(`isCreator`, `canSeeSystemInfo`) — actual data access still goes through
the request's real Supabase session cookie, so RLS remains the real
authorization boundary regardless of this header's value. See
`components.md §17` for the full reasoning.

**A real bug found and fixed while implementing this:** the first version
rebuilt `supabaseResponse` a second time in `middleware.ts` *after*
`getUser()` resolved (to add the new headers), discarding whatever
`Set-Cookie` a session refresh had already applied to the earlier
response — would have silently broken session refresh. Fixed by deferring
cookie application (`applyCookies` closure, captured from `setAll`) until
after the final response — with the final headers — is built, so nothing
gets discarded regardless of whether a refresh happened.

**Files updated:**
- `lib/auth/get-request-user.ts` (**new**).
- `middleware.ts` — unconditional header strip/forward, restructured
  cookie application (see bug note above).
- `app/page.tsx`, `app/tests/[id]/page.tsx` — `getRequestUser()` instead
  of `supabase.auth.getUser()`.
- `e2e/tests/voting.spec.ts` — new "Header spoofing is rejected" test.
- Docs: `components.md §17` (new), this file, `build-history/index.md`,
  `core.md` (§6 bump).

**Tests:**
- No unit test for `getRequestUser()` itself — same established precedent
  as `lib/dates/get-request-locale.ts` (a thin `next/headers` wrapper,
  untestable in isolation outside a real Next.js request context).
- New e2e test (`voting.spec.ts`): an anonymous (no session cookie)
  viewer forges `x-user-id` to the real creator's id via
  `page.setExtraHTTPHeaders` and still doesn't see the creator-only
  Reveal control — proves the middleware's unconditional strip holds.
- Full existing suite re-run (`voting.spec.ts`, `public-feed.spec.ts`,
  `admin-clip-override.spec.ts`, `import-provenance.spec.ts`) — all
  pervasively depend on `isCreator`/`isAdmin`/user-presence branching.

**Verified:**
- `npx tsc --noEmit` — no new errors.
- `npm test` — 57 files / 571 tests, all passing.
- `npx playwright test e2e/tests/voting.spec.ts` — passing, including the
  new header-spoofing test.

**Repeat performance analysis:** deployed to staging (`Staging` branch),
measured with Lighthouse (mobile, simulated throttling) against
`https://audiophile-compare-git-staging-pete-callaghan.vercel.app`,
compared to the pre-step-71 baseline (`perf-baselines/00-before-*.json`
vs `perf-baselines/71-after-*.json`):

| Metric | Feed before → after | Test detail before → after |
|---|---|---|
| Performance score | 0.88 → 0.88 | 0.82 → 0.85 |
| LCP | 3.4s → 3.4s | 4.0s → 4.1s (noise) |
| FCP | 1.9s → 1.8s | 1.1s → 1.0s |
| TTFB (server-response-time) | 30ms → 30ms | 50ms → 30ms |
| LCP breakdown TTFB phase | 819ms → 807ms | 796ms → 666ms (**~130ms faster**) |
| Total Blocking Time | 50ms → 40ms | 50ms → 20ms |
| Speed Index | 4.3s → 4.2s | 5.3s → **3.9s** |

The ~130ms TTFB-phase improvement on the test-detail page is consistent
with removing one Auth-server round trip. Real, but small relative to the
dominant cost on both pages: LCP is overwhelmingly **Render Delay**
(2.6-3.4s, ~75-85% of LCP), not TTFB — the gap between "first byte
arrives" and "the real streamed content actually paints." That gap is far
larger than this app's own server-side data-fetching time (measured
locally at ~150-200ms against the same DB), which is exactly what steps
72 (Vercel/Supabase region alignment) and 73 (RPC consolidation) target
next — step 71 alone was never expected to move that dominant cost, only
the smaller TTFB slice, which it did.

**Separately found, not caused by step 71 — flagged, not investigated
further here:** `admin-clip-override.spec.ts`'s 3 admin-gated tests fail
against the deployed staging URL specifically (pass 4/4 locally). Confirmed
these were *already* failing against real staging before step 71 was ever
deployed (first e2e run this session, prior to any staging push, showed
the same 3 failures) — a pre-existing, environment-specific issue on the
staging deployment (`ADMIN_EMAILS` is configured there per `vercel env ls`,
so the exact cause is still open), unrelated to this step's code.
