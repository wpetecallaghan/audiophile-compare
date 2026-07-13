import { describe, it, expect } from 'vitest'
import { effectiveUrlStatus } from '../effective-url-status'
import { STATUS_OK as OK, STATUS_DEGRADED as DEGRADED, STATUS_DEAD as DEAD } from '../check-url'

describe('effectiveUrlStatus', () => {
  it('passes the raw status through when there is no override, for every status', () => {
    expect(effectiveUrlStatus(OK, null)).toBe(OK)
    expect(effectiveUrlStatus(DEGRADED, null)).toBe(DEGRADED)
    expect(effectiveUrlStatus(DEAD, null)).toBe(DEAD)
  })

  it('an "ok" override forces ok regardless of the raw status', () => {
    expect(effectiveUrlStatus(OK, OK)).toBe(OK)
    expect(effectiveUrlStatus(DEGRADED, OK)).toBe(OK)
    expect(effectiveUrlStatus(DEAD, OK)).toBe(OK)
  })

  it('a "dead" override forces dead regardless of the raw status', () => {
    expect(effectiveUrlStatus(OK, DEAD)).toBe(DEAD)
    expect(effectiveUrlStatus(DEGRADED, DEAD)).toBe(DEAD)
    expect(effectiveUrlStatus(DEAD, DEAD)).toBe(DEAD)
  })
})
