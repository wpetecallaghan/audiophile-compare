---
name: audiophile-compare-build-history-84
description: Build step 84 — A follow-up, deeper audit of step 83's semantic color tokens found four more genuinely-duplicated color roles and two components hand-rolling styles instead of reusing Button/Link.
---

# ✅ 84 — Second color audit: four more tokens, two component-usage fixes

**The request, reported directly:** after step 83 shipped, asked for a
review of every remaining hardcoded color class across `app/` and
`components/` — not just the ones step 83's own audit had already caught.

**Audit findings:** a fresh grep across every `bg-`/`text-`/`border-`/
`ring-`/`divide-` color utility (not just the specific patterns step 83 had
already fixed) found 23 files still using literal colors. Most were
legitimate single-file one-offs already covered by step 83's "don't
over-apply" reasoning (`Badge`'s per-status backgrounds, `Callout`'s
`success`/`neutral` tones, `ConfirmButton`'s solid action button, hover
darken shades layered on already-tokenized bases, etc.) — left untouched.
Four were genuine gaps step 83's narrower audit had missed:

1. **`bg-gray-100 dark:bg-gray-800`** ("chip" background) — independently
   duplicated in `Badge.tsx` (draw status), `SnapshotSection.tsx` (×2),
   `CrossCheckSelector.tsx` (×2), and `FooterNavLink.tsx` (as a hover
   state). Same literal value as step 83's own `divider` token (border
   role) — reused that token via `bg-divider` rather than adding a
   near-duplicate CSS variable for the identical shade.
2. **`hover:bg-gray-50 dark:hover:bg-gray-800`** — duplicated across
   `Button.tsx` (secondary), `Link.tsx` (card), `StepSnapshots.tsx`,
   `StepTrack.tsx`, and `EditForumLinkButton.tsx` (the last removed
   entirely by the component-usage fix below). New `hover-surface` token.
3. **`text-blue-600` with no dark-mode pairing at all** — `Link.tsx`'s own
   `inline` variant, `ChangePasswordForm.tsx`, and `UnknownPlayer.tsx`
   (removed by the component-usage fix below) all shared this — a real
   unpaired-color bug (this project's own rule: never ship a color without
   both a light and dark value), not just a missing token. New `link`
   token (blue-600 light / blue-400 dark, matching this project's existing
   600→400 pattern for vivid single-color text roles, e.g. `danger`).
4. **Bare `border`/`divide-y` with only a `dark:` shade** — `StepPublish.tsx`,
   `StepSnapshots.tsx`, `StepTrack.tsx` (×2). Not actually a visual bug —
   Tailwind's own preflight default border color is gray-200, so the light
   mode already accidentally matched the `border` token's value — but it
   relied on an implicit default instead of the explicit token, so a future
   change to Tailwind's own default would silently affect these. Converted
   to explicit `border-border`/`divide-border`.

**Two components were hand-rolling styles instead of reusing an existing
component** (`components.md`'s own stated rule for both):
- `EditForumLinkButton.tsx`'s idle-trigger button → `<Button
  variant="secondary">`. This changes its text color from a hand-picked
  `text-gray-700 dark:text-gray-300` to the standard secondary button's
  default/inherited text — a deliberate convergence onto every other
  secondary button in the app, not a preserved one-off. (This also removes
  the last caller of that particular gray-700/300 pair, so `TallyDisplay.tsx`'s
  own use of it — an `<h3>` — reverts to being a genuine single-file
  one-off again; not tokenized.)
- `UnknownPlayer.tsx`'s raw `<a>` → `<Link variant="inline" target="_blank"
  rel="noopener noreferrer">`. `Link` already renders a plain anchor for an
  external/absolute URL (documented precedent: the test-detail page's "view
  original post" link uses the same pattern), so this was a straightforward
  swap, not a new capability.

**Fix:**
- `app/globals.css` / `tailwind.config.ts` — two new tokens (`hover-surface`,
  `link`), `bg-divider` reused for the chip role.
- `components/ui/Badge.tsx`, `SnapshotSection.tsx`, `CrossCheckSelector.tsx`,
  `FooterNavLink.tsx` — chip backgrounds → `bg-divider`.
- `components/ui/Button.tsx`, `Link.tsx`, `StepSnapshots.tsx`,
  `StepTrack.tsx` — hover backgrounds → `hover-surface`.
- `components/ui/Link.tsx` (inline variant), `ChangePasswordForm.tsx` —
  → `text-link`.
- `components/tests/steps/StepPublish.tsx`, `StepSnapshots.tsx`,
  `StepTrack.tsx` — bare `border`/`divide-y` → explicit `border-border`/
  `divide-border`.
- `components/tests/EditForumLinkButton.tsx` — now renders `<Button
  variant="secondary">` instead of a raw styled `<button>`.
- `components/media/players/UnknownPlayer.tsx` — now renders `<Link
  variant="inline">` instead of a raw `<a>`.

**Docs:** `components.md §12` — token table gains `bg-divider`/`hover-surface`/
`link` rows; a note that "no proven second caller" is a snapshot, re-checked
on future edits, not permanent; `Badge`'s doc snippet updated to show
`text-status-win` instead of the old literal `text-green-700`.

**Tests:** no existing test asserted on any of the literals replaced here
(checked via grep before editing) — none needed updating. No new test
files needed; `EditForumLinkButton`/`UnknownPlayer` had none before and
this change doesn't alter their accessible name or behavior, only markup.

**Verified:**
- `npm test` — all passing, same count as step 83 (no test touched this
  step's files).
- `npm run build` — clean, no TypeScript or Tailwind config errors.
- `npm run test:e2e` — full suite run separately (see conversation): 73/76
  passed; the 3 failures are pre-existing `waitForServerState` replication-
  lag timeouts in `voting.spec.ts`, unrelated to any file this step or step
  83 touched (confirmed by reading each failing test — none assert on
  color/class, all are text/href visibility checks against independent
  Playwright sessions racing a real Supabase write).
