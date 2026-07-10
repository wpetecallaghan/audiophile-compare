---
name: audiophile-compare-build-history-46
description: Build step 46 — Optional, editable forum discussion link.
---

# ✅ 46 — Optional, editable forum discussion link

**The gap this closes:** a creator could attach a forum-post link to a
test in exactly one way — the forum-*ingestion* pipeline sets
`tests.source_url` at import time, shown unconditionally (never
reveal-gated) so a real forum author can recognize and claim their own
still-blind imported content (steps 32, 44). There was no way for a
web-UI creator to attach a link to a forum thread *discussing* their own
test, editable any time, hidden from other listeners until reveal.

**Confirmed via investigation before building anything:** reusing
`source_url` for this would have broken the existing claim-flow use case
— the two need opposite default visibility for two different populations
of tests, and nothing in the schema distinguishes "imported provenance
link" from "creator's own discussion link" except an inference from
`is_placeholder`. Decided with the user: a new, separate column
(`forum_link`), not a reuse.

**Decisions:**

1. **New nullable `tests.forum_link text` column.** No RLS migration
   needed — a real, non-obvious finding: `"tests: creator update (reveal
   only)"`'s actual definition is `for update using (creator_id =
   auth.uid())`, no `with check`, no column-level restriction. Postgres
   RLS has no per-column enforcement at all; the policy's `(reveal only)`
   name is descriptive of what happened to use it first, not an enforced
   constraint. A creator could already update any column on their own
   row — see `api-conventions.md` Rule 5 for the general lesson (don't
   assume a policy is narrower than its own SQL).
2. **Visibility reuses `canSeeSystemInfo` directly** (`isRevealed ||
   isCreator`, step 43) — no new boolean, since the rule is identical.
3. **New `PATCH /api/tests/[id]`** (the file previously only had
   `GET`/`DELETE`), scoped to `{ forum_link }` only, not a
   general-purpose test-patch endpoint. Creator-only, 404-on-mismatch
   (matching `DELETE`'s existing pattern in the same file). Deliberately
   **no reveal or vote-count gating** — unlike `PATCH /api/clips/[id]`'s
   `voteCount === 0` restriction (swapping a clip's URL changes what was
   actually compared, retroactively misrepresenting what earlier
   listeners heard), a forum link is pure metadata about the discussion,
   not about what's being tested.
4. **New `EditForumLinkButton.tsx`**, mirroring `ReplaceClipUrlButton.tsx`'s
   open/toggle/`router.refresh()` shape but simpler (plain URL input, no
   verify-then-persist flow — this link is only ever displayed, never
   played back). Rendered whenever `isCreator`, **outside** the existing
   `isCreator && (!isRevealed || voteCount === 0)` creator-controls block
   — that block disappears once revealed and voted, which would
   contradict "editable irrespective of reveal status."
5. **Light server-side URL validation** (`lib/tests/validate-forum-link.ts`,
   shared by both `POST /api/tests` and the new `PATCH`): `URL`
   constructor, `http:`/`https:` only, empty/absent clears to `null`.
   Proportionate to a manually-typed, display-only field.
6. **`StepPublish.tsx`'s new field uses local `useState`, not the shared
   `TestDraft` type** — mirrors exactly how `title` itself already works
   on this step. Confirmed this step has no `onUpdate` callback back to
   the parent's `draft` state at all, so a back-then-forward wizard
   navigation already loses an in-progress title edit today — a
   pre-existing, unrelated gap; the new field behaves identically, not
   better.
7. **Own i18n keys from the start, not reused ones — applying step 45's
   lesson proactively instead of hitting the same bug a second time.**
   `tests.replaceClip.saveButton` = "Save" *can* be open on screen
   simultaneously with this new button (both render independently for
   the creator, one inside the creator-controls block, this one outside
   it) — reusing "Save" would have risked the identical Playwright
   substring-match ambiguity step 45 found and fixed after the fact. New
   `tests.forumLink.saveButton` = "Save forum link" instead.

**Files updated:**
- `supabase/migrations/20260710093651_tests_forum_link.sql` — new
  column, applied to staging.
- `lib/tests/validate-forum-link.ts` (new) — shared validator.
- `app/api/tests/route.ts` — accepts optional `forum_link`.
- `app/api/tests/[id]/route.ts` — new `PATCH` handler.
- `components/tests/steps/StepPublish.tsx` — new optional field.
- `components/tests/EditForumLinkButton.tsx` (new).
- `app/tests/[id]/page.tsx` — query, gated render, edit button.
- `messages/en.json` — `tests.publishStep.forumLink*`, new
  `tests.forumLink` namespace.
- `e2e/helpers/admin.ts` — `seedTest` gained a `forumLink` param.
- Docs: `audiophile-compare-schema.md` (new column + a
  `forum_link`-vs-`source_url` distinguishing note), `api-conventions.md`
  Rule 9 (new field) and Rule 5 (the RLS-policy-name lesson),
  `components.md` §6 (new `EditForumLinkButton` subsection),
  `testing.md` (E2E inventory + a new named "verifying a reveal actually
  succeeded" testing-pattern note), `entry.md`/`core.md` (step count).

**Tests:** E2E only — confirmed no unit tests exist for any route/component
in this exact family (`app/api/tests/route.ts`, `[id]/route.ts`,
`ReplaceClipUrlButton.tsx`, `RevealButton.tsx`, `DeleteTestButton.tsx` are
all E2E-covered only). Extended `test-creation.spec.ts`'s full-wizard test
(fills the new optional field, confirms the creator sees it immediately on
a fresh, unrevealed, un-voted test) and added a new `describe` block to
`voting.spec.ts` (creator adds a link while blind and a non-creator can't
see it; cast a vote then reveal; non-creator can see it once revealed;
creator can still edit it after reveal and after a vote exists).

**A real, reproducible bug found and fixed while writing the new
`voting.spec.ts` tests, not by inspection — the same false-positive class
step 43 already found once:** `ConfirmButton.tsx`'s confirm panel replaces
the original "Reveal before/after" button the instant it's clicked,
*before* the async reveal call resolves either way — so
`await expect(revealButton).not.toBeVisible()` alone only proves the
confirm panel opened, not that the reveal actually succeeded. Step 43
already established the fix (also wait for `revealedStatus` text), but
the new test in this step copy-pasted only the first half. Caught for
real: a raw REST query against staging showed `status: 'open'` in the
database at the exact moment the (too-weak) assertion had already passed.
Fixed by adding the missing second assertion, matching the established
pattern exactly — see `testing.md`'s new note for the general rule so
this doesn't get half-copied a third time.

**Verified:**
- `npx tsc --noEmit` — no new errors (same pre-existing, unrelated
  `__tests__/supabase-*.test.ts` failures as every prior step).
- `npx playwright test e2e/tests/test-creation.spec.ts
  e2e/tests/voting.spec.ts` — run against a local dev server
  (`E2E_BASE_URL=http://localhost:3000`, not deployed staging, same
  deployment-lag reason every recent step has used) — 13/13 passing.
- Full local E2E suite (`npx playwright test`, all spec files) — 60/60
  passing, confirming no regressions.
