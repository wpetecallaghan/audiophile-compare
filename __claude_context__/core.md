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
- **Never edit a migration file once applied to any project** — `supabase db push` tracks applied files by filename, so an edit silently no-ops. Write a new migration instead. See `audiophile-compare-schema.md` for the full rule and precedent.
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
      GoogleDrivePlayer.tsx                  ← Client: iframe only, no embed-control SDK; pause() force-remounts (step 53), always crops to fill its box (step 55)
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
`/version` is also gated by an `ADMIN_EMAILS` allowlist beyond just auth — see `build-history/18-version-commit-info-page.md`.

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
| Writing or reviewing code (app or test) that repeats a string or numeric literal | `repeated-string-constants.md` |
| Build history / orientation on any step | `build-history/index.md`, then load only the specific step file(s) you need |
| Forum ingestion pipeline work (steps 30, 31, 33+) | `build-history-ingestion/index.md`, then the specific step file(s) (detailed plan) + `deferred-features.md` (original architecture rationale) |
| Import provenance UI (step 32) | `build-history/32-import-provenance-ui.md` directly — UI work, not pipeline infrastructure, so it isn't in `build-history-ingestion/` |

---

## 6. Build status

Steps 1–55 complete: core app (1–29, 40–55) plus the forum-ingestion
pipeline (30–39) through a real production import. Current unit suite: 47
files / 506 tests passing (`npm run test`); integration suite (`npm run
test:integration`, testing.md §11): 17/17 passing against real staging.

Full step-by-step detail, one file per step: `build-history/index.md`
(core app) and `build-history-ingestion/index.md` (forum ingestion
pipeline — steps 30, 31, 33, 35–39; steps 32/34 are UI/core-app work and
live directly in `build-history/`).
