import { describe, it, expect } from 'vitest'
import { isUnsupportedClip } from '../is-unsupported'
import {
  PROVIDER_YOUTUBE,
  PROVIDER_VIMEO,
  PROVIDER_GOOGLE_DRIVE,
  PROVIDER_DIRECT,
  PROVIDER_UNKNOWN,
  MEDIA_TYPE_UNKNOWN,
} from '../detect-provider'

describe('isUnsupportedClip', () => {
  it('returns true for provider unknown (URL never parsed)', () => {
    expect(isUnsupportedClip({ provider: PROVIDER_UNKNOWN })).toBe(true)
  })

  // Build step 54: a direct clip is no longer presumptively unsupported —
  // NativePlayer always attempts playback and falls back client-side.
  // A real caller (app/tests/[id]/page.tsx) passes a full clip row that
  // still carries media_type; the param type no longer references it, but
  // structural typing still accepts the extra field on a real object.
  it('returns false for provider direct, regardless of media_type', () => {
    const rawClipRow: { provider: string; media_type: string } = { provider: PROVIDER_DIRECT, media_type: MEDIA_TYPE_UNKNOWN }
    expect(isUnsupportedClip(rawClipRow)).toBe(false)
  })

  it('returns false for embeddable providers', () => {
    expect(isUnsupportedClip({ provider: PROVIDER_YOUTUBE })).toBe(false)
    expect(isUnsupportedClip({ provider: PROVIDER_VIMEO })).toBe(false)
    expect(isUnsupportedClip({ provider: PROVIDER_GOOGLE_DRIVE })).toBe(false)
  })
})
