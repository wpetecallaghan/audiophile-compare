---
name: audiophile-compare-build-history-78
description: Build step 78 — Fix revealed-test results silently dropping voter observations for curated (non-Other) listening techniques.
---

# ✅ 78 — Revealed test results were dropping observations for curated techniques

**The problem, reported directly:** on a revealed test's detail page, the
free-text "observation" a listener optionally leaves with their vote
wasn't showing up. Since step 57 narrowed active voting to "Tune Method"
only (a curated, non-"Other" technique), this meant essentially no
observation left by any voter was visible anywhere on a revealed test.

**Root cause:** `lib/votes/compute-tally.ts`'s per-vote aggregation loop
read `vote.observation` off every row, but only ever attached it anywhere
when the vote's technique had `is_other: true` — pushed into the `others[]`
array as part of an `OtherVote`. For a curated (non-"Other") technique, the
vote only incremented the `a`/`b` win counters; the observation text was
read and discarded. `CuratedResult` had no field to hold it, and
`components/tests/TallyDisplay.tsx` had no corresponding UI slot to render
it even if it had survived aggregation. `app/api/votes/route.ts` was never
the problem — it already stores `observation` for every vote regardless of
technique.

**Fix:**
- `lib/votes/compute-tally.ts` — added `CuratedObservation` (`{
  chosenClipId, observation }`) and an `observations: CuratedObservation[]`
  field on `CuratedResult`. The aggregation loop now pushes a
  `CuratedObservation` onto the per-technique accumulator whenever
  `vote.observation` is non-empty, mirroring the existing truthy check used
  for `OtherVote`.
- `components/tests/TallyDisplay.tsx` — renders each curated technique's
  `observations` as a list below its A/B percentage bars, in the same
  visual style as the existing "Other approaches" list (clip label in
  `font-medium`, em dash, then the text).

**Also fixed in the same file, while touching it (not a separate task):**
`TallyDisplay.tsx` hardcoded the literal `'Clip A'`/`'Clip B'` in three
places (the percent-bar labels and the `others` list's clip label) — a
pre-existing violation of `components.md §10` ("never hardcode strings
directly in components") that the new observations block would otherwise
have repeated a fourth time. The project already has a canonical
`tests.mapping.clipALabel`/`clipBLabel` translation key (used by
`MappingBadge.tsx`), so `TallyDisplay` now pulls a second translator —
`const tMapping = await getTranslations('tests.mapping')` — and all four
`'Clip A'`/`'Clip B'` sites use it instead of the literal. The single
hardcoded divergence-callout sentence ("Techniques disagree on the
winner…") was also moved into `messages/en.json` as
`tests.results.divergentWarning`.

**Deliberately left alone:** the `{n === 1 ? 'vote' : 'votes'}` and
`{n === 1 ? 'approach' : 'approaches'}` pluralization ternaries in this
same file. That exact hardcoded-plural pattern is the established
convention repeated verbatim across 9 other call sites project-wide
(`FeedCard.tsx`, `app/tests/[id]/page.tsx`, `app/tracks/[id]/page.tsx`,
`app/tracks/page.tsx` ×2, `app/systems/page.tsx` ×2,
`app/systems/[id]/page.tsx`), and `vitest.setup.ts`'s `next-intl` mock only
does flat `{variable}` substitution — no ICU `{count, plural, ...}`
support — so plural-aware i18n isn't wired up anywhere in this project yet.
Converting only these two instances would make this file inconsistent with
the rest of the app; that's real, separate, app-wide work, not part of
this bug fix.

**Files updated:**
- `lib/votes/compute-tally.ts` — `CuratedObservation` type, `observations`
  field, aggregation loop.
- `lib/votes/__tests__/compute-tally.test.ts` — new `'Curated technique
  observations'` describe block (4 tests).
- `components/tests/TallyDisplay.tsx` — observations list, `tMapping`
  translator, `Clip A`/`Clip B` literal → `tMapping(...)`, divergence
  sentence → `t('divergentWarning')`.
- `messages/en.json` — `tests.results.divergentWarning`.

**Tests:**
- `lib/votes/__tests__/compute-tally.test.ts` — 4 new tests: an
  observation on a curated vote is collected with the right
  `chosenClipId`/text; a vote with no observation leaves `observations`
  empty; multiple voters' observations on one technique are collected in
  order; observations stay scoped to their own technique and don't leak
  into a sibling technique's `observations` array.

**Verified:**
- `npm test` — 61 files / 612 tests, all passing (608 baseline + 4 new).
- `npx tsc --noEmit` — no new errors (32 pre-existing errors in
  `__tests__/supabase-client.test.ts` / `supabase-server.test.ts`, unrelated
  Supabase mock typing issues, confirmed present on `Dev` before this
  change via `git stash`).
- Manual check in dev: cast a vote under Tune Method with a non-empty
  observation, revealed the test, confirmed the observation now renders
  under Tune Method's bars labeled "Clip A"/"Clip B" — previously it
  silently disappeared.

**Real follow-up bug, reported directly after the first version shipped:**
"observations now display, but not the name of the voter who made the
observation." The first version rendered the free-text observation itself
but never surfaced who left it — for a shared, multi-listener A/B test,
an unattributed opinion is much less useful than an attributed one.

**Root cause:** neither of the two votes queries in `app/tests/[id]/page.tsx`
(the revealed-tally batch query and the still-open own-vote query) joined
the `users` table at all, so `RawVoteRow` never carried voter identity
into `computeTally` in the first place — there was no data to attach, not
just a missing render.

**Fix:**
- `lib/votes/compute-tally.ts` — `RawVoteRow` gained a `voter` join field
  (`{ display_name: string | null } | [...] | null`, same array-or-object
  shape Supabase already returns for `technique`). Both `OtherVote` and
  `CuratedObservation` gained a `voterName: string | null` field, resolved
  from the joined row the same way `technique` already is (`Array.isArray
  (...) ? [0] : ...`). `compute-tally.ts` stays a pure function — it passes
  `voterName` through as-is (including `null`); it does not decide what
  "no name" should display as.
- `app/tests/[id]/page.tsx` — both votes queries now additionally select
  `voter:users!user_id(display_name)`, mirroring the existing
  `creator:users!creator_id(display_name, is_placeholder)` join already
  used earlier in the same file for the test's creator. Safe under RLS:
  `users` is `public read` and `votes` is readable by everyone once
  `status = 'revealed'` (the only state this component ever renders full
  observations in), so no new data is exposed beyond what the page
  already discloses once revealed.
- `components/tests/TallyDisplay.tsx` — added a second translator,
  `const tTests = await getTranslations('tests')`, reusing the existing
  `tests.anonymous` ("Anonymous") key for a null `voterName` — the same
  fallback `app/tests/[id]/page.tsx` already uses for the test's creator
  (`creator?.display_name ?? t('anonymous')`) — rather than adding a
  duplicate "Anonymous" string under `tests.results`. Both the curated
  observations list and the "Other approaches" list now append
  `t('observationAuthor', { name: ... })` (new `messages/en.json` key,
  `"— {name}"`) after the observation text, e.g. "Clip A — tighter bass —
  Jane Doe".
- `messages/en.json` — added `tests.results.observationAuthor`.

**Tests:**
- `lib/votes/__tests__/compute-tally.test.ts` — the `vote()` test helper
  now builds a `voter: { display_name }` field; 6 new tests: voter name
  attaches to a curated observation, to an Other vote, the Supabase
  single-element-array join form for `voter` resolves correctly, and three
  null-handling cases (no display name, `voter` object present with a null
  name, `voter` itself null).

**Verified:**
- `npm test` — 61 files / 618 tests, all passing (612 + 6 new).
- `npx tsc --noEmit` — no new errors in touched files.
- Manual re-check in dev: same vote → reveal → reload flow as above, now
  showing "Clip A — [observation text] — [voter's display name]".
