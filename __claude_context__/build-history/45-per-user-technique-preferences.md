---
name: audiophile-compare-build-history-45
description: Build step 45 — Per-user listening technique preferences.
---

# ✅ 45 — Per-user listening technique preferences

**The gap this closes:** every blind test offered a voter all 6 active
`listening_techniques` — a global list, no per-user customization existed
anywhere in the schema. This step lets a user choose, from their profile,
which active techniques they personally want offered when voting (minimum
1, all enabled by default), and adds a reminder on the test detail page
that this is configurable.

**Decisions:**

1. **New table `user_technique_preferences (user_id, technique_id)`,
   composite primary key, owner-only RLS** (`for all using (user_id =
   auth.uid())`, no public read — private preference data, unlike
   `systems`/`votes`). "No rows for a user" means "every active technique
   enabled" (the default), not "zero enabled" — a save always writes the
   user's complete current selection (delete-all-then-insert-all from
   application code, not incremental), so there's never an ambiguity
   between "never customized" and "customized down to nothing" to
   resolve. No signup-time trigger populates this table —
   `handle_new_user` only ever created the `users` row itself, and
   there's no need to change that for a table whose absence already has a
   well-defined meaning.
2. **Graceful non-atomicity, deliberate.** The save is two sequential
   calls (delete then insert), not a transaction/RPC — unlike
   `claim_placeholder`/`erase_user_*`, this never touches another user's
   rows, so no `security definer` function is needed. If the insert half
   ever failed after a successful delete, the user would land on zero
   rows — which, per decision 1, reads back as "all enabled," a valid
   state, not corruption.
3. **`claim_placeholder` (step 39) extended, in the same migration file,
   not a second one.** It exhaustively reassigns every FK to
   `public.users(id)` when merging a placeholder into a real account —
   this table adds one more. In practice a placeholder never sets
   preferences itself (placeholders never log in), so this can never
   actually fire today, but leaving `claim_placeholder` incomplete
   against its own stated exhaustiveness would be a real, if dormant,
   gap. The existing, already-*applied* `claim_placeholder` migration is
   untouched — a new migration layers a `create or replace function` on
   top, same pattern step 32 used to extend `ingest_test`. Initially
   planned as two separate migration files (one for the table, one for
   the function); corrected mid-plan — the "never edit an applied
   migration" rule only forbids editing a migration that's already been
   applied, it doesn't require every logical change to get its own file,
   and neither piece here had been applied anywhere yet. Same collision
   handling as `claim_placeholder`'s existing vote-collision logic
   (decision 5 in that function's own history): `user_id` is part of
   `user_technique_preferences`' own primary key, so a colliding
   preference row is dropped in the real user's favour before
   reassigning the rest, rather than erroring the whole merge.
4. **If a user has already voted on a specific test using a technique,
   then later disables that technique, the vote form for that specific
   test still offers it** — so the existing vote stays visible/editable;
   new votes on other tests only ever offer currently-enabled techniques.
   Implemented as a union at read time: the technique-fetch query already
   has `existingVotes` available (fetched earlier in the page for
   `hasVoted`/`canSeeTally`), so no new query is needed — just
   `enabledIds.has(t.id) || votedIds.has(t.id)`. This exact gap already
   existed for the admin-only `is_active` flag (a deactivated technique's
   vote block silently stops rendering, though the vote persists
   untouched in the DB/tally) — fixed here for the new per-user case
   specifically, since self-service disabling makes it far more likely to
   happen than rare admin deactivation. **Deliberately not extended to
   the pre-existing `is_active` case** — out of scope, unaffected either
   way.
5. **"Other" (the free-text catch-all) is treated like any other
   technique** — includable/excludable, no special-casing, consistent
   with "choose 1 or more of the available methods." The min-1 rule
   already guarantees something stays selected, which could legitimately
   be "Other" alone or exclude it entirely.
6. **No shared `Checkbox` component introduced.** None existed in this
   codebase before this step, and `TechniquePreferencesForm.tsx` is a
   single use site — reuses `StepSnapshots.tsx`'s exact selected-card
   styling (label-wrapped input, conditional `ring-1 ring-blue-300`) with
   `type="checkbox"` and no `name` grouping, consistent with this repo's
   no-speculative-abstraction stance.
7. **`TechniquePreferencesForm` needed its own button labels, not the
   shared `saveButton`/`saving` keys `ProfileForm` uses.** Every other
   profile section already has a distinctly-worded action button
   (`ChangeEmailForm`'s "Send confirmation", `ChangePasswordForm`'s
   "Update password") — `ProfileForm`'s generic "Save"/"Saving…" turned
   out to be the one exception, not the rule. Found the hard way: adding
   a second "Save"-labelled button to the same page broke the two
   existing E2E assertions using `getByRole('button', { name: 'Save' })`
   — Playwright's default name matching is substring-based, so it
   ambiguously matched both "Save" and "Save listening methods." Fixed
   both directions: the new form uses its own
   `techniquesSaveButton`/`techniquesSaving` keys, and the two
   pre-existing assertions were tightened to `exact: true`.

**Files updated:**
- `supabase/migrations/20260710082825_user_technique_preferences.sql` —
  new table + RLS (decision 1) and the `claim_placeholder` extension
  (decision 3), applied to staging.
- `app/api/profile/technique-preferences/route.ts` (new) — `PATCH`,
  following `app/api/profile/route.ts`'s exact template (auth check →
  parse → validate `technique_ids.length >= 1` → write → response).
- `components/TechniquePreferencesForm.tsx` (new, top-level like
  `ProfileForm.tsx`) — checkbox list, `Set<string>` local state, min-1
  gated Save button.
- `app/profile/page.tsx` — one more server-side query (active techniques
  + the user's preference rows), new section between display name and
  change email.
- `app/tests/[id]/page.tsx` — technique-fetch block extended per
  decisions 1 and 4; reminder `Callout` added at the bottom of the page,
  same `user && !isRevealed` gate as `VoteForm` itself, linking to
  `/profile`.
- `messages/en.json` — new `profile.techniques*` keys and
  `tests.techniquePreferencesReminder`; `common.profileLink`.
- `e2e/helpers/constants.ts` — added `ROLE.checkbox`.
- `e2e/helpers/admin.ts` — `getActiveTechniqueIds`, `getTechniqueIdByName`,
  `setTechniquePreferences`, `resetTechniquePreferences`.
- `app/api/admin/claim/__tests__/route.integration.test.ts` — extended
  both existing tests with `user_technique_preferences` assertions
  (reassignment and collision-drop), matching decision 3.
- Docs: `audiophile-compare-schema.md` (new table, RLS row, governance
  note, `claim_placeholder`'s updated return shape),
  `components.md` §6 (new subsection), `api-conventions.md` Rule 5 (new
  example), `testing.md` (unit/E2E inventory, helper notes), `entry.md`/
  `core.md` (step count bumped to 45).

**Tests:**
- `components/__tests__/TechniquePreferencesForm.test.tsx` (new, 13
  cases): default-all-checked rendering, toggle behavior, min-1
  disables Save and shows the error, submission payload, success/error
  states — mirrors `ProfileForm.test.tsx`'s structure.
- `app/api/admin/claim/__tests__/route.integration.test.ts` — extended,
  not new (decision 3); a real bug in my own added assertion was caught
  and fixed by actually running it against staging, not just written and
  assumed correct — see Verified below.
- `e2e/tests/profile.spec.ts` — new `describe` block, 3 cases (default
  all-enabled, narrowed selection persists across reload, Save disabled
  at the min-1 boundary); `test.afterEach` calls
  `resetTechniquePreferences()`. The two pre-existing display-name tests
  needed `exact: true` added to their own "Save" button locator (decision
  7).
- `e2e/tests/voting.spec.ts` — new `describe` block, 1 case covering both
  the narrowing behavior and decision 4's already-voted-but-disabled fix
  in a single fixture; also needed `test.afterEach` reset, since the real
  E2E test user's technique preferences are account state, not
  `[E2E]`-prefixed content `global-teardown.ts`'s sweep would ever catch.

**Verified:**
- `npm run test` — 39 files / 452 tests, all passing (net +13 from the
  new `TechniquePreferencesForm.test.tsx`; every other file unaffected).
- `npx tsc --noEmit` — no new errors (same pre-existing, unrelated
  `__tests__/supabase-*.test.ts` failures as every prior step).
- `npm run test:integration` — 17/17 passing against real staging,
  including the new `user_technique_preferences` reassignment/collision
  assertions. **A real bug in the test itself, not the migration, found
  and fixed by actually running it:** the first version of the collision
  test's verification query filtered only by `technique_id` ("Tune
  Method," a shared global row), which picked up leftover rows from
  disposable real users created by *other* runs of the same suite (their
  `public.users` rows are never explicitly cleaned up in this file,
  same pre-existing gap the "full" test's own disposable users have).
  Fixed by additionally scoping to `.in('user_id', [placeholderId,
  realUserId])` — this test's own two users, not the whole table.
- `npx playwright test e2e/tests/profile.spec.ts e2e/tests/voting.spec.ts
  e2e/tests/systems.spec.ts e2e/tests/import-provenance.spec.ts
  e2e/tests/delete.spec.ts e2e/tests/clip-health.spec.ts
  e2e/tests/test-creation.spec.ts` — run against a local dev server
  (`E2E_BASE_URL=http://localhost:3000`), not the deployed staging site,
  same deployment-lag reason every recent step has used — 39/39 passing,
  confirming no cross-spec contamination from the shared E2E account's
  technique preferences.
