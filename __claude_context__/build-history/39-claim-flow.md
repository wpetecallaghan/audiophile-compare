---
name: audiophile-compare-build-history-39
description: Build step 39 — Claim flow (merge a placeholder into a real account).
---

# ✅ 39 — Claim flow (merge a placeholder into a real account)

Lets a real Lejonklou forum member claim their imported content. Identity
verification is a forum PM to the site owner's own forum account — no
generated code, no new UI, since the sender's forum identity is itself the
proof; proportionate to an estimated dozen or so total claims. Admin-
triggered (reuses the same `isAdminEmail` gate as `/version` and step 38's
erasure routes), not self-service, and no new claim-request state
machine. The merge itself is `claim_placeholder`, a `security definer`
Postgres function mirroring step 38's `erase_user_*` functions' shape —
same EXECUTE lockdown, same atomicity — that reassigns all five content
FK columns (`systems.owner_id`, `tests.creator_id`, `tracks.created_by`,
`comments.user_id`, `votes.user_id`), repoints (not deletes)
`import_authors`, deletes the placeholder's `public.users` row, and drops
a colliding vote in favor of the real user's own existing one. Admin
route/page/form (`app/api/admin/claim/`, `app/admin/claim/`) built with a
preview-before-merge step, matching step 38's own UX pattern. Migration
applied to and independently re-verified on both `audiophile-staging` and
`audiophile-prod` (`supabase migration list` checked directly against
both); 17/17 integration tests passing for real (3 for
`claim_placeholder`), unit suite and typecheck unaffected, admin gate
curl-verified for real (401/404). Full plan and verification:
`build-history-ingestion/39-claim-flow.md`.
