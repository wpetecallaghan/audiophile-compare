---
name: audiophile-compare-build-history-13
description: Build step 13 — Display name / profile.
---

# ✅ 13 — Display name / profile

Trigger derives `display_name` from email local-part on sign-up (coalesces OAuth `raw_user_meta_data` name fields first).
`PATCH /api/profile` updates `display_name` (RLS: own row only). `ProfileForm` client component; `app/profile/page.tsx` server page.
