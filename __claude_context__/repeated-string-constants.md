---
name: audiophile-compare-repeated-string-constants
description: >
  Coding convention: extract any string or numeric literal used more than
  once for the same reason into a named constant, scoped to where it's
  actually reused. Load this when writing or reviewing code (app or test)
  that repeats a literal.
---

# Repeated literals → named constants

When a string **or number** literal appears more than once *for the same
reason*, define it as a named constant instead of repeating the literal.
For strings this applies to anything — business/copy text, ARIA roles
passed to Playwright's `getByRole('button', ...)`, config keys, CSS class
fragments. For numbers it applies to the same class of thing: timeouts,
page sizes, retry counts, thresholds — any magic number whose meaning
isn't obvious from the digit alone.

## Numbers need one extra check strings don't: same reason, not same digits

Two occurrences of `500` can be completely unrelated — an HTTP `5xx`
classification threshold and a route's own `{ status: 500 }` response are
both "500" but mean different things and change independently. Extracting
a shared constant across coincidentally-equal, semantically-unrelated
numbers is a correctness/readability regression, not an improvement — it
implies a connection that doesn't exist. Only extract when the *same
value is repeated because it's the same value* (e.g. one page size used in
both the query `.range()` call and the "next page" check), not because two
unrelated numbers happen to match.

Structural numbers — `0`/`1`/`-1` in loop bounds, array indices, ordinary
arithmetic — aren't "magic numbers" in the sense this rule cares about;
don't extract those just because the digit recurs. And a single
well-named default parameter (e.g. `timeoutMs = 5000`) already documents
itself via its name — it doesn't also need a separate top-level constant
duplicating the same value for no second call site.

## Typed discriminated-union members get the same structural exemption

A string literal returned into a field with an explicit string-literal-union
type (e.g. `provider: 'youtube'` where the field's type is
`'youtube' | 'vimeo' | 'google-drive' | 'direct' | 'unknown'`) doesn't need
its own named constant just because the same union member is returned from
more than one branch of the same function. The compiler already provides
the safety a constant would buy — a typo doesn't type-check — so a constant
adds indirection without adding information. `lib/clips/detect-provider.ts`
returns `media_type: 'unknown'` from three different branches and
`provider: 'direct'` from two; neither needs extracting.

This exemption covers only *individual members* of an already-declared
union returned inline. It does not cover the union *type declaration*
itself — when the same literal union is retyped from scratch in a second
file instead of importing the first file's exported type (e.g. `provider`'s
five-value union used to be redeclared in six different files instead of
importing `ClipProvider` from `lib/clips/detect-provider.ts`), that's real
duplication and should be fixed the normal way: export the type once from
its owning module, import it everywhere else.

## Scope the constant to its reuse

- **Repeats only within one file** → a local `const` at the top of that file.
- **Repeats across multiple files** → a shared module. In `e2e/tests/`, that's
  `e2e/helpers/constants.ts` — already holds `E2E_PREFIX` and `ROLE`
  (`{ button, link, heading }`, deduplicating dozens of `getByRole('button', ...)`
  style calls across every spec file).

## Don't over-apply

Only extract on actual repetition — a literal used once stays inline. Extracting
"in case it repeats later" is premature abstraction, which conflicts with this
project's general no-speculative-abstraction stance (see root `CLAUDE.md`).
This caveat matters more for numbers than strings, since coincidentally-equal
numbers are far more common than coincidentally-equal strings.

## Audit the whole change, not just the file that got flagged

When you (or a reviewer) spot a repeated literal in one file, check every
other file touched in the same change for the same pattern before calling
it done — don't fix only the file that got pointed out. This has recurred
across a single turn before: a fix landed in one file while a sibling file
written in the same change still had the identical repeated literal,
requiring a second correction. Treat one flagged instance as a signal to
re-scan the full diff, not a ticket scoped to one file.

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
