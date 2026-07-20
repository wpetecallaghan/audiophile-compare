---
name: audiophile-compare-build-history-82
description: Build step 82 — Merge login's Password/Google tabs into one view matching /register, split forgot-password into its own page, and build the previously-catalogued AuthShell/Divider components.
---

# ✅ 82 — Login: one view, not tabs; forgot-password gets its own page; AuthShell/Divider built

**The request, reported directly:** put Google sign-in and email/password
sign-in on the same `/login` view, laid out the same way as `/register`
(Google button, divider, form — nothing hidden behind a tab).

**Follow-up, clarified directly:** also stop `/login`'s "Forgot password?"
link from swapping the password form out in place for `ForgotPasswordForm`
— of three options presented (a real separate page; an always-visible
stacked reset form; an inline expand that keeps the login form mounted),
a real page at `/forgot-password` was chosen. This leaves `/login` with
**zero** client-side view-switching, matching `/register` exactly.

**A second finding that changed the shape of this work:** building this
would have meant hand-copying `/register`'s centered-card wrapper (`<main
className="h-full flex items-center justify-center"><div className="w-full
max-w-sm space-y-6 p-8">` + a raw `<h1 className="text-2xl
font-semibold">`) and its "or …with email" divider block into a *third*
file. Both patterns were already on record as identified-but-deliberately-
unbuilt in `build-history/52-componentize-page-layout.md` and
`components.md §13` — `AuthShell` and `Divider` — left at 2 occurrences as
not-yet-worth-it. Per direct instruction to enforce repeated-structure
extraction, not just repeated strings: building a third copy instead of
finally extracting these would have made the existing catalog entry stale
on arrival. Built both now instead.

**Fix:**
- `components/ui/AuthShell.tsx` (new) — the centered-card wrapper, heading
  rendered via the existing `Heading level={1}` rather than a raw `<h1>`,
  fixing the non-responsive-heading defect noted at cataloging time, for
  all three pages at once.
- `components/ui/Divider.tsx` (new) — the labeled horizontal-rule
  separator. Neither component takes `cva` variants (nothing to vary), so
  neither uses `cva`, unlike `Heading`/`PageShell` which do because they
  have real variant props.
- `app/login/page.tsx` — rebuilt as a server component composing
  `AuthShell` + `OAuthButtons` + `Divider` + `LoginWithPasswordForm` + a
  `Link` to `/forgot-password` + the register-link paragraph. No client
  wrapper component needed at all now (previously `LoginTabs.tsx`).
- `app/register/page.tsx` — same content, rebuilt on `AuthShell`/`Divider`
  instead of hand-rolled markup. Same rendered output.
- `app/forgot-password/page.tsx` (new route, public — same bucket as
  `/login`/`/register` in `middleware.ts`'s `protectedPaths`, i.e. not in
  it) — `AuthShell` + `ForgotPasswordForm` + a "back to sign in" link to
  `/login`.
- **Deleted `components/LoginTabs.tsx` outright** — its tab bar and its
  forgot-password in-place swap are both gone; nothing needs a stateful
  wrapper on `/login` anymore.
- `components/ForgotPasswordForm.tsx` — dropped the `onBack` prop and its
  conditional "Back to sign in" `<Button>` (the new page's link handles
  this now, unconditionally, mirroring `RegisterForm.tsx`, which never had
  a back-link of its own either); dropped the internal heading paragraph
  (`AuthShell`'s `heading` prop owns that text now).
- `messages/en.json` (`auth` namespace) — removed the now-unused `tabs: {
  password, google }` object; added `orSignInWithEmail` (mirrors
  `orRegisterWithEmail` exactly). Every other key reused as-is.

**Docs:** `components.md §13` — `AuthShell`/`Divider` moved from the
"catalogued, not implemented" list into full documented API entries
alongside `PageShell`/`Text`/`Section`/`RowCard`/`PageHeader`, same
"use X, never hand-roll Y" framing the others already use. `core.md`'s
file-layout table: `LoginTabs.tsx` row removed; `login`/`register` route
rows annotated with their new composition; `app/forgot-password/page.tsx`
added; `ForgotPasswordForm.tsx`'s prop change noted.

**Tests:**
- `components/__tests__/ForgotPasswordForm.test.tsx` — removed the two
  tests tied to the deleted `onBack` behavior; trimmed the heading
  assertion out of the "renders the email input" test (heading moved to
  the page). Every other test (submit args, success message, "Sending…"
  state, error message) unchanged.
- `e2e/tests/public-feed.spec.ts` — the login test no longer clicks a tab
  before asserting the Google button; a new test confirms the
  forgot-password link navigates to its own page with its own heading.
  The existing register-page test needed no changes — same rendered
  output, just sourced from `AuthShell`/`Divider` now.
- No dedicated test files for `AuthShell.tsx`/`Divider.tsx` — matches the
  existing precedent for this class of component (`Heading.tsx`/
  `PageShell.tsx` have none either).

**Verified:**
- `npm test` — 61 files / 609 tests, all passing (down from 611 — exactly
  `ForgotPasswordForm.test.tsx`'s 2 removed tests, nothing else changed).
- `npx tsc --noEmit` — no new errors; 32 pre-existing, unrelated
  Supabase-mock-typing errors unchanged.
- `grep -rn "LoginTabs\|onBack\|auth\.tabs"` across the repo afterward:
  zero `LoginTabs`/`auth.tabs` hits; the only `onBack` hits are
  `StepPublish.tsx`'s unrelated wizard-navigation prop (`CreateTestForm.tsx`
  → `StepPublish`) — confirmed by reading each hit's file, not assumed
  from the name matching.
- Manual check in dev: `/login`, `/register`, `/forgot-password` all
  render via `AuthShell`, structurally identical (Google button → divider
  → form → footer link, or just form → footer link for forgot-password);
  `/login` has zero client-side swapping; the forgot-password link
  navigates to a real page.
- `npx playwright test public-feed` — the reworked login test, the new
  forgot-password test, and the unmodified register test all pass against
  a real running app.
