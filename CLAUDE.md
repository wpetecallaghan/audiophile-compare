# Audiophile Compare

Blind A/B comparison app for hi-fi audio systems. Listeners vote on whether they can hear a difference between two system snapshots on a shared recording without knowing which clip is which.

## Stack (fixed — do not substitute)

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15+, App Router | No Pages Router; async params/searchParams |
| Language | TypeScript strict | No `any` without justification |
| Database + Auth | Supabase (Postgres + Auth) | RLS enforced at DB layer |
| Hosting | Vercel | Vercel Cron for background jobs |
| Styling | Tailwind CSS | Mobile-first; defensive overflow/width required |
| i18n | next-intl | Without-routing mode; locale fixed to `en` |
| Testing | Vitest + Testing Library + Playwright | |

## Deployment topology

```
GitHub main    → Vercel Production → Supabase audiophile-prod
GitHub staging → Vercel Preview    → Supabase audiophile-staging
```

Migrations apply independently to each project — apply to staging first, then production.

## Server vs client — decision rule

Default is **server**. Add `'use client'` only for: `useState`/`useEffect`/`useRef`, browser event handlers, browser APIs, or third-party DOM SDKs (YouTube, Vimeo).

A server component can render a client component. A client component **cannot** import `lib/supabase/server.ts`.

## Context files — load for your task

All detailed context is in `__claude_context__/`. Read `core.md` first for the full file layout.

| Task | Load |
|---|---|
| API routes | `api-conventions.md` + `audiophile-compare-schema.md` |
| Components / pages | `components.md` |
| Tests | `testing.md` |
| Queries / migrations / RLS | `audiophile-compare-schema.md` |
| Build history / orientation | `build-history.md` |
| Deferred features (ingestion, storage, mobile) | `deferred-features.md` |
| Writing or reviewing code (app or test) that repeats a string literal | `repeated-string-constants.md` |
