---
name: verify
description: Full pre-done verification sweep
---

Run in order, stopping on first failure:
1. `npx tsc --noEmit`
2. `npm run build`
3. `npm test` (expect all unit tests green)
4. `npx playwright test` for affected specs
5. Launch the dev server and take a Playwright screenshot of every changed UI route
6. List which context/build-history docs need updating for this change

Report a table: check | status | notes. Do NOT declare done if any step failed.
