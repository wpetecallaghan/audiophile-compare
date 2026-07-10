---
name: audiophile-compare-build-history-38
description: Build step 38 — Data erasure requests (votes / content / full account).
---

# ✅ 38 — Data erasure requests (votes / content / full account)

Rescoped from an original "undo a bad production import" safety-net plan
(superseded — its ownership-check design had a real gap: it never
considered that a test's voters are separately claimable identities from
the test's own creator) to what the real need turned out to be: admin-
triggered, human-verified deletion for three support scenarios — an
unmerged placeholder's votes only, an unmerged placeholder's tests and
systems, or a registered user's full data including the account itself
(votes, systems, snapshots, tests, then `auth.users`/`public.users`).
Three reusable `security definer` Postgres functions
(`erase_user_votes`/`erase_user_content`/`erase_user_account`), atomic by
construction — deliberately learning from a real gap found in
`rollback.ts` (see below), which does the equivalent deletion as 4
separate non-transactional calls. `erase_user_account` needed a real
schema fix first: `tracks.created_by` was `not null` with no cascade,
which would have blocked deleting `public.users` the moment the erased
user had ever created a track — now nullable, nulled rather than
blocking (tracks are shared, `created_by` is provenance only). Admin
route + minimal form built (`app/api/admin/erase-user-data/`,
`app/admin/erase-user-data/`). Migration applied to staging (production
not yet — separate, deliberate step per this project's "staging first"
convention); 14/14 integration tests passing for real, including EXECUTE
lockdown against an anon key. Admin gate re-verified with a real
authenticated-but-non-admin session (404), not just anonymous requests,
and the real admin account confirmed the form itself presents correctly
at `/admin/erase-user-data` — the one gap the assistant couldn't close
directly (no real admin credentials in this environment) closed by the
user instead. Not the same thing as
`scripts/rollback-lejonklou.ts`/`lib/ingestion/rollback.ts` (built during
step 36, an interim ingestion-pipeline-only tool, unrelated to this step,
left unchanged). Full plan: `build-history-ingestion/38-data-erasure-requests.md`.
