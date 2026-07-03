---
name: audiophile-compare-build-history
description: >
  Historical build log and deferred feature notes for the audiophile A/B
  comparison app. Load this for orientation on how the project was built,
  why specific decisions were made, or when beginning work on a deferred
  feature (owned storage, mobile app). Not needed for routine coding tasks.
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
**Namespaces:** `common`, `nav`, `auth`, `systems`, `snapshots`, `tests`, `profile`, `feed`, `tracks`.

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

### ⬜ 17 — End-to-end test coverage
Run the full Playwright suite against staging; confirm every named route has at least one passing happy-path scenario.
**Gaps to close:** cross-check selector flow, reveal flow end-to-end, feed vote-count display.
See `testing.md` for current coverage and `docs/end-to-end-testing.md` for test strategy.

### ⬜ 18 — Visual polish
Tighten the UI for a modern, compact look. No layout or feature changes — purely presentation.
- **Font scale:** reduce to two body sizes — `text-sm` for body, `text-xs` for metadata/badges; reserve `text-base`+ for headings.
- **Whitespace:** cut vertical padding/spacing by ~30% across cards, list items, sections, form fields.
- **Buttons vs links:** replace plain `<a>`/`<Link>` inline actions (edit, cancel, back, reveal, add snapshot, sign out) with small button-styled elements (`border rounded px-2 py-1 text-xs`); reserve unstyled links for navigation only.
- **Consistency:** audit all pages for one-off sizing, colour, or spacing deviations and align to a single set of Tailwind utility patterns.

---

## Deferred features

### Agentic / programmatic API

There are exactly two anticipated non-browser callers. No public API, no versioned contract, no API keys, no OpenAPI documentation — both callers are first-party and controlled.

**Architectural decision — Go vs Next.js:** A separate Go service was considered and rejected. Both use cases are low-frequency and operate on the same data model as the browser. A Go service would add a second deployment, second secret management, and a second codebase to keep in sync with the schema, with no performance benefit at this scale. Go remains an option if sustained high concurrency or long-running operations become a concrete requirement; extraction would be mechanical since Supabase is the shared data layer.

Neither use case is currently implemented. `source_ref` is already included in the initial schema migration — no additional migration needed when the ingestion pipeline is built.

#### Use case 1 — Forum ingestion pipeline

An AI process reads Lejonklou forum threads, extracts recordings and listening comparisons, and writes them into the database as tests, tracks, clips, and votes. Periodic scheduled refreshes catch new posts.

**Authentication:** A single dedicated `ingestion_bot` user in `auth.users`, created manually. The ingestion service authenticates as this user via Supabase Auth (magic link issued once; token stored in the service's environment). No API key table needed. Subject to standard RLS — no policy exceptions required.

**Idempotency:** Forum posts must not produce duplicate tests on repeated runs. The `source_ref` column on `tests` (UNIQUE, nullable) records forum provenance (e.g. `'lejonklou-forum:thread-42:post-187'`). Before inserting a test, check `source_ref` — skip if already present.

**Ingest endpoint:** `POST /api/internal/ingest` — not part of any public surface. Protected by a shared secret in an environment variable (`INGEST_SECRET`), not Supabase Auth, since this is a server-to-server call:

```typescript
// app/api/internal/ingest/route.ts
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-ingest-secret')
  if (secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // ... write track, test, clips, clip_mapping, votes atomically
  // using the ingestion_bot user's supabase client
}
```

`INGEST_SECRET` is set in Vercel environment variables and in the ingestion service's environment. Never committed to source control. CORS is not needed — server-to-server call, no browser involved.

**Payload shape** (one test per call):
```typescript
type IngestPayload = {
  source_ref: string           // unique identifier for the forum post
  track: {
    artist: string
    title: string
    album?: string
    passage_note?: string
  }
  snapshot_a: {
    system_name: string        // matched or created by name
    version_label: string
    components?: object[]
  }
  snapshot_b: {
    system_name: string
    version_label: string
    components?: object[]
  }
  clip_a_url: string
  clip_b_url: string
  before_is_a: boolean
  votes?: Array<{
    chosen_label: 'A' | 'B'
    technique_name: string     // matched against listening_techniques.name
    observation?: string
    other_description?: string
  }>
}
```

The ingest route resolves or creates tracks, systems, and snapshots by name before writing the test — the same logic as the web creation flow, but automated. All writes are attributed to the `ingestion_bot` user.

#### Use case 2 — Mobile app

The mobile app is a first-party client. It authenticates users via Supabase Auth directly (magic link or OAuth), storing tokens in `expo-secure-store` rather than cookies. It then calls the same `/api/` routes as the browser. **No separate auth mechanism needed** — existing RLS policies and route auth checks apply unchanged.

**Upload flow** (when owned storage is implemented):
```
Mobile → POST /api/clips/upload-url   (authenticated as user; returns presigned URL)
Mobile → PUT  {presignedUrl}          (direct to storage; no server involvement)
Mobile → POST /api/clips/confirm      (marks clip row as uploaded)
```

**CORS:** Needed only if the mobile app calls `/api/` routes directly rather than via the Supabase JS client. Add to `middleware.ts` if required:
```typescript
if (request.nextUrl.pathname.startsWith('/api/') &&
    request.headers.get('x-client') === 'mobile') {
  // set CORS headers
}
```
In practice, using the Supabase JS client for reads and the existing `/api/` routes for mutations (with the user's session token) avoids CORS entirely.

See the **Mobile app** and **Owned blob storage** sections below for technology choices and the full upload/transcoding architecture.

---

### Owned blob storage

**Context:** The current model is BYOS — users supply URLs; the app never handles audio/video bytes. This section records architectural decisions for when owned storage is added. No current code needs to change to keep these options open.

**Preferred storage options (in order):**

| Option | Notes |
|---|---|
| Supabase Storage | Already in the stack; RLS policies mirror DB rules; signed URLs for time-limited playback; direct upload from mobile without proxying. Lowest operational overhead. |
| Cloudflare R2 | S3-compatible; no egress fees (important for media replayed many times); pairs well with Vercel. Use if Supabase Storage proves limiting. |
| AWS S3 | Standard but egress costs accumulate at scale for media. Avoid unless other AWS services already in use. |

**Schema migration needed (no data migration):**
```sql
ALTER TABLE public.clips
  DROP CONSTRAINT clips_provider_check,
  ADD CONSTRAINT clips_provider_check
    CHECK (provider IN ('youtube', 'vimeo', 'direct', 'unknown', 'supabase', 'r2'));

ALTER TABLE public.clips ADD COLUMN storage_key text;
-- storage_key stores the internal object path; separate from the public/signed URL which may rotate
```

**Retention policy** must be decided before launch — retain permanently, archive after N years, or delete when parent test is deleted. Affects whether `archived_at` needs to be added to `clips`.

**Upload flow (files of any meaningful size upload directly to storage — never through the Next.js server):**
```
Mobile → POST /api/v1/clips/upload-url   (authenticated; returns presigned URL + clipId)
Mobile → PUT  {presignedUrl}             (direct to storage; server not involved)
Mobile → POST /api/v1/clips/confirm      (tells server upload is complete)
Server →      updates clip row, optionally enqueues transcode job
```

**Transcoding:** Raw mobile recordings (AAC/M4A, MP4) may need normalisation for consistent cross-device playback.
- **Recommended:** accept raw and transcode server-side using **Inngest** or **Trigger.dev** (both integrate with Vercel; support durable jobs beyond the 5-minute function limit).
- Vercel Cron is **not suitable** for transcoding — jobs may exceed the cron execution window.
- Requiring the app to transcode before upload is simpler server-side but worse UX; not recommended for a first version.

---

### Mobile app

**Context:** The mobile app is a first-party client. It authenticates users via Supabase Auth directly, storing tokens in `expo-secure-store` rather than cookies. It calls the same `/api/` routes as the browser. No separate auth mechanism is needed.

**Technology options:**

| Option | Fit | Notes |
|---|---|---|
| React Native + Expo | Best for speed | TypeScript reuse; Supabase JS client works; `expo-av` has recording APIs; cross-platform iOS + Android |
| Swift (iOS only) | Best for audio quality | Native CoreAudio/AVFoundation; sample-accurate recording; significant language investment |
| Flutter | Middle ground | Cross-platform; Dart approachable from a Java/Go background; good Supabase client |

**Recommendation:** React Native + Expo if time-to-working-app is the priority. Swift if the audiophile community is iOS-dominated and recording fidelity at the hardware level is central to the value proposition.

**Auth difference from web:** Mobile apps cannot use cookies — Supabase Auth tokens stored in `expo-secure-store`. Existing RLS policies and route auth checks apply unchanged.

**Neither owned storage nor the mobile app is currently under active development.** Begin work only after build steps 1–16 are stable in production.
