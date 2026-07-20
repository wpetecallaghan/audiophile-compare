---
name: audiophile-compare-build-history-81
description: Build step 81 — Remove the interactive magic-link login option from /login, leaving password and Google OAuth login intact.
---

# ✅ 81 — Remove magic-link login

**The request, reported directly:** remove the ability to log in via
"magic link" (passwordless email OTP). Password login and Google OAuth
stay exactly as they were.

**Why this needed care, not just deleting `LoginForm.tsx`:** magic link
shares Supabase Auth infrastructure with several things that must not
break — registration's confirm-account email, password reset's email
link, Google OAuth, and (non-obviously) the e2e test harness's own
authentication. Every touched/untouched file below was confirmed by
reading it directly, not assumed from similar-sounding names.

**The key finding, worth recording so it doesn't get "fixed" by
mistake later:** `e2e/helpers/auth.ts`'s `createAuthenticatedContext()`
(used by `global-setup.ts` to produce the shared `playwright/.auth/user.json`
session every authenticated e2e spec relies on) calls Supabase's **Admin
API** — `admin.auth.admin.generateLink({ type: 'magiclink', ... })` —
directly, then verifies via `token_hash` against
`app/auth/confirm/route.ts`. This is a server-side, admin-only primitive
that never touched `LoginForm.tsx` or `signInWithOtp()` — it borrows the
Supabase `magiclink` OTP *type* purely because admin-issued links can't
carry a PKCE `code_verifier` (a client-initiated `signInWithOtp()` call
sets one up; an admin-generated link has no client to pair it with). This
removal does not touch `e2e/helpers/auth.ts` at all — its `'magiclink'`
references are correct and unrelated, confirmed by running the actual
suite (see Verified).

**Fix — deleted outright** (magic-link-only, no other importers,
confirmed via `grep -rln "LoginForm"`):
- `components/LoginForm.tsx`
- `__tests__/LoginForm.test.tsx`

**Fix — surgical edits** (shared files, only the magic-link slice
removed):
- `components/LoginTabs.tsx` — dropped `'magic'` from the local `Tab`
  union, its `tabs` array entry, the `LoginForm` import, and the
  `{tab === 'magic' && ...}` render block. Password (`LoginWithPasswordForm`
  + `ForgotPasswordForm`) and Google (`OAuthButtons`) tabs untouched;
  default tab was already `'password'`.
- `messages/en.json` (`auth` namespace) — removed exactly three keys:
  `magicLinkButton`, `magicLinkSent`, `tabs.magicLink`. Every other key
  (shared `emailLabel`, password/register/forgot-password/Google copy)
  stays — `emailLabel` in particular is also used by
  `ForgotPasswordForm.tsx` and `RegisterForm.tsx`, confirmed via grep
  before assuming it was safe to remove alongside the magic-link-specific
  keys.
- `e2e/tests/public-feed.spec.ts` — the combined test asserting both the
  magic-link tab and the Google tab in one test became
  `'login page shows a Google sign-in option'`, keeping only the Google
  assertions.

**Docs reworded, not stripped** (all describe genuinely shared behavior,
not magic-link-specific logic):
- `core.md` — redirect-URL mismatch caution (was scoped to "magic link
  logins," now OAuth/registration/password-reset, which have the same
  sensitivity); `auth/callback/route.ts`'s file-layout comment ("Magic
  link + OAuth code exchange" → "OAuth + registration + password-reset
  code exchange"); removed the `LoginForm.tsx` file-layout row; §6
  build-status bump.
- `components.md` — the server-side-redirect exception line reworded from
  "Magic link and OAuth callbacks" to "OAuth, registration, and
  password-reset email-link callbacks."
- `testing.md` — removed the `LoginForm.test.tsx` inventory row; added one
  clause to the e2e-auth description noting `global-setup.ts`'s use of
  `'magiclink'` is the admin-API mechanism above, unrelated to this
  removal.
- `audiophile-compare-schema.md` — the `handle_new_user` trigger's
  `split_part(email, '@', 1)` fallback comment reworded from "magic link
  / password fallback" to "generic fallback when no full_name is
  available" — the fallback logic itself is untouched (still hit by
  password/OAuth signups with no `full_name`), only the comment implied
  magic link was still a live path.
- `deferred-features.md` — both mentions (ingestion-bot auth, mobile-app
  auth) are unbuilt designs that reference the Supabase Auth API
  directly, which still exists after this UI removal — added a
  parenthetical to each noting the interactive web login option is gone
  even though the underlying API isn't.
- `build-history/*.md` steps 02, 14, 16, 17, 18, 19, 29 — left untouched;
  this repo doesn't retroactively edit build history, it records what was
  true at build time.

**Explicitly out of scope** (confirmed independent, not touched):
`app/auth/callback/route.ts`, `app/auth/confirm/route.ts`,
`middleware.ts`, `RegisterForm.tsx`, `ForgotPasswordForm.tsx`,
`LoginWithPasswordForm.tsx`, `OAuthButtons.tsx`, `e2e/helpers/auth.ts`,
`e2e/global-setup.ts`. Also out of scope: the Supabase project's
dashboard-level "Magic Link" email template/OTP toggle (staging +
production) — this repo has no tracked Auth-provider-settings file (only
`supabase/migrations/*.sql`); removing the app's UI entry point does not
disable the underlying Supabase capability. That's a separate, manual,
per-environment step outside version control if wanted.

**Tests:**
- `__tests__/LoginForm.test.tsx` deleted along with the component (13
  `it(...)` blocks by source count; the real reduction confirmed via
  `npm test` was 12 — one was a nested case sharing a describe block, not
  a separate top-level test).
- `e2e/tests/public-feed.spec.ts`'s login test rewritten, not deleted —
  still confirms the Google tab renders correctly.

**Verified:**
- `npm test` — 61 files / 611 tests, all passing (down from 62/623 —
  exactly the `LoginForm.test.tsx` file and its tests gone, nothing else
  changed).
- `npx tsc --noEmit` — no new errors (confirms nothing else imported the
  deleted `LoginForm.tsx`, and `LoginTabs.tsx`'s narrowed `Tab` type still
  checks out); 32 pre-existing, unrelated Supabase-mock-typing errors in
  `__tests__/supabase-{client,server}.test.ts` unchanged.
- `grep -rn "magic"` across the whole repo (code + docs) afterward,
  reviewed by hand: every remaining hit is one of the documented
  exceptions above (`e2e/helpers/auth.ts`'s admin-link mechanism, the
  `testing.md`/`deferred-features.md` clarifying notes) — nothing missed.
  This pass caught one gap the plan itself hadn't listed —
  `core.md`'s `auth/callback/route.ts` file-layout comment — fixed before
  calling this done.
- Manual check in dev: `/login` shows exactly two tabs (Password,
  Google), no "Magic link" tab; password login, forgot-password, and the
  Google button all work as before; `/register` unaffected.
- `npx playwright test public-feed` — the reworked test passes, and the
  shared `playwright/.auth/user.json` session (depended on by every other
  authenticated e2e spec) is still created successfully by
  `global-setup.ts`, confirming the e2e harness's own auth is genuinely
  unaffected, not just claimed to be.
