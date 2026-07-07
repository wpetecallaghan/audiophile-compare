// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchOEmbed, enrichLinksWithOEmbed } from '../fetch-oembed'

const YOUTUBE_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
const VIMEO_URL = 'https://vimeo.com/123456789'
const DIRECT_URL = 'https://example.com/recording.mp3'

describe('fetchOEmbed', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('populates oembed_title/oembed_author on a successful YouTube lookup', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ title: 'Great Track', author_name: 'Some Channel' }),
    } as Response)

    const result = await fetchOEmbed(YOUTUBE_URL)

    expect(result).toEqual({ oembed_title: 'Great Track', oembed_author: 'Some Channel' })
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://www.youtube.com/oembed?url='),
    )
  })

  it('populates fields on a successful Vimeo lookup', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ title: 'A Vimeo Video', author_name: 'A Creator' }),
    } as Response)

    const result = await fetchOEmbed(VIMEO_URL)

    expect(result).toEqual({ oembed_title: 'A Vimeo Video', oembed_author: 'A Creator' })
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://vimeo.com/api/oembed.json?url='),
    )
  })

  it('skips non-YouTube/Vimeo links entirely — no network call', async () => {
    const result = await fetchOEmbed(DIRECT_URL)

    expect(result).toEqual({})
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('swallows a failed/404 oEmbed lookup, returning no fields rather than throwing', async () => {
    vi.mocked(global.fetch).mockResolvedValue({ ok: false } as Response)

    await expect(fetchOEmbed(YOUTUBE_URL)).resolves.toEqual({})
  })

  it('swallows a network error, returning no fields rather than throwing', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('network down'))

    await expect(fetchOEmbed(YOUTUBE_URL)).resolves.toEqual({})
  })
})

describe('enrichLinksWithOEmbed', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ title: 'Enriched Title', author_name: 'Enriched Author' }),
    } as Response)
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('enriches each link independently, preserving order', async () => {
    const result = await enrichLinksWithOEmbed([{ url: YOUTUBE_URL }, { url: DIRECT_URL }])

    expect(result).toEqual([
      { url: YOUTUBE_URL, oembed_title: 'Enriched Title', oembed_author: 'Enriched Author' },
      { url: DIRECT_URL },
    ])
  })
})
