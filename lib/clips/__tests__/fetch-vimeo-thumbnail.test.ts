// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchVimeoThumbnail } from '../fetch-vimeo-thumbnail'

const VIDEO_ID = '123456789'
const THUMBNAIL_URL = 'https://i.vimeocdn.com/video/123_640.jpg'

describe('fetchVimeoThumbnail', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('returns the thumbnail_url from a successful oEmbed response', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ thumbnail_url: THUMBNAIL_URL }),
    } as Response)

    const result = await fetchVimeoThumbnail(VIDEO_ID)

    expect(result).toBe(THUMBNAIL_URL)
  })

  it('requests the oEmbed endpoint for the given video id', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ thumbnail_url: THUMBNAIL_URL }),
    } as Response)

    await fetchVimeoThumbnail(VIDEO_ID)

    const [url] = vi.mocked(global.fetch).mock.calls[0]
    expect(url).toBe(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${VIDEO_ID}`)}`,
    )
  })

  it('returns null when the response has no thumbnail_url field', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response)

    const result = await fetchVimeoThumbnail(VIDEO_ID)

    expect(result).toBeNull()
  })

  it('returns null on a non-ok response (e.g. a private or deleted video)', async () => {
    vi.mocked(global.fetch).mockResolvedValue({ ok: false } as Response)

    const result = await fetchVimeoThumbnail(VIDEO_ID)

    expect(result).toBeNull()
  })

  it('returns null on a rejected fetch rather than throwing', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('network down'))

    await expect(fetchVimeoThumbnail(VIDEO_ID)).resolves.toBeNull()
  })

  it('returns null on a timeout rather than throwing', async () => {
    vi.mocked(global.fetch).mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit).signal
          signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )

    await expect(fetchVimeoThumbnail(VIDEO_ID, 10)).resolves.toBeNull()
  })
})
