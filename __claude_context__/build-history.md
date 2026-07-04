---
name: audiophile-compare-build-history
description: >
  Historical build log for the audiophile A/B comparison app. Load this for
  orientation on how the project was built and why specific decisions were made.
  For deferred features (owned storage, mobile app, ingestion pipeline) see
  deferred-features.md. Not needed for routine coding tasks.
---

# Audiophile Compare — Build History & Deferred Features

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

### ⬜ 19 — Visual polish
Tighten the UI for a modern, compact look. No layout or feature changes — purely presentation.
- **Font scale:** reduce to two body sizes — `text-sm` for body, `text-xs` for metadata/badges; reserve `text-base`+ for headings.
- **Whitespace:** cut vertical padding/spacing by ~30% across cards, list items, sections, form fields.
- **Buttons vs links:** replace plain `<a>`/`<Link>` inline actions (edit, cancel, back, reveal, add snapshot, sign out) with small button-styled elements (`border rounded px-2 py-1 text-xs`); reserve unstyled links for navigation only.
- **Consistency:** audit all pages for one-off sizing, colour, or spacing deviations and align to a single set of Tailwind utility patterns.

---

Deferred features (agentic ingestion pipeline, owned blob storage, mobile app) are documented in `deferred-features.md`.
