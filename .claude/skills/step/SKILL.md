---
name: step
description: Execute one planned build step end-to-end with full verification
---

Execute the requested build step following this exact sequence. Do not skip or reorder.

1. SCOPE: grep the repo for every call site / entry point of the thing being changed. List them. If more than the user mentioned, stop and confirm.
2. PLAN: present the plan via ExitPlanMode and wait for approval.
3. IMPLEMENT: no hardcoded literals — status codes, colors, timeouts and strings go through constants / theme tokens / i18n.
4. TEST: add or update unit tests; run the FULL suite.
5. E2E: update Playwright specs if a user-visible flow changed; run them.
6. BUILD: run type-check and `npm run build`.
7. VERIFY: for any UI change, take a browser screenshot and confirm it visually.
8. DOCUMENT: update the context/build-history docs.
9. REPORT: a checklist of steps 1-8 with pass/fail for each.
