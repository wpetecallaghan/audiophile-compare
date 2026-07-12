// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkDirectUrl, STATUS_OK, STATUS_DEGRADED, STATUS_DEAD } from '../check-url'
import type { DetectedClip } from '../detect-provider'

const DIRECT_CLIP: DetectedClip = {
  provider: 'direct',
  media_type: 'unknown',
  embed_id: null,
  canonical_url: 'https://example.com/clip.mp3',
}

const DROPBOX_CLIP: DetectedClip = {
  provider: 'direct',
  media_type: 'unknown',
  embed_id: null,
  canonical_url: 'https://www.dropbox.com/scl/fi/abc123/clip.mov?rlkey=xyz&raw=1',
}

function mockResponse(overrides: {
  ok: boolean
  status?: number
  url?: string
  contentType?: string | null
}): Response {
  return {
    ok: overrides.ok,
    status: overrides.status ?? (overrides.ok ? 200 : 404),
    url: overrides.url ?? '',
    headers: { get: () => overrides.contentType ?? null },
  } as unknown as Response
}

describe('checkDirectUrl', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe('non-Dropbox direct URLs', () => {
    it('200 with an audio content-type resolves to ok, media_type audio', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        mockResponse({ ok: true, url: DIRECT_CLIP.canonical_url, contentType: 'audio/mpeg' }),
      )
      const result = await checkDirectUrl(DIRECT_CLIP)
      expect(result).toEqual({ url_status: STATUS_OK, media_type: 'audio', duration_ms: null })
    })

    it('200 with a video content-type resolves to ok, media_type video', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        mockResponse({ ok: true, url: DIRECT_CLIP.canonical_url, contentType: 'video/mp4' }),
      )
      const result = await checkDirectUrl(DIRECT_CLIP)
      expect(result).toEqual({ url_status: STATUS_OK, media_type: 'video', duration_ms: null })
    })

    it('200 with no content-type resolves to ok, media_type unknown', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        mockResponse({ ok: true, url: DIRECT_CLIP.canonical_url, contentType: null }),
      )
      const result = await checkDirectUrl(DIRECT_CLIP)
      expect(result).toEqual({ url_status: STATUS_OK, media_type: 'unknown', duration_ms: null })
    })

    it('404 resolves to dead', async () => {
      vi.mocked(global.fetch).mockResolvedValue(mockResponse({ ok: false, status: 404 }))
      const result = await checkDirectUrl(DIRECT_CLIP)
      expect(result).toEqual({ url_status: STATUS_DEAD, media_type: 'unknown', duration_ms: null })
    })

    it('500 resolves to degraded (may be transient)', async () => {
      vi.mocked(global.fetch).mockResolvedValue(mockResponse({ ok: false, status: 500 }))
      const result = await checkDirectUrl(DIRECT_CLIP)
      expect(result).toEqual({ url_status: STATUS_DEGRADED, media_type: 'unknown', duration_ms: null })
    })

    it('a timeout resolves to degraded', async () => {
      vi.mocked(global.fetch).mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            const signal = (init as RequestInit).signal
            signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
          }),
      )
      const result = await checkDirectUrl(DIRECT_CLIP, 10)
      expect(result).toEqual({ url_status: STATUS_DEGRADED, media_type: 'unknown', duration_ms: null })
    })

    it('a network error resolves to dead', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('getaddrinfo ENOTFOUND'))
      const result = await checkDirectUrl(DIRECT_CLIP)
      expect(result).toEqual({ url_status: STATUS_DEAD, media_type: 'unknown', duration_ms: null })
    })
  })

  describe('Dropbox URLs — content-type can\'t distinguish broken from working, so the redirect host is checked instead', () => {
    it('200 that redirected to a *.dropboxusercontent.com CDN host resolves to ok', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        mockResponse({
          ok: true,
          url: 'https://uc123abc.dl.dropboxusercontent.com/cd/0/inline/xyz/file',
          contentType: 'application/json', // Dropbox's real, misreported content-type for a real video
        }),
      )
      const result = await checkDirectUrl(DROPBOX_CLIP)
      expect(result.url_status).toBe(STATUS_OK)
    })

    it('200 that never left dropbox.com resolves to dead — a broken/revoked share still returns 200', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        mockResponse({
          ok: true,
          url: 'https://www.dropbox.com/scl/fi/abc123/clip.mov?rlkey=xyz&raw=1',
          contentType: 'text/html',
        }),
      )
      const result = await checkDirectUrl(DROPBOX_CLIP)
      expect(result).toEqual({ url_status: STATUS_DEAD, media_type: 'unknown', duration_ms: null })
    })

    it('a Dropbox 404/5xx still resolves the same way as any other direct host (untouched by the redirect-host check)', async () => {
      vi.mocked(global.fetch).mockResolvedValue(mockResponse({ ok: false, status: 404 }))
      const result = await checkDirectUrl(DROPBOX_CLIP)
      expect(result.url_status).toBe(STATUS_DEAD)
    })
  })

  it('the redirect-host check is gated to Dropbox only — a non-Dropbox 200 is trusted regardless of its final url', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      mockResponse({
        ok: true,
        url: 'https://some-other-cdn.example.com/clip.mp3',
        contentType: 'audio/mpeg',
      }),
    )
    const result = await checkDirectUrl(DIRECT_CLIP)
    expect(result.url_status).toBe(STATUS_OK)
  })
})
