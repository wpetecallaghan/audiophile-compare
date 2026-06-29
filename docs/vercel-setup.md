# Vercel Setup — Production, Preview, and Development

## Environment architecture

The app uses three deployment environments backed by two Supabase cloud projects:

| Environment | Git trigger | Supabase project |
|---|---|---|
| **Production** | Push to `main` | `audiophile-prod` |
| **Preview** | Push to any branch / open a PR | `audiophile-staging` |
| **Development** | `next dev` locally | Local Supabase or `audiophile-staging` |

---

## Before you start

You need connection details from two Supabase projects. See
`docs/supabase-environments.md` for how to create them and where to find:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

You also need a `CRON_SECRET` for each environment — generate one now:

```bash
openssl rand -base64 32   # run twice: once for production, once for preview
```

---

## Step 1 — Create a Vercel account

1. Go to [vercel.com](https://vercel.com) → **Sign Up**
2. Choose **Continue with GitHub** (recommended — Vercel will detect your repositories automatically)
3. Authorise the GitHub OAuth app when prompted

---

## Step 2 — Create the Vercel project

If you already have a Vercel project for this repository and want a clean start:
- Go to the project → **Settings → Advanced → Delete Project**
- Confirm deletion (this removes only the Vercel configuration; your code and Supabase data are unaffected)

To create the project:

1. In the Vercel dashboard click **Add New → Project**
2. Click **Import** next to the `audiophile-compare` GitHub repository
3. Vercel detects Next.js automatically — leave all build and output settings at their defaults
4. **Do not click Deploy yet** — add environment variables first (Step 3)

---

## Step 3 — Add environment variables

In the project creation screen, expand **Environment Variables** before deploying.
Each variable has three scope checkboxes: **Production**, **Preview**, **Development**.
Set them independently — do not tick all three unless you want the same value everywhere.

### Production scope

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Production service role key |
| `CRON_SECRET` | Strong random string (from `openssl rand -base64 32`) |

### Preview scope

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Staging Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Staging anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Staging service role key |
| `CRON_SECRET` | Separate random string (or reuse the production value) |

### Development scope

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` (local) or staging URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Local anon key (printed by `supabase start`) or staging anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Local service role key or staging service role key |
| `CRON_SECRET` | Any string (e.g. `dev-secret`) — only used for local cron testing |

> **Which to use for local dev?**  
> Local Supabase gives full offline isolation (no shared staging data) but requires
> Docker and a running `supabase start`. Using the staging URL is simpler — you share
> staging data between local dev and preview deploys, which is fine during development.

---

## Step 4 — Deploy

Click **Deploy**. Vercel builds and deploys the `main` branch to Production.

After the first successful deployment:

1. **Settings → Cron Jobs** — verify the daily URL health check job (`/api/cron/check-urls`, `0 2 * * *`) appears
2. **Settings → Domains** — note the auto-assigned `*.vercel.app` URL
3. Visit the live URL and confirm the app loads correctly

---

## Step 5 — Pull Development variables locally

After the project is created, sync the Development-scoped variables to `.env.local`:

```bash
# Link this local repository to your Vercel project (one-time setup)
npx vercel link

# Pull Development variables into .env.local
npx vercel env pull
```

`.env.local` is gitignored — credentials never enter version control. Re-run
`vercel env pull` any time you change the Development variables in the dashboard.

---

## Step 6 — Verify preview deployments

```bash
git checkout -b test-preview
git push origin test-preview
```

Vercel automatically builds a preview URL for this branch (visible in the dashboard
under **Deployments**). The preview uses the Staging Supabase project. Delete the
branch when done testing.

---

## Ongoing workflow

| Action | Result |
|---|---|
| `git push origin main` | New Production deployment |
| Push to any branch / open PR | New Preview deployment |
| `next dev` locally | Uses `.env.local` (Development variables) |
| `npx vercel env pull` | Refreshes `.env.local` if Development variables changed |

---

## Troubleshooting

**Build fails with "environment variable not found"**  
The variable is set for the wrong scope. A variable set for Production only is not
available to Preview builds. Check the scope checkboxes in Settings → Environment Variables.

**Cron job not appearing after deploy**  
Verify `vercel.json` is committed and pushed. The cron is registered only after a
successful deployment from a branch Vercel considers the production branch (usually `main`).

**Preview site reads from the wrong database**  
Verify `NEXT_PUBLIC_SUPABASE_URL` for the Preview scope points to `audiophile-staging`,
not `audiophile-prod`.

**Auth callback fails on preview URLs**  
Supabase needs to trust preview URLs as redirect targets. In your staging Supabase
project go to **Authentication → URL Configuration** and add
`https://*.vercel.app/auth/callback` to the **Redirect URLs** list.

**`vercel link` asks which project to link**  
Select the project you just created. If the CLI lists the wrong account, run
`npx vercel logout` then `npx vercel login` first.
