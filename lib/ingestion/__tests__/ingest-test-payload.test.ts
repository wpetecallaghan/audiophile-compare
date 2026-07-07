import { describe, it, expect } from 'vitest'
import { validateIngestPayload, resolveTestTitle, type IngestPayload } from '../ingest-test-payload'

const SOURCE_REF = 'lejonklou-forum:thread-3233:post-42'
const FORUM_USERNAME = 'BassHead99'
const ARTIST = 'Diana Krall'
const TRACK_TITLE = 'The Look of Love'
const SYSTEM_NAME = 'Living room rig'
const VERSION_LABEL = 'v2 — new DAC'

function validPayload(overrides: Partial<IngestPayload> = {}): IngestPayload {
  return {
    source_ref: SOURCE_REF,
    author: { forum_username: FORUM_USERNAME },
    track: { artist: ARTIST, title: TRACK_TITLE },
    snapshot_a: { system_name: SYSTEM_NAME, version_label: VERSION_LABEL },
    snapshot_b: { system_name: SYSTEM_NAME, version_label: 'v3 — new cables' },
    clip_a_url: 'https://example.com/a.mp3',
    clip_b_url: 'https://example.com/b.mp3',
    before_is_a: true,
    ...overrides,
  }
}

describe('validateIngestPayload', () => {
  it('accepts a fully populated payload', () => {
    const result = validateIngestPayload(validPayload())
    expect(result.valid).toBe(true)
  })

  it('accepts a payload with a fully populated vote', () => {
    const result = validateIngestPayload(
      validPayload({
        votes: [
          {
            voter: { forum_username: 'AnotherListener' },
            chosen_label: 'A',
            technique_name: 'Tune Method',
          },
        ],
      }),
    )
    expect(result.valid).toBe(true)
  })

  it('rejects a non-object body', () => {
    const result = validateIngestPayload('not an object')
    expect(result).toEqual({ valid: false, error: 'Request body must be a JSON object' })
  })

  it('rejects a missing source_ref', () => {
    const result = validateIngestPayload(validPayload({ source_ref: '' }))
    expect(result).toEqual({ valid: false, error: 'source_ref is required' })
  })

  it('rejects a missing author.forum_username', () => {
    const result = validateIngestPayload(validPayload({ author: { forum_username: '' } }))
    expect(result).toEqual({ valid: false, error: 'author.forum_username is required' })
  })

  it('rejects a missing track.artist or track.title', () => {
    const result = validateIngestPayload(validPayload({ track: { artist: '', title: TRACK_TITLE } }))
    expect(result).toEqual({ valid: false, error: 'track.artist and track.title are required' })
  })

  it('rejects a missing snapshot_a field', () => {
    const result = validateIngestPayload(
      validPayload({ snapshot_a: { system_name: SYSTEM_NAME, version_label: '' } }),
    )
    expect(result).toEqual({
      valid: false,
      error: 'snapshot_a.system_name and snapshot_a.version_label are required',
    })
  })

  it('rejects a missing snapshot_b field', () => {
    const result = validateIngestPayload(
      validPayload({ snapshot_b: { system_name: '', version_label: VERSION_LABEL } }),
    )
    expect(result).toEqual({
      valid: false,
      error: 'snapshot_b.system_name and snapshot_b.version_label are required',
    })
  })

  it('rejects missing clip URLs', () => {
    const result = validateIngestPayload(validPayload({ clip_a_url: '' }))
    expect(result).toEqual({ valid: false, error: 'clip_a_url and clip_b_url are required' })
  })

  it('rejects a non-boolean before_is_a', () => {
    const result = validateIngestPayload(validPayload({ before_is_a: undefined as unknown as boolean }))
    expect(result).toEqual({ valid: false, error: 'before_is_a must be a boolean' })
  })

  it('rejects a vote missing voter.forum_username', () => {
    const result = validateIngestPayload(
      validPayload({
        votes: [{ voter: { forum_username: '' }, chosen_label: 'A', technique_name: 'Tune Method' }],
      }),
    )
    expect(result).toEqual({ valid: false, error: 'votes[0].voter.forum_username is required' })
  })

  it('rejects a vote with an invalid chosen_label', () => {
    const result = validateIngestPayload(
      validPayload({
        votes: [
          {
            voter: { forum_username: 'AnotherListener' },
            chosen_label: 'C' as unknown as 'A' | 'B',
            technique_name: 'Tune Method',
          },
        ],
      }),
    )
    expect(result).toEqual({ valid: false, error: "votes[0].chosen_label must be 'A' or 'B'" })
  })

  it('rejects a vote missing technique_name', () => {
    const result = validateIngestPayload(
      validPayload({
        votes: [{ voter: { forum_username: 'AnotherListener' }, chosen_label: 'A', technique_name: '' }],
      }),
    )
    expect(result).toEqual({ valid: false, error: 'votes[0].technique_name is required' })
  })
})

describe('resolveTestTitle', () => {
  it('uses the explicit title when provided', () => {
    const title = resolveTestTitle(validPayload({ title: 'DAC shootout' }))
    expect(title).toBe('DAC shootout')
  })

  it('falls back to "artist – title" when omitted', () => {
    const title = resolveTestTitle(validPayload())
    expect(title).toBe(`${ARTIST} – ${TRACK_TITLE}`)
  })

  it('falls back when title is whitespace-only', () => {
    const title = resolveTestTitle(validPayload({ title: '   ' }))
    expect(title).toBe(`${ARTIST} – ${TRACK_TITLE}`)
  })
})
