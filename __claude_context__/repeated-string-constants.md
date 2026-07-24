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

Two occurrences of the same number can still be completely unrelated — e.g.
a `timeoutMs = 5000` default and an unrelated page-size constant that
happens to also be `5000` mean different things and change independently.
Extracting a shared constant across coincidentally-equal, semantically-
unrelated numbers is a correctness/readability regression, not an
improvement — it implies a connection that doesn't exist. Only extract when
the *same value is repeated because it's the same value* (e.g. one page
size used in both the query `.range()` call and the "next page" check),
not because two unrelated numbers happen to match.

HTTP status codes are the deliberate *exception* here, not an example of
unrelated same-digit numbers: every numeric HTTP status literal in a
`NextResponse.json({...}, { status: N })` call has exactly one meaning —
the response's own HTTP status — so per the shared-module rule below
they're all centralized in `lib/api/http-status.ts` (`HTTP_OK`,
`HTTP_BAD_REQUEST`, `HTTP_UNAUTHORIZED`, etc.), not treated as a per-
occurrence "is this the same reason" judgment call.

Structural numbers — `0`/`1`/`-1` in loop bounds, array indices, ordinary
arithmetic — aren't "magic numbers" in the sense this rule cares about;
don't extract those just because the digit recurs. And a single
well-named default parameter (e.g. `timeoutMs = 5000`) already documents
itself via its name — it doesn't also need a separate top-level constant
duplicating the same value for no second call site.

## Typed discriminated-union members get the same structural exemption — until cross-file reuse shows up

A string literal returned into a field with an explicit string-literal-union
type (e.g. `provider: 'youtube'` where the field's type is
`'youtube' | 'vimeo' | 'google-drive' | 'direct' | 'unknown'`) doesn't need
its own named constant just because the same union member is returned from
more than one branch of the same function. The compiler already provides
the safety a constant would buy — a typo doesn't type-check — so a constant
adds indirection without adding information, **as long as the repetition
stays inside the file that declares the union.**

This exemption is not a permanent pass, though — it only holds until the
same literal turns out to be repeated *outside* that file too. This
project's own `ClipProvider`/`MediaType` (`lib/clips/detect-provider.ts`)
went through exactly that: an earlier version of this doc cited
`media_type: 'unknown'` (three branches) and `provider: 'direct'` (two
branches) inside that one file as not needing extraction. That was true in
isolation, but a codebase-wide search later found every member of both
unions — `'youtube'`, `'vimeo'`, `'google-drive'`, `'direct'`, `'unknown'`,
`'audio'`, `'video'` — independently re-typed as raw literals across ~25
other files (build step 80), exactly the "repeats across multiple files →
shared module" case below. At that point the single-file exemption no
longer applied — cross-file reuse always takes precedence, regardless of
whether the repeated value also happens to sit in a typed-union position.
`detect-provider.ts` now exports one named constant per member
(`PROVIDER_YOUTUBE`, `MEDIA_TYPE_UNKNOWN`, etc. — declared `as const` for
literal typing, not the wider union type; see that file's own comment for
why), the same pattern `check-url.ts`'s `STATUS_OK`/`STATUS_DEGRADED`/
`STATUS_DEAD` already established for `UrlStatus`.

The takeaway: this exemption describes a *symptom* (the compiler already
catches typos in a typed-union position), not a *rule that overrides*
cross-file duplication. Don't assume a union member is exempt just because
it's typed — check whether it's also independently repeated elsewhere
first.

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
  style calls across every spec file). For HTTP status codes across
  `app/api/**/route.ts` and their tests, that's `lib/api/http-status.ts`.

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
