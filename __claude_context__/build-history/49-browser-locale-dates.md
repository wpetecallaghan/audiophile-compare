---
name: audiophile-compare-build-history-49
description: Build step 49 — format dates using the visiting browser's locale.
---

# ✅ 49 — Format dates using the visiting browser's locale

**The gap this closes:** every rendered date used a bare
`new Date(x).toLocaleDateString()` with no locale argument, in 6 places
across the app. With no explicit locale, that method uses the *executing
runtime's* default locale — for the 5 server-rendered spots
(`app/tests/[id]/page.tsx`, `app/tracks/[id]/page.tsx`,
`app/systems/[id]/page.tsx`, `app/systems/page.tsx`,
`components/feed/FeedCard.tsx`), that's the Vercel/Node server's locale,
never the visitor's browser, so every visitor saw the same format
regardless of where they were. `components/systems/SnapshotSection.tsx`
(the one `'use client'` component in the list) technically picked up the
browser's locale after hydration, but first painted with the server's
(wrong) locale — a real hydration text mismatch, band-aided with
`suppressHydrationWarning` and a comment calling it "cosmetic."

**Mechanism: read the `Accept-Language` request header, not
`navigator.language`.** Converting every date-rendering spot to a client
component would fight `components.md §1`'s "default to server" rule and
reintroduce the exact hydration-mismatch pattern already band-aided once.
`next/headers`'s `headers()` already exposes `Accept-Language` to Server
Components with no new dependency, and it's the one browser-supplied
signal a server can read without any client-side JS at all — a "browser
API" without needing `'use client'`.

**New:**
- `lib/dates/parse-accept-language.ts` — pure function, takes the first
  (highest-priority) language tag from the header (e.g.
  `'en-GB,en;q=0.9'` → `'en-GB'`; real browsers always list their
  configured locale first, so this skips full RFC 4647 quality-value
  sorting rather than add a weighting library for it). Validates the tag
  via `new Intl.DateTimeFormat(tag)` in a `try/catch` before returning it
  — `Accept-Language` is client-controlled input, and a malformed BCP 47
  tag throws a `RangeError` at render time, which would 500 the page.
  Falls back to `undefined` on any invalid/missing header —
  `.toLocaleDateString(undefined)` is exactly the prior implicit
  behavior, so that fallback path is a zero-regression no-op.
- `lib/dates/get-request-locale.ts` — thin `async` wrapper combining
  `headers()` + `parseAcceptLanguage`. No unit test (same convention as
  `lib/supabase/server.ts` — untestable without a request context,
  exercised via E2E instead).

**Threading convention:** the 4 standalone pages call `await
getRequestLocale()` directly. The 2 reusable render components
(`FeedCard`, `SnapshotSection`) take an optional `locale?: string` prop
instead — their parent page resolves the header once and passes it down,
rather than every row/instance re-resolving the same per-request value.
No formatting-style change anywhere: still `.toLocaleDateString(locale)`
with no options object, so the existing short numeric date style is
unchanged, only parameterized. Confirmed via Node/V8 ICU: `en-GB` →
`25/03/2024`, `en-US` → `3/25/2024`.

**`SnapshotSection`'s hydration mismatch is now actually fixed, not just
silenced** — `suppressHydrationWarning` and its comment were removed.
Passing `locale` as a prop resolved server-side from `Accept-Language`
makes the value identical on both the SSR pass and the client hydration
pass (it's baked into the same payload), so there's nothing left to
mismatch. `FeedCard`'s own (inert) `suppressHydrationWarning` was also
removed — it's a Server Component with no client-side re-render of its
own, so nothing was ever actually mismatching there.

**Files changed:** `app/tests/[id]/page.tsx`, `app/tracks/[id]/page.tsx`,
`app/systems/[id]/page.tsx` (also threads `locale` into its
`<SnapshotSection>` call), `app/systems/page.tsx`, `app/page.tsx` (threads
`locale` into each `<FeedCard>` call), `components/feed/FeedCard.tsx`,
`components/systems/SnapshotSection.tsx`. No schema/RLS/migration — pure
read-side formatting change, no new data.

**Tests:**
- `lib/dates/__tests__/parse-accept-language.test.ts` (new) — weighted
  header, single tag, missing header, empty string, wildcard, malformed
  tag.
- `components/systems/__tests__/SnapshotSection.test.tsx` — one new test
  passing `locale="en-GB"` and asserting `15/01/2024` renders from the
  existing `SNAPSHOT` fixture's `created_at`; `locale` stays optional so
  every pre-existing test is unaffected.
- `e2e/tests/date-formatting.spec.ts` (new) — the mechanism is identical
  at every call site, so this exercises it once, end-to-end, at the test
  detail page rather than repeating the same assertion everywhere it's
  wired in. Added `setTestCreatedAt` to `e2e/helpers/admin.ts` to force a
  deterministic `created_at` (day 25 — unambiguous regardless of what day
  the suite runs) after seeding, since Playwright's `locale` context
  option only controls *how* a date renders, not which date is seeded.
  Two tests, `test.use({ locale: 'en-GB' })` / `'en-US'` (this also sets
  the `Accept-Language` header Chromium sends, per Playwright's docs),
  asserting `25/03/2024` and `3/25/2024` respectively.

**Verified:**
- `npx vitest run lib/dates/__tests__/parse-accept-language.test.ts
  components/systems/__tests__/SnapshotSection.test.tsx` — 35/35 passing.
- `npx tsc --noEmit` — clean.
- `npm run test` — 40 files / 460 tests passing (up from 39/452 — the 8
  new tests above).
- `npx playwright test e2e/tests/date-formatting.spec.ts` — 2/2 passing
  against a local dev server.
- Full local E2E suite (`npx playwright test`) — 62/62 passing, no
  regressions.
