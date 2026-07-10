---
name: audiophile-compare-build-history-27
description: Build step 27 — Handle verified-broken clip URLs.
---

# ✅ 27 — Handle verified-broken clip URLs

**The gap this closed:** the URL health-check cron (step 10) already wrote
`url_status` (`ok`/`degraded`/`dead`) to `clips` daily, but nothing
downstream ever read it — a dead end, not a feature. `lib/clips/
to-clip-data.ts` fetched `url_status` off the raw row and dropped it before
building the `ClipData` the player receives; `NativePlayer.tsx` had no
concept of it. Before this step, a dead clip just failed silently in the
`<audio>`/`<video>` element with zero explanation, and the creator had no
way to find out short of noticing it themselves.

**Known limitation, documented not solved here:** detection is inherently
partial. The cron only HEAD-checks `provider='direct'` clips — YouTube/
Vimeo embeds return 200 regardless of whether the specific video still
exists (see the comment in `app/api/cron/check-urls/route.ts`), so a
removed YouTube video is invisible to this system. The UI here must not
imply "not flagged broken" means "definitely works" — it doesn't claim
that anywhere. Embed-specific liveness checking (e.g. oEmbed lookups) is
out of scope for this step.

**Also found while investigating, fixed as a one-liner:** step 10's
description above said the cron checks clips "in open tests" — the actual
query has no test-status filter at all; it checks every `provider='direct'`
clip regardless of test status. Doc inaccuracy, not a behavior change —
corrected in that step's own entry above.

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
     draw | blind | revealed | broken`). `FeedCard.tsx` (home feed,
     `app/page.tsx`) and `app/tracks/[id]/page.tsx`'s test list don't fetch
     `clips` at all yet and need it added; `app/systems/[id]/page.tsx`'s
     per-snapshot test list already embeds `clips(id, label)` (pre-dates
     this step) so it only needs `url_status` added to that existing
     embed. All three need it to compute "has a dead clip" per row.

2. **Vote gating — blocks only on `dead`, not `degraded`:** the test detail
   page computes `hasDeadClip` from the already-fetched clip rows and
   passes it to `VoteForm`, which hides the form and shows an explanatory
   message instead of the normal vote controls when true. Server-side,
   `POST /api/votes` re-checks clip status before accepting and returns 409
   if a chosen clip is dead — defense in depth against a direct API call
   bypassing the UI gate, same pattern as step 26's DB-level backstop on
   vote-blocked test deletion. `degraded` alone never blocks voting — it
   may be transient (a 5xx or a timeout), and blocking on it would punish
   listeners for a possibly-temporary failure.

   **Correction (step 26 shipped after this plan was written, and added a
   second anonymous-only block this rule also needs to cover):**
   `app/tests/[id]/page.tsx` now also renders a "Sign in to vote" `Callout`
   for logged-out visitors (`!user && !isRevealed`) — telling them to sign
   in implies voting is possible once they do, which isn't true on a
   `dead` test. That block should also be suppressed when `hasDeadClip` is
   true; the player-area warning from point 1 already explains why, so no
   second message is needed for anonymous visitors — just hide the prompt
   rather than replace it.

3. **Remediation — creator can replace a dead clip's URL, but only if the
   test has zero votes, mirroring step 26's "once voted, frozen forever"
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

   **Correction:** step 26 (built after this plan was written) already put
   a "Creator controls" row on the test detail page holding `RevealButton`
   and `DeleteTestButton` side by side. "Replace URL" joins that same row
   as a third creator-only action, gated the same way `DeleteTestButton`
   already is (`voteCount === 0`) — no new layout slot needed.

**Resolved at build time:** the cron does **not** skip re-checking clips on
tests that are already `dead` and have votes. It would need a join from
`clips` through `tests` to `votes` just to skip work that's already cheap
(a HEAD request per `direct` clip, once a day) — added complexity for a
marginal efficiency gain, not a correctness requirement the plan actually
needed. Left as a future optimization if the clips table ever grows large
enough for it to matter, not built now.

**Deviations from the plan (found during implementation, not anticipated
by it):**

**`clips` was missing its UPDATE RLS policy on the live database —
present in the initial schema migration file, absent from `pg_policies`
when actually queried.** Cause unknown, predates this step: nothing before
step 27 ever ran `UPDATE` on `clips` (verify doesn't touch the DB, test
creation only `INSERT`s), so the gap was silent until `PATCH
/api/clips/[id]` became the first caller to need it. Without the policy,
Postgres silently updates zero rows on an RLS-blocked `UPDATE` — no error,
so the route returned `200 { ok: true }` while nothing actually changed.
Caught by an end-to-end e2e failure (the page still showed the dead-clip
warning after "successfully" replacing the URL), traced by comparing a
direct authenticated `curl` PATCH against the DB row afterward. Fixed two
ways: recreated the policy
(`20260707093703_restore_clips_update_policy.sql`, applied to staging
only), and hardened the route itself — it now chains `.select().single()`
after the update and treats a missing row as failure, so this class of bug
can't silently recur. See `api-conventions.md` Rule 5's second real-world
instance of this exact failure mode.

**Files updated:**
- `components/ui/Badge.tsx` — `broken` status variant.
- `components/clips/ClipInput.tsx` (new) — extracted from `StepClips.tsx`.
- `components/tests/steps/StepClips.tsx` — now imports the extracted
  `ClipInput`.
- `components/tests/VoteForm.tsx` — `hasDeadClip` prop, blocked-message
  early return.
- `components/tests/ReplaceClipUrlButton.tsx` (new).
- `app/tests/[id]/page.tsx` — `hasDeadClip` computation, per-label
  dead/degraded warnings, anonymous vote-prompt suppression, `VoteForm`
  wiring, `ReplaceClipUrlButton`(s) in the creator-controls row.
- `app/api/clips/[id]/route.ts` (new) — `PATCH`, replace a clip's URL.
- `app/api/votes/route.ts` — dead-clip 409 check.
- `app/page.tsx` + `components/feed/FeedCard.tsx`,
  `app/tracks/[id]/page.tsx`, `app/systems/[id]/page.tsx` — `url_status`
  added to each's clips query; `broken` badge takes priority over the
  normal status wherever each computes one.
- `messages/en.json` — `tests.clipHealth.*`, `tests.vote.blockedByDeadClip`,
  `tests.replaceClip.*`, `feed.statusBroken`, `tracks.statusBroken`.
- `supabase/migrations/20260707093703_restore_clips_update_policy.sql`
  (applied to staging only, per the "staging first" deployment topology).

**Tests:**
- **Unit:** extended `VoteForm.test.tsx` (20 → 22) for `hasDeadClip`
  (renders normally by default; shows the blocked message and hides the
  form/radios when true). No new tests for `ReplaceClipUrlButton.tsx` or
  `ClipInput.tsx` — consistent with the existing precedent that this class
  of component (`RevealButton`/`DeleteTestButton`/`DeleteSystemButton`,
  and every `components/ui/*` primitive) is e2e-covered, not unit-tested.
- **E2E:** new `e2e/tests/clip-health.spec.ts` (4 tests) — dead-clip
  warning shown and player still renders; vote form replaced with the
  blocked message; creator replaces the dead clip's URL and the warning
  clears; "Broken" badge shown on both the track and system detail pages.
  Extended `e2e/helpers/admin.ts`'s `seedClip`/`seedCompleteTest` with an
  optional `url_status`/`clipAStatus`/`clipBStatus` override (default
  `'ok'`, backward compatible with every existing caller).

**Verified:** `npm run test` — 25 files / 265 tests, all passing.
`npx tsc --noEmit` — no new errors (same pre-existing, unrelated
`__tests__/supabase-*.test.ts` failures as every prior step). `npm run
test:e2e` — full suite 40/40 passing (36 pre-existing + 4 new), run
against a local dev server (`E2E_BASE_URL` overridden to
`http://localhost:3000`, same reason as steps 23/26 — staging doesn't have
this branch's code). Confirmed via a direct authenticated `curl` PATCH
plus a follow-up `pg_constraint`/`pg_policies`/row query — not just the
passing e2e test — that the clip actually changes in the database, not
just in the UI. Also spot-checked the feed's "Broken" badge directly via
`curl` against the rendered HTML (public page, no auth needed).

---
