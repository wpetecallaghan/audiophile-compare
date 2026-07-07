import { describe, it, expect } from 'vitest'
import { toClipData } from '../to-clip-data'

const baseClip = {
  id: 'abc-123',
  label: 'A',
  source_url: '',
  provider: 'direct',
  media_type: 'audio',
  url_status: 'ok',
}

describe('toClipData', () => {

  it('passes id, label, source_url, provider, media_type through unchanged', () => {
    const result = toClipData({
      ...baseClip,
      source_url: 'https://example.com/track.mp3',
    })
    expect(result.id).toBe('abc-123')
    expect(result.label).toBe('A')
    expect(result.source_url).toBe('https://example.com/track.mp3')
    expect(result.provider).toBe('direct')
    expect(result.media_type).toBe('audio')
  })

  it('derives embed_id and canonical_url for a YouTube source_url', () => {
    const result = toClipData({
      ...baseClip,
      source_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      provider: 'youtube',
      media_type: 'video',
    })
    expect(result.embed_id).toBe('dQw4w9WgXcQ')
    expect(result.canonical_url).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
  })

  it('derives embed_id and canonical_url for a Vimeo source_url', () => {
    const result = toClipData({
      ...baseClip,
      source_url: 'https://vimeo.com/123456789',
      provider: 'vimeo',
      media_type: 'video',
    })
    expect(result.embed_id).toBe('123456789')
    expect(result.canonical_url).toBe('https://player.vimeo.com/video/123456789')
  })

  it('derives embed_id and canonical_url for a Google Drive source_url', () => {
    const result = toClipData({
      ...baseClip,
      source_url: 'https://drive.google.com/file/d/1tzyg-oj6k007AnVSTXmmauTtZcsvUpUl/view?usp=sharing',
      provider: 'google-drive',
      media_type: 'video',
    })
    expect(result.embed_id).toBe('1tzyg-oj6k007AnVSTXmmauTtZcsvUpUl')
    expect(result.canonical_url).toBe(
      'https://drive.google.com/file/d/1tzyg-oj6k007AnVSTXmmauTtZcsvUpUl/preview',
    )
  })

  it('returns null embed_id for a direct URL', () => {
    const result = toClipData({
      ...baseClip,
      source_url: 'https://example.com/track.mp3',
    })
    expect(result.embed_id).toBeNull()
  })

  it('handles label B correctly', () => {
    const result = toClipData({ ...baseClip, label: 'B' })
    expect(result.label).toBe('B')
  })
})