---
name: audiophile-compare-build-history-51
description: Build step 51 — minimum password complexity, sliding by length.
---

# ✅ 51 — Minimum password complexity, sliding by length

**The gap this closed:** password validation (`RegisterForm.tsx`,
`ChangePasswordForm.tsx`, via `lib/auth/password-rules.ts`) only enforced
`MIN_PASSWORD_LENGTH = 8` — any 8+ character string passed, including
`'password123'`, which was literally the happy-path fixture value in both
components' own unit tests. Requested rule: short passwords need
character variety, long passwords (20+) can rely on length alone —
matching NIST 800-63B's guidance that composition rules discourage
memorable long passphrases and length is the stronger signal.

**Confirmed via two clarifying questions before implementing** (both
security-relevant behavior decisions, not style choices):
1. Short-password complexity: **3 of 4 character classes** (lowercase,
   uppercase, digit, symbol) — the classic "3 of 4" rule (e.g. historical
   Active Directory default), forgiving enough not to force a symbol on
   every password.
2. Long-password (20+) rule: **must contain at least one alphabetic
   character**, nothing else required — rejects a 20-digit or 20-symbol
   string (degenerate, defeats the point of the length exemption) while
   accepting a long plain-lowercase passphrase.

**`lib/auth/password-rules.ts`** — added alongside the existing
`MIN_PASSWORD_LENGTH`:
```typescript
export const LONG_PASSWORD_LENGTH = 20
const MIN_CHARACTER_CLASSES = 3

function countCharacterClasses(password: string): number {
  return [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/]
    .filter(re => re.test(password)).length
}

export function isPasswordComplexEnough(password: string): boolean {
  if (password.length >= LONG_PASSWORD_LENGTH) return /[a-zA-Z]/.test(password)
  return countCharacterClasses(password) >= MIN_CHARACTER_CLASSES
}
```

**Wired into both forms as a second early-return check**, right after the
existing length check and before the confirm-password match check — same
style, same file, same `t('key')` → `setError()` pattern already
established for `passwordMinLength`. New `messages/en.json` keys
`auth.passwordComplexity` / `profile.passwordComplexity` (mirroring the
existing per-namespace duplication of `passwordMinLength`/
`passwordMismatch`).

**Deliberately no persistent hint text under the password field** — the
existing 8-character rule has never had one either (only ever surfaces as
an on-submit error), so adding a live hint just for the new rule would be
an inconsistent, unrequested UX addition on top of what was asked for.

**No schema/RLS/migration/server-side enforcement** — this stays a purely
client-side check, consistent with how `MIN_PASSWORD_LENGTH` already
worked (no Supabase Auth password policy is configured for this project;
introducing server-side enforcement now would be a new enforcement point,
not requested).

**Tests:**
- New `lib/auth/__tests__/password-rules.test.ts` (11 cases) — character-
  class counting at 1/2/3/4 classes, the exact `'password123'` regression
  fixture, the `LONG_PASSWORD_LENGTH` boundary (19 vs 20 chars), a 20+
  all-digit string (rejected), a 20+ all-symbol string (rejected), a long
  plain-lowercase passphrase (accepted).
- `RegisterForm.test.tsx` / `ChangePasswordForm.test.tsx` — their
  existing happy-path fixture passwords (`'password123'`,
  `'newpassword1'`, lowercase+digit = 2 classes) now fail the new rule,
  so every call site of those literals was updated to a value satisfying
  3 classes (`'Password123'` / `'NewPassword1'`); the mismatch tests'
  fixtures were bumped the same way so they still reach the mismatch
  check rather than failing earlier at complexity; `ChangePasswordForm`'s
  auth-failure test (`'weakpass'`, 1 class) was bumped to `'Weakpass1'`
  (3 classes) so it still reaches the mocked `updateUser` call it's
  actually testing. One new test per file: `'shows error when password
  lacks character variety'`, reusing the old `'password123'`/
  `'newpassword1'` values as the negative case they now correctly are.
- `__claude_context__/testing.md` — updated both components' inventory
  rows, added a row for the new `password-rules.test.ts`.

**Verified:** `npx tsc --noEmit` clean. `npm run test` — 42 files / 482
tests passing (up from 41/469 — 11 new in `password-rules.test.ts`, 1 new
in each of the two component test files). Full local E2E suite (`npx
playwright test`) — 62/62 passing; no E2E spec sets a new password
(confirmed by search before implementing), so none were affected.
