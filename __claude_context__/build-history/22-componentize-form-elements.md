---
name: audiophile-compare-build-history-22
description: Build step 22 — Componentize remaining repeated form/text elements.
---

# ✅ 22 — Componentize remaining repeated form/text elements

Same motivation and process as steps 20/21: `Button`, `Badge`, and `Link`
only covered three element types. An audit of every other DOM element
styled more than once (`grep` on exact className strings across `app/` and
`components/`, excluding `components/ui/`) turned up five more repeated
roles, all now componentized, plus two one-off bugs fixed mechanically.

**1. `components/ui/Heading.tsx`** — `<Heading level={1|2}>`, a `cva` with
`level` as the only variant. Replaced 12 `<h1>`s and 13 `<h2>`s. One `<h2>`
look-alike (`ChangePasswordForm.tsx`'s `text-sm font-semibold` disclosure
heading) uses a genuinely different, smaller size and was correctly left
raw rather than forced into `level={2}`.

**2. `components/ui/FieldLabel.tsx`** — `tone: 'standard' | 'muted'`.
`standard` (`text-sm font-medium mb-1`) replaced 15 near-identical labels.
`muted` (`text-xs text-gray-500 dark:text-gray-400 mb-1`) unified three
disagreeing variants found across `CrossCheckSelector.tsx` (was `text-xs
font-medium text-gray-500...`, no `mb-1`), `VoteForm.tsx` (matched exactly),
and — found only once actual migration started, not in the original audit
— `SnapshotSection.tsx`'s label/notes fields (was `text-xs font-medium
text-gray-600 dark:text-gray-300 block mb-1`, a third color). All three
converged on one canonical muted style.

**3. `components/ui/TextField.tsx`** — exports `fieldVariants` (`cva`,
`size: 'standard' | 'compact'`) plus three thin wrappers, `TextInput`,
`TextArea`, `Select`, all consuming it — same relationship `Button.tsx` has
to `buttonVariants`. `standard` replaced 18 occurrences; `compact` unified
the two disagreeing tiers found in the audit (`VoteForm.tsx`'s
`ring-blue-400`/`text-sm` vs `SnapshotSection.tsx`'s `ring-blue-500`/
`text-xs`) onto one pairing — `ring-blue-500` (matches `standard`'s ring
color) and `text-xs` (matches `Button`'s own size convention, where
`compact` means smaller text). The 12-occurrence bug variant (missing
`border-gray-200` + no focus ring) was folded into `standard`, gaining a
visible focus ring and a proper light-mode border where neither existed
before. **Real gotcha hit during the build**: `<input>`/`<select>` both
have a *native* HTML `size` attribute (numeric — character width / visible
option count) that collides with a `cva` variant prop of the same name;
`TextInputProps`/`SelectProps` explicitly `Omit<..., 'size'>` from the DOM
props before intersecting with the variant props to avoid a silent type
error. `TextArea` has no such native `size`, so needed no workaround.

**4. `components/ui/FormMessage.tsx`** — `tone: 'error' | 'success'`,
fixed `text-sm` always (real usage split `text-sm`/`text-xs` 7-vs-12
with no semantic reason). Replaced 19 error + 4 success occurrences,
including fixing `StepClips.tsx`'s stray `green-700` (now `green-600`,
matching every other success message).

**5. `components/ui/Callout.tsx`** — `tone: 'warning' | 'success' | 'info' |
'neutral'`. Replaced 6 alert/info boxes (`RevealButton.tsx`,
`TallyDisplay.tsx`, `UnknownPlayer.tsx` — warning; `StepTrack.tsx` —
success; `MappingBadge.tsx` — info; `app/tests/[id]/page.tsx`'s sign-in
gate — neutral). Padding/text-size overrides passed via `className` where
an instance genuinely differs (`TallyDisplay.tsx`'s tighter `px-3 py-2.5`).
**Fixed `MappingBadge.tsx`'s dark-mode bug**: `bg-blue-50 border-blue-200`
had no `dark:` classes at all — the box itself now inherits dark variants
from `Callout`'s `info` tone, and the inner text colors (`text-blue-900`,
`text-blue-700`) were given matching `dark:text-blue-100`/
`dark:text-blue-300` pairs that were also missing before.

**Two bugs found during the original audit, fixed mechanically —
no new component involved:**
- `VoteForm.tsx`'s submit button (`rounded bg-blue-600 ...`) had been missed
  by the step-20 Button/Badge migration — the same "blue primary instead of
  black" bug that migration fixed everywhere else. Now a plain `<Button>`.
- `SignOutButton.tsx`'s raw `<button>` classes were character-for-character
  `linkVariants({ variant: 'nav' })` from step 21, hand-copied because
  signing out isn't page navigation so it can't be a `<Link>`. Now consumes
  `linkVariants({ variant: 'nav' })` directly via `cn()`, the same way
  `Link.tsx` itself consumes `buttonVariants`-adjacent patterns.

**Deliberately left as one-offs, not componentized** (single occurrence
each, or a genuinely unique interaction, same bar as `RevealButton.tsx`'s
amber buttons in step 20): `LoginTabs.tsx`'s tab bar (conditional
active/inactive classes, the only tab UI in the app) and its "forgot
password" toggle button; `StepTrack.tsx`'s track-search-result row button;
`SnapshotSection.tsx`'s inline "×" remove-component button;
`ChangePasswordForm.tsx`'s disclosure toggle (a `<button>`, not a link,
despite matching `text-sm text-blue-600 hover:underline` — already the
canonical inline-link style by coincidence, so no change needed).

**Verified:** full unit suite (25 files / 256 tests) and full E2E suite
(25/25) both green — the E2E suite exercises nearly every migrated form
(test-creation wizard, voting, systems CRUD, profile); `tsc --noEmit` shows
no new errors; manual Playwright screenshots of register, login, profile,
and the test-creation wizard's track step (including its success `Callout`
and "add track" `FieldLabel`/`TextInput` form) in both light and dark mode,
authenticated and unauthenticated.
