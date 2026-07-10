---
name: audiophile-compare-build-history-14
description: Build step 14 — OAuth / Google sign-in.
---

# ✅ 14 — OAuth / Google sign-in

`supabase.auth.signInWithOAuth({ provider: 'google' })`. `OAuthButtons` client component renders above magic link form on `/login`; both accept and thread the `redirectTo` prop.
Auth trigger updated to: `coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email,'@',1))` so OAuth sign-ups get a real display name automatically.
`app/auth/callback/route.ts` unchanged — `exchangeCodeForSession` handles OAuth code exchange identically to magic links.
Setup instructions: `docs/google-oauth.md`.
