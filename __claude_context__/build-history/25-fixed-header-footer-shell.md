---
name: audiophile-compare-build-history-25
description: Build step 25 — Fixed header/footer app shell with internal scroll region.
---

# ✅ 25 — Fixed header/footer app shell with internal scroll region

Built per plan, no deviations. `app/layout.tsx`'s `<body>` is now
`h-dvh flex flex-col overflow-hidden`; `{children}` is wrapped in a new
`flex-1 overflow-y-auto` div between `SiteHeader` and `SiteFooter`, which
each gained `shrink-0`. `app/login/page.tsx` and `app/register/page.tsx`
changed their `<main>` from `min-h-screen` to `h-full` so they fill the new
scrollable region instead of forcing it to a full extra viewport height.
No other page needed changes — everything else has no explicit height and
flows into the new wrapper exactly as it did into the document body before.

**Verified** (dev server, real Supabase-backed render — not just `tsc`):
`npx tsc --noEmit` clean for all changed files; `npm run test` unchanged at
25 files/256 tests (pure layout/CSS, no branching logic, as expected). Five
throwaway Playwright assertions (not added to the permanent suite — pure
layout checks with no user-facing behavior to regress-test long-term):
header/footer bounding-box position identical before and after scrolling a
long page at a short (1000×500) viewport; `document.scrollingElement`
never moved and `body.scrollHeight` never exceeded the viewport (confirms
a single scrollbar, not two); `/about`'s footer bottom edge lands exactly
at the viewport bottom on a short page (900px viewport, ~500px of content —
true sticky-footer behavior, not a gap); `/login` and `/register` still
vertically center their form within the header-to-footer region after the
`h-full` change; no horizontal-scroll regression at a 375px mobile width.
Also screenshotted (light + dark, plus a 390×700 mobile viewport): header
and footer both stay pinned on screen while the card list scrolls
underneath, `/login` centers correctly in dark mode with good contrast, and
the mobile view shows the same fixed-chrome behavior. All passed on the
first attempt — no fixes needed.
