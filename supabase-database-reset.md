# Supabase Database Reset & Recovery

---

## Full database reset

Use this when you want to wipe all data and schema and start from scratch.

### 1. Reset via the Supabase CLI

```bash
supabase db reset
```

This drops every schema object in the local database, then re-runs all
migrations from `supabase/migrations/` in order. All data is lost.

After the reset, push the result to your remote project if needed:

```bash
supabase db push
```

### 2. Reset via the Supabase dashboard (remote project)

If you need to reset a remote/hosted project rather than a local one:

1. Open the [Supabase dashboard](https://supabase.com/dashboard) and select
   your project.
2. Go to **Settings → Database → Reset database**.
3. Confirm the reset. All data and schema objects are deleted.
4. Run your migrations again to restore the schema:

   ```bash
   supabase db push
   ```

---

## Recovery: tables not created in the public schema

### Symptom

After running `supabase db push` (or `supabase db reset`) the migration
reports success, but the **Table Editor** shows no tables under the `public`
schema, or the application returns "relation does not exist" errors.

### Cause

This typically happens when:

- The migration SQL ran against a non-`public` schema (e.g. `postgres` or a
  user-created schema).
- The migration was partially applied and then failed, leaving the schema in an
  inconsistent state.
- The Supabase CLI migration history table (`supabase_migrations.schema_migrations`)
  recorded the migration as applied even though the DDL did not complete.

### Step 1 — Verify which schema the tables are in

Run this in **Supabase → SQL Editor**:

```sql
select table_schema, table_name
from information_schema.tables
where table_name in (
  'users', 'systems', 'system_snapshots', 'tracks',
  'tests', 'clips', 'clip_mapping',
  'listening_techniques', 'votes', 'comments'
)
order by table_schema, table_name;
```

If rows are returned with `table_schema = 'public'` the tables exist and the
issue is elsewhere. If no rows are returned, proceed to Step 2.

### Step 2 — Check the migration history

```sql
select * from supabase_migrations.schema_migrations order by version;
```

If the migration version (`20260625094142`) is listed here but the tables are
absent from `public`, the CLI believes the migration ran but it did not apply
correctly.

### Step 3 — Remove the stale migration record and re-apply

```sql
-- Remove the incorrect history entry so the CLI will re-run the migration
delete from supabase_migrations.schema_migrations
where version = '20260625094142';
```

Then from your terminal:

```bash
supabase db push
```

The CLI will now treat the migration as unapplied and run it again.

### Step 4 — Verify the tables exist

Return to **Supabase → Table Editor** and confirm all ten tables appear under
the `public` schema:

| Table | Description |
|---|---|
| `users` | User profiles (mirrors `auth.users`) |
| `systems` | Hi-fi systems owned by users |
| `system_snapshots` | Point-in-time snapshots of a system |
| `tracks` | Music tracks used in tests |
| `tests` | A/B comparison tests |
| `clips` | Audio/video clips attached to a test |
| `clip_mapping` | Maps clips to Before/After positions |
| `listening_techniques` | Reference data for vote techniques |
| `votes` | User votes on a test |
| `comments` | User comments on a test |

### Step 5 — Verify the auth trigger

The migration also creates a trigger that auto-creates a `public.users` row
whenever someone signs up. Confirm it is present:

```sql
select trigger_name, event_object_schema, event_object_table, action_timing
from information_schema.triggers
where trigger_name = 'on_auth_user_created';
```

One row should be returned. If it is missing, re-run the full reset
(`supabase db reset`) to cleanly re-apply all migrations.

---

## After a reset: restore seed data for manual testing

After a full reset you will need to re-seed your test data. Follow the steps
in [manual-testing-setup.md](manual-testing-setup.md) to get back to a working
state quickly.
