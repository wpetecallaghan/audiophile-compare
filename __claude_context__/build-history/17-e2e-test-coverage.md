---
name: audiophile-compare-build-history-17
description: Build step 17 — End-to-end test coverage.
---

# ✅ 17 — End-to-end test coverage

Full Playwright suite passes against staging (24/24). Fixed along the way:
env vars not loading in `playwright.config.ts`, Vercel SSO Deployment
Protection blocking the automated browser (see `VERCEL_AUTOMATION_BYPASS_SECRET`
in `testing.md` §9), admin-issued magic links needing `token_hash` verification
via the new `app/auth/confirm/route.ts` instead of the `code` flow, and several
spec files with selectors that had drifted from the current UI.

Not covered by any spec (optional future additions, not blocking this step):
cross-check selector flow, feed vote-count display.
See `testing.md` for current coverage and `docs/end-to-end-testing.md` for test strategy.
