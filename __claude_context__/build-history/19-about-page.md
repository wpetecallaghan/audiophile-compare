---
name: audiophile-compare-build-history-19
description: Build step 19 — About / how-it-works page.
---

# ✅ 19 — About / how-it-works page

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
