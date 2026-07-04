import { describe, it, expect, afterEach } from 'vitest'
import { isAdminEmail } from '../is-admin-email'

describe('isAdminEmail', () => {
  const originalEnv = process.env.ADMIN_EMAILS

  afterEach(() => {
    process.env.ADMIN_EMAILS = originalEnv
  })

  it('returns false when ADMIN_EMAILS is unset', () => {
    delete process.env.ADMIN_EMAILS
    expect(isAdminEmail('anyone@example.com')).toBe(false)
  })

  it('returns false for a null or undefined email', () => {
    process.env.ADMIN_EMAILS = 'admin@example.com'
    expect(isAdminEmail(null)).toBe(false)
    expect(isAdminEmail(undefined)).toBe(false)
  })

  it('returns true for an email on the allowlist', () => {
    process.env.ADMIN_EMAILS = 'admin@example.com,second@example.com'
    expect(isAdminEmail('admin@example.com')).toBe(true)
    expect(isAdminEmail('second@example.com')).toBe(true)
  })

  it('returns false for an email not on the allowlist', () => {
    process.env.ADMIN_EMAILS = 'admin@example.com'
    expect(isAdminEmail('nobody@example.com')).toBe(false)
  })

  it('matches case-insensitively', () => {
    process.env.ADMIN_EMAILS = 'Admin@Example.com'
    expect(isAdminEmail('admin@example.com')).toBe(true)
  })

  it('trims whitespace around comma-separated entries', () => {
    process.env.ADMIN_EMAILS = ' admin@example.com , second@example.com '
    expect(isAdminEmail('admin@example.com')).toBe(true)
    expect(isAdminEmail('second@example.com')).toBe(true)
  })

  it('ignores empty entries from trailing commas', () => {
    process.env.ADMIN_EMAILS = 'admin@example.com,,'
    expect(isAdminEmail('admin@example.com')).toBe(true)
    expect(isAdminEmail('')).toBe(false)
  })
})
