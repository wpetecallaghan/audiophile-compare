---
name: audiophile-compare-build-history-83
description: Build step 83 — Fix hardcoded-color drift across app/ and components/, and add a CSS-variable-backed semantic color-token layer so a rebrand touches globals.css once instead of every cva component.
---

# ✅ 83 — Fix color drift; add a semantic color-token layer

**The request, reported directly:** a discussion of how to stop colors/
fonts/spacing being hand-copied as raw Tailwind classes across the app,
which led to a concrete complaint — changing one color (e.g. a muted
gray) requires edits across most of the app.

**Audit findings, not assumptions:** a full grep across `app/` and
`components/`, plus a complete read of every `components/ui/*.tsx` file,
found two separate problems:
1. **Drift** — several pages/components hand-copied a raw class string an
   existing component (`Text`, `Divider`, `ConfirmButton`) or established
   pattern already covered, instead of using it.
2. **No token layer under the components** — even the `cva` components
   that *do* centralize a class string each hardcoded a literal Tailwind
   shade independently. "Default border," for example, was the literal
   `border-gray-200 dark:border-gray-700` pair repeated across `Button.tsx`,
   `Divider.tsx`, `TextField.tsx`, `Link.tsx`, `Callout.tsx`, plus several
   hand-applied call sites — changing that role meant editing every one of
   those files. This is the actual cause of the reported complaint.

**Fix — Part A (drift):**
- `text-gray-500 dark:text-gray-400` (raw) → `<Text tone="muted">` across
  ~15 files (`app/login`, `/register`, `/forgot-password`, `/version`,
  `/tracks/[id]`, `/systems/[id]`, `VoteForm.tsx`, `TallyDisplay.tsx`,
  `CrossCheckSelector.tsx`, the wizard step components, `SnapshotSection.tsx`).
- `text-gray-600 dark:text-gray-300` (raw) → `<Text tone="body">`.
- The already-established `<Text size="xs" className="font-semibold
  uppercase tracking-wide">` eyebrow-label pattern was hand-duplicated raw
  in `app/version/page.tsx`, `StepSnapshots.tsx`, `StepPublish.tsx` (×2) —
  swapped to match.
- New `components/media/ClipLabel.tsx` — the "Clip A"/"Clip B" `<h2>`
  (`text-sm font-semibold uppercase tracking-wide`, no color) had
  organically repeated 3 times (`ABPlayer.tsx` ×2, `app/tests/[id]/page.tsx`'s
  `ClipSlotFallback`) — extracted once it cleared this project's
  established "3rd occurrence" bar. See `components.md §5`.
- `ConfirmButton.tsx`'s idle-trigger button classes were byte-for-byte
  duplicated in `ReplaceClipUrlButton.tsx` — exported as
  `CONFIRM_TRIGGER_BUTTON_CLASSES` and imported by both, instead of two
  copies of the same literal string.
- `Callout.tsx`'s `warning`/`info` tones set no text color, so 7 call
  sites (`ConfirmButton.tsx`, `VoteForm.tsx`, `TallyDisplay.tsx`,
  `app/tests/[id]/page.tsx` ×4) independently re-added the identical
  `text-amber-800`/`text-blue-800` pair on top — `calloutVariants` now sets
  it once per tone, and all 7 overrides were deleted. `success`/`neutral`
  were left alone — no second caller doing the same yet.

**Fix — Part B (semantic color tokens):** mirrored the existing
`--background`/`--foreground` mechanism in `app/globals.css` (`:root` +
its `@media (prefers-color-scheme: dark)` override) — one CSS variable per
role, exposed as a `theme.extend.colors` entry in `tailwind.config.ts`. No
`dark:` Tailwind variant is needed on any consumer; the variable itself
flips at the OS-level media query, same as `bg-background`/`text-foreground`
already do. Only roles with **confirmed duplication across 2+ files** were
tokenized (`repeated-string-constants.md`'s "don't over-apply" rule):

| Token | Replaced | Consumers |
|---|---|---|
| `muted` | gray-500/400 text | `Text`, `Divider`, `FieldLabel`, `Link` (nav), `FooterNavLink`, `Badge` (draw), `CreateTestForm`, several call sites |
| `body` | gray-600/300 text | `Text`, `TallyDisplay.tsx`'s `<li>`s |
| `border` | gray-200/700 border | `Button`, `Divider`, `TextField`, `Link` (card), `Callout` (neutral), `VoteForm`, `AddSnapshotForm`, `StepSnapshots`, `CreateTestForm` (via `bg-border`) |
| `divider` | gray-100/800 border | `SiteHeader`, `SiteFooter`, `app/profile/page.tsx` (×3 `<hr>`), `CrossCheckSelector`, `StepSnapshots`, `SnapshotSection` |
| `ink` / `ink-foreground` | black/white ↔ white/black | `Button` (primary), `CreateTestForm` (step dots) |
| `danger` | red-600/400 text | `FormMessage` (error), `VoteForm`'s required asterisk |
| `status-win` / `status-loss` | green-700/300, red-700/300 text | `Badge` (win/loss), `SnapshotSection`'s win/loss counts |
| `warning` / `warning-bg` / `warning-foreground` | amber 200/700, 50/900, 800/200 | `Callout` (warning) |
| `info` / `info-bg` / `info-foreground` | blue 200/700, 50/900, 800/200 | `Callout` (info) |

Not tokenized (single-file, no proven duplication): `FormMessage`'s
`success` tone, `Callout`'s `success`/`neutral` backgrounds, `Badge`'s
per-status backgrounds, `ConfirmButton`'s solid amber-600 action button and
amber-900/100 heading text, `ConfirmButton`/`ReplaceClipUrlButton`'s own
amber outline-trigger shade (a deliberately different, higher-contrast
amber family from `Callout`'s `warning` tone — handled by the Part A
component-level dedupe above instead, not a token).

The two `-bg` dark-mode values (`warning-bg`, `info-bg`) are flat hex
colors pre-computed as amber-900/blue-900 at 20% opacity composited over
the dark page background (`#0a0a0a`), reproducing what the old
`bg-amber-900/20`/`bg-blue-900/20` opacity-modifier classes rendered —
computed directly rather than kept as an opacity modifier, since this
project's simple `--background: #ffffff`-style CSS variables (not the
RGB-channel format Tailwind's opacity modifiers need) don't support it.

**Docs:** `components.md §12` — new "Semantic color tokens" subsection
with the full table and the rule "never hand-write a literal shade for one
of these roles"; "Border roles" paragraph updated to name the tokens, not
raw shades; `Callout`'s and `ConfirmButton`'s doc blocks updated to match.
`components.md §5` — documents `ClipLabel`.

**Tests:**
- New `components/media/__tests__/ClipLabel.test.tsx` (2 tests — renders
  as an `<h2>`, carries the uppercase/tracking-wide classes).
- `components/ui/__tests__/FooterNavLink.test.tsx` — one test asserted the
  literal `text-gray-500`/`dark:text-gray-400` classes directly; updated to
  assert `text-muted` instead (same rendered color, different class name).
- No other existing test asserted on any of the replaced literals.

**Verified:**
- `npm test` — 62 files / 611 tests, all passing (609 pre-existing + 2 new
  `ClipLabel` tests).
- `npm run build` — clean, no TypeScript or Tailwind config errors.
- `npx tailwindcss -i app/globals.css -o /tmp/out.css --content ...` — every
  new token (`text-muted`, `border-divider`, `bg-ink`, `text-ink-foreground`,
  `border-warning`, etc.) compiles to a real utility rule referencing its
  CSS variable.
- Dev server: `/login`, `/register`, `/forgot-password` return 200 and
  `/login`'s rendered HTML carries the `text-muted` class on the expected
  element.
