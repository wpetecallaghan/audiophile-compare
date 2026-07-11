// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { toClipData } from '../to-clip-data'

const baseClip = {
  id: 'abc-123',
  label: 'A',
  source_url: '',
  provider: 'direct',
  media_type: 'audio',
  url_status: 'ok',
}

const GOOGLE_PHOTOS_URL = 'https://photos.app.goo.gl/oXgxc2sNftEAKkQ46'
const RESOLVED_VIDEO_URL = 'https://lh3.googleusercontent.com/pw/AP1GczO-video'

describe('toClipData', () => {

  it('passes id, label, source_url, provider, media_type through unchanged', async () => {
    const result = await toClipData({
      ...baseClip,
      source_url: 'https://example.com/track.mp3',
    })
    expect(result.id).toBe('abc-123')
    expect(result.label).toBe('A')
    expect(result.source_url).toBe('https://example.com/track.mp3')
    expect(result.provider).toBe('direct')
    expect(result.media_type).toBe('audio')
  })

  it('derives embed_id and canonical_url for a YouTube source_url', async () => {
    const result = await toClipData({
      ...baseClip,
      source_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      provider: 'youtube',
      media_type: 'video',
    })
    expect(result.embed_id).toBe('dQw4w9WgXcQ')
    expect(result.canonical_url).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
  })

  it('derives embed_id and canonical_url for a Vimeo source_url', async () => {
    const result = await toClipData({
      ...baseClip,
      source_url: 'https://vimeo.com/123456789',
      provider: 'vimeo',
      media_type: 'video',
    })
    expect(result.embed_id).toBe('123456789')
    expect(result.canonical_url).toBe('https://player.vimeo.com/video/123456789')
  })

  it('derives embed_id and canonical_url for a Google Drive source_url', async () => {
    const result = await toClipData({
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

  it('returns null embed_id for a direct URL', async () => {
    const result = await toClipData({
      ...baseClip,
      source_url: 'https://example.com/track.mp3',
    })
    expect(result.embed_id).toBeNull()
  })

  it('handles label B correctly', async () => {
    const result = await toClipData({ ...baseClip, label: 'B' })
    expect(result.label).toBe('B')
  })
})

describe('toClipData — Google Photos resolution', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('overrides canonical_url (via the proxy route) and media_type on successful resolution', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      text: async () => `<meta property="og:video" content="${RESOLVED_VIDEO_URL}">`,
    } as Response)

    const result = await toClipData({
      ...baseClip,
      source_url: GOOGLE_PHOTOS_URL,
      provider: 'direct',
      media_type: 'unknown',
    })

    expect(result.canonical_url).toBe(
      `/api/clips/google-photos-proxy?url=${encodeURIComponent(RESOLVED_VIDEO_URL)}`,
    )
    expect(result.media_type).toBe('video')
  })

  it('falls back to today\'s behavior when resolution fails', async () => {
    vi.mocked(global.fetch).mockResolvedValue({ ok: false } as Response)

    const result = await toClipData({
      ...baseClip,
      source_url: GOOGLE_PHOTOS_URL,
      provider: 'direct',
      media_type: 'unknown',
    })

    expect(result.canonical_url).toBe(GOOGLE_PHOTOS_URL)
    expect(result.media_type).toBe('unknown')
  })

  it('never calls fetch for a non-Google-Photos direct URL', async () => {
    await toClipData({
      ...baseClip,
      source_url: 'https://example.com/track.mp3',
      provider: 'direct',
      media_type: 'audio',
    })

    expect(global.fetch).not.toHaveBeenCalled()
  })
})
