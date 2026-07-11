// Shared with RegisterForm.tsx and ChangePasswordForm.tsx — the only two
// places this app enforces a minimum password length.
export const MIN_PASSWORD_LENGTH = 8

export const LONG_PASSWORD_LENGTH = 20
const MIN_CHARACTER_CLASSES = 3

function countCharacterClasses(password: string): number {
  return [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/]
    .filter(re => re.test(password)).length
}

// Passwords under LONG_PASSWORD_LENGTH need at least MIN_CHARACTER_CLASSES
// of lowercase/uppercase/digit/symbol. At LONG_PASSWORD_LENGTH or above,
// length substitutes for complexity — only an alphabetic character is
// required, so a long passphrase of plain words is accepted without
// forcing digits or symbols into it (NIST 800-63B: length over
// composition for long passwords).
export function isPasswordComplexEnough(password: string): boolean {
  if (password.length >= LONG_PASSWORD_LENGTH) return /[a-zA-Z]/.test(password)
  return countCharacterClasses(password) >= MIN_CHARACTER_CLASSES
}
