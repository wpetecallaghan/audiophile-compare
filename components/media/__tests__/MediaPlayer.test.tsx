import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MediaPlayer, { type ClipData } from '../MediaPlayer'
import {
  PROVIDER_YOUTUBE,
  PROVIDER_VIMEO,
  PROVIDER_GOOGLE_DRIVE,
  PROVIDER_DIRECT,
  PROVIDER_UNKNOWN,
  MEDIA_TYPE_AUDIO,
  MEDIA_TYPE_VIDEO,
  MEDIA_TYPE_UNKNOWN,
} from '@/lib/clips/detect-provider'

// @vitest-environment jsdom

const capturedVimeoPlayer = { on: vi.fn(), off: vi.fn(), pause: vi.fn(), destroy: vi.fn() }

// `new VimeoSDK(...)`/`new YT.Player(...)` require a real constructor
// function below — an arrow function can't be called with `new` (same
// precedent as YouTubePlayer.test.tsx's own window.YT stub).
vi.mock('@vimeo/player', () => ({
  default: vi.fn().mockImplementation(function () {
    return capturedVimeoPlayer
  }),
}))

beforeEach(() => {
  window.YT = {
    Player: vi.fn().mockImplementation(function () {
      return { pauseVideo: vi.fn(), destroy: vi.fn() }
    }),
    PlayerState: { PLAYING: 1, UNSTARTED: -1, ENDED: 0, PAUSED: 2, BUFFERING: 3, CUED: 5 },
  } as unknown as typeof YT
})

const makeClip = (overrides: Partial<ClipData>): ClipData => ({
  id: 'test-id',
  label: 'A',
  source_url: 'https://example.com/clip.mov',
  provider: PROVIDER_DIRECT,
  media_type: MEDIA_TYPE_VIDEO,
  ...overrides,
})

describe('MediaPlayer', () => {
  // The core regression guard for build step 54 — media_type 'unknown' no
  // longer forces a bare link; NativePlayer is attempted regardless (a
  // fallback link shows too, by design — step 56 — until playback is
  // confirmed, but the <video> element is mounted and attempting to load
  // it, not skipped outright the way a provider: 'unknown' clip is).
  it('mounts NativePlayer (not just a bare link) for a direct clip with media_type unknown', () => {
    const clip = makeClip({ media_type: MEDIA_TYPE_UNKNOWN })

    render(<MediaPlayer clip={clip} onPlay={vi.fn()} />)

    expect(document.querySelector('video')).not.toBeNull()
  })

  it('defaults to a <video> element (not <audio>) for media_type unknown', () => {
    const clip = makeClip({ media_type: MEDIA_TYPE_UNKNOWN })

    render(<MediaPlayer clip={clip} onPlay={vi.fn()} />)

    expect(document.querySelector('video')).not.toBeNull()
    expect(document.querySelector('audio')).toBeNull()
  })

  it('renders an <audio> element for a direct clip with media_type audio', () => {
    const clip = makeClip({ media_type: MEDIA_TYPE_AUDIO })

    render(<MediaPlayer clip={clip} onPlay={vi.fn()} />)

    expect(document.querySelector('audio')).not.toBeNull()
  })

  it('renders a bare link for provider unknown (unparseable URL)', () => {
    const clip = makeClip({ provider: PROVIDER_UNKNOWN, media_type: MEDIA_TYPE_UNKNOWN })

    render(<MediaPlayer clip={clip} onPlay={vi.fn()} />)

    expect(document.querySelector('video')).toBeNull()
    expect(document.querySelector('audio')).toBeNull()
    expect(screen.getByRole('link')).toBeInTheDocument()
  })

  // Build step 56: a Dropbox clip's canonical_url (the rewritten raw=1
  // link) is what actually gets played, not the original share-page
  // source_url — detect-provider.ts computes canonical_url fresh from
  // source_url, so this is the wiring that makes that useful.
  it('uses canonical_url, not source_url, as the media element src when they differ', () => {
    const clip = makeClip({
      source_url: 'https://www.dropbox.com/scl/fi/abc123/clip.mov?rlkey=xyz&dl=0',
      canonical_url: 'https://www.dropbox.com/scl/fi/abc123/clip.mov?rlkey=xyz&raw=1',
    })

    render(<MediaPlayer clip={clip} onPlay={vi.fn()} />)

    const video = document.querySelector('video') as HTMLVideoElement
    expect(video.src).toBe('https://www.dropbox.com/scl/fi/abc123/clip.mov?rlkey=xyz&raw=1')
  })

  // Build step 57: a link to the clip's original source is always shown
  // alongside the embed — not a failure-only fallback — since an embed can
  // fail for reasons specific to its provider (iframe blocked, video
  // removed/region-locked, host-side hotlink protection) that the listener
  // has no other way to route around. Present immediately, with no load
  // state to wait on, for every provider that attempts a real embed.
  describe('always shows a link to the original clip alongside the embed', () => {
    it('for a direct clip', () => {
      const clip = makeClip({ provider: PROVIDER_DIRECT, source_url: 'https://example.com/clip.mov' })
      render(<MediaPlayer clip={clip} onPlay={vi.fn()} />)

      expect(document.querySelector('video')).not.toBeNull()
      const link = screen.getByRole('link') as HTMLAnchorElement
      expect(link.href).toBe('https://example.com/clip.mov')
    })

    it('for a YouTube clip', () => {
      const clip = makeClip({
        provider: PROVIDER_YOUTUBE,
        source_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        embed_id: 'dQw4w9WgXcQ',
      })
      render(<MediaPlayer clip={clip} onPlay={vi.fn()} />)

      const link = screen.getByRole('link') as HTMLAnchorElement
      expect(link.href).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    })

    it('for a Vimeo clip', () => {
      const clip = makeClip({
        provider: PROVIDER_VIMEO,
        source_url: 'https://vimeo.com/123456789',
        embed_id: '123456789',
      })
      render(<MediaPlayer clip={clip} onPlay={vi.fn()} />)

      const link = screen.getByRole('link') as HTMLAnchorElement
      expect(link.href).toBe('https://vimeo.com/123456789')
    })

    it('for a Google Drive clip', () => {
      const clip = makeClip({
        provider: PROVIDER_GOOGLE_DRIVE,
        source_url: 'https://drive.google.com/file/d/abc123/view',
        embed_id: 'abc123',
      })
      render(<MediaPlayer clip={clip} onPlay={vi.fn()} />)

      const link = screen.getByRole('link') as HTMLAnchorElement
      expect(link.href).toBe('https://drive.google.com/file/d/abc123/view')
    })
  })

  // Build step 76: SDK/iframe mounting for YouTube, Vimeo, and Google Drive
  // is deferred until the visitor presses ClipFacade's play button — direct
  // and unknown providers are out of scope (see components.md §5).
  describe('lazy SDK mounting via ClipFacade', () => {
    it('renders a ClipFacade play button instead of the real iframe for a YouTube clip', () => {
      const clip = makeClip({
        provider: PROVIDER_YOUTUBE,
        source_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        embed_id: 'dQw4w9WgXcQ',
      })
      render(<MediaPlayer clip={clip} onPlay={vi.fn()} />)

      expect(screen.getByRole('button', { name: 'Play clip A' })).toBeInTheDocument()
      expect(window.YT.Player).not.toHaveBeenCalled()
    })

    it('mounts the real YouTubePlayer (with autoplay) once the facade is clicked', async () => {
      const user = userEvent.setup()
      const onPlay = vi.fn()
      const clip = makeClip({
        provider: PROVIDER_YOUTUBE,
        source_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        embed_id: 'dQw4w9WgXcQ',
      })
      render(<MediaPlayer clip={clip} onPlay={onPlay} />)

      await user.click(screen.getByRole('button', { name: 'Play clip A' }))

      expect(onPlay).toHaveBeenCalledTimes(1)
      expect(window.YT.Player).toHaveBeenCalledTimes(1)
      const options = vi.mocked(window.YT.Player).mock.calls[0][1]
      expect(options.playerVars?.autoplay).toBe(1)
    })

    it('renders a ClipFacade play button instead of the real iframe for a Vimeo clip, and mounts it on click', async () => {
      const user = userEvent.setup()
      const clip = makeClip({
        provider: PROVIDER_VIMEO,
        source_url: 'https://vimeo.com/123456789',
        embed_id: '123456789',
      })
      render(<MediaPlayer clip={clip} onPlay={vi.fn()} />)

      expect(screen.getByRole('button', { name: 'Play clip A' })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Play clip A' }))

      expect(screen.queryByRole('button', { name: 'Play clip A' })).not.toBeInTheDocument()
    })

    it('renders a ClipFacade play button instead of the real iframe for a Google Drive clip, and mounts it on click', async () => {
      const user = userEvent.setup()
      const clip = makeClip({
        provider: PROVIDER_GOOGLE_DRIVE,
        source_url: 'https://drive.google.com/file/d/abc123/view',
        embed_id: 'abc123',
      })
      render(<MediaPlayer clip={clip} onPlay={vi.fn()} />)

      expect(screen.getByRole('button', { name: 'Play clip A' })).toBeInTheDocument()
      expect(document.querySelector('iframe')).toBeNull()

      await user.click(screen.getByRole('button', { name: 'Play clip A' }))

      const iframe = screen.getByTitle('Google Drive video player') as HTMLIFrameElement
      expect(iframe.src).toBe('https://drive.google.com/file/d/abc123/preview?autoplay=1')
    })

    it('does not render a ClipFacade for a direct clip (out of scope)', () => {
      const clip = makeClip({ provider: PROVIDER_DIRECT, media_type: MEDIA_TYPE_VIDEO })
      render(<MediaPlayer clip={clip} onPlay={vi.fn()} />)

      expect(screen.queryByRole('button', { name: /Play clip/ })).not.toBeInTheDocument()
      expect(document.querySelector('video')).not.toBeNull()
    })
  })
})
