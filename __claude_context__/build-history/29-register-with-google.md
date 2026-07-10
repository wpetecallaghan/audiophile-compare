---
name: audiophile-compare-build-history-29
description: Build step 29 — Register with Google.
---

# ✅ 29 — Register with Google

**The gap this closed:** `/login` has offered "Continue with Google" since
step 14 (tabbed alongside password/magic-link since step 16), but
`/register` (`RegisterForm.tsx`) only ever offered email/password —
there's no way to reach `signInWithOAuth` from the register page today.

**No backend or Supabase/Google config changes needed — confirmed, not
assumed:** `app/auth/callback/route.ts` treats every OAuth code exchange
identically regardless of which page initiated it (no `login` vs
`register` branch, none needed). `handle_new_user()` (the trigger that
creates a `public.users` row) fires `after insert on auth.users for each
row` — unconditional on auth method — so a first-time Google sign-in
already creates the account correctly whether a user clicks the button on
`/login` or a future `/register`. `docs/google-oauth.md` already states
this plainly (its existing "already works for OAuth" framing was written
about `/login`, but the same Google Cloud OAuth client and the single
shared `/auth/callback` redirect URI cover both pages — no new redirect
URI, no new consent-screen scope, nothing to touch in the Google Cloud
Console or the Supabase dashboard). This step is a pure frontend addition:
render the existing, already-generic `OAuthButtons` component
(`components/OAuthButtons.tsx` — takes only an optional `redirectTo` prop,
already has zero knowledge of login vs register) on the register page too.

**Decisions:**

1. **Divider, not a second tab bar.** `LoginTabs.tsx` uses tabs because
   login genuinely has three parallel, equally-weighted methods a
   returning user might reach for (password / magic link / Google).
   Register has one primary path (fill the form) and one one-click
   alternate (Google) — a top-of-page divider ("or register with email")
   above the existing form fits that shape better than tabs, and avoids a
   decision the codebase doesn't need to make yet: `components.md`
   currently describes `LoginTabs.tsx`'s tab bar as deliberately
   uncomponentized because it's "the only tab UI in the app" (step 22).
   Adding a *second*, differently-shaped tab bar (two tabs, no forgot-
   password sub-state) would force that call now, for no UX benefit over
   a plain divider. `app/register/page.tsx` renders `<OAuthButtons />`
   above `<RegisterForm />`, separated by that divider — mirroring where
   `OAuthButtons` originally sat on `/login` *before* step 16 introduced
   tabs there (step 14: "above magic link form").

2. **Reuse `auth.googleButton` ("Continue with Google") as-is — don't add
   a register-specific variant.** `OAuthButtons.tsx` hardcodes
   `t('googleButton')` internally; a register-specific string would mean
   either parameterizing the component (unnecessary complexity for
   different-in-tone-only copy) or forking it. Google's own OAuth button
   branding guidance recommends the same "Continue with Google" wording
   regardless of sign-in vs sign-up context, so reusing the existing key
   isn't just simpler, it's the more correct choice.

3. **No `redirectTo` support added to `/register`.** `/login` threads a
   `redirectTo` query param because middleware redirects unauthenticated
   visitors *to* `/login?redirectTo=...` from a protected route. Nothing
   redirects to `/register` with an intended destination today, and
   `RegisterForm`'s own email/password path doesn't redirect anywhere
   post-submit either (it shows `registrationSuccess` in place, since
   email confirmation is required first). `<OAuthButtons />` on
   `/register` is rendered with no `redirectTo` prop, defaulting to `/` —
   consistent with there being no existing destination to preserve.

4. **Known, expected asymmetry — not a bug, worth a one-line note in the
   UI or docs so it isn't "discovered" later as a defect:** registering
   via Google is instant (no email-confirmation step, since Google already
   verified the address), while email/password registration requires
   confirming via a sent link. Both are correct for their method; nothing
   to reconcile.

**Files updated:**
- `app/register/page.tsx` — renders `<OAuthButtons />` above
  `<RegisterForm />`, with a plain divider between them (two flex-1
  `border-t` rules flanking the label — deliberately not the absolute-
  positioned "line behind centered text on a matching background" pattern,
  which would need to match the page's actual background color exactly;
  getting that pairing wrong is the same bug class `components.md` step 20
  already flagged once for `Button`'s dark-mode background).
- `messages/en.json` — new `auth.orRegisterWithEmail: "or register with
  email"` key; no other new copy (button text reused per decision 2).
- `docs/google-oauth.md` — reworded the opening line and added a paragraph
  after the `handle_new_user` explanation stating plainly that register
  reuses the exact same OAuth client and callback route, so a future
  reader doesn't assume a second Google Cloud/Supabase setup is needed.

**Tests:**
- **Unit:** none needed, as planned — `OAuthButtons.tsx` and
  `RegisterForm.tsx` are both reused/left completely unchanged; their
  existing unit tests needed no changes and still pass.
- **E2E:** new case in `e2e/tests/public-feed.spec.ts` — `/register` shows
  both the Google button and the email form's fields at once (no tabs).
  Same scope limit as the existing login-page Google test: only confirms
  the button renders, doesn't attempt a real OAuth round trip.

**Verified:** `npm run test` — 25 files / 267 tests, unchanged and all
passing (this step touched no unit-tested code). `npx tsc --noEmit` — no
new errors (same pre-existing, unrelated `__tests__/supabase-*.test.ts`
failures as every prior step). `npm run test:e2e` — full suite 43/43
passing (42 pre-existing + 1 new), run against a local dev server
(`E2E_BASE_URL` overridden to `http://localhost:3000`, same reason as
every prior step touching e2e).

---
