---
name: audiophile-compare-build-history-30
description: Build step 30 — Forum ingestion: placeholder author infrastructure.
---

# ✅ 30 — Forum ingestion: placeholder author infrastructure

New `public.users.is_placeholder` column (no RLS policy needed — only ever
set via the admin client) plus a new `public.import_authors` table
(`source`, `external_username`, `user_id`, publicly readable — resolved in
favor of an explicit table over a derived-email lookup, since slugification
is lossy/collision-order-dependent) backing `lib/ingestion/
create-placeholder-author.ts`, a resolve-or-create helper that gives each
distinct Lejonklou forum author their own real, full `auth.users`/
`public.users` identity (email `<slug>@import.audiophile-compare.uk`) — a
deliberate pivot from `deferred-features.md`'s original
single-`ingestion_bot`-owns-everything plan, so a later merge step can hand
real people their own imported content by repointing
`import_authors.user_id`, not discarding it. Migration applied to both
staging and production (step 37 ran the real import against both). Full
plan and verification detail: `build-history-ingestion/30-placeholder-author-infrastructure.md`.
