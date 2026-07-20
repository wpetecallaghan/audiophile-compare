---
name: audiophile-compare-build-history-79
description: Build step 79 — Show the Clip-A snapshot's real name in the test-creation wizard's Clips step "before" question, and finish translating StepClips.tsx and ClipInput.tsx's hardcoded copy.
---

# ✅ 79 — Clips step shows the real snapshot name; ClipInput copy translated

**The request, reported directly:** in the 3rd step of the test-creation
wizard ("Clips" — `StepClips.tsx`), the "Which clip is the 'before'
system?" question and its two radio labels ("Clip A is before" / "Clip B
is before") were both abstract — nothing on screen reminded the person
which real system snapshot (chosen in the previous "Systems" step) was
riding on Clip A vs Clip B. Clarified directly with the user: the question
becomes "Which clip is '{first snapshot name}'?", and each radio label
swaps the literal word "before" for that same snapshot name — e.g. "Clip A
is v2 — Furutech cable upgrade" / "Clip B is v2 — Furutech cable upgrade".
"First snapshot" = `draft.snapshotA`, the snapshot already tied to Clip A
from the Systems step (`StepSnapshots.tsx`). The underlying toggle logic
(`beforeIsA: boolean`) is unchanged — only the wording.

**Fix (`components/tests/steps/StepClips.tsx`):**
- `firstSnapshotName` — a local `` `v${version} — ${label}` `` expression,
  matching the exact format `StepSnapshots.tsx`'s own snapshot list items
  and `StepPublish.tsx`'s summary already use for the same purpose. Scoped
  locally to this file rather than extracted to a shared module — this is
  the format's third call site project-wide, but the other two
  (`StepSnapshots.tsx`, `StepPublish.tsx`) aren't otherwise touched by
  this change, and extracting a shared formatter that only one new caller
  would use is speculative, not something this change needs.
- The question and radio-label text now come from `en.json` (interpolated
  via `t('beforeQuestion', { snapshot: ... })` /
  `t('beforeLabel', { side, snapshot: ... })`) instead of a static string
  plus a hardcoded JSX literal.
- The step's intro paragraph ("Enter the URL for each recording…"), also
  previously hardcoded in this same file, moved to `t('description')` in
  the same pass — matching the naming precedent `StepSnapshots.tsx`
  already uses for its own intro paragraph.

**Also fixed, requested directly as part of this change:**
`components/clips/ClipInput.tsx` — shared by `StepClips.tsx` and
`ReplaceClipUrlButton.tsx` (the creator's "replace a dead clip's URL"
flow) — still had its own hardcoded copy: the "Clip {label}" heading, the
dead-URL error message, and the three-fragment "Verified — {provider}[,
{media_type}][ (server responded slowly…)]" success message. Both
existing callers already sourced `ClipInput`'s other three strings
(`urlPlaceholder`, `verifyLabel`, `verifyingLabel`) from the identical
`tests.clipsStep` namespace and keys, passed down as props — genuinely
redundant threading, since neither caller ever passed anything different.
Fixed by having `ClipInput.tsx` call `useTranslations('tests.clipsStep')`
itself (it's already `'use client'`) instead of taking those three by
prop, and sourcing the newly-translated strings the same way. Both
`StepClips.tsx` and `ReplaceClipUrlButton.tsx` dropped the now-gone
`urlPlaceholder`/`verifyLabel`/`verifyingLabel` props from their
`<ClipInput .../>` calls — a mechanical follow-on of the prop-signature
change, not new logic in either file.

**`messages/en.json`** (`tests.clipsStep` namespace) — new keys:
`description`, `clipLabel`, `deadUrlError`, `verified`,
`verifiedMediaType`, `verifiedDegraded`; `beforeQuestion` reworded; new
`beforeLabel` key (`"Clip {side} is {snapshot}"`).

**Real bug caught by manual verification, not the unit test:** the first
version of `beforeQuestion` was written as `"Which clip is '{snapshot}'?"`
— a single apostrophe immediately before `{snapshot}`. In real
next-intl/ICU MessageFormat (unlike `vitest.setup.ts`'s mock, which does
plain `{variable}` regex substitution with no ICU semantics), a bare `'`
opens a "quoted literal" span that runs to the next `'`: everything inside
— including `{snapshot}` — is treated as literal text and NOT
interpolated, and the quote characters themselves are stripped from the
output. So the real rendered question read literally **"Which clip is
{snapshot}?"** — no quotes, unsubstituted placeholder — while the unit
test (using the simplified mock) passed, and the sibling `beforeLabel` key
(no apostrophes) rendered correctly, giving no other signal anything was
wrong. Caught only by driving the real wizard end-to-end in a browser
(Playwright against a live `next dev` server) as this step's manual
verification, exactly the gap unit tests using this project's next-intl
mock can't cover. Fixed by doubling the apostrophes — ICU's escape for a
literal `'` character — to `"Which clip is ''{snapshot}''?"`, which
renders correctly under real ICU (`'v2 — Furutech cable upgrade'`) and
required updating `StepClips.test.tsx`'s two assertions to expect the
doubled quotes passing through the simplified mock unescaped (documented
inline in the test with the reasoning above, so a future reader isn't
confused by the seemingly-doubled punctuation). Checked the rest of
`en.json` for the same `'{` pattern before considering this fixed — no
other occurrences found; this was a first-time mistake, not a
pre-existing latent bug elsewhere.

**Deliberately out of scope:**
- `StepSnapshots.tsx` / `StepPublish.tsx`'s own pre-existing `` v{version}
  — {label} `` occurrences — genuine duplicates of the same format, but
  neither file is otherwise touched by this change; see above.
- No new test file for `ClipInput.tsx` itself — it had no prior test
  coverage, and this change fixes its copy without newly establishing
  test scaffolding for a previously-untested file.

**Files updated:**
- `components/tests/steps/StepClips.tsx`
- `components/clips/ClipInput.tsx`
- `components/tests/ReplaceClipUrlButton.tsx` (prop removal only)
- `messages/en.json`

**Tests:**
- New `components/tests/__tests__/StepClips.test.tsx` (5 tests) — mirrors
  the existing sibling-step convention
  (`components/tests/__tests__/StepSnapshots.test.tsx`, tests for these
  wizard step components live one level up from `steps/`, not nested
  under `steps/__tests__/`): the question renders with Clip A's snapshot
  name interpolated; both radio labels render with that name substituted
  for "before"; completing the step with the default selection reports
  `beforeIsA: true`; selecting the Clip B radio and completing reports
  `beforeIsA: false`; renders without crashing when `snapshotA` is null
  (type allows it even though the wizard flow never actually reaches this
  step with it null).

**Verified:**
- `npm test` — 62 files / 623 tests, all passing (618 baseline + 5 new).
- `npx tsc --noEmit` — no new errors in touched files.
- Manual check in dev: walked the wizard (Track → two different snapshots
  on two systems in Systems step → Clips step), confirmed the question and
  both radio labels show the real Clip-A snapshot name, and that toggling
  the radio and completing the wizard still produces the correct
  `Clip A (before)` / `Clip B (after)` pairing on the Publish step's
  summary.
