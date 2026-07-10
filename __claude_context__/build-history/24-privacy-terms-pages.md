---
name: audiophile-compare-build-history-24
description: Build step 24 — Add `/privacy` and `/terms` pages.
---

# ✅ 24 — Add `/privacy` and `/terms` pages

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
