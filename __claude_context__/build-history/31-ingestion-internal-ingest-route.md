---
name: audiophile-compare-build-history-31
description: Build step 31 — Forum ingestion: internal ingest API route.
---

# ✅ 31 — Forum ingestion: internal ingest API route

Built the `POST /api/internal/ingest` route and its atomic
`ingest_test(payload jsonb)` Postgres function (track/system/snapshot/
test/clips/clip_mapping/votes in one transaction), extended with per-author
system matching and each vote resolving its own voter placeholder (not the
post author) — a gap found during planning review, since two different
commenters citing the same technique would otherwise collide on `votes`'
unique constraint. Uses the admin/service-role client throughout (removes
the session-management problem the original session-based bot-auth design
would have hit once there are many placeholder authors instead of one).
`ingest_test` is `security definer`, so its migration explicitly revokes
EXECUTE from `anon`/`authenticated` and grants it to `service_role` only —
otherwise anyone with the anon key could call it directly over PostgREST,
bypassing both RLS and the route's `INGEST_SECRET` check. First integration
test in this project (`npm run test:integration`, hits real staging).
Migration applied to both staging and production (step 37 ran the real
import against both); `INGEST_SECRET` is set in Vercel for
Development/Preview/Production. Full plan and verification detail:
`build-history-ingestion/31-internal-ingest-api-route.md`.
