import { describe, it, expect } from 'vitest'
import { nextUrlStatus } from '../next-url-status'
import { STATUS_OK as OK, STATUS_DEGRADED as DEGRADED, STATUS_DEAD as DEAD } from '../check-url'

describe('nextUrlStatus', () => {
  it('recovers to ok immediately from ok on a raw ok check', () => {
    expect(nextUrlStatus(OK, OK)).toBe(OK)
  })

  it('recovers to ok immediately from degraded on a raw ok check', () => {
    expect(nextUrlStatus(DEGRADED, OK)).toBe(OK)
  })

  it('recovers to ok immediately from dead on a raw ok check', () => {
    expect(nextUrlStatus(DEAD, OK)).toBe(OK)
  })

  it('moves to degraded from ok on a raw degraded check', () => {
    expect(nextUrlStatus(OK, DEGRADED)).toBe(DEGRADED)
  })

  it('stays degraded on a raw degraded check', () => {
    expect(nextUrlStatus(DEGRADED, DEGRADED)).toBe(DEGRADED)
  })

  it('drops from dead to degraded on a raw degraded check (partial recovery)', () => {
    expect(nextUrlStatus(DEAD, DEGRADED)).toBe(DEGRADED)
  })

  it('only demotes ok to degraded on a raw dead check — the grace period', () => {
    expect(nextUrlStatus(OK, DEAD)).toBe(DEGRADED)
  })

  it('confirms dead on a second consecutive raw dead check from degraded', () => {
    expect(nextUrlStatus(DEGRADED, DEAD)).toBe(DEAD)
  })

  it('stays dead on a raw dead check', () => {
    expect(nextUrlStatus(DEAD, DEAD)).toBe(DEAD)
  })
})
