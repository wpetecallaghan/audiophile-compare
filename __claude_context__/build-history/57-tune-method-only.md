---
name: audiophile-compare-build-history-57
description: Build step 57 — Voting narrowed to Tune Method only; step 45's per-user technique preferences removed.
---

# ✅ 57 — Voting narrowed to Tune Method only

**The product decision:** Audiophile Compare now offers only Tune Method
when casting a *new* vote. The rationale, and the About page copy
explaining it, were originally drafted from first principles (an
unsourced claim that Tune Method's "rhythm/timing" focus survives
clip/recording degradation better than the other techniques) — **this
turned out to be wrong and was corrected the same day**, once checked
against the two source documents backing this method: Linn's "Tune Dem"
and Lejonklou's "Tune Method" (both kept in the repo root/`e2e/helpers/`
as reference-only source material, not application code). Neither source
frames the method around rhythm or timing at all — that's a different,
separate technique (PRaT) already in this schema. Both instead describe
following the tune/melody itself (can you sing along, follow the pitch
relationships), and both independently rate it as the most reliable
comparison method they've used. The sourced reason this app offers it
*exclusively*: Lejonklou's own document states Tune Method comparisons
are normally hard to do in a blind test *unless* the listener has full
control over the music, volume, and switching — "when this is the case,
the Tune Method works great" (paraphrased) — which is exactly the
self-paced format this site offers. See "Follow-up: source-accuracy
correction" below for the specifics of what changed and why.

**Decisions:**

1. **Deactivate, don't delete.** A new migration
   (`20260712170000_deactivate_non_tune_method_techniques.sql`) sets
   `is_active = false` on the other five rows (PRaT, Tonal / Frequency
   balance, Soundstage & imaging, General preference, Other) rather than
   touching the table shape or any historical data. Every existing vote,
   and every test's per-technique results breakdown
   (`computeTally`/`TallyDisplay`), is untouched — those already-cast
   votes still render exactly as before. Only what a *new* vote can be
   cast under changes. Reversible: reactivating a row is enough to offer
   it again, since every read site (`app/tests/[id]/page.tsx`'s technique
   fetch, the new server-side check below) filters generically on
   `is_active`, never hardcoded to "Tune Method" by name.
2. **`POST /api/votes` now rejects a vote under an inactive technique
   (400).** Before this step, nothing stopped a direct API call from
   voting under a deactivated `technique_id` — the UI hiding inactive
   techniques was the only enforcement. Added the same defense-in-depth
   check the dead-clip rule already uses (step 27): re-verify server-side
   what the UI already filters for the same reason a client could bypass
   either.
3. **The step 45 per-user technique-preferences feature was removed
   entirely** — UI section on the profile page, `TechniquePreferencesForm`
   component, and `PATCH /api/profile/technique-preferences` route. With
   only one active technique, "choose which techniques you want offered"
   had nothing left to choose between: the picker would always render
   exactly one checkbox that could never be unchecked (the existing min-1
   rule), which actively undercuts "voting is by Tune Method" rather than
   reinforcing it. `user_technique_preferences` the table, and
   `claim_placeholder`'s reassignment/collision handling for it, were
   deliberately **not** touched — real user data, cheap to keep dormant,
   and it costs nothing to leave the reassignment logic in place against
   the day a technique is reactivated.
4. **`app/tests/[id]/page.tsx`'s technique fetch simplified** to just the
   active-techniques query — the per-user-preferences union query it used
   to run alongside that (decision 4 of step 45: "a technique already
   voted on for this test stays offered even after being disabled
   elsewhere") is now dead code, since there's no preference table read
   left to union against. The equivalent gap for the *global* `is_active`
   flag (a deactivated technique's vote block simply stops rendering, even
   for someone who already voted under it) already existed before step 45
   and is unchanged by this step either — same as it's always been.
5. **`VoteForm.tsx` stayed structurally generic** — it still renders one
   card per entry in `techniques[]`, which now simply always has length 1.
   No loop/keying logic was ripped out; only copy that assumed multiple
   techniques could be true at once (the subheading, previously hardcoded
   outside `messages/en.json` — moved into `tests.vote.subheading` while
   touching it) was reworded. Kept generic rather than hand-collapsed to a
   single-technique layout, consistent with decision 1's reversibility.
6. **About page rewritten**, not just appended to.
   `about.listenersBody2` previously told listeners to "pick... for
   whichever listening technique you're focused on (Tune Method, tonal
   balance, soundstage, timing, or your own general preference)... vote
   again using a different technique" — now false, so it was rewritten
   rather than left stale next to a new section contradicting it. A new
   "Why Tune Method" section was added between "Why this exists" and
   "Using it as a listener" — the rationale belongs before the how-to,
   not after it.

**Files updated:**
- `supabase/migrations/20260712170000_deactivate_non_tune_method_techniques.sql`
  (new) — decision 1.
- `supabase/migrations/__tests__/deactivate-non-tune-method-techniques.test.ts`
  (new) — pins the migration's `is_active = false` / `name <>` clauses,
  reusing `TUNE_METHOD_TECHNIQUE_NAME` from
  `lib/ingestion/ingest-test-payload.ts` rather than a second literal,
  same pattern that file's own existing test uses against the seed
  migration.
- `app/api/votes/route.ts` — decision 2.
- `app/tests/[id]/page.tsx` — decision 4; also dropped the "change your
  listening methods from your profile" reminder `Callout` (nothing left
  to configure).
- `app/profile/page.tsx` — removed the "Listening methods" `Section` and
  its now-unused queries.
- `components/TechniquePreferencesForm.tsx`,
  `components/__tests__/TechniquePreferencesForm.test.tsx`,
  `app/api/profile/technique-preferences/route.ts` — deleted (decision 3).
- `components/tests/VoteForm.tsx` — decision 5.
- `app/about/page.tsx` — decision 6.
- `messages/en.json` — added `tests.vote.subheading`, `about.tuneMethodHeading`/
  `tuneMethodBody1-3`; rewrote `about.listenersBody2`; removed the now-orphaned
  `profile.techniques*` keys, `common.profileLink`, and
  `tests.techniquePreferencesReminder`.
- `e2e/tests/profile.spec.ts` — deleted the "Listening technique
  preferences" describe block and its now-unused import.
- `e2e/tests/voting.spec.ts` — deleted the "Technique preferences applied
  to voting" describe block; reworded the surviving "cast a vote" test
  away from "the first technique".
- `e2e/helpers/admin.ts` — removed `getActiveTechniqueIds`,
  `getTechniqueIdByName`, `setTechniquePreferences`,
  `resetTechniquePreferences` (only consumers were the deleted blocks
  above).
- `e2e/helpers/constants.ts` — removed `ROLE.checkbox` (only consumer was
  the deleted profile.spec.ts block).
- Docs: `core.md` (step count, unit suite count), `entry.md` (same),
  `components.md` (removed the `TechniquePreferencesForm` subsection;
  repointed a code example that referenced it to `ChangeEmailForm`
  instead), `audiophile-compare-schema.md` ("listening_techniques
  governance" rewritten for decisions 1 and 3),
  `api-conventions.md` (Rule 7 gained the active-technique check;
  removed a stale "clean example" pointing at the now-deleted
  `PATCH /api/profile/technique-preferences` route), `testing.md`
  (unit/E2E inventory rows updated; removed the technique-preference
  E2E-helper note), `build-history/45-per-user-technique-preferences.md`
  (forward-pointer note added, left otherwise intact as a historical
  record), `build-history/index.md` (this entry).

**Tests:**
- New: `supabase/migrations/__tests__/deactivate-non-tune-method-techniques.test.ts`
  (2 cases).
- Deleted: `components/__tests__/TechniquePreferencesForm.test.tsx` (13
  cases, component deleted).
- Unit suite after this step: 48 files / 521 tests.

**Verified:**
- `npm run test` — 48 files / 521 tests, all passing.
- `npx tsc --noEmit` — no new errors (same pre-existing, unrelated
  `__tests__/supabase-*.test.ts` failures as every prior step; also
  cleared a stale `.next/` type-check error pointing at the deleted
  `technique-preferences` route — a regenerated build artifact, not a
  real error).

## Follow-up: source-accuracy correction (same day)

Given two reference documents (Linn's "Tune Dem" PDF, Lejonklou's "Tune
Method" markdown — both reference-only, not application code), the
original About page copy and this doc's own opening rationale were
checked against them and found to conflate Tune Method with PRaT (see
above) and to invent unsourced audio-engineering claims (compression
artefacts, phone-mic frequency response, loudness normalization —
appearing in neither source). Corrected:

- `messages/en.json` — `about.tuneMethodBody1-3` rewritten: what the
  method is (follow the tune/melody, not tone/detail/character), where
  it's from (named attribution to both sources, paraphrased not quoted),
  and why this site offers it exclusively (Lejonklou's own point about
  blind tests working well *with* listener-controlled switching, which
  is this site's actual format — not a claim about clips surviving
  degradation better than other techniques, which neither source
  supports). `about.listenersBody2` reworded from "flows better" to
  "easier to follow the tune on", matching the sources' actual language.
- `supabase/migrations/20260712174500_correct_tune_method_description.sql`
  (new) — the seeded `listening_techniques` description for Tune Method
  ("Assesses rhythmic coherence, pace, and timing — whether the music
  flows naturally", from the original `20260625094142_initial_schema.sql`
  seed) had the identical rhythm/timing conflation and is shown live on
  the vote form next to "Tune Method" — left uncorrected it would have
  contradicted the corrected About page. Updated to "Assesses how easily
  you can follow the tune — not tone, detail, or overall character".
  `supabase/migrations/__tests__/correct-tune-method-description.test.ts`
  (new, 3 cases) pins the update target and asserts the new description
  doesn't reintroduce the rhythm/pace/timing conflation.
- `audiophile-compare-schema.md` — "listening_techniques governance"
  section's own rationale rewritten to match (it had the same fabricated
  claim, having been written from the same unsourced first draft).

**Not done:** no hyperlinks to the source documents were added to the
About page — no confirmed public URL for either was available, and
neither should be guessed. Named attribution only ("Linn... Lejonklou").

## Follow-up 2: the actual origin discussion (same day)

The user pointed to a specific post in a public Lejonklou forum thread —
"Building a dedicated service for listening tests" — and asked that the
About page be checked against it too. Fetched directly (`curl` with a
browser `User-Agent`; a plain `WebFetch` call 403'd) and parsed with the
real ingestion scraper's own `parsePostsFromPage`/`findNextPageUrl`
(`lib/ingestion/scrape/parse-thread-page.ts`) via a throwaway scratch
script, not committed — same read-only, diagnostic use as Follow-up 1's
DB checks. This turned out to be the actual origin thread for this
product decision, and for this very app: the site owner (posting as
`springwood64`) describes building Audiophile Compare with Claude's help
starting 2026-06-24; Lejonklou (posting as `lejonklou`) — the method's
namesake — replies directly. In post `p78529`, Lejonklou argues that a
clip, especially a phone recording, "strips away the nice sound... and
you're left with something that can only be judged on a fundamental
level," making every technique except Tune Method "not just pointless
but ruining the whole idea." The site owner's very next reply (`p78530`)
says this argument is what changed their mind to restrict the service to
Tune Method — i.e. this forum post is the *actual, direct* cause of the
product decision step 57 implements, not an after-the-fact rationale.

This is more specific and more authoritative than either formal
reference document for the "why exclusively" question (neither the Linn
PDF nor the Lejonklou markdown discusses recorded clips at all) — so it
replaced Follow-up 1's weaker framing rather than sitting alongside it:

- `messages/en.json` — `about.tuneMethodBody3` replaced (was the
  blind-test-with-listener-control point, now the clip-specific
  argument, paraphrased with one short direct quote); the original point
  demoted to new `about.tuneMethodBody4`, kept since it's still true and
  still sourced, just secondary. Added `about.tuneMethodSourceLink`
  ("Read the forum discussion").
- `app/about/page.tsx` — renders `tuneMethodBody4` and a real link to
  the forum thread (`https://www.lejonklou.com/forum/viewtopic.php?p=78529#p78529`)
  — a genuine exception to Follow-up 1's "don't link, no confirmed URL"
  call, since this URL was given directly by the user and confirmed
  working, not guessed.
- `audiophile-compare-schema.md` — "listening_techniques governance"
  extended with the forum-sourced rationale as the primary "why
  exclusively" explanation, formal-PDF point kept as secondary.

**Verified:** `npm run test` — 49 files / 524 tests, still passing;
`npx tsc --noEmit` — clean; `messages/en.json` — valid JSON.
