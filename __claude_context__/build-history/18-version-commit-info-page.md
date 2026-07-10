---
name: audiophile-compare-build-history-18
description: Build step 18 — Deployed version / commit info page.
---

# ✅ 18 — Deployed version / commit info page

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
