---
name: audit-literals
description: Find and migrate repeated hardcoded literals to named constants
---

Grep the entire repo (not just recently touched files) for hardcoded HTTP status codes, hex colors, raw Tailwind color classes, numeric timeouts, and user-facing string literals.
Produce a table of file -> literal -> proposed constant BEFORE editing anything.
After approval, migrate every occurrence in one pass, then re-grep to prove zero remain. Run type-check and the full test suite.
