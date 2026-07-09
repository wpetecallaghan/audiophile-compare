---
name: audiophile-compare-core
description: >
  Technology stack, file layout, deployment topology, and server/client rules
  for the audiophile A/B comparison app. Read this first before any coding
  task, then load the context file that matches your work category (see §5).
---

# Audiophile Compare — Core Reference

Read this file first. Then load the context file for your task (§5).

---

## 1. Technology stack (fixed — do not substitute)

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15+, App Router | No Pages Router patterns; use async params/searchParams |
| Language | TypeScript | Strict mode; no `any` without justification |
| Database + Auth | Supabase (Postgres + Supabase Auth) | RLS enforced at DB layer |
| Hosting | Vercel | Vercel Cron for background jobs |
| Styling | Tailwind CSS | Mobile-first; defensive overflow/width patterns required |
| i18n | next-intl | Without-routing mode; locale fixed to `en` |
| Testing | Vitest + Testing Library + Playwright | See `testing.md` |

**Turbopack root — if Next.js infers the wrong workspace root** (e.g. monorepo/playground structure):
```javascript
// next.config.mjs
const nextConfig = {
  turbopack: { root: process.cwd() },
}
```

---

## 2. Deployment topology

Two Supabase projects, one Vercel project:

```
GitHub main     → Vercel Production  → Supabase audiophile-prod
GitHub staging  → Vercel Preview     → Supabase audiophile-staging
```

- Supabase projects are fully isolated (separate Postgres, Auth user pool, API keys).
- All non-production branches and PRs use the staging Supabase project by default.
- **Migrations apply independently** to each project — apply to staging first, verify, then production.
- Each project requires its own Auth redirect URL in Supabase → Authentication → URL Configuration.
  Mismatched redirect URLs cause magic link logins to land on the wrong environment.

---

## 3. Project file layout

```
app/
  api/                                      ← Route Handlers (server only)
    clips/verify/route.ts
    cron/check-urls/route.ts                ← Daily URL health check; CRON_SECRET protected
    profile/route.ts
    systems/route.ts
    systems/[id]/route.ts
    systems/[id]/snapshots/route.ts
    systems/[id]/snapshots/[snapshotId]/route.ts
    systems/[id]/cross-check/route.ts
    tests/route.ts
    tests/[id]/route.ts
    tests/[id]/reveal/route.ts
    tests/[id]/results/route.ts
    tests/cross-check/route.ts
    tracks/route.ts
    votes/route.ts
    votes/[id]/route.ts
  auth/callback/route.ts                    ← Magic link + OAuth code exchange
  auth/confirm/route.ts                     ← token_hash verification (admin/service-issued links)
  global-error.tsx                          ← Required for Next.js 16 + Turbopack
  layout.tsx
  page.tsx                                  ← Public feed (server, paginated)
  about/page.tsx                            ← Public: why/how explainer, no auth
  login/page.tsx
  register/page.tsx
  profile/page.tsx
  systems/page.tsx
  systems/new/page.tsx
  systems/[id]/page.tsx
  systems/[id]/edit/page.tsx
  tests/new/page.tsx
  tests/[id]/page.tsx
  tracks/page.tsx
  tracks/[id]/page.tsx
  version/page.tsx                          ← Admin-only: deployed commit info

components/
  ui/
    Button.tsx                               ← cva-based; variant (primary/secondary) × size (standard/compact)
    Badge.tsx                                ← cva-based; status (win/loss/draw/blind/revealed)
    Link.tsx                                 ← cva-based; wraps next/link; variant (nav/card/inline) × size (inline only)
    Heading.tsx                              ← cva-based; wraps h1/h2; level (1/2)
    FieldLabel.tsx                           ← cva-based; wraps label; tone (standard/muted)
    TextField.tsx                            ← cva-based; TextInput/TextArea/Select share fieldVariants; size (standard/compact)
    FormMessage.tsx                          ← cva-based; wraps p; tone (error/success)
    Callout.tsx                              ← cva-based; wraps div; tone (warning/success/info/neutral)
    cn.ts                                    ← clsx wrapper for merging conditional class lists
  media/
    ABPlayer.tsx                            ← Client: owns refs, coordinates pause
    MediaPlayer.tsx                         ← Client: routes to correct player
    players/
      NativePlayer.tsx
      YouTubePlayer.tsx
      VimeoPlayer.tsx
      GoogleDrivePlayer.tsx                  ← Client: iframe only, pause() is a documented no-op (no embed-control SDK)
      UnknownPlayer.tsx
  feed/FeedCard.tsx                         ← Server: single test card for feed
  SiteHeader.tsx                            ← Server: global header; reads auth
  SignOutButton.tsx                         ← Client
  OAuthButtons.tsx                          ← Client; accepts redirectTo prop
  LoginForm.tsx                             ← Client: magic link form
  LoginWithPasswordForm.tsx                 ← Client
  LoginTabs.tsx                             ← Client: tab shell on /login
  RegisterForm.tsx                          ← Client
  ForgotPasswordForm.tsx                    ← Client
  ProfileForm.tsx                           ← Client
  ChangeEmailForm.tsx                       ← Client
  ChangePasswordForm.tsx                    ← Client
  systems/
    CreateSystemForm.tsx                    ← Client; POST /api/systems
    EditSystemForm.tsx                      ← Client; PATCH /api/systems/[id]
    AddSnapshotForm.tsx                     ← Client; uses router.refresh() on success
    SnapshotSection.tsx                     ← Client with server-rendered children
  tests/
    CreateTestForm.tsx                      ← Client: wizard shell; local useState for systems
    VoteForm.tsx                            ← Client
    TallyDisplay.tsx                        ← Server
    RevealButton.tsx                        ← Client
    MappingBadge.tsx                        ← Server
    CrossCheckSelector.tsx                  ← Client
    steps/
      StepTrack.tsx
      StepSnapshots.tsx
      StepClips.tsx
      StepPublish.tsx

lib/
  supabase/
    server.ts                               ← createClient() for server components + API routes
    client.ts                               ← createClient() for browser components
    admin.ts                                ← createAdminClient() — service role; cron only
  clips/
    detect-provider.ts                      ← Pure URL classification (no I/O)
    check-url.ts                            ← HEAD request for direct URLs
    to-clip-data.ts                         ← Converts verified URL to ClipData shape
    find-shared-clips.ts                    ← Shared track finder for cross-check
  votes/
    compute-outcome.ts                      ← computeOutcome(); Outcome type
    compute-tally.ts                        ← computeTally(); RawVoteRow, CuratedResult types
  admin/
    is-admin-email.ts                       ← isAdminEmail(); ADMIN_EMAILS allowlist check for /version
                                               (unrelated to lib/supabase/admin.ts's service-role client —
                                               "admin" here means privileged user, not DB access level)
  types/
    test-creation.ts                        ← TestDraft, Snapshot, SystemWithSnapshots types
  youtube-api.ts                            ← Singleton YouTube IFrame API loader

messages/en.json                            ← All UI strings, namespaced by feature area
i18n/request.ts                             ← next-intl config: locale fixed to 'en'
middleware.ts                               ← Session refresh + route protection (edge runtime)
types/
  youtube.d.ts                              ← YouTube IFrame API type definitions
  next-intl.d.ts                            ← Extends IntlMessages from en.json
```

**Protected paths** (middleware redirects unauthenticated users to `/login`):
```
/systems, /tracks, /profile, /tests/new, /version
```
`/version` is also gated by an `ADMIN_EMAILS` allowlist beyond just auth — see `build-history.md` step 18.

**Public paths** (no login required to view; login required to vote):
```
/, /about, /tests/[id], /login, /register, /auth/callback, /auth/confirm
```

---

## 4. Server vs client — decision rule

See `components.md §1` for the full rule and code patterns. Summary: default is **server**. Add `'use client'` only for `useState`/`useEffect`/`useRef`, browser event handlers, browser APIs, or third-party DOM SDKs (YouTube, Vimeo). A client component **cannot** import `lib/supabase/server.ts`.

---

## 5. Which context file to load

| Task | Load |
|---|---|
| Writing or modifying API routes | `api-conventions.md` + `audiophile-compare-schema.md` |
| Writing or modifying components or pages | `components.md` |
| Writing or modifying tests | `testing.md` |
| Writing queries, migrations, or RLS policies | `audiophile-compare-schema.md` |
| Any task touching the data model | `audiophile-compare-schema.md` |
| Writing or reviewing code (app or test) that repeats a string literal | `repeated-string-constants.md` |
| Forum ingestion pipeline work (build-history.md steps 30, 31, 33+) | `build-history-ingestion.md` (detailed plan) + `deferred-features.md` (original architecture rationale) |
| Import provenance UI (build-history.md step 32) | `build-history.md` step 32 directly — UI work, not pipeline infrastructure, so it isn't in `build-history-ingestion.md` |

---

## 6. Build status

Steps 1–38 and 40 are complete (✅ 1–16 core features; ✅ 17 E2E coverage; ✅ 18 version/commit info page; ✅ 19 about page; ✅ 20 visual polish; ✅ 21 Link component; ✅ 22 Heading/FieldLabel/TextField/FormMessage/Callout components; ✅ 23 anonymous clip playback; ✅ 24 privacy/terms pages; ✅ 25 fixed header/footer app shell; ✅ 26 delete tests/snapshots/systems; ✅ 27 handle verified-broken clip URLs; ✅ 28 concise presentation for unsupported-playback clips; ✅ 29 register with Google; ✅ 30 forum ingestion: placeholder author infrastructure; ✅ 31 forum ingestion: internal ingest API route; ✅ 32 import provenance UI; ✅ 33 forum ingestion: scraper; ✅ 34 Google Drive clip provider support; ✅ 35 forum ingestion: extraction — built, unit-tested, and trial-run twice against real data (40-page sample); found and fixed two real bugs this way, and documented one accepted gap (`ambiguous_attribution` never actually triggers); also added a `broken/` status, human-review tooling, a thorough clip-health check with token-saving fatal-issue routing, and a retroactive `recheck-clip-health.ts` sweep script — see build-history-ingestion.md step 35's findings 3-7; ✅ 36 forum ingestion: commit — `scripts/commit-lejonklou.ts`/`lib/ingestion/commit.ts` POSTs approved candidates to a deployed environment and chains staging's output into production's input, so a candidate physically cannot reach production without already being committed to staging; uses two separate local secrets, `INGEST_SECRET_STAGING`/`INGEST_SECRET_PRODUCTION`, not one ambient var. Manually reviewing the first real 44-test commit on staging found three more real bugs (imported tests never marked `revealed` regardless of vote count; `created_at` always defaulted to ingestion time instead of the real forum post date; the public feed's Previous/Next-only pagination was missing First/Last) — all fixed, see build-history-ingestion.md step 36 finding 8. The first fix attempt introduced its own regression (a migration based on a stale pre-`source_url` copy of `ingest_test` silently dropped the "view original post" link) and didn't actually move `created_at` (the 44 real candidate files on disk predated the extraction fix, so none had anything to send) — both caught by re-reviewing the recommit; the migration fix required a genuinely new migration file rather than editing the already-applied one (editing it silently no-opped on `supabase db push` — a real process mistake, not just a code one), plus a new one-off `scripts/backfill-payload-created-at.ts` for the data gap (finding 9). A first, narrower version of step 38's rollback tooling (`scripts/rollback-lejonklou.ts`/`lib/ingestion/rollback.ts`) was also built ahead of its formal turn, to make a delete-and-recommit cycle possible on staging — not yet safe against production once step 39/claim flow exists, see step 38's notes; ✅ 37 run the import, staging then production — the actual one-time deliverable: every usable candidate committed to both `audiophile-staging` and `audiophile-prod` for real, confirmed independently (not just taken on report) by `curl`-ing the real production feed and reading the rendered content directly — 44 tests live, correct historical dates, varied Revealed/Blind badges, step 40's title/snapshot formatting all rendering correctly; the other 164 real candidates this pipeline ever extracted sit in `broken/` (dead/missing/unplayable clips, step 35); ✅ 40 surface system/snapshot info consistently — the public feed already showed "SystemName · label vs SystemName · label" per test, but the test detail page never did (confirmed via `git log` a pre-existing gap, not a regression — just never noticed until step 36's reveal-status fix produced the first real revealed imported tests anyone but their own creator would look at); added a shared `lib/tests/format-snapshot-line.ts` used by both the feed and `app/tests/[id]/page.tsx`, and separately concatenated the system name into ingested test titles (`resolveTestTitle`, forum-ingestion-only — the web wizard always supplies its own title) so tests re-comparing the same track are distinguishable in list views — see build-history.md step 40 Parts A/B; ✅ 38 data erasure requests — rescoped from an original "undo a bad import" rollback plan to admin-triggered, human-verified deletion of a user's votes/content/full account, once a real gap was found in that original plan's ownership check (`scripts/rollback-lejonklou.ts` stays an unrelated, unchanged ingestion-iteration tool); three `security definer` Postgres functions plus a real schema fix (`tracks.created_by` made nullable — was blocking account deletion via an unrelated FK), an admin route/page gated the same way `/version` is; migration applied to staging (production not yet — separate step) and re-verified for real, not just taken on report: 14/14 integration tests passing including EXECUTE lockdown, plus the admin gate independently re-checked with a real authenticated-non-admin session (404); the actual authenticated-*admin* happy path is still unverified — no real admin credentials available in this environment — see `build-history-ingestion.md` step 38). Step 39 (the claim flow) remains planned but not yet built. The current unit test suite is 38 files / 440 tests passing, plus a separate integration suite (`npm run test:integration`, testing.md §11) covering the ingest route and step 38's erasure functions against real staging. See `testing.md` for the full inventory.
