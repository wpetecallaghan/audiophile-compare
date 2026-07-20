// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkDirectUrl } from '@/lib/clips/check-url'
import { isRealPostLink, checkClipHealth, checkClipStatus } from '../clip-health'
import { MEDIA_TYPE_AUDIO, MEDIA_TYPE_VIDEO, MEDIA_TYPE_UNKNOWN } from '@/lib/clips/detect-provider'

vi.mock('@/lib/clips/check-url', () => ({
  checkDirectUrl: vi.fn(),
  STATUS_OK: 'ok',
  STATUS_DEGRADED: 'degraded',
  STATUS_DEAD: 'dead',
}))

const YOUTUBE_URL = 'https://www.youtube.com/watch?v=aaaaaaaaaaa'
const DIRECT_URL = 'https://example.com/recording.mp3'
const DROPBOX_PREVIEW_URL = 'https://www.dropbox.com/scl/fi/abc/clip.mov?rlkey=xyz&dl=0'
const GOOGLE_DRIVE_URL = 'https://drive.google.com/file/d/abc123/view?usp=sharing'

describe('isRealPostLink', () => {
  it('is false for an empty (or whitespace-only) URL', () => {
    expect(isRealPostLink('', ['https://forum.example/a'])).toBe(false)
    expect(isRealPostLink('   ', ['https://forum.example/a'])).toBe(false)
  })

  it('is false when the URL is not among the post\'s own real links', () => {
    expect(isRealPostLink('https://forum.example/b', ['https://forum.example/a'])).toBe(false)
  })

  it('is true when the URL is one of the post\'s own real links', () => {
    expect(isRealPostLink('https://forum.example/a', ['https://forum.example/a'])).toBe(true)
  })
})

describe('checkClipHealth', () => {
  beforeEach(() => {
    vi.mocked(checkDirectUrl).mockReset()
  })

  it('trusts a youtube/vimeo URL by shape alone — no network call (decision 12, unchanged)', async () => {
    await expect(checkClipHealth(YOUTUBE_URL)).resolves.toBe('ok')
    expect(checkDirectUrl).not.toHaveBeenCalled()
  })

  it('returns unverifiable for a google-drive URL — no network call, since an anonymous request can\'t tell a dead Drive file from a healthy one (both return an identical 404, verified against real examples)', async () => {
    await expect(checkClipHealth(GOOGLE_DRIVE_URL)).resolves.toBe('unverifiable')
    expect(checkDirectUrl).not.toHaveBeenCalled()
  })

  it('returns dead when checkDirectUrl reports the URL is dead', async () => {
    vi.mocked(checkDirectUrl).mockResolvedValue({ url_status: 'dead', media_type: MEDIA_TYPE_UNKNOWN, duration_ms: null })
    await expect(checkClipHealth(DIRECT_URL)).resolves.toBe('dead')
  })

  it('leaves a degraded (timeout/5xx) URL as passable, matching decision 12\'s original leniency', async () => {
    vi.mocked(checkDirectUrl).mockResolvedValue({ url_status: 'degraded', media_type: MEDIA_TYPE_UNKNOWN, duration_ms: null })
    await expect(checkClipHealth(DIRECT_URL)).resolves.toBe('ok')
  })

  it('returns ok when the URL is reachable and genuinely resolves to media', async () => {
    vi.mocked(checkDirectUrl).mockResolvedValue({ url_status: 'ok', media_type: MEDIA_TYPE_AUDIO, duration_ms: null })
    await expect(checkClipHealth(DIRECT_URL)).resolves.toBe('ok')
  })

  it('returns unplayable when the URL is reachable but resolves to a non-media page (the real Dropbox/Photos/iCloud case)', async () => {
    vi.mocked(checkDirectUrl).mockResolvedValue({ url_status: 'ok', media_type: MEDIA_TYPE_UNKNOWN, duration_ms: null })
    await expect(checkClipHealth(DROPBOX_PREVIEW_URL)).resolves.toBe('unplayable')
  })
})

describe('checkClipStatus', () => {
  beforeEach(() => {
    vi.mocked(checkDirectUrl).mockReset()
  })

  it('returns missing without any network call when the URL is empty', async () => {
    await expect(checkClipStatus('', [])).resolves.toBe('missing')
    expect(checkDirectUrl).not.toHaveBeenCalled()
  })

  it('returns missing without any network call when the URL is not a real link from the post', async () => {
    await expect(checkClipStatus(DIRECT_URL, ['https://forum.example/other'])).resolves.toBe('missing')
    expect(checkDirectUrl).not.toHaveBeenCalled()
  })

  it('runs the real health check once the URL is confirmed to be a real post link', async () => {
    vi.mocked(checkDirectUrl).mockResolvedValue({ url_status: 'ok', media_type: MEDIA_TYPE_VIDEO, duration_ms: null })
    await expect(checkClipStatus(DIRECT_URL, [DIRECT_URL])).resolves.toBe('ok')
    expect(checkDirectUrl).toHaveBeenCalledTimes(1)
  })
})
