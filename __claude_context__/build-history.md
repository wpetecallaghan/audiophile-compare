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

**Follow-up — componentized the pattern (post-step-20):** the manual class
consolidation above still meant hand-editing the same button/badge class
string in 15+ files — exactly the kind of drift that caused this step in the
first place. Added `components/ui/Button.tsx` and `Badge.tsx`
(`class-variance-authority` + `clsx`, see `docs/dependencies.md`) holding
each pairing in one place, then migrated every remaining raw `bg-black`
button and status-badge `<span>` across the app to them (`outcomeLabel()` in
`app/systems/[id]/page.tsx` now returns a `status` key instead of a `cls`
string). See `components.md §12` for usage. One-off single-use styles (the
amber confirm/trigger buttons in `RevealButton.tsx`) were deliberately left
as raw classes rather than forcing them into a variant used exactly once.
Also fixed a few unpaired dark-mode colors turned up along the way (green
success-message text, a stray `border` missing its light-mode shade). Full
unit suite, full E2E suite, and light/dark screenshots verified again after
migration — all green, pixel-identical to before.

### ✅ 21 — Link component
Same motivation as the step-20 follow-up: `<Link>`/`<a>` styling was
hand-copied class strings, which is exactly the pattern that let the step-20
bugs propagate. Grounded in an audit of real usage across `app/` and
`components/` (excluding `components/ui/`), same process as the Button/Badge
audit.

**Audit findings (grep on exact className strings, one `<a>`/`<Link>` role
already covered by `buttonVariants()` excluded — e.g. `ProfileForm.tsx`,
`EditSystemForm.tsx`, the systems detail "Edit" link):**

- **Nav link** — `text-sm text-gray-500 dark:text-gray-400
  hover:text-gray-900 dark:hover:text-gray-100` (+ `shrink-0` on 4 of 5) —
  **5 occurrences, all in `SiteHeader.tsx`** (About, Systems, Tracks,
  Profile, Sign in).
- **Card link** — `rounded border border-gray-200 dark:border-gray-700
  px-3 sm:px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800
  transition-colors`, prefixed with either `block` (`app/systems/page.tsx`,
  `FeedCard.tsx`) or `flex items-center justify-between`
  (`app/tracks/page.tsx`, `app/tracks/[id]/page.tsx`, the test list in
  `app/systems/[id]/page.tsx`) depending on whether the Link itself is the
  flex container or wraps one — **5 occurrences**, shared part identical.
- **Breadcrumb link** — bare `hover:underline`, no color/size classes of its
  own (relies on ambient text color) — **6 occurrences**: `tracks/[id]`,
  `register`, `systems/[id]/edit` (×2), `systems/[id]`, `LoginTabs.tsx`. One
  utility class is likely too trivial to justify a component — same call as
  leaving `RevealButton.tsx`'s one-off amber buttons raw.
- **Inline CTA link** — `text-blue-600`, plus size/hover variants that
  disagreed with each other: `text-sm text-blue-600 hover:underline` (5:
  `page.tsx` pagination ×2, `about/page.tsx` ×2), `text-blue-600 underline`
  with no `hover:` (5: `page.tsx`, `tracks/page.tsx`, `systems/page.tsx`
  empty-state CTAs, plus `tests/[id]/page.tsx`'s "sign in to listen" — which
  was also the one instance of this role on a plain `<a href="/login">`
  instead of `next/link`'s `Link`, losing client-side navigation), and
  `text-xs text-blue-600 hover:underline` (1: `CrossCheckSelector.tsx`,
  itself another plain `<a>` instead of `Link`). Unlike the deliberate
  `gray-500/400` vs `gray-600/300` two-tier split kept in step 20, this
  3-way split had no matching semantic distinction — same CTA role,
  inconsistent `hover:` treatment — so it read as drift, not design. Fixed
  by standardizing on `text-sm text-blue-600 hover:underline`, fixing both
  stray `<a>`s to `Link`, and treating the one `text-xs` instance as a
  `size="compact"` variant prop rather than a raw `className` override —
  `cn()`/`clsx` doesn't dedupe conflicting Tailwind utilities the way
  `tailwind-merge` would, so appending `className="text-xs"` on top of a
  variant that already sets `text-sm` would not reliably win.
  `ChangePasswordForm.tsx`'s `text-sm text-blue-600 hover:underline` looked
  like a fifth instance of this role from a className grep alone, but it's a
  `<button type="button">` disclosure toggle, not a link — left alone,
  same call as the amber `RevealButton.tsx` buttons in step 20.

**Shape built:** one `components/ui/Link.tsx`, mirroring `Button.tsx`'s
structure — a `cva` config with a `variant` prop (`nav | card | inline`) and
a `size` prop (`standard | compact`, scoped to `inline` only via
`compoundVariants`) on top of `next/link`'s `Link`, not a plain `<a>`.
`card`'s shared border/hover classes live in the variant; the `block` vs
`flex items-center justify-between` split stays a per-call-site `className`
override (real layout difference, not a styling inconsistency to force into
one shape). `variant="breadcrumb"` was deliberately **not** built — a single
utility class repeated 6 times doesn't clear the bar that justified
`Button`/`Badge` (15+ files, multi-class strings, a real dark-mode bug from
copy-paste drift) — those 6 `hover:underline` breadcrumb links were left as
plain `next/link` `Link`s.

The empty-state CTAs' always-on `underline` was folded into `inline`
(now `hover:underline` like the majority) rather than kept as a distinct
"prominent" sub-variant — same drift as the size/hover split, not a
deliberate design choice.

**Verified:** full unit suite (25 files / 256 tests) and full E2E suite
(25/25) both green; `tsc --noEmit` shows no new errors (pre-existing,
unrelated vitest-mock typing errors in `__tests__/supabase-*.test.ts` are
untouched by this change); manual Playwright screenshots of home, about,
systems, tracks, track detail, and test detail pages in both light and dark
mode, authenticated and unauthenticated.

### ✅ 22 — Componentize remaining repeated form/text elements
Same motivation and process as steps 20/21: `Button`, `Badge`, and `Link`
only covered three element types. An audit of every other DOM element
styled more than once (`grep` on exact className strings across `app/` and
`components/`, excluding `components/ui/`) turned up five more repeated
roles, all now componentized, plus two one-off bugs fixed mechanically.

**1. `components/ui/Heading.tsx`** — `<Heading level={1|2}>`, a `cva` with
`level` as the only variant. Replaced 12 `<h1>`s and 13 `<h2>`s. One `<h2>`
look-alike (`ChangePasswordForm.tsx`'s `text-sm font-semibold` disclosure
heading) uses a genuinely different, smaller size and was correctly left
raw rather than forced into `level={2}`.

**2. `components/ui/FieldLabel.tsx`** — `tone: 'standard' | 'muted'`.
`standard` (`text-sm font-medium mb-1`) replaced 15 near-identical labels.
`muted` (`text-xs text-gray-500 dark:text-gray-400 mb-1`) unified three
disagreeing variants found across `CrossCheckSelector.tsx` (was `text-xs
font-medium text-gray-500...`, no `mb-1`), `VoteForm.tsx` (matched exactly),
and — found only once actual migration started, not in the original audit
— `SnapshotSection.tsx`'s label/notes fields (was `text-xs font-medium
text-gray-600 dark:text-gray-300 block mb-1`, a third color). All three
converged on one canonical muted style.

**3. `components/ui/TextField.tsx`** — exports `fieldVariants` (`cva`,
`size: 'standard' | 'compact'`) plus three thin wrappers, `TextInput`,
`TextArea`, `Select`, all consuming it — same relationship `Button.tsx` has
to `buttonVariants`. `standard` replaced 18 occurrences; `compact` unified
the two disagreeing tiers found in the audit (`VoteForm.tsx`'s
`ring-blue-400`/`text-sm` vs `SnapshotSection.tsx`'s `ring-blue-500`/
`text-xs`) onto one pairing — `ring-blue-500` (matches `standard`'s ring
color) and `text-xs` (matches `Button`'s own size convention, where
`compact` means smaller text). The 12-occurrence bug variant (missing
`border-gray-200` + no focus ring) was folded into `standard`, gaining a
visible focus ring and a proper light-mode border where neither existed
before. **Real gotcha hit during the build**: `<input>`/`<select>` both
have a *native* HTML `size` attribute (numeric — character width / visible
option count) that collides with a `cva` variant prop of the same name;
`TextInputProps`/`SelectProps` explicitly `Omit<..., 'size'>` from the DOM
props before intersecting with the variant props to avoid a silent type
error. `TextArea` has no such native `size`, so needed no workaround.

**4. `components/ui/FormMessage.tsx`** — `tone: 'error' | 'success'`,
fixed `text-sm` always (real usage split `text-sm`/`text-xs` 7-vs-12
with no semantic reason). Replaced 19 error + 4 success occurrences,
including fixing `StepClips.tsx`'s stray `green-700` (now `green-600`,
matching every other success message).

**5. `components/ui/Callout.tsx`** — `tone: 'warning' | 'success' | 'info' |
'neutral'`. Replaced 6 alert/info boxes (`RevealButton.tsx`,
`TallyDisplay.tsx`, `UnknownPlayer.tsx` — warning; `StepTrack.tsx` —
success; `MappingBadge.tsx` — info; `app/tests/[id]/page.tsx`'s sign-in
gate — neutral). Padding/text-size overrides passed via `className` where
an instance genuinely differs (`TallyDisplay.tsx`'s tighter `px-3 py-2.5`).
**Fixed `MappingBadge.tsx`'s dark-mode bug**: `bg-blue-50 border-blue-200`
had no `dark:` classes at all — the box itself now inherits dark variants
from `Callout`'s `info` tone, and the inner text colors (`text-blue-900`,
`text-blue-700`) were given matching `dark:text-blue-100`/
`dark:text-blue-300` pairs that were also missing before.

**Two bugs found during the original audit, fixed mechanically —
no new component involved:**
- `VoteForm.tsx`'s submit button (`rounded bg-blue-600 ...`) had been missed
  by the step-20 Button/Badge migration — the same "blue primary instead of
  black" bug that migration fixed everywhere else. Now a plain `<Button>`.
- `SignOutButton.tsx`'s raw `<button>` classes were character-for-character
  `linkVariants({ variant: 'nav' })` from step 21, hand-copied because
  signing out isn't page navigation so it can't be a `<Link>`. Now consumes
  `linkVariants({ variant: 'nav' })` directly via `cn()`, the same way
  `Link.tsx` itself consumes `buttonVariants`-adjacent patterns.

**Deliberately left as one-offs, not componentized** (single occurrence
each, or a genuinely unique interaction, same bar as `RevealButton.tsx`'s
amber buttons in step 20): `LoginTabs.tsx`'s tab bar (conditional
active/inactive classes, the only tab UI in the app) and its "forgot
password" toggle button; `StepTrack.tsx`'s track-search-result row button;
`SnapshotSection.tsx`'s inline "×" remove-component button;
`ChangePasswordForm.tsx`'s disclosure toggle (a `<button>`, not a link,
despite matching `text-sm text-blue-600 hover:underline` — already the
canonical inline-link style by coincidence, so no change needed).

**Verified:** full unit suite (25 files / 256 tests) and full E2E suite
(25/25) both green — the E2E suite exercises nearly every migrated form
(test-creation wizard, voting, systems CRUD, profile); `tsc --noEmit` shows
no new errors; manual Playwright screenshots of register, login, profile,
and the test-creation wizard's track step (including its success `Callout`
and "add track" `FieldLabel`/`TextInput` form) in both light and dark mode,
authenticated and unauthenticated.

### ✅ 23 — Allow anonymous clip playback
**The gap this closes:** `app/tests/[id]/page.tsx:159-169` is the *only*
gate on playback:
```tsx
{/* Player — login required to see */}
<div className="w-full max-w-full min-w-0">
  {user ? (
    <ABPlayer clipA={clipA} clipB={clipB} />
  ) : (
    <Callout tone="neutral" ...>
      <Link href="/login">{t('signIn')}</Link>{' '}{t('signInToListen')}
    </Callout>
  )}
</div>
```
No middleware involvement (`/tests/[id]` isn't in `middleware.ts`'s
protected-paths list) and no RLS gate (`clips`/`tests` SELECT policies are
`using (true)`) — this single conditional is 100% of the enforcement.
Confirmed separate from the blind/reveal mechanism: `clip_mapping`
visibility (`isCreator || isRevealed`, lines 43-55) and vote-tally
visibility (`canSeeTally`, line 70) are independent gates and do not
change.

**Decisions:**

1. **Playback — remove the gate entirely.** Replace the `user ? ... : ...`
   branch with an unconditional `<ABPlayer clipA={clipA} clipB={clipB} />`.
   No new prop threading needed — `clipA`/`clipB` are already computed
   unconditionally above this block (lines 104-105).

2. **Voting — stays gated, but give anonymous visitors an explicit prompt
   where the vote form used to be invisible.** Today, `{user && !isRevealed
   && <VoteForm .../>}` (line 182) simply renders nothing for a logged-out
   visitor — that was fine when the sign-in callout above it already
   covered "you need an account for any of this." Once playback no longer
   implies that, add a sibling anonymous-only prompt:
   ```tsx
   {!user && !isRevealed && (
     <Callout tone="neutral" className="p-4 sm:p-6 text-center text-sm text-gray-500 dark:text-gray-400">
       <Link href="/login">{t('signIn')}</Link>{' '}{t('signInToVote')}
     </Callout>
   )}
   ```
   placed where `VoteForm` would render. Revealed tests show nothing extra
   for anonymous visitors (voting is already closed for everyone at that
   point, same as today).

3. **Copy — repurpose, don't duplicate.** Rename `messages/en.json`'s
   `tests.signInToListen` (`"to listen to the clips."`) to
   `tests.signInToVote` (`"to vote."`), reusing the existing `tests.signIn`
   ("Sign in") key for both the old and new callout. Confirmed only two
   references to `signInToListen` in the whole repo: `messages/en.json` and
   `app/tests/[id]/page.tsx` — no other call sites to update.

**Files updated:**
- `app/tests/[id]/page.tsx` — the two changes above.
- `messages/en.json` — key rename.
- `api-conventions.md` Rule 3 (currently: *"clip playback requires
  login... Enforced in middleware for protected routes. API routes serving
  clip data must also check that `user` is not null."*) — rewrite to state
  playback is public and only voting requires auth; this existing rule text
  was already slightly aspirational (no middleware or API-route check for
  clip data actually exists today), so the rewrite also corrects that
  inaccuracy.
- `core.md`'s Public paths parenthetical `(login required for play/vote)` →
  `(login required to vote)`.
- `docs/audiophile-compare-app-specification.md` — the visitor-persona
  bullet ("Cannot play clips or vote without registering" → "Can play
  clips; cannot vote without registering") and the page-structure row for
  test detail (`Public (play requires login)` → `Public (voting requires
  login)`).
- `testing.md` §6 coverage table — `public-feed.spec.ts` row gains the new
  anonymous-playback assertion.

**Tests:**
- **Unit:** none added — `app/tests/[id]/page.tsx` is a server component
  with no client-side branching logic to unit test, consistent with the
  existing convention (this page has never had a unit test; it's covered
  end-to-end only).
- **E2E (`e2e/tests/public-feed.spec.ts`, the unauthenticated Playwright
  project):** added a new `Anonymous clip playback` describe block using
  the same `seedCompleteTest` helper `voting.spec.ts` already uses from
  `e2e/helpers/admin.ts`. Covers: an anonymous visitor to a seeded test's
  detail page sees the `ABPlayer` (asserted via the `Clip A`/`Clip B`
  headings it renders); the same page shows the new "Sign in to vote"
  callout (`m.tests.signInToVote`) — scoped to `getByRole('main')` since
  the header nav also has its own "Sign in" link.
- **E2E (`e2e/tests/voting.spec.ts`, authenticated project):** unchanged —
  confirmed it doesn't implicitly depend on the removed branch.

**Verified:** `npm run test` — unit suite unchanged at 25 files / 256 tests,
all passing. `npx tsc --noEmit` — no new errors (32 pre-existing failures
in `__tests__/supabase-client.test.ts`/`supabase-server.test.ts`, unrelated
Supabase-mock typing issues, confirmed present before this step's changes
via `git stash`). `npm run test:e2e` — full suite 27/27 passing (25
pre-existing + 2 new), both the unauthenticated and authenticated projects,
run against a local dev server (`.env.local`'s `E2E_BASE_URL` points at the
staging deployment by default, which doesn't have this branch's code yet —
overrode it to `http://localhost:3000` for this run). Confirms the player
renders for a logged-out visitor and the "Sign in to vote" prompt appears
in place of the vote form on an open test.

### ✅ 24 — Add `/privacy` and `/terms` pages
Built per plan, no deviations. `app/privacy/page.tsx` and `app/terms/page.tsx`
— server components, public, static content, mirroring `app/about/page.tsx`
exactly; neither added to `middleware.ts`'s `protectedPaths`. New `privacy`,
`terms`, and `footer` namespaces in `messages/en.json` (one key per
section heading/paragraph, `about`'s convention).

New `components/SiteFooter.tsx` (Privacy/Terms links, `variant="nav"` on
`Link`) rendered in `app/layout.tsx` below `{children}` — kept deliberately
minimal (no About link, no copyright line) since `SiteHeader.tsx`'s nav
already carries About in both auth states.

Content uses the four details confirmed by the user (`wpete.callaghan@gmail.com`,
England and Wales, minimum age 16, individual operator — "I", not "we",
no company name/address) and is grounded in what the app's code actually
does: Supabase + Vercel + Google (OAuth only) as the only third parties, no
analytics/tracking dependencies, clip URLs are user-supplied links to
externally hosted media rather than anything hosted by the app, and the
`comments` schema table is correctly omitted since no UI reads or writes it
yet. Cross-references step 26 (no self-service account deletion exists yet;
requests go through the contact email) and step 27 (clip links can go dead
— covered by "no warranty").

**Tests:** `e2e/tests/public-feed.spec.ts` — three new assertions in the
unauthenticated describe block: `/privacy` and `/terms` each render (200, no
redirect to `/login`), plus a footer-links-visible check on `/`. No unit
tests — same reasoning as `/about` (static server components, no branching
logic).

**Verified:** `npx tsc --noEmit` clean for all new/changed files (pre-existing
unrelated errors in `__tests__/supabase-*.test.ts` untouched — confirmed
present before this change). `npm run test` — unchanged at 25 files / 256
tests. **Not verified as rendered**: this sandbox has no `.env.local` with
Supabase credentials, so `npm run dev` 500s on every route including
pre-existing ones (confirmed `/about` 500s too, from `middleware.ts` needing
a live Supabase client on every request) — not something introduced by this
step, but a real gap in this step's own verification. Run the dev server or
E2E suite somewhere with Supabase env vars configured (or push to staging)
before relying on this as confirmed-working.

**Still open, not done as part of this step:**
- `docs/google-oauth.md` Option A — these pages are the prerequisite, but
  submitting for Google's brand verification (logo upload, Authorized
  domain via Search Console, publishing the OAuth consent screen) is a
  dashboard action outside this repo, not covered here.

### ⬜ 25 — Fixed header/footer app shell with internal scroll region (planned, not yet built)
**The ask:** header always stays at the top of the viewport, footer always
stays at the bottom, and page content scrolls independently between them —
an app-shell layout, not the current model where the whole document
scrolls in the browser. Plan only — no code written yet.

**Approach — flex-column shell, not `sticky`/`fixed` tricks.** `sticky`/
`fixed` pin an element *within* an otherwise normally-scrolling page, but
don't cleanly produce "content scrolls independently between two fixed
bars." The correct fit:

1. Lock the outer shell to the viewport, no page-level scroll: `<body>`
   becomes `h-dvh flex flex-col overflow-hidden` — `dvh` (dynamic viewport
   height), not `vh`/`h-screen`, because mobile Safari/Chrome resize the
   visible viewport as the address bar shows/hides; `vh` would clip content
   behind that chrome.
2. `SiteHeader`/`SiteFooter` become flex items with `shrink-0` — fixed size
   at the top/bottom of that column, structurally unable to scroll away
   since there's no page scroll for them to scroll with.
3. Wrap `{children}` in a new `flex-1 overflow-y-auto` div in
   `app/layout.tsx` — the only scrollable element. All existing page
   content renders inside it unchanged.

**Files to touch:**
- `app/layout.tsx` — the structural change above
- `components/SiteHeader.tsx`, `components/SiteFooter.tsx` — add `shrink-0`
- `app/login/page.tsx`, `app/register/page.tsx` — both currently use
  `min-h-screen` on their own `<main>` to vertically center their form.
  Nested inside the new scrollable wrapper, `min-h-screen` still means
  "100dvh," forcing an oversized scrollable region regardless of the
  header/footer taking their own space — needs to change to `h-full` (fill
  the available scroll region) instead. No other page needs any change —
  every other page's `<main>` has no explicit height today, so it flows
  naturally inside the new wrapper exactly as it does inside the document
  body currently.

**Risks/decisions to verify at build time, not just assume:**
- **Double scrollbars** — the whole point is one scrollbar (the inner div),
  not two. `overflow-hidden` on the shell plus `overflow-y-auto` only on the
  inner wrapper is what prevents that.
- **Cmd+F / anchor-link scrolling** — browsers generally handle "scroll to
  find" correctly against an internal scrollable element, but this is a
  less common pattern than page-level scroll and is worth a manual check.
- **Short pages get sticky-footer behavior for free** — e.g. an empty feed
  state should show the footer pinned at the true bottom of the viewport,
  not floating right under a short block of content. Worth confirming this
  actually happens rather than assuming the flexbox math works out.

**Testing/verification plan:** screenshot a long page (home feed) at a
small viewport height, scroll the middle region, confirm header/footer
never move; check a short page's footer sits at the true bottom; re-check
`/login`/`/register` still center correctly after the `h-full` change;
light and dark mode; a mobile-sized viewport to confirm `dvh` behaves near
the address bar; confirm no regression of the existing `overflow-x-hidden`
horizontal-scroll guard in `app/layout.tsx`. No unit tests — pure layout/CSS,
no branching logic to cover; same reasoning as steps 19–24's static pages.

### ⬜ 26 — Delete tests, snapshots, and systems (planned, not yet built)
User-requested rules: a creator can delete a **test** they created, but
only if it has **zero votes recorded** — listening is a real time
commitment, so once a vote exists it must be respected and the test is
frozen forever (no delete, presumably no further edits either, though
nothing about tests is currently editable post-creation anyway). A creator
can delete a **snapshot** they created only if it has no undeleted tests
referencing it (as `snapshot_a_id` or `snapshot_b_id`). A creator can
delete a **system** they created only if it has no undeleted snapshots.
Plan only — no code or migration written yet.

**Decision: hard delete (real `DELETE`), relying on the existing foreign
keys' default `RESTRICT` behavior for the cascade ordering — not soft
delete.**

This reverses an earlier pass at this plan (see git history / prior version
of this section), which landed on soft delete via a `deleted_at` column.
That reasoning was entirely about protecting *other users'* votes from a
unilateral delete by the test creator. The vote rule above makes that
protection categorical and unconditional instead: a test with any vote can
never be deleted, full stop — so a test that *is* eligible for deletion is,
by definition, one where nothing but the creator's own `clips`/
`clip_mapping` rows are at stake. Hard-deleting it destroys no one else's
data.

That protection propagates upward for free, by referential integrity, not
just convention: a snapshot can only be deleted once every test that used
it is gone — meaning every one of those tests was either always vote-free
and already deleted, or never existed. Either way, no vote was ever
attached to that snapshot, so hard-deleting it is equally safe. Same logic
covers systems one level up. **No `deleted_at` column, no RLS read-policy
changes, and no new "is this really gone" bookkeeping anywhere** — a plain
`DELETE` plus the database's own existing `REFERENCES` constraints (default
`NO ACTION`, which behaves like `RESTRICT`) already refuse to remove a
snapshot/system while a child row still exists. The one already-decided
piece that carries over unchanged: no restore/undo UI, since a hard delete
has no "undo" to build in the first place.

**Clips are not shared rows — confirmed against the actual cross-check
code, not just the schema doc.** `clips.test_id` is `NOT NULL REFERENCES
tests(id)`; every test, including cross-check tests, gets its own brand-new
pair of `clips` rows. `app/api/tests/cross-check/route.ts` copies the
`source_url`/`provider`/`media_type` *string values* from an existing clip
into fresh rows scoped to the new test — it never re-links an existing
`clips.id`. `lib/clips/find-shared-clips.ts`'s "shared" refers to sharing
the same underlying **track** (recording) across two systems' tests, not a
shared clip row. So there is no scenario where deleting a test's clips
could orphan a clip still used by another test, and no clip-deduplication
work is in scope for this step — each clip already belongs to exactly one
test.

**Schema migration needed — not for the tests/snapshots/systems FKs
themselves (already correctly restrictive by default with no migration
required), but for `clips` and `clip_mapping`, which need `ON DELETE
CASCADE` added to their `test_id` foreign key.** Unlike votes, `clips` and
`clip_mapping` rows are wholly owned by the test — created together with
it, never independently meaningful — so cascading their deletion is correct
and safe, not a repeat of the votes problem:
```sql
ALTER TABLE public.clips
  DROP CONSTRAINT clips_test_id_fkey,
  ADD CONSTRAINT clips_test_id_fkey
    FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE CASCADE;

ALTER TABLE public.clip_mapping
  DROP CONSTRAINT clip_mapping_test_id_fkey,
  ADD CONSTRAINT clip_mapping_test_id_fkey
    FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE CASCADE;
```
(Constraint names above are illustrative — confirm actual names via `\d
tests`/`\d clips` at build time before writing the migration.)
`votes.test_id` deliberately keeps its default (non-cascading) foreign key
as a **second, database-enforced layer of protection**: even if the
app-layer "zero votes" check had a bug, the database itself would still
refuse to delete a test that a vote row references.

**New/updated API routes** (mirroring the existing `PATCH` handlers'
auth/ownership pattern — 401 unauthenticated, 404 on any ownership
mismatch to avoid leaking existence):
- `DELETE /api/tests/[id]` (new) — creator only; 409 if `votes` has any row
  for this `test_id`; else deletes the test (cascading to its own `clips`/
  `clip_mapping`).
- `DELETE /api/systems/[id]/snapshots/[snapshotId]` (new handler on the
  existing route file) — system-owner only; app-layer pre-check returns 409
  if any test still has this snapshot as `snapshot_a_id`/`snapshot_b_id`
  (giving a friendly error), backed by the DB's own FK `RESTRICT` as a
  second layer; else deletes the snapshot.
- `DELETE /api/systems/[id]` (new handler on the existing route file) —
  owner only; same pattern — 409 if any snapshot still references this
  system, else delete.

**Reads need no changes** — a deleted row is simply gone, so the home feed,
track detail's test list, systems list/detail, and both snapshot pickers
(`CrossCheckSelector.tsx`, `steps/StepSnapshots.tsx`) all keep working
exactly as they do today with no new filter to add or forget.

**UI:** a "Delete" action on the test detail page (creator only, hidden or
disabled once `vote_count > 0` — the page already computes this for the
existing vote-count display), the snapshot list in `SnapshotSection.tsx`
(creator only), and the systems list/detail page (owner only) — reusing
`RevealButton.tsx`'s existing two-step confirm pattern (click → inline
confirm/cancel) rather than inventing a new one. Snapshot/system delete
actions can be **proactively disabled** (not just left to fail on submit)
since the page already has the child count in hand — `app/systems/[id]/
page.tsx` already fetches each snapshot's tests, and each system's
snapshots, to render the existing lists.

### ⬜ 27 — Handle verified-broken clip URLs (planned, not yet built)
**The gap this closes:** the URL health-check cron (step 10) already writes
`url_status` (`ok`/`degraded`/`dead`) to `clips` daily, but nothing
downstream ever reads it — a dead end, not a feature. `lib/clips/
to-clip-data.ts` fetches `url_status` off the raw row and drops it before
building the `ClipData` the player receives; `NativePlayer.tsx` has no
concept of it. Today, a dead clip just fails silently in the `<audio>`/
`<video>` element with zero explanation, and the creator has no way to find
out short of noticing it themselves. Plan only — no code written yet.

**Known limitation to document, not solve here:** detection is inherently
partial. The cron only HEAD-checks `provider='direct'` clips — YouTube/
Vimeo embeds return 200 regardless of whether the specific video still
exists (see the comment in `app/api/cron/check-urls/route.ts`), so a
removed YouTube video is invisible to this system. Whatever UI ships here
must not imply "not flagged broken" means "definitely works." Building
embed-specific liveness checking (e.g. oEmbed lookups) is out of scope for
this step.

**Also found while investigating, worth a one-line fix at build time:** step
10's description above says the cron checks clips "in open tests" — the
actual query has no test-status filter at all; it checks every
`provider='direct'` clip regardless of test status. Doc inaccuracy, not a
behavior change.

**Decisions:**

1. **Visibility — all three surfaces, not just one:**
   - Listener-facing: on the test detail page, a `Callout tone="warning"`
     in place of/alongside the player for a `dead` clip (e.g. "Clip A is
     currently unreachable"). Safe to say which *label* (A/B) is broken
     without leaking `clip_mapping` before/after identity, since
     `url_status` lives on the raw clip row, independent of the mapping.
     `degraded` gets a lighter-touch note; the player still renders (may be
     transient — a 5xx or timeout, not necessarily gone for good).
   - Creator-facing: no dedicated "my tests" page exists today, so the
     natural creator-scoped surfaces are the test detail page itself
     (already `isCreator`-aware) and `app/systems/[id]/page.tsx`, which
     already lists the creator's own tests per snapshot with outcome
     badges — the new badge in the next point covers this for free, no new
     page needed.
   - Public feed/list badges: a new `Badge` `status` variant, `broken`,
     added to `components/ui/Badge.tsx`'s existing union (`win | loss |
     draw | blind | revealed | broken`). `FeedCard.tsx`, `app/tracks/[id]/
     page.tsx`'s test list, and `app/systems/[id]/page.tsx`'s per-snapshot
     test list all need their queries extended to embed `clips(url_status)`
     (none of the three fetch clips today) so they can compute "has a dead
     clip" per row.

2. **Vote gating — blocks only on `dead`, not `degraded`:** the test detail
   page computes `hasDeadClip` from the already-fetched clip rows and
   passes it to `VoteForm`, which hides the form and shows an explanatory
   message instead of the normal vote controls when true. Server-side,
   `POST /api/votes` re-checks clip status before accepting and returns 409
   if a chosen clip is dead — defense in depth against a direct API call
   bypassing the UI gate, same pattern as step 24's DB-level backstop on
   vote-blocked test deletion. `degraded` alone never blocks voting — it
   may be transient (a 5xx or a timeout), and blocking on it would punish
   listeners for a possibly-temporary failure.

3. **Remediation — creator can replace a dead clip's URL, but only if the
   test has zero votes, mirroring step 24's "once voted, frozen forever"
   principle exactly.** Replacing a clip's URL changes what's being
   compared; on a voted test that risks retroactively misrepresenting what
   earlier listeners actually heard, the same integrity concern that
   blocks deleting a voted test. New route (`PATCH /api/clips/[id]` or
   similar — no clip mutation route exists today, only `POST /api/clips/
   verify` for validation at creation time) — creator-only, own test only,
   409 if the test has any vote. Reuses the existing verify-then-persist
   flow already built for test creation (`app/api/clips/verify/route.ts`,
   and `StepClips.tsx`'s `ClipInput` UI pattern — URL input + Verify button
   + inline verified/dead message — is a natural fit to extract and reuse
   as an inline "Replace URL" action on the test detail page). If the test
   has votes, no replace action is shown at all — just the permanent
   warning from point 1.

**Not yet decided, to resolve at build time:** whether the cron should
skip re-checking clips on tests that are already `dead` *and* have votes
(nothing can act on that result once frozen) — a minor efficiency
improvement, not a correctness requirement.

---

Deferred features (agentic ingestion pipeline, owned blob storage, mobile app) are documented in `deferred-features.md`.
