---
name: audiophile-compare-build-history-15
description: Build step 15 — Centralised string resources (i18n).
---

# ✅ 15 — Centralised string resources (i18n)

All user-facing strings in `messages/en.json`, namespaced by feature area.
Package: `next-intl` (App Router native; "without routing" mode — no URL locale prefix).
`app/layout.tsx` wraps tree with `<NextIntlClientProvider messages={messages}>`.
`next.config.mjs` wraps config with `createNextIntlPlugin()`.
`types/next-intl.d.ts` extends `IntlMessages` from `en.json` — unknown keys are TypeScript errors.
`vitest.setup.ts` mocks both `next-intl` and `next-intl/server` with async factories returning actual English values for human-readable test assertions.
E2E tests import `messages/en.json` directly so copy changes keep tests in sync automatically.
**Namespaces:** `common`, `nav`, `auth`, `systems`, `snapshots`, `tests`, `profile`, `feed`, `tracks`, `crosscheck`.
