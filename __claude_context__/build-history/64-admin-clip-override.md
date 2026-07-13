---
name: audiophile-compare-build-history-64
description: Build step 64 — admin override for clip-health false positives/negatives (code-complete locally, pending staging verification).
---

# 🚧 64 — Admin override for clip-health false positives/negatives (code-complete, not yet staging-verified)

**The gap:** the URL health-check cron (steps 10/50/58/59) writes
`clips.url_status` automatically, and has two known failure modes with no
manual fix today:
- **False negative, structural:** YouTube/Vimeo embeds always return `200`
  regardless of whether the specific video still exists — step 27
  documented this as an accepted blind spot, "invisible to this system."
- **False positive:** step 50's Cloudflare bot-mitigation incident (fixed
  for that specific host, but the class of failure — a host doing
  something cron traffic trips and browsers don't — can recur elsewhere).

**Decisions:**

1. **Scope: per-clip, not per-test.** A test has two clips (A/B), and the
   concrete blind-spot case (YouTube/Vimeo) is inherently per-clip. Reuses
   every existing per-label mechanism as-is (the A/B warning `Callout`s,
   the creator-controls row, the feed/track/system "Broken" badges)
   instead of inventing a parallel test-level concept.

2. **Schema — 3 new columns on `clips`:**
   ```sql
   ALTER TABLE public.clips
     ADD COLUMN admin_override text CHECK (admin_override IN ('ok', 'dead')),
     ADD COLUMN admin_override_by uuid REFERENCES public.users(id),
     ADD COLUMN admin_override_at timestamptz;
   ```
   No `'degraded'` in the override enum — the two requested admin actions
   are binary ("not broken" / "broken"). No RLS policy needed: the write
   goes through the admin/service-role client, which bypasses RLS
   entirely (same as erase-user-data/claim).

3. **A pure composition function, same shape as step 50's `nextUrlStatus`:**
   ```typescript
   // lib/clips/effective-url-status.ts
   export function effectiveUrlStatus(urlStatus: UrlStatus, adminOverride: UrlStatus | null): UrlStatus {
     return adminOverride ?? urlStatus
   }
   ```
   The cron keeps writing raw `url_status` daily, completely oblivious to
   the override. Every place that reads `url_status` for a "is this
   broken" decision switches to `effectiveUrlStatus(clip.url_status,
   clip.admin_override)`. Clearing the override (`null`) instantly
   reverts to whatever the cron last measured.

4. **New route:** `PATCH /api/admin/clips/[id]/override` — gated by
   session + `isAdminEmail(user.email)` (Rule 8 pattern, 404 for
   non-admins), uses `createAdminClient()`. Body
   `{ override: 'ok' | 'dead' | null }`. Sets `admin_override`,
   `admin_override_by = user.id`, `admin_override_at = now()` together, or
   nulls all three to clear. No Postgres function needed — a plain
   `.update()` mirrors how `PATCH /api/clips/[id]` already works; no
   cross-table cascade requiring `security definer`.

5. **Not gated by vote count or reveal status** — this corrects a
   *signal*, not what was tested.

6. **UI:** new admin-only section on the test detail page, gated by
   `isAdminEmail(user?.email)` directly (not `isCreator` — an admin
   viewing someone else's test must see this too). One
   `AdminClipOverrideControl` per clip (new client component), showing
   raw cron status, effective status, and whichever of "Force broken" /
   "Force OK" / "Clear override" isn't the current state.

7. **Every `hasDeadClip`/badge derivation site updated** to select
   `admin_override` and use `effectiveUrlStatus`: `app/page.tsx` (feed),
   `app/tracks/[id]/page.tsx`, `app/systems/[id]/page.tsx`,
   `app/tests/[id]/page.tsx` (aggregate `hasDeadClip` and the four
   per-label warning conditions), `app/api/votes/route.ts` (409 gate).

8. **`ADMIN_EMAILS` e2e fixture, built (not deferred):** new
   `E2E_ADMIN_USER_EMAIL` env var, a second permanent fixture account
   added to staging's `ADMIN_EMAILS`. `createAuthenticatedContext` gets an
   optional `email` param (default `E2E_TEST_USER_EMAIL`, so every
   existing call site is unaffected). `global-setup.ts` also saves
   `playwright/.auth/admin.json`. `playwright.config.ts` gets a new
   `admin` project (`ADMIN_AUTH_FILE`, scoped via `testMatch` to
   `admin-clip-override.spec.ts` only, same pattern as the
   `unauthenticated` project's `public-feed.spec.ts` scoping).

**Tests (written, passing locally):**
- Unit: `lib/clips/__tests__/effective-url-status.test.ts` (3 tests) — all
  `(urlStatus, adminOverride)` combinations. Part of the full local suite:
  54 files / 559 tests passing (`npm run test`), `npx tsc --noEmit` clean
  (same pre-existing, unrelated `__tests__/supabase-*.test.ts` failures as
  every prior step, no new errors).
- Integration: `app/api/admin/clips/[id]/override/__tests__/
  route.integration.test.ts` — admin-client update against a seeded clip
  (the 3 columns set/clear together); the `clips_admin_override_check`
  CHECK constraint rejects a value outside `ok`/`dead`; an anon-key caller
  can't write them (RLS still blocks it even though the admin route
  itself bypasses RLS) — **written, not yet run**, since it needs this
  step's migration applied to staging first.
- E2E: `e2e/tests/admin-clip-override.spec.ts` (runs under the new
  `admin` Playwright project) — force a raw-`ok` clip to `dead`
  (warning/vote-block appear); clear it (reverts); force a raw-`dead`
  clip to `ok` (warning/vote-block disappear); negative case — control
  absent under the plain `authenticated` session (`test.use({
  storageState: AUTH_FILE })`), including for the test's own non-admin
  creator. **Written, not yet run** — needs the migration applied to
  staging, the `E2E_ADMIN_USER_EMAIL` account created, and that address
  added to staging's `ADMIN_EMAILS`.

**E2E admin fixture, built:** `E2E_ADMIN_USER_EMAIL` env var;
`createAuthenticatedContext` (`e2e/helpers/auth.ts`) takes an optional
`email` param (default `E2E_TEST_USER_EMAIL`, every existing call site
unaffected); `global-setup.ts` saves a second session
(`playwright/.auth/admin.json`); `playwright.config.ts` adds an `admin`
project (`ADMIN_AUTH_FILE`, scoped via `testMatch`/`testIgnore` to
`admin-clip-override.spec.ts` only).

**Docs updated:** `audiophile-compare-schema.md` (new "Admin clip-health
override" section under "Clip health rules," `clips` table definition),
`api-conventions.md` (Rule 7 effective-status note, Rule 8's caller list),
`components.md` (`AdminClipOverrideControl` placement/pattern),
`testing.md` (§4 unit inventory + count, §5 mandatory fixtures, §6
coverage table, §7 integration tests, §8 env vars), `core.md` (§3 file
layout, §6 build status), `docs/dependencies.md` and
`docs/end-to-end-testing.md` (`E2E_ADMIN_USER_EMAIL` setup).

**Files added/changed:**
- `supabase/migrations/20260713100000_clips_admin_override.sql` (new,
  not yet applied to any environment).
- `lib/clips/effective-url-status.ts` (new) + its test.
- `app/api/admin/clips/[id]/override/route.ts` (new) + integration test.
- `app/page.tsx`, `app/tracks/[id]/page.tsx`, `app/systems/[id]/page.tsx`,
  `app/tests/[id]/page.tsx`, `app/api/votes/route.ts` — `admin_override`
  selected alongside `url_status`, `effectiveUrlStatus()` used wherever a
  raw `url_status` check used to decide "is this clip broken."
  `app/tests/[id]/page.tsx` also gets the new admin-controls section and
  `ReplaceClipUrlButton`'s gating switched to the effective status too.
- `components/tests/AdminClipOverrideControl.tsx` (new).
- `messages/en.json` — `tests.adminOverride.*`.
- `e2e/helpers/auth.ts`, `e2e/global-setup.ts`, `playwright.config.ts`,
  `e2e/tests/admin-clip-override.spec.ts` (new).
- `.env.local`, staging `ADMIN_EMAILS`, and the `E2E_ADMIN_USER_EMAIL`
  Supabase Auth account itself are **not yet created/edited** — see
  "Status" below.

**Status:** code-complete and unit/typecheck-verified locally. Still
pending, all requiring a live-infrastructure action deliberately not
taken without explicit sign-off in the same turn as the code:
1. Apply the migration to staging (`supabase db push`), then production.
2. Create the `E2E_ADMIN_USER_EMAIL` account in staging Supabase Auth and
   add it to staging's `ADMIN_EMAILS`.
3. Add `E2E_ADMIN_USER_EMAIL` to local `.env.local`.
4. Run the integration test and the e2e suite (including
   `admin-clip-override.spec.ts`) against staging to confirm end-to-end.
5. Manually `curl`-verify the route's own session/`isAdminEmail` gating
   (401/404 paths), matching steps 38/39's precedent.
