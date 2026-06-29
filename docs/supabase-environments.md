# Supabase Environments

## Strategy

The app uses two Supabase cloud projects. The free tier allows two active projects,
which maps exactly to this setup:

| Environment | Project name | Used by |
|---|---|---|
| **Production** | `audiophile-prod` | Vercel Production (main branch) |
| **Staging** | `audiophile-staging` | Vercel Preview (branches/PRs) + local dev |

Local Supabase (Docker) is an optional third option for fully offline development —
see the local section below.

---

## Creating the Supabase projects

### 1. Production project

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Name: `audiophile-prod`
3. Database password: generate a strong password and store it in a password manager
4. Region: choose the region closest to your users
5. Click **Create new project** and wait ~2 minutes for provisioning

### 2. Staging project

Repeat with name `audiophile-staging` and a different database password.

---

## Obtaining connection details

For each project go to **Settings → API**:

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | "Project URL" |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | "Project API keys" → `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | "Project API keys" → `service_role` `secret` |

The `service_role` key bypasses Row Level Security — treat it like a database
superuser password. It goes only into server-side environment variables, never
into client-side code.

---

## Applying the schema

The entire schema lives in one file:

```
supabase/migrations/20260625094142_initial_schema.sql
```

Apply it to each project using the Supabase CLI. The CLI needs to know which project
to target — this is set via `supabase link`.

### Find your project reference

The project reference appears in the dashboard URL:
```
https://supabase.com/dashboard/project/<project-ref>
```
It is a 20-character alphanumeric string.

### Apply to Production

```bash
npx supabase link --project-ref <prod-project-ref>
npx supabase db push
```

Enter your Production database password when prompted.

### Apply to Staging

```bash
npx supabase link --project-ref <staging-project-ref>
npx supabase db push
```

> `supabase link` writes the project reference to `.supabase/config.toml`.
> You must re-link when switching between projects. The file is gitignored.

### Verify the schema applied

In each project's **Table Editor**, confirm these tables exist:
`users`, `systems`, `system_snapshots`, `tracks`, `tests`, `clips`,
`clip_mapping`, `listening_techniques`, `votes`, `comments`

In **Authentication → Policies**, confirm RLS policies are listed for each table.

---

## Configure authentication redirect URLs

Each project needs to trust the URLs that Supabase Auth will redirect to after
a magic link click.

### Production project

Go to **Authentication → URL Configuration**:
- **Site URL**: your production domain (e.g. `https://audiophile-compare.vercel.app`)
- **Redirect URLs**: add `https://audiophile-compare.vercel.app/auth/callback`

### Staging project

Go to **Authentication → URL Configuration**:
- **Site URL**: `https://audiophile-staging.vercel.app` (or your preview domain)
- **Redirect URLs**: add `https://*.vercel.app/auth/callback` (wildcard covers all preview URLs)

---

## Applying future schema changes

During the development phase (no production data, database can be discarded):

1. Edit `supabase/migrations/20260625094142_initial_schema.sql` directly
2. Push to both projects:

```bash
# Reset and re-apply to Production
npx supabase link --project-ref <prod-project-ref>
npx supabase db reset --linked   # drops and recreates from the migration file

# Reset and re-apply to Staging
npx supabase link --project-ref <staging-project-ref>
npx supabase db reset --linked
```

> `db reset` drops the entire database and recreates it from your migration files.
> Only use this while there is no data you want to keep.

Once production data exists, switch to incremental migration files and use
`db push` (not `db reset`).

---

## Local Supabase (optional — requires Docker)

For fully offline development without touching either cloud project:

```bash
# Start local Supabase (Postgres + Auth + Storage + Studio)
npx supabase start

# Apply the schema
npx supabase db push

# Open the local dashboard
open http://127.0.0.1:54323

# Stop when done (data is preserved between restarts)
npx supabase stop

# Stop and discard all local data
npx supabase stop --no-backup
```

`supabase start` prints the local API URL, anon key, and service role key.
Use these values for the Development scope in Vercel (or in `.env.local` directly).

Local URL: `http://127.0.0.1:54321`  
Local Studio: `http://127.0.0.1:54323`

---

## Keeping environments in sync

During the dev phase both cloud projects run identical schemas. After any schema change:

```bash
# 1. Edit the single migration file
# 2. Reset and re-apply to each project

npx supabase link --project-ref <prod-project-ref>
npx supabase db reset --linked

npx supabase link --project-ref <staging-project-ref>
npx supabase db reset --linked

# 3. If using local Supabase:
npx supabase db reset
```
