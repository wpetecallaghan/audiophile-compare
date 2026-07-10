---
name: audiophile-compare-build-history-16
description: Build step 16 — Email/password auth and account management.
---

# ✅ 16 — Email/password auth and account management

Register with email + name + password; sign in with password (alongside magic link and Google); change email, password, or display name from the profile page; forgot password flow.

**Supabase configuration (both projects):** Authentication → Providers → Email: confirm "Confirm email" is on; "Disable new user signups" must be off; `/auth/callback` in allowed Redirect URLs.

**Schema:** `handle_user_email_updated()` trigger is part of `20260625094142_initial_schema.sql` — no separate migration.

**`auth/callback` — recovery flow:**
```typescript
const type = searchParams.get('type')
if (code) {
  await supabase.auth.exchangeCodeForSession(code)
}
if (type === 'recovery') {
  return NextResponse.redirect(`${origin}/profile?reset=true`)
}
return NextResponse.redirect(`${origin}${redirectTo}`)
```
The profile page detects `?reset=true` and auto-opens `ChangePasswordForm`.

**Forgot password:** `supabase.auth.resetPasswordForEmail(email, { redirectTo: '…/auth/callback?type=recovery' })`

**Register:** `supabase.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: '…/auth/callback' } })`

**Password sign-in:** `supabase.auth.signInWithPassword({ email, password })` → `window.location.href = redirectTo ?? '/'`

**Login page:** Three tabs — Password | Magic link | Google. Links to `/register` and forgot-password flow.

**Profile page additions:** `ChangeEmailForm` (`updateUser({ email })`), `ChangePasswordForm` (`updateUser({ password })`).
