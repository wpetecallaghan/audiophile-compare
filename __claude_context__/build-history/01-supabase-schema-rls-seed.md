---
name: audiophile-compare-build-history-01
description: Build step 1 — Supabase schema, RLS, seed data.
---

# ✅ 1 — Supabase schema, RLS, seed data

Single migration file: `supabase/migrations/20260625094142_initial_schema.sql`.
Includes all tables, RLS policies, auth triggers (`on_auth_user_created`, `on_auth_user_email_updated`),
`test_vote_count` security-definer function, and technique seed data.
