# Google OAuth Setup

Enables "Continue with Google" on the sign-in page. Must be completed for both
the staging and production Supabase projects.

---

## Step 1 — Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown at the top → **New Project**
3. Give it a name (e.g. `audiophile-compare`) and click **Create**

---

## Step 2 — Configure the OAuth consent screen

1. In the left sidebar: **APIs & Services → OAuth consent screen**
2. User type: **External** (allows any Google account to sign in) → **Create**
3. Fill in the required fields:
   - **App name** — e.g. `Audiophile Compare`
   - **User support email** — your email address
   - **Developer contact information** — your email address
4. Click through **Scopes** and **Test users** without changes — the defaults are fine
5. Click **Back to Dashboard**

---

## Step 3 — Create OAuth 2.0 credentials

You need one set of credentials per Supabase project (staging and production),
because each project has a different callback URL. You can add both callback
URLs to the same Google OAuth client, or create two separate clients — either
works.

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
2. Application type: **Web application**
3. Give it a name (e.g. `audiophile-compare-staging`)
4. Under **Authorised redirect URIs**, click **Add URI** and paste the Supabase
   callback URL for this environment. Find it in your Supabase dashboard:
   **Authentication → Providers → Google** — it is shown as the
   **Callback URL (for OAuth)** and looks like:
   ```
   https://<project-ref>.supabase.co/auth/v1/callback
   ```
5. Click **Create**
6. Google displays the **Client ID** and **Client Secret** — copy both now
   (you can retrieve them again later from Credentials if needed)

Repeat this step for the other environment (staging or production), using that
project's Supabase callback URL.

---

## Step 4 — Enable Google as a provider in Supabase

Do this in **each** Supabase project (staging and production separately).

1. Open the Supabase dashboard for the project
2. Go to **Authentication → Providers → Google**
3. Toggle **Enable Sign in with Google** on
4. Paste the **Client ID** and **Client Secret** from Step 3
5. Click **Save**

---

## Step 5 — Add the app callback URL to Supabase's allowed redirect list

Still in the same Supabase project:

1. Go to **Authentication → URL Configuration**
2. Under **Redirect URLs**, click **Add URL** and enter:
   ```
   https://<your-vercel-domain>/auth/callback*
   ```
   Replace `<your-vercel-domain>` with your Vercel deployment URL for this
   environment (e.g. `audiophile-compare.vercel.app` for production, or the
   preview URL pattern for staging).

   The trailing `*` wildcard is required — it allows the `?redirectTo=` query
   parameter to pass through so users land on the page they were trying to
   reach before being prompted to sign in.

3. Click **Save**

Repeat Steps 4 and 5 for the other Supabase project.

---

## How it fits the existing auth flow

No application code changes are required beyond what is already implemented.

```
User clicks "Continue with Google"
  → supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '.../auth/callback?redirectTo=...' } })
  → browser redirected to Google consent screen
  → user approves
  → Google redirects to Supabase callback URL (https://<project>.supabase.co/auth/v1/callback)
  → Supabase exchanges the code for a session
  → Supabase redirects to app's /auth/callback?code=...&redirectTo=...
  → existing app/auth/callback/route.ts calls exchangeCodeForSession(code)
  → user is signed in; browser redirected to the original destination
```

The `app/auth/callback/route.ts` handler already works for OAuth — it calls
`exchangeCodeForSession(code)` which is identical for magic links and OAuth
flows. No changes to the callback route are needed.

On first sign-in, Supabase creates a new `auth.users` row, which triggers the
`handle_new_user` database function. This creates the corresponding
`public.users` row and sets `display_name` to the user's Google display name
(`raw_user_meta_data->>'full_name'`), falling back to the email local-part if
no name is available.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "redirect_uri_mismatch" error from Google | The Supabase callback URL in Step 3 does not exactly match what Google has on record — check for trailing slashes |
| Redirected back to the wrong environment after sign-in | The Supabase project's Redirect URL in Step 5 points to the wrong Vercel domain |
| "Invalid redirect URL" error from Supabase | The `?redirectTo=` destination is not covered by the wildcard added in Step 5 |
| Display name shows as email local-part after Google sign-in | `raw_user_meta_data` did not contain `full_name` — this is normal for Google Workspace accounts with restricted profile sharing |
