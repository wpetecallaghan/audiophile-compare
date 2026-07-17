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
  const originalFetch = global.fetch

  // toClipData now also resolves a per-provider thumbnail_url (build step
  // 76) — Vimeo's requires a real fetch (fetch-vimeo-thumbnail.ts's
  // oEmbed call), so every test in this file needs fetch mocked, not just
  // the Google Photos block below, or an unmocked Vimeo test would issue a
  // real network request. Defaults to a failed response (thumbnail_url
  // resolves to null) — individual tests override with mockResolvedValue
  // where they need a specific response.
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false } as Response)
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

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

  // build step 76 — YouTube's thumbnail is derived synchronously from
  // embed_id alone (img.youtube.com's predictable path), unlike Vimeo's
  // below.
  it('derives a thumbnail_url for a YouTube clip without any network call', async () => {
    const result = await toClipData({
      ...baseClip,
      source_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      provider: 'youtube',
      media_type: 'video',
    })
    expect(result.thumbnail_url).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
    expect(global.fetch).not.toHaveBeenCalled()
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

  // build step 76 — Vimeo has no predictable thumbnail path, so
  // to-clip-data.ts calls fetch-vimeo-thumbnail.ts's oEmbed lookup.
  it('derives a thumbnail_url for a Vimeo clip via the oEmbed lookup', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ thumbnail_url: 'https://i.vimeocdn.com/video/123_640.jpg' }),
    } as Response)

    const result = await toClipData({
      ...baseClip,
      source_url: 'https://vimeo.com/123456789',
      provider: 'vimeo',
      media_type: 'video',
    })
    expect(result.thumbnail_url).toBe('https://i.vimeocdn.com/video/123_640.jpg')
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

  // build step 76 — Google Drive has no public thumbnail without Drive API
  // auth; ClipFacade falls back to a generic placeholder for this provider.
  it('returns a null thumbnail_url for a Google Drive clip', async () => {
    const result = await toClipData({
      ...baseClip,
      source_url: 'https://drive.google.com/file/d/1tzyg-oj6k007AnVSTXmmauTtZcsvUpUl/view?usp=sharing',
      provider: 'google-drive',
      media_type: 'video',
    })
    expect(result.thumbnail_url).toBeNull()
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
