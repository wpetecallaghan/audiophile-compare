-- Step 64: admin-only override of a clip's health status, correcting a
-- false positive or false negative from the URL health-check cron (steps
-- 10/50/58/59). Per-clip, not per-test — a test has two clips (A/B), and
-- the concrete motivating case (YouTube/Vimeo embeds always return 200
-- regardless of whether the specific video exists — step 27's documented
-- blind spot) is inherently per-clip.
--
-- admin_override is deliberately binary ('ok'/'dead', no 'degraded') — the
-- two admin actions this supports are "mark broken" / "mark not broken".
-- lib/clips/effective-url-status.ts composes this with the cron's own
-- url_status (admin_override ?? url_status); the cron itself is never
-- touched and keeps writing url_status daily, oblivious to any override.
--
-- No RLS policy needed — the write goes through PATCH
-- /api/admin/clips/[id]/override, which uses the admin/service-role
-- client (bypasses RLS entirely), gated by isAdminEmail() at the app
-- layer, same pattern as erase-user-data/claim.
alter table public.clips
  add column admin_override text
    constraint clips_admin_override_check check (admin_override in ('ok', 'dead')),
  add column admin_override_by uuid references public.users(id),
  add column admin_override_at timestamptz;
