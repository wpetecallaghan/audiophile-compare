---
name: audiophile-compare-build-history
description: >
  Historical build log for the audiophile A/B comparison app. Load this for
  orientation on how the project was built and why specific decisions were made.
  For deferred features (owned storage, mobile app, ingestion pipeline) see
  deferred-features.md. Not needed for routine coding tasks.
---

# Audiophile Compare — Build History 

---

## Build steps

### ✅ 1 — Supabase schema, RLS, seed data
Single migration file: `supabase/migrations/20260625094142_initial_schema.sql`.
Includes all tables, RLS policies, auth triggers (`on_auth_user_created`, `on_auth_user_email_updated`),
`test_vote_count` security-definer function, and technique seed data.

### ✅ 2 — Auth — Supabase Auth, middleware, magic link, callback route
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

### ✅ 3 — Clip URL verification — `POST /api/clips/verify`
`lib/clips/detect-provider.ts` — pure URL classification (no I/O).
`lib/clips/check-url.ts` — HEAD request for `direct` URLs.
`lib/clips/to-clip-data.ts` — converts verified URL into `ClipData` shape.

### ✅ 4 — MediaPlayer — YouTube / Vimeo / native / unknown
A/B coordination via `forwardRef` + `useImperativeHandle`. `ABPlayer` owns both refs and pauses the inactive clip when the other plays. All player components follow the `forwardRef` + `PlayerHandle` contract — see `components.md` §5.

### ✅ 5 — Test creation wizard (`CreateTestForm`)
Multi-step wizard: Track → Snapshots → Clips → Publish.
`systems` is fetched server-side and held in local `useState` so inline creations update the wizard UI without a page reload. Steps do **not** call `router.refresh()`.
- **Inline snapshot creation:** `StepSnapshots` calls `onSnapshotCreated(systemId, snap)`; `CreateTestForm` merges into local state and auto-selects the new snapshot.
- **Inline system creation:** `StepSnapshots` calls `onSystemCreated(system)`; `CreateTestForm` prepends to local state.

Tests: `components/tests/__tests__/StepSnapshots.test.tsx` (28 tests).

### ✅ 6 — Test detail page + blind playback
Server page (`app/tests/[id]/page.tsx`) fetches test data without `clip_mapping`.
`ABPlayer` renders both clips; tally section is hidden until viewer has voted or test is revealed.

### ✅ 7 — Voting
`POST /api/votes` (cast); `PATCH /api/votes/[id]` (update before reveal).
One vote per (user, test, technique) — `UNIQUE` constraint enforced at DB layer.

### ✅ 8 — Results by technique
`TallyDisplay` (server component). `computeTally()` in `lib/votes/compute-tally.ts` groups by technique, computes percentages, detects divergence between curated techniques.
`computeOutcome()` in `lib/votes/compute-outcome.ts` returns win/loss/draw/no-votes/open per snapshot.

### ✅ 9 — System catalogue
Tracks list, track detail, systems list, system detail with win/loss per snapshot, cross-check selector.
- **Inline snapshot on system detail:** `AddSnapshotForm` (client, owner-only) calls `router.refresh()` on success — contrast with wizard which uses local state.
- **Snapshot editing:** `SnapshotSection` (client-with-server-children pattern); `PATCH /api/systems/[id]/snapshots/[snapshotId]`.
- **System create/edit:** `CreateSystemForm` and `EditSystemForm`; pages `/systems/new` and `/systems/[id]/edit`.

### ✅ 10 — URL health check cron
`GET /api/cron/check-urls` — HEAD-checks all `provider='direct'` clips in open tests.
Uses admin (service role) client. Daily at 02:00 UTC via `vercel.json`. Protected by `CRON_SECRET` env var.

### ✅ 11 — Public feed + pagination
`app/page.tsx` — server component, public. `?page=N`; `PAGE_SIZE=20`; `.range()` + `count: 'exact'`.
`FeedCard` server component. Normalises Supabase array/object join ambiguity before passing typed props.

### ✅ 12 — Site header
`SiteHeader` (server, in layout); `SignOutButton` (client: `supabase.auth.signOut()` → `window.location.href = '/'`).
Unauthenticated: wordmark + "Sign in". Authenticated: Tests / Systems / Tracks / Profile + Sign out.

### ✅ 13 — Display name / profile
Trigger derives `display_name` from email local-part on sign-up (coalesces OAuth `raw_user_meta_data` name fields first).
`PATCH /api/profile` updates `display_name` (RLS: own row only). `ProfileForm` client component; `app/profile/page.tsx` server page.

### ✅ 14 — OAuth / Google sign-in
`supabase.auth.signInWithOAuth({ provider: 'google' })`. `OAuthButtons` client component renders above magic link form on `/login`; both accept and thread the `redirectTo` prop.
Auth trigger updated to: `coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email,'@',1))` so OAuth sign-ups get a real display name automatically.
`app/auth/callback/route.ts` unchanged — `exchangeCodeForSession` handles OAuth code exchange identically to magic links.
Setup instructions: `docs/google-oauth.md`.

### ✅ 15 — Centralised string resources (i18n)
All user-facing strings in `messages/en.json`, namespaced by feature area.
Package: `next-intl` (App Router native; "without routing" mode — no URL locale prefix).
`app/layout.tsx` wraps tree with `<NextIntlClientProvider messages={messages}>`.
`next.config.mjs` wraps config with `createNextIntlPlugin()`.
`types/next-intl.d.ts` extends `IntlMessages` from `en.json` — unknown keys are TypeScript errors.
`vitest.setup.ts` mocks both `next-intl` and `next-intl/server` with async factories returning actual English values for human-readable test assertions.
E2E tests import `messages/en.json` directly so copy changes keep tests in sync automatically.
**Namespaces:** `common`, `nav`, `auth`, `systems`, `snapshots`, `tests`, `profile`, `feed`, `tracks`, `crosscheck`.

### ✅ 16 — Email/password auth and account management
Register with email + name + password; sign in with password (alongside magic link and Google); change email, password, or display name from the profile page; forgot password flow.

**Supabase configuration (both projects):** Authentication → Providers → Email: confirm "Confirm email" is on; "Disable new user signups" must be off; `/auth/callback` in allowed Redirect URLs.

**Schema:** `handle_user_email_updated()` trigger is part of `20260625094142_initial_schema.sql` — no separate migration.

**`auth/callback` — recovery flow:**
```typescript
const type = searchParams.get('type')
if (code) {
  await supabase.auth.exchangeCodeForSession(code)
}
if (type === 'recovery') {
  return NextResponse.redirect(`${origin}/profile?reset=true`)
}
return NextResponse.redirect(`${origin}${redirectTo}`)
```
The profile page detects `?reset=true` and auto-opens `ChangePasswordForm`.

**Forgot password:** `supabase.auth.resetPasswordForEmail(email, { redirectTo: '…/auth/callback?type=recovery' })`

**Register:** `supabase.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: '…/auth/callback' } })`

**Password sign-in:** `supabase.auth.signInWithPassword({ email, password })` → `window.location.href = redirectTo ?? '/'`

**Login page:** Three tabs — Password | Magic link | Google. Links to `/register` and forgot-password flow.

**Profile page additions:** `ChangeEmailForm` (`updateUser({ email })`), `ChangePasswordForm` (`updateUser({ password })`).

### ✅ 17 — End-to-end test coverage
Full Playwright suite passes against staging (24/24). Fixed along the way:
env vars not loading in `playwright.config.ts`, Vercel SSO Deployment
Protection blocking the automated browser (see `VERCEL_AUTOMATION_BYPASS_SECRET`
in `testing.md` §9), admin-issued magic links needing `token_hash` verification
via the new `app/auth/confirm/route.ts` instead of the `code` flow, and several
spec files with selectors that had drifted from the current UI.

Not covered by any spec (optional future additions, not blocking this step):
cross-check selector flow, feed vote-count display.
See `testing.md` for current coverage and `docs/end-to-end-testing.md` for test strategy.

### ✅ 18 — Deployed version / commit info page
`/version` shows the deployed commit SHA and message, restricted to a fixed
admin allowlist.

**Data source:** Vercel auto-injects `VERCEL_GIT_COMMIT_SHA`,
`VERCEL_GIT_COMMIT_MESSAGE`, `VERCEL_GIT_COMMIT_REF` (branch), and `VERCEL_ENV`
as environment variables at build **and** runtime — no config needed, just
read `process.env` server-side. Unset in local dev — falls back to
`t('unavailable')` per field rather than erroring.

**Access control — email allowlist, no schema change:**
- `ADMIN_EMAILS` env var — comma-separated, case-insensitive. Parsed and
  checked by `lib/admin/is-admin-email.ts` (`isAdminEmail()`), unit-tested in
  `lib/admin/__tests__/is-admin-email.test.ts` (7 cases: unset var, null/undefined
  email, match, no match, case-insensitivity, whitespace, empty entries).
  Named `lib/admin/` deliberately distinct from `lib/supabase/admin.ts` — the
  latter is the service-role DB client; this is a privileged-*user* check.
- `supabase.auth.getUser()` then `isAdminEmail(user.email)` — same shape as
  the ownership checks in `api-conventions.md §2`, just against a fixed list
  instead of a DB row.
- `/version` added to `middleware.ts`'s protected paths so an unauthenticated
  visitor is redirected to `/login` first (consistent with `/systems`,
  `/tracks`, `/profile`, `/tests/new`).
- The page calls `notFound()` for an authenticated user who isn't on the
  allowlist — matches the existing `notFound()` pattern in
  `app/systems/[id]/page.tsx` — rather than a "logged in but not allowed"
  message that would confirm the route's purpose to anyone who finds it.

**Files:** `app/version/page.tsx` (server component, no client JS),
`lib/admin/is-admin-email.ts`. i18n: new `version` namespace in `en.json`.

**Verified manually** (dev server, real magic-link sign-in via
`app/auth/confirm/route.ts`): unauthenticated → 307 to `/login`; authenticated
+ allowlisted → renders commit fields (all "unavailable" locally, as
expected); authenticated + not allowlisted → 404, not a redirect.

**Rejected alternative:** a shared-secret env var (`VERSION_SECRET`, matching
the `CRON_SECRET`/`INGEST_SECRET` pattern used for non-user-facing routes) —
simpler, but gates on "knows the secret" rather than "is a specific
privileged person," which is a weaker fit for a page a human visits in a
browser.

### ✅ 19 — About / how-it-works page
`/about` explains, in plain English, why the service exists and how to use
it. **Public** — the opposite access model from step 18's `/version`: this
page is aimed partly at signed-out visitors deciding whether to register, so
it must not require auth and must not go in `middleware.ts`'s protected paths.

**Route:** `app/about/page.tsx` — server component, fully static content, no
`'use client'` needed (no interactivity, no per-user data). `notFound()`/auth
checks from step 18 do **not** apply here.

**Content structure** (plain-English rewrite of `docs/audiophile-compare-app-specification.md`
§1 "Core value propositions" and §4 "User stories" — not a copy of that
document's technical language):
1. **Why this exists** — blind A/B testing removes the placebo/expectation
   bias that makes it hard to tell whether a hi-fi change (cable, component,
   position, room treatment) actually changed the sound, versus you just
   expecting it to.
2. **How it works, for listeners** — browse the public feed, play clip A and
   clip B without knowing which is "before" and which is "after," vote by
   listening technique, see results once you've voted or the creator reveals.
3. **How it works, for creators** — describe a system as a snapshot, record
   before/after clips, publish a test, invite people to listen and vote,
   reveal when ready.
4. Anonymous visitors can browse and read; **listening to clips and voting
   require an account** — link to `/login`/`/register` here.

**i18n:** new `about` namespace in `messages/en.json`. Long-form paragraph
content still goes through translation keys, per the existing "never
hardcode strings in components" rule — one key per paragraph/section rather
than one key per short label, since this page is prose rather than UI chrome.

**Nav link:** `SiteHeader.tsx` currently renders the wordmark, then branches
on `user` — systems/tracks/profile/sign-out when signed in, "Sign in" link
when not. The `/about` link must render in **both** branches (it's for
everyone), so it goes outside that branch, next to the wordmark. New
`nav.about` message key for the label.

**Optional nice-to-have, not required for this step:** a CTA at the bottom of
the page that links to `/register` for signed-out visitors or `/tests/new`
for signed-in ones — skip unless it turns out to be trivial once the static
content is in place.

**Testing:** added to `public-feed.spec.ts` (unauthenticated project) — asserts
`/about` renders without a redirect to `/login`, the inverse of step 18's
redirect assertion. No unit test — no branching logic to cover.

**Verified manually** (dev server): unauthenticated `/about` → 200, no
redirect; nav shows wordmark + About in both auth states (confirmed via a
real magic-link sign-in for the authenticated case); `auth.spec.ts`'s nav
assertions still pass unaffected. Full E2E: `public-feed.spec.ts` (8/8) and
`auth.spec.ts` (2/2) both green against the live dev server; full unit suite
still 25 files / 256 tests.

### ✅ 20 — Visual polish
Denser, more consistent, higher-contrast, modern look. No layout or feature
changes — purely presentation. Grounded in an audit of actual class usage,
not guesswork. Full design system reference now lives in `components.md §12`
— read that before touching any styling. Summary of what changed:

- **Type:** h2 section headings had three competing variants (`text-lg`,
  `text-base`, `text-base sm:text-lg`) — standardized on
  `text-base sm:text-lg font-semibold` everywhere. h1/body/metadata sizes
  were already consistent.
- **Color:** collapsed text-gray sprawl (7+ shades) to two roles — muted
  (`gray-500 dark:gray-400`) and a separate higher-contrast "readable body
  copy" tier (`gray-600 dark:gray-300`, e.g. `/about`'s prose — kept
  deliberately, not a bug). Fixed `gray-400` used unpaired in light mode
  (borderline-failing contrast on white, 73 occurrences). Collapsed borders
  to two roles (`gray-200/700` default, `gray-100/800` subtle). Unified all
  status badges to `outcomeLabel()`'s exact pairing (amber alone had 9
  different shades in use before). Fixed one component using `yellow-*`
  instead of the established `amber-*` warning color, and one blue "primary"
  button where every other primary action uses black.
- **Density:** page container padding `py-6 sm:py-10` → `py-4 sm:py-6`
  everywhere (11 files) plus one page on a divergent `py-12` pattern.
  Reduced `space-y-8`/`space-y-10` section gaps to `space-y-6`.
- **Buttons:** standardized to two roles × two size tiers (primary/secondary
  × standard/compact) — see `components.md §12`. Converted ~15 bare
  `<a>`/`<Link>`/`<button>` inline actions (edit, cancel, back, add-snapshot,
  add-component) to the bordered secondary style; left real page-navigation
  links (breadcrumbs, pagination, register/login CTAs) and the header's
  "Sign out" (grouped with nav links, not a form action) unstyled.

**Dark-mode contrast bug found via manual screenshot verification** (not
caught by code review or typecheck): every primary `bg-black` button was
invisible against the `#0a0a0a` dark-mode page background (`app/globals.css`).
Fixed by pairing every `bg-black`/`text-white` with `dark:bg-white
dark:text-black` (inverting on dark mode) — the same pattern already used in
`CreateTestForm.tsx`'s step indicator, now applied consistently everywhere.
This is why the plan explicitly calls for a real rendered check, not just a
class-name audit — screenshots in both color schemes caught something the
whole rest of this pass would have shipped broken.

**Verified:** full unit suite (25 files / 256 tests) and full E2E suite
(25/25) both green against a live dev server; manual Playwright screenshots
of home, about, login, systems list, and system detail pages in both light
and dark mode.

---

Deferred features (agentic ingestion pipeline, owned blob storage, mobile app) are documented in `deferred-features.md`.
