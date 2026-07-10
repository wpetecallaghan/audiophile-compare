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

You also need a `CRON_SECRET` and an `INGEST_SECRET` for each environment —
generate them now:

```bash
openssl rand -base64 32   # run once per secret, per environment
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
| `INGEST_SECRET` | Strong random string (from `openssl rand -base64 32`) — protects `POST /api/internal/ingest` |

### Preview scope

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Staging Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Staging anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Staging service role key |
| `CRON_SECRET` | Separate random string (or reuse the production value) |
| `INGEST_SECRET` | Separate random string (or reuse the production value) |

### Development scope

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` (local) or staging URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Local anon key (printed by `supabase start`) or staging anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Local service role key or staging service role key |
| `CRON_SECRET` | Any string (e.g. `dev-secret`) — only used for local cron testing |
| `INGEST_SECRET` | Any string (e.g. `dev-secret`) — only used for local ingest testing |

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

## Forum ingestion: `AI_GATEWAY_API_KEY` (local-script-only)

The extraction step of the forum ingestion pipeline (`scripts/extract-lejonklou.ts`,
`build-history-ingestion/35-extraction-decisions.md`) calls the Vercel AI Gateway to classify forum
posts. Unlike every other variable above, this one is **not** added to the
Production/Preview/Development scopes in the dashboard — extraction never runs as a
deployed Vercel Function, only as a local script a human runs by hand, so it only
ever needs to exist in `.env.local`.

1. In the Vercel dashboard, go to your team → **AI Gateway** → **API Keys**
2. Create a new key and copy it
3. Add it to `.env.local` directly (not via `vercel env pull` / the dashboard's
   per-environment scopes):
   ```
   AI_GATEWAY_API_KEY=<your key>
   ```

**Why not just rely on `VERCEL_OIDC_TOKEN`?** Running `vercel env pull` (Step 5
above) already populates a `VERCEL_OIDC_TOKEN` in `.env.local`, which can also
authenticate to the Gateway — but it's short-lived and meant to be kept fresh by an
active `vercel dev` session. Extraction is a long-running, unattended batch script
(potentially processing thousands of posts across a re-run), a poor fit for a token
that can expire mid-run. A dedicated `AI_GATEWAY_API_KEY` doesn't expire, so it's
the right credential for this specific use, even though `VERCEL_OIDC_TOKEN` is
already sitting there.

---

## Forum ingestion: commit-script env vars (local-script-only)

The commit step of the forum ingestion pipeline (`scripts/commit-lejonklou.ts`,
`build-history-ingestion/36-commit.md`) POSTs approved candidates to a *deployed*
environment's `POST /api/internal/ingest` — first staging, then production
(`build-history-ingestion/37-run-import.md`). It needs two things per environment: the
ingest secret and the deployed base URL. Both are read from `.env.local` under
per-environment names — never a single ambient value — so the same session can
commit to staging then production without editing `.env.local` in between.

### `INGEST_SECRET_STAGING` / `INGEST_SECRET_PRODUCTION`

Both environments already have their own `INGEST_SECRET` value from Step 3
above, scoped separately in the Vercel dashboard (Production vs. Preview) — but
a single local `.env.local` can only hold one value per key name.

Add both values under their own names (not the bare `INGEST_SECRET` name Step
3's dashboard scopes use):
```
INGEST_SECRET_STAGING=<the Preview-scope INGEST_SECRET value>
INGEST_SECRET_PRODUCTION=<the Production-scope INGEST_SECRET value>
```

### `COMMIT_BASE_URL_STAGING` / `COMMIT_BASE_URL_PRODUCTION`

The deployed URL for each environment, e.g.:
```
COMMIT_BASE_URL_STAGING=https://staging.audiophile-compare.uk
COMMIT_BASE_URL_PRODUCTION=https://audiophile-compare.uk
```
Overridable per-invocation with `--base-url <url>` if you ever need to target a
one-off URL (e.g. a specific preview deployment) without touching `.env.local`.

`commit-lejonklou.ts` reads the `_STAGING` pair when run with `--env staging` and
the `_PRODUCTION` pair when run with `--env production` — `--env` itself always
stays a required, no-default flag, so an accidental copy-paste can't send the
wrong secret to the wrong environment silently (the request would just fail with
403 instead), and there's never an implicit "which environment" to get wrong.

---

## Forum ingestion: rollback-script env vars (local-script-only)

`scripts/rollback-lejonklou.ts` (built during `build-history-ingestion/36-commit.md`'s
iteration, an interim ingestion-pipeline-only tool — **not** step 38,
which now covers a different, unrelated data-erasure requirement; see step
38's rewritten plan) deletes committed test data directly from a Supabase
project — unlike the commit script, this isn't a deployed HTTP call, so it
needs direct database credentials, not a base URL. Same per-environment-name
reasoning as above: a single ambient `NEXT_PUBLIC_SUPABASE_URL`/
`SUPABASE_SERVICE_ROLE_KEY` (what the deployed app itself uses) can only ever
represent one environment.

```
SUPABASE_URL_STAGING=<the Preview-scope NEXT_PUBLIC_SUPABASE_URL value>
SUPABASE_SERVICE_ROLE_KEY_STAGING=<the Preview-scope SUPABASE_SERVICE_ROLE_KEY value>
SUPABASE_URL_PRODUCTION=<the Production-scope NEXT_PUBLIC_SUPABASE_URL value>
SUPABASE_SERVICE_ROLE_KEY_PRODUCTION=<the Production-scope SUPABASE_SERVICE_ROLE_KEY value>
```

**`rollback-lejonklou.ts` has its own known, still-unresolved limitation,
independent of step 38's rewrite: no placeholder-ownership check.** It has no
way to confirm a test's owner is still a placeholder before deleting it — see
`build-history-ingestion/36-commit.md` findings 8–9 for the full account.
**This is no longer a hypothetical risk:** step 39's claim flow
(`build-history-ingestion/39-claim-flow.md`) is now built and deployed to
both `audiophile-staging` and `audiophile-prod`, so real content may already
have been claimed on either. Pointing this script at `--env production` (or
`--env staging`) could silently delete a real, claimed user's content, not
just an unmerged placeholder's. Before adding the `_PRODUCTION` pair below,
either add the ownership check to the script, or confirm directly against
that environment that nothing has been claimed yet — an `import_authors` row
whose mapped `user_id` no longer belongs to an `is_placeholder = true` user
has been claimed.

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
