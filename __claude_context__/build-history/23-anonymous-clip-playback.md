---
name: audiophile-compare-build-history-23
description: Build step 23 — Allow anonymous clip playback.
---

# ✅ 23 — Allow anonymous clip playback

**The gap this closes:** `app/tests/[id]/page.tsx:159-169` is the *only*
gate on playback:
```tsx
{/* Player — login required to see */}
<div className="w-full max-w-full min-w-0">
  {user ? (
    <ABPlayer clipA={clipA} clipB={clipB} />
  ) : (
    <Callout tone="neutral" ...>
      <Link href="/login">{t('signIn')}</Link>{' '}{t('signInToListen')}
    </Callout>
  )}
</div>
```
No middleware involvement (`/tests/[id]` isn't in `middleware.ts`'s
protected-paths list) and no RLS gate (`clips`/`tests` SELECT policies are
`using (true)`) — this single conditional is 100% of the enforcement.
Confirmed separate from the blind/reveal mechanism: `clip_mapping`
visibility (`isCreator || isRevealed`, lines 43-55) and vote-tally
visibility (`canSeeTally`, line 70) are independent gates and do not
change.

**Decisions:**

1. **Playback — remove the gate entirely.** Replace the `user ? ... : ...`
   branch with an unconditional `<ABPlayer clipA={clipA} clipB={clipB} />`.
   No new prop threading needed — `clipA`/`clipB` are already computed
   unconditionally above this block (lines 104-105).

2. **Voting — stays gated, but give anonymous visitors an explicit prompt
   where the vote form used to be invisible.** Today, `{user && !isRevealed
   && <VoteForm .../>}` (line 182) simply renders nothing for a logged-out
   visitor — that was fine when the sign-in callout above it already
   covered "you need an account for any of this." Once playback no longer
   implies that, add a sibling anonymous-only prompt:
   ```tsx
   {!user && !isRevealed && (
     <Callout tone="neutral" className="p-4 sm:p-6 text-center text-sm text-gray-500 dark:text-gray-400">
       <Link href="/login">{t('signIn')}</Link>{' '}{t('signInToVote')}
     </Callout>
   )}
   ```
   placed where `VoteForm` would render. Revealed tests show nothing extra
   for anonymous visitors (voting is already closed for everyone at that
   point, same as today).

3. **Copy — repurpose, don't duplicate.** Rename `messages/en.json`'s
   `tests.signInToListen` (`"to listen to the clips."`) to
   `tests.signInToVote` (`"to vote."`), reusing the existing `tests.signIn`
   ("Sign in") key for both the old and new callout. Confirmed only two
   references to `signInToListen` in the whole repo: `messages/en.json` and
   `app/tests/[id]/page.tsx` — no other call sites to update.

**Files updated:**
- `app/tests/[id]/page.tsx` — the two changes above.
- `messages/en.json` — key rename.
- `api-conventions.md` Rule 3 (currently: *"clip playback requires
  login... Enforced in middleware for protected routes. API routes serving
  clip data must also check that `user` is not null."*) — rewrite to state
  playback is public and only voting requires auth; this existing rule text
  was already slightly aspirational (no middleware or API-route check for
  clip data actually exists today), so the rewrite also corrects that
  inaccuracy.
- `core.md`'s Public paths parenthetical `(login required for play/vote)` →
  `(login required to vote)`.
- `docs/audiophile-compare-app-specification.md` — the visitor-persona
  bullet ("Cannot play clips or vote without registering" → "Can play
  clips; cannot vote without registering") and the page-structure row for
  test detail (`Public (play requires login)` → `Public (voting requires
  login)`).
- `testing.md` §6 coverage table — `public-feed.spec.ts` row gains the new
  anonymous-playback assertion.

**Tests:**
- **Unit:** none added — `app/tests/[id]/page.tsx` is a server component
  with no client-side branching logic to unit test, consistent with the
  existing convention (this page has never had a unit test; it's covered
  end-to-end only).
- **E2E (`e2e/tests/public-feed.spec.ts`, the unauthenticated Playwright
  project):** added a new `Anonymous clip playback` describe block using
  the same `seedCompleteTest` helper `voting.spec.ts` already uses from
  `e2e/helpers/admin.ts`. Covers: an anonymous visitor to a seeded test's
  detail page sees the `ABPlayer` (asserted via the `Clip A`/`Clip B`
  headings it renders); the same page shows the new "Sign in to vote"
  callout (`m.tests.signInToVote`) — scoped to `getByRole('main')` since
  the header nav also has its own "Sign in" link.
- **E2E (`e2e/tests/voting.spec.ts`, authenticated project):** unchanged —
  confirmed it doesn't implicitly depend on the removed branch.

**Verified:** `npm run test` — unit suite unchanged at 25 files / 256 tests,
all passing. `npx tsc --noEmit` — no new errors (32 pre-existing failures
in `__tests__/supabase-client.test.ts`/`supabase-server.test.ts`, unrelated
Supabase-mock typing issues, confirmed present before this step's changes
via `git stash`). `npm run test:e2e` — full suite 27/27 passing (25
pre-existing + 2 new), both the unauthenticated and authenticated projects,
run against a local dev server (`.env.local`'s `E2E_BASE_URL` points at the
staging deployment by default, which doesn't have this branch's code yet —
overrode it to `http://localhost:3000` for this run). Confirms the player
renders for a logged-out visitor and the "Sign in to vote" prompt appears
in place of the vote form on an open test.
