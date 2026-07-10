import { describe, it, expect } from 'vitest'
import { parseAcceptLanguage } from '../parse-accept-language'

describe('parseAcceptLanguage', () => {
  it('takes the first tag from a quality-weighted header', () => {
    expect(parseAcceptLanguage('en-GB,en;q=0.9')).toBe('en-GB')
  })

  it('takes the first tag when multiple languages are weighted', () => {
    expect(parseAcceptLanguage('fr-FR,fr;q=0.9,en;q=0.8')).toBe('fr-FR')
  })

  it('accepts a single unweighted tag', () => {
    expect(parseAcceptLanguage('de-DE')).toBe('de-DE')
  })

  it('returns undefined for a missing header', () => {
    expect(parseAcceptLanguage(null)).toBeUndefined()
  })

  it('returns undefined for an empty header', () => {
    expect(parseAcceptLanguage('')).toBeUndefined()
  })

  it('returns undefined for a wildcard header', () => {
    expect(parseAcceptLanguage('*')).toBeUndefined()
  })

  it('returns undefined for a malformed BCP 47 tag', () => {
    expect(parseAcceptLanguage('not-a-real-locale-!!')).toBeUndefined()
  })
})
