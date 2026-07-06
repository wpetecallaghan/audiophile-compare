---
name: audiophile-compare-repeated-string-constants
description: >
  Coding convention: extract any string literal used more than once into a
  named constant, scoped to where it's actually reused. Load this when
  writing or reviewing code (app or test) that repeats a literal string.
---

# Repeated string literals → named constants

When a string literal appears more than once, define it as a named constant
instead of repeating the literal. This applies to any repeated string —
business/copy text, ARIA roles passed to Playwright's `getByRole('button', ...)`,
config keys, CSS class fragments, anything.

## Scope the constant to its reuse

- **Repeats only within one file** → a local `const` at the top of that file.
- **Repeats across multiple files** → a shared module. In `e2e/tests/`, that's
  `e2e/helpers/constants.ts` — already holds `E2E_PREFIX` and `ROLE`
  (`{ button, link, heading }`, deduplicating dozens of `getByRole('button', ...)`
  style calls across every spec file).

## Don't over-apply

Only extract on actual repetition — a string used once stays inline. Extracting
"in case it repeats later" is premature abstraction, which conflicts with this
project's general no-speculative-abstraction stance (see root `CLAUDE.md`).

## Related existing convention

User-facing copy already has its own stricter rule, independent of repetition
count: **all** user-facing strings go in `messages/en.json`, never hardcoded in
components (see `components.md §10`). E2E specs
should reference those same keys (`import m from '../../messages/en.json'`)
rather than hardcoding the English text a second time — this is really the
same "don't repeat the literal" principle applied to app copy vs. its test
assertions, not a separate rule.

Where a component hardcodes copy that *isn't* in `messages/en.json` (a gap in
the component, not the test), match it as a plain string/regex in the spec and
leave a one-line comment noting it isn't sourced from `en.json` — don't invent
a message key in the test file to paper over it.
