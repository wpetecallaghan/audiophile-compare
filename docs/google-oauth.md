# Google OAuth Setup

Enables "Continue with Google" on both the sign-in page (`/login`, since
step 14) and the register page (`/register`, since step 29). Must be
completed for both the staging and production Supabase projects.

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

**This is also how "register with Google" works (step 29) — same OAuth
client, same redirect URI, no separate setup.** `signInWithOAuth` doesn't
distinguish signing in from registering; whether the button is clicked on
`/login` or `/register`, Google returns the same kind of code, and
`handle_new_user` fires identically on a first-time `auth.users` insert
either way. Nothing in this doc — the Google Cloud project, the OAuth
consent screen, the OAuth client, or the redirect URLs configured below —
needed to change for the register page to gain this button; it reuses the
exact same client and callback route as login.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "redirect_uri_mismatch" error from Google | The Supabase callback URL in Step 3 does not exactly match what Google has on record — check for trailing slashes |
| Redirected back to the wrong environment after sign-in | The Supabase project's Redirect URL in Step 5 points to the wrong Vercel domain |
| "Invalid redirect URL" error from Supabase | The `?redirectTo=` destination is not covered by the wildcard added in Step 5 |
| Display name shows as email local-part after Google sign-in | `raw_user_meta_data` did not contain `full_name` — this is normal for Google Workspace accounts with restricted profile sharing |

---

## Known issue: Google account chooser shows the Supabase ref, not our domain

**Symptom:** After clicking "Continue with Google", the Google account-chooser
screen reads "to continue to `<project-ref>.supabase.co`" instead of showing
`audiophile-compare.uk` (or `staging.audiophile-compare.uk`). OAuth itself
works correctly — this is a branding/trust issue, not a functional bug.

**Cause:** That screen displays the domain of the actual OAuth redirect URI,
which is the Supabase Auth callback (`https://<project-ref>.supabase.co/auth/v1/callback`,
see Step 3 above) — not our app's domain.

There are two ways to fix this, not yet applied (deferred — revisit later):

### Option A — Free: show the app name instead of the domain

Showing an app name and logo (instead of just publishing with defaults)
requires completing Google's **brand verification** process — a lighter
review than full sensitive-scope verification, but a real submission with a
real review turnaround. This needs actual hosted pages, not just form fields:

1. **A public home page** at our domain (e.g. `https://audiophile-compare.uk`)
   that is publicly reachable and clearly relevant to the app
2. **A Privacy Policy page** hosted on that same domain, disclosing how the
   app accesses and uses Google user data — e.g. `/privacy`
3. **A Terms of Service page** on the same domain — e.g. `/terms`. Some
   sources list this as merely recommended, but Google's brand-verification
   requirements list it alongside the privacy policy, so treat it as required
4. In **Google Cloud Console → APIs & Services → OAuth consent screen**, set:
   - **App name** (e.g. `Audiophile Compare`) — a text field
   - **App logo** — a direct image upload (120×120px minimum), not a URL
   - The home page, privacy policy, and terms of service links from steps 1–3
5. Add `audiophile-compare.uk` as an **Authorized domain** — requires
   verifying ownership via Google Search Console (covers the home page,
   privacy policy, and terms links, since they all share this domain)
6. **Submit for brand verification** and publish the app (move it from
   "Testing" to "In production"). Since we only request basic
   `email`/`profile`/`openid` scopes, this does not trigger the heavier
   sensitive/restricted-scope review — just brand verification, which
   typically takes **2–3 business days**
7. Note: any future change to the app name, logo, or these links requires
   resubmitting for verification before it takes effect on the consent screen

Once approved, the account chooser shows "to continue to **Audiophile
Compare**" instead of the raw Supabase subdomain. It shows our app name, not
the literal domain string — and it requires building two new pages
(privacy policy, terms) plus a home page if we don't already have one.

### Option B — Paid: show the actual domain

Use Supabase's **custom domains** feature so the Auth server itself runs on
our domain (e.g. `auth.audiophile-compare.uk`) instead of `*.supabase.co`.
Because the redirect URI's host becomes our domain, Google's account chooser
then displays it directly.

- Requires the **Pro plan** ($25/mo) plus a **custom domains add-on**
  (~$10/mo **per project** — both prod and staging would need it separately)
- Steps: add the new custom-domain callback URL *alongside* the existing
  `*.supabase.co` one in the Google OAuth client → activate the custom domain
  in the Supabase dashboard → Supabase Auth then advertises the custom domain
  as the callback → update Step 3's registered redirect URI accordingly
- Keep the old `.supabase.co` redirect URI registered during the transition so
  sign-in doesn't break mid-cutover

**Recommendation:** Option A is free and solves the trust/branding concern
(proper name and logo instead of a random project ref). Option B is only
worth the recurring cost if the literal domain string needs to appear, and it
would be paid twice if enabled on both staging and production.
