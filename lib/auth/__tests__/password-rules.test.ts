import { describe, it, expect } from 'vitest'
import { isPasswordComplexEnough } from '../password-rules'

describe('isPasswordComplexEnough', () => {
  describe('short passwords (under 20 chars) — need 3 of 4 character classes', () => {
    it('rejects a single character class (lowercase only)', () => {
      expect(isPasswordComplexEnough('lowercaseonly')).toBe(false)
    })

    it('rejects the real regression this step closes: lowercase + digit only', () => {
      expect(isPasswordComplexEnough('password123')).toBe(false)
    })

    it('accepts lowercase + uppercase + digit (3 classes)', () => {
      expect(isPasswordComplexEnough('Password123')).toBe(true)
    })

    it('accepts lowercase + digit + symbol (3 classes)', () => {
      expect(isPasswordComplexEnough('password!23')).toBe(true)
    })

    it('accepts all 4 classes', () => {
      expect(isPasswordComplexEnough('Password!23')).toBe(true)
    })

    it('rejects uppercase + digit only (2 classes)', () => {
      expect(isPasswordComplexEnough('PASSWORD123')).toBe(false)
    })
  })

  describe('the 20-character boundary', () => {
    it('rejects a 19-character password with only 1 class', () => {
      expect(isPasswordComplexEnough('a'.repeat(19))).toBe(false)
    })

    it('accepts a 20-character password with only 1 class, as long as it has a letter', () => {
      expect(isPasswordComplexEnough('a'.repeat(20))).toBe(true)
    })
  })

  describe('long passwords (20+ chars) — need at least one letter, nothing else', () => {
    it('rejects a 20+ character all-digit string', () => {
      expect(isPasswordComplexEnough('1'.repeat(20))).toBe(false)
    })

    it('rejects a 20+ character all-symbol string', () => {
      expect(isPasswordComplexEnough('!'.repeat(20))).toBe(false)
    })

    it('accepts a long plain-lowercase passphrase', () => {
      expect(isPasswordComplexEnough('this is a long passphrase')).toBe(true)
    })
  })
})
