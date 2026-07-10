---
name: audiophile-compare-build-history-28
description: Build step 28 — Concise presentation for unsupported-playback clips.
---

# ✅ 28 — Concise presentation for unsupported-playback clips

**The gap this closed:** `MediaPlayer.tsx` falls back to `UnknownPlayer.tsx`
whenever a clip can't be embedded — either `provider === 'unknown'` (URL
didn't parse) or `provider === 'direct' && media_type === 'unknown'` (a
direct-looking URL whose HEAD response wasn't recognizable audio/video,
e.g. a page link rather than a raw media file). Before this step,
`UnknownPlayer` rendered an amber `Callout` box with "This URL could not be
identified as a supported media source." plus a separate "Open link
directly" link — in *both* the blind and revealed views, taking real
estate that duplicated what the revealed view's blue `MappingBadge` box
already showed once before/after was known.

**Decisions:**

1. **Blind view — strip `UnknownPlayer.tsx` down to a bare link.** Drop the
   `Callout` wrapper and the "could not be identified" message entirely;
   render just the link (kept as `target="_blank" rel="noopener
   noreferrer"`, matching today's external-link handling). The "Clip
   A"/"Clip B" heading above it (rendered by `ABPlayer.tsx`, unchanged)
   already identifies which clip it is, so nothing else is needed.
   `UnknownPlayer`'s existing copy is hardcoded (a pre-existing gap from
   before step 15's i18n rule) — since this is a genuine rewrite of the
   component's content, not a passive reuse like step 27's `ClipInput`
   extraction, add it properly to `messages/en.json` this time instead of
   carrying the gap forward: new top-level `tests.openClipLink: "Open link
   directly"` key.

2. **Shared predicate for "this clip can't be embedded," used by both the
   player and the page** — new `lib/clips/is-unsupported.ts`:
   ```ts
   export function isUnsupportedClip(clip: { provider: string; media_type: string }): boolean {
     return clip.provider === 'unknown' || (clip.provider === 'direct' && clip.media_type === 'unknown')
   }
   ```
   `MediaPlayer.tsx`'s own dispatch chain already encodes this exact
   condition via its cascading `if`s falling through to `<UnknownPlayer>`
   — left as-is, no behavior change needed there. The new helper exists so
   `app/tests/[id]/page.tsx` (which needs the identical boolean for the
   two decisions below) can't silently drift out of sync with
   `MediaPlayer`'s own fallback condition.

3. **Revealed view — `MappingBadge.tsx`'s "Before"/"After" become links
   for unsupported clips only; `ABPlayer.tsx` stops rendering that clip's
   slot.** Two new optional props on `MappingBadge`:
   `clipAUnsupportedUrl: string | null` / `clipBUnsupportedUrl: string |
   null` (the clip's `source_url` when `isUnsupportedClip()` is true for
   it, else `null`). When set, the corresponding "Before"/"After" span
   becomes an `<a href={...} target="_blank" rel="noopener noreferrer">` —
   when `null`, unchanged plain text (a clip with a working embedded
   player doesn't need a redundant link, per your confirmation). Computed
   in `page.tsx` from the already-selected `rawA`/`rawB.provider`/
   `media_type` (no query change needed — both columns are already
   fetched) and passed alongside the existing `clipAId`/`beforeClipId`/
   `afterClipId` props.

   `ABPlayer.tsx` gains two new optional props, `hideClipA?: boolean` /
   `hideClipB?: boolean` (default `false`) — when true, that slot (heading
   + `MediaPlayer`) doesn't render at all, refs/`onPlay` coordination
   untouched (a hidden slot's ref is simply never attached; the sibling's
   pause-the-other-clip call safely no-ops). `ABPlayer` stays exactly as
   unaware of reveal state as it is today — it just receives `true`/`false`
   for a slot it's told not to render, the same architectural boundary
   `isCreator`/`isRevealed` already respect elsewhere (all decided
   server-side in `page.tsx`, never inside a player component). Page.tsx
   passes `hideClipA={isRevealed && !!mapping && isUnsupportedClip(rawA)}`
   (and the `B` equivalent) — gated on `mapping` being non-null too, not
   just `isRevealed`, so a hidden slot is never left with nothing to show
   in the (unexpected) case the mapping fetch itself failed — that must
   match exactly the same condition `MappingBadge` itself is already
   rendered under (`{isRevealed && mapping && <MappingBadge .../>}`).

**Files updated:**
- `components/media/players/UnknownPlayer.tsx` — stripped to a bare link.
- `lib/clips/is-unsupported.ts` (new) — shared predicate.
- `components/tests/MappingBadge.tsx` — two new optional URL props;
  conditional link rendering per clip.
- `components/media/ABPlayer.tsx` — `hideClipA`/`hideClipB` optional props.
- `app/tests/[id]/page.tsx` — computes `hideClipA`/`hideClipB` once; passes
  the new props to both `MappingBadge` and `ABPlayer`.
- `messages/en.json` — new `tests.openClipLink` key.

**Deviation from the plan (found while writing the e2e test, not
anticipated by it):** `e2e/helpers/admin.ts`'s `seedCompleteTest` never
created a `clip_mapping` row — meaning `MappingBadge` had never actually
been exercised by any e2e test before this step. (`voting.spec.ts`'s
existing reveal test tolerated this via `.or(page.getByText(m.tests.
mapping.before))`, matching either outcome rather than asserting mapping
specifically.) Fixed by adding a `seedClipMapping` helper and calling it
from `seedCompleteTest` (clip A = before, clip B = after) — this is a
fixture realism fix for every caller, not just this step's own tests, and
doesn't change `voting.spec.ts`'s existing behavior since its check
already tolerated either branch.

**Files updated (test infrastructure):**
- `e2e/helpers/admin.ts` — `seedClip` gained optional `provider`/
  `mediaType` params (defaulting to the existing hardcoded `'youtube'`/
  `'video'`, backward compatible); `seedCompleteTest`'s `opts` gained
  `clipAProvider`/`clipAMediaType`/`clipBProvider`/`clipBMediaType`,
  mirroring step 27's `clipAStatus`/`clipBStatus`; new `seedClipMapping`
  helper, called from `seedCompleteTest`; `SeededClip` now includes
  `source_url` (needed so e2e assertions can check a link's `href` against
  the actual seeded URL).

**Tests:**
- **Unit:** extended `components/media/__tests__/ABPlayer.test.tsx`
  (1 → 3 tests) — `hideClipA`/`hideClipB` each hide that slot's heading
  and player entirely, leaving the other slot unaffected. No new unit test
  files for `MappingBadge.tsx` or `UnknownPlayer.tsx` — consistent with
  the existing precedent that this class of small presentational
  component (`FeedCard`, `RevealButton`, `DeleteTestButton`,
  `ConfirmButton`, `ClipInput`) is e2e-covered, not unit-tested.
- **E2E:** two new cases in `e2e/tests/clip-health.spec.ts` (same file as
  step 27's dead-clip tests — same "clip surfaces something about itself
  outside the player" family of behavior), seeding a test with clip A
  `provider: 'direct', media_type: 'unknown'`: blind view shows the bare
  link (asserted against the seeded clip's actual `source_url`) with no
  "could not be identified" text anywhere on the page; after the creator
  reveals, Clip A's slot in the player is gone entirely, and exactly one
  link to the clip's URL exists on the page (the mapping badge's Before/
  After label) rather than two.

**Verified:** `npm run test` — 25 files / 267 tests, all passing.
`npx tsc --noEmit` — no new errors (same pre-existing, unrelated
`__tests__/supabase-*.test.ts` failures as every prior step). `npm run
test:e2e` — full suite 42/42 passing (40 pre-existing + 2 new), run
against a local dev server (`E2E_BASE_URL` overridden to
`http://localhost:3000`, same reason as every prior step touching e2e).
Confirmed `voting.spec.ts`'s reveal test still passes unchanged after
`seedCompleteTest` started seeding a real `clip_mapping` row.

---
