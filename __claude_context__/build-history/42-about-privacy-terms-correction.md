---
name: audiophile-compare-build-history-42
description: Build step 42 — Correct /about, /privacy, /terms against real functionality.
---

# ✅ 42 — Correct /about, /privacy, /terms against real functionality

**The gap this closes:** `/about` (step 19) and `/privacy`/`/terms`
(step 24) hadn't been touched since they were written, but real
functionality moved on: anonymous clip playback (step 23), delete
tests/snapshots/systems (step 26), Google Drive as a clip provider
(step 34), and the whole forum-ingestion pipeline — placeholder
accounts, imported content, admin-triggered erasure, and the claim flow
(steps 30-40). Reviewed all three pages' copy line by line against real,
currently-deployed behavior (`middleware.ts`'s protected-paths list, the
live `DeleteTestButton`/`DeleteSystemButton` wiring, the
`clips_provider_check` constraint, and every existing string that
already references imported/placeholder content) rather than assumed.
Two findings were outright contradictions; the rest were omissions, the
most material being that the Privacy Policy said nothing about the
forum-ingestion pipeline at all, despite it processing real people's
forum usernames and posts without their direct registration.

**Findings and fixes (`messages/en.json`):**

1. **Contradiction** — `about.listenersBody1` said *"Listening to clips
   and voting need a free account,"* false since step 23 (`/tests/[id]`
   isn't in `middleware.ts`'s `protectedPaths`, and `ABPlayer` renders
   unconditionally). Rewritten to state playback is open to everyone;
   only voting (and creating tests) needs an account.
2. **Contradiction** — `terms.endingBody` said self-service delete would
   be available *"once that feature is available,"* stale since step 26
   shipped it. Rewritten to state it's available now, with the actual
   eligibility rules (`api-conventions.md` Rule 6: a voted-on test, a
   snapshot still referenced by a test, or a system that still has any
   snapshot, can't be deleted) — and split out the unrelated
   abuse-removal sentence it had been sharing a paragraph with.
3. **Omission** — `privacy.thirdPartiesBody` listed clip hosts as
   *"YouTube, Vimeo, or a direct file URL,"* missing Google Drive (step
   34). Added. Confirmed while checking this: the automated
   reachability check (`app/api/cron/check-urls/route.ts`) only ever
   covers `provider = 'direct'` clips — YouTube/Vimeo/Google Drive
   return 200 regardless of whether the specific video exists, so
   they're not (and can't usefully be) auto-checked — the existing "a
   direct link is still reachable" wording was already correct and left
   unchanged, not broadened.
4. **Omission** — nothing in `privacy` disclosed that some accounts
   (`is_placeholder = true`) and their content were created by the site
   owner from public Lejonklou forum posts, not self-registered. The
   only prior user-facing trace was the "Imported" badge and
   `common.claimContact` on test/system/track pages — visible to any
   visitor, but never explained by the policy itself. Fixed with a
   concise addition to `collectBody` (per-decision: no new subsection).
5. **Omission** — `privacy.rightsBody` covered deletion-on-request but
   not the flip side that's actually built and linked from that same
   badge: imported content can be *claimed* (attributed to the real
   owner's account) instead of deleted (`claim_placeholder`, step 39).
   Added one sentence pointing at the same contact route.

**Files updated:**
- `messages/en.json` — the five strings above (`about`, `terms`,
  `privacy` namespaces). No `.tsx` changes — all three pages already
  render every key in their namespace generically.
- Checked `e2e/tests/public-feed.spec.ts` (the only spec referencing
  these three pages) for anything the copy changes would break — it
  only asserts each page's `heading`, never body text, so nothing needed
  updating there.
- `__claude_context__/core.md` §6 — new ✅ 42 entry.

**Tests:** no new test files — confirmed the one existing spec touching
these pages doesn't assert body copy, so no test changes were needed.

**Verified:** `npm run test` — 38 files / 440 tests, all passing, no
change. `npx tsc --noEmit` — no new errors (same pre-existing, unrelated
`__tests__/supabase-*.test.ts` failures as every prior step). `npx
playwright test e2e/tests/public-feed.spec.ts` — run against a local dev
server, confirming the heading assertions for all three pages still
pass.
