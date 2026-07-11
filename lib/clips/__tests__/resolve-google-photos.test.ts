// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isGooglePhotosUrl, resolveGooglePhotosVideoUrl } from '../resolve-google-photos'

const SHORT_LINK_URL = 'https://photos.app.goo.gl/oXgxc2sNftEAKkQ46'
const RESOLVED_SHARE_URL =
  'https://photos.google.com/share/AF1QipPHyfFj9fI8m3LOOQoMUST3bhnDK5DjiRn1CipvwGYnX-gX5SMS521edDP4CrIiew?key=abc'
const SAMPLE_VIDEO_URL = 'https://lh3.googleusercontent.com/pw/AP1GczO-video=w600-h315-k-no-m18'
const SAMPLE_SECURE_VIDEO_URL = 'https://lh3.googleusercontent.com/pw/AP1GczO-secure=w600-h315-k-no-m18'

describe('isGooglePhotosUrl', () => {
  it('matches a short goo.gl link', () => {
    expect(isGooglePhotosUrl(SHORT_LINK_URL)).toBe(true)
  })

  it('matches a resolved photos.google.com/share/... link', () => {
    expect(isGooglePhotosUrl(RESOLVED_SHARE_URL)).toBe(true)
  })

  it('does not match a photos.google.com/photo/... permalink (different shape)', () => {
    expect(isGooglePhotosUrl('https://photos.google.com/photo/AF1Qip123')).toBe(false)
  })

  it('does not match a Google Drive link', () => {
    expect(isGooglePhotosUrl('https://drive.google.com/file/d/xyz/view')).toBe(false)
  })

  it('does not match a bare google.com URL', () => {
    expect(isGooglePhotosUrl('https://google.com')).toBe(false)
  })

  it('does not throw on a malformed URL string', () => {
    expect(isGooglePhotosUrl('not a url')).toBe(false)
  })
})

describe('resolveGooglePhotosVideoUrl', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('prefers og:video:secure_url when both tags are present', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      text: async () => `
        <meta property="og:video" content="${SAMPLE_VIDEO_URL}">
        <meta property="og:video:secure_url" content="${SAMPLE_SECURE_VIDEO_URL}">
      `,
    } as Response)

    const result = await resolveGooglePhotosVideoUrl(SHORT_LINK_URL)

    expect(result).toBe(SAMPLE_SECURE_VIDEO_URL)
  })

  it('falls back to og:video when og:video:secure_url is absent', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      text: async () => `<meta property="og:video" content="${SAMPLE_VIDEO_URL}">`,
    } as Response)

    const result = await resolveGooglePhotosVideoUrl(SHORT_LINK_URL)

    expect(result).toBe(SAMPLE_VIDEO_URL)
  })

  it('extracts content regardless of attribute order in the meta tag', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      text: async () => `<meta content="${SAMPLE_VIDEO_URL}" property="og:video">`,
    } as Response)

    const result = await resolveGooglePhotosVideoUrl(SHORT_LINK_URL)

    expect(result).toBe(SAMPLE_VIDEO_URL)
  })

  it('returns null when the OG tag content points at an unexpected host', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      text: async () => `<meta property="og:video" content="https://evil.example.com/video.mp4">`,
    } as Response)

    const result = await resolveGooglePhotosVideoUrl(SHORT_LINK_URL)

    expect(result).toBeNull()
  })

  it('returns null when neither OG tag is present (photo-only or album share)', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      text: async () => `<meta property="og:image" content="https://lh3.googleusercontent.com/pw/photo">`,
    } as Response)

    const result = await resolveGooglePhotosVideoUrl(SHORT_LINK_URL)

    expect(result).toBeNull()
  })

  it('returns null on a non-ok response', async () => {
    vi.mocked(global.fetch).mockResolvedValue({ ok: false } as Response)

    const result = await resolveGooglePhotosVideoUrl(SHORT_LINK_URL)

    expect(result).toBeNull()
  })

  it('returns null on a rejected fetch rather than throwing', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('network down'))

    await expect(resolveGooglePhotosVideoUrl(SHORT_LINK_URL)).resolves.toBeNull()
  })

  it('returns null on a timeout rather than throwing', async () => {
    vi.mocked(global.fetch).mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit).signal
          signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )

    await expect(resolveGooglePhotosVideoUrl(SHORT_LINK_URL, 10)).resolves.toBeNull()
  })

  it('sends a browser-shaped User-Agent header', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      text: async () => `<meta property="og:video" content="${SAMPLE_VIDEO_URL}">`,
    } as Response)

    await resolveGooglePhotosVideoUrl(SHORT_LINK_URL)

    const [, init] = vi.mocked(global.fetch).mock.calls[0]
    const userAgent = (init as RequestInit).headers as Record<string, string>
    expect(userAgent['User-Agent']).toMatch(/Mozilla/)
  })
})
