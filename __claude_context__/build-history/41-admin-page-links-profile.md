---
name: audiophile-compare-build-history-41
description: Build step 41 — Surface admin page links on the profile page.
---

# ✅ 41 — Surface admin page links on the profile page

**The gap this closes:** two admin-only pages exist —
`/admin/erase-user-data` (step 38) and `/admin/claim` (step 39) — both
gated server-side by `isAdminEmail(user.email)`, but neither was linked
from anywhere in the app; an admin had to type the URL by hand.
`SiteHeader.tsx` renders the same nav to every signed-in user regardless
of admin status — there was no admin-only nav surface anywhere.

**Decisions:**

1. **Where the check happens.** Inline in `app/profile/page.tsx`, calling
   `isAdminEmail(user.email)` on the `user` the page already fetches for
   its own redirect check — the same pattern every other call site
   (`/version`, `/admin/erase-user-data`, `/admin/claim`) already uses,
   with no shared wrapper. One more call site didn't justify extracting
   one.
2. **Placement and markup.** A new section at the end of the page, after
   "Change password", separated by the same `<hr>` the other sections
   use. The section heading uses `<Heading level={2}>` — the correct,
   current component per `components.md`'s "one h2 per page section"
   rule — rather than copying the page's own pre-existing hand-rolled
   `<h2 className="text-sm font-semibold">` on the "Change email"
   section (that hand-rolled instance predates/bypasses step 22's
   `Heading` extraction; left as-is, not fixed here, but not perpetuated
   in new code either). Inside the section, two stacked
   `Link variant="inline"` entries, not `variant="card"` (reserved for
   list-of-entities rows like feed/track/system cards — two static
   admin links aren't a list of entities).
3. **Link labels reuse existing strings, not new copies.**
   `messages/en.json` already has `admin.eraseUserData.heading` and
   `admin.claim.heading` — the exact page titles for those two routes.
   The profile page pulls both via two extra `getTranslations()` calls
   and uses them directly as link text, so the labels can never drift
   from what those pages call themselves. Only one new string was
   needed: `profile.adminHeading` ("Admin").
4. **Order:** erase-user-data link first, then claim — matches
   `api-conventions.md` Rule 8's caller list order and the `app/admin/`
   directory listing order.
5. **Testing proportionality — matches steps 38/39's own admin pages,
   not full E2E coverage for a two-link section.** No unit test (the
   page is an async server component with no client-side logic, same
   established convention as every other server page). E2E covers the
   negative case only — confirmed `E2E_TEST_USER_EMAIL` is not in
   `ADMIN_EMAILS` in this environment, so one new assertion in the
   existing `profile.spec.ts` (the Admin section is absent for a normal
   authenticated user) is a real regression guard at zero new fixture
   cost. The positive case (an admin actually sees the links) isn't
   automated — a dedicated admin-only Playwright fixture (its own
   `ADMIN_EMAILS`-listed account, its own storageState, a second
   project) would be disproportionate for two static links; verified
   manually instead, the same way steps 38/39's own admin pages were.

**Files updated:**
- `app/profile/page.tsx` — `isAdminEmail` check, two `getTranslations()`
  calls (`admin.eraseUserData`, `admin.claim`), the new conditional
  section.
- `messages/en.json` — `profile.adminHeading`.
- `e2e/tests/profile.spec.ts` — new assertion: non-admin doesn't see the
  Admin section.
- `__claude_context__/testing.md` §6 — `profile.spec.ts` coverage row
  updated.
- `__claude_context__/components.md` — a short note under the
  `Heading`/`Link` usage docs pointing at this page as a real example of
  `Heading level={2}` + stacked `Link variant="inline"` for a short,
  non-entity link list.
- `__claude_context__/core.md` §6 — new ✅ 41 entry.
- `__claude_context__/build-history/` (this file) — this entry, plus a
  correction to the previously-stale step 39 stub above (it still said
  "planned, not yet built" from before step 39 was actually built and
  verified in a later session; full detail always lived in
  `build-history-ingestion/`, only this file's short summary was out
  of date).

**Tests:** covered inline above — one new E2E assertion, no new files.

**Verified:** `npm run test` — 38 files / 440 tests, all passing, no
change (no unit tests added, matching the plan). `npx tsc --noEmit` — no
new errors (same pre-existing, unrelated `__tests__/supabase-*.test.ts`
failures as every prior step). `npx playwright test
e2e/tests/profile.spec.ts` — run against a local dev server, all 4 tests
passing including the new non-admin assertion. Merged to `Dev`,
`Staging`, and `main` (`6cb757c`); the real admin account confirmed the
positive case — both links visible and working on `/profile` — on all
deployments, the one gap the assistant couldn't close directly (no real
admin credentials in this environment), same as steps 38/39.
