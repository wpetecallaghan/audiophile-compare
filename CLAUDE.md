# Audiophile Compare

Blind A/B comparison app for hi-fi audio systems. Listeners vote on whether they can hear a difference between two system snapshots on a shared recording without knowing which clip is which.

## Definition of Done for a Build Step

Every feature/fix is only complete when all of these are true:
1. Implementation changed
2. Unit tests added/updated and `npm test` passes (full suite, not just the touched file)
3. E2E tests updated where a user-visible flow changed
4. `npm run build` and type-check pass
5. Context/build-history docs updated
6. Browser or Lighthouse verification for any UI change

Report the status of each of the six explicitly at the end.

## Verification Before Claiming Done

- Never assert a root cause from inspection alone. Reproduce it first (Playwright, HAR capture, console logs, or a failing test) and state the evidence.
- If a fix is speculative (e.g. bumping a timeout, changing a middleware matcher), label it explicitly as a hypothesis and verify it changes behaviour before moving on. Revert it if it doesn't.
- Always browser-verify UI changes (screenshot or Playwright) before reporting completion — unit tests with mocks have repeatedly missed real rendering bugs (ICU apostrophe escaping, missing voter name).

## Stack (fixed — do not substitute)

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16+, App Router | No Pages Router; async params/searchParams |
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
Never edit a migration file once it has been applied to any project — `supabase db push` tracks applied files by filename, so an edit to one silently no-ops. Write a new migration instead.

## Server vs client — decision rule

Default is **server**. Add `'use client'` only for: `useState`/`useEffect`/`useRef`, browser event handlers, browser APIs, or third-party DOM SDKs (YouTube, Vimeo).

A server component can render a client component. A client component **cannot** import `lib/supabase/server.ts`.

## Planning

### Scope Discovery Before Planning

Before writing a plan, enumerate ALL entry points and call sites for the thing being changed (grep for the component, route, or feature name across the repo) and list them in the plan. Do not plan against a single screen when the feature appears on multiple pages.

## Code Conventions

### No Repeated Literals

- No hardcoded magic values in application code: HTTP status codes, colors/CSS classes, timeouts, and user-facing strings must come from named constants, the theme token system, or i18n files.
- Import and use the exported types from the module that owns them rather than re-declaring inline shapes.
- When adding a constant, grep the whole repo for other instances of the same literal and migrate them in the same pass — partial migrations have required a second audit.
- See `repeated-string-constants.md` for detailed guidance when writing or reviewing code that repeats a string or numeric literal.

### Full-Surface Audits

When asked to migrate or standardize a pattern across the codebase, enumerate ALL matching files with a grep/ripgrep sweep first, present the complete file list, then migrate. Do not report completion until a second grep confirms zero remaining occurrences.

### Prefer Deterministic Designs Over Timing Races

Avoid timeout-based fallbacks, arbitrary delays, and "wait N ms then assume" logic. Prefer event/callback-driven designs (e.g. link-by-default, upgrade on successful load) and state that lives outside unmounting components.

## Context files — load for your task

All detailed context is in `__claude_context__/`. Read `core.md` first for the full file layout.

| Task | Load |
|---|---|
| API routes | `api-conventions.md` + `audiophile-compare-schema.md` |
| Components / pages | `components.md` |
| Tests | `testing.md` |
| Queries / migrations / RLS | `audiophile-compare-schema.md` |
| Build history / orientation | `build-history/index.md`, then the specific step file |
| Forum ingestion pipeline (scraper, extraction, commit, rollback, erasure) | `build-history-ingestion/index.md`, then the specific step file |
| Deferred features (ingestion, storage, mobile) | `deferred-features.md` |
| Writing or reviewing code (app or test) that repeats a string or numeric literal | `repeated-string-constants.md` |
| Open bugs / dev-environment quirks (check before re-investigating) | `known-issues.md` |
