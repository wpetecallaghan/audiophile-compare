import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRef } from 'react'
import { render, act } from '@testing-library/react'
import YouTubePlayer from '../YouTubePlayer'
import type { PlayerHandle } from '../NativePlayer'

// @vitest-environment jsdom

let capturedOptions: YT.PlayerOptions
let capturedPlayer: { pauseVideo: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }

beforeEach(() => {
  // loadYouTubeApi (lib/youtube-api.ts) calls its ready-callback
  // immediately whenever window.YT?.Player already exists — mocking the
  // global here avoids needing to mock script injection at all.
  capturedPlayer = { pauseVideo: vi.fn(), destroy: vi.fn() }
  window.YT = {
    // `new YT.Player(...)` requires a real constructor function — an
    // arrow function can't be called with `new`.
    Player: vi.fn().mockImplementation(function (_el: unknown, options: YT.PlayerOptions) {
      capturedOptions = options
      return capturedPlayer
    }),
    PlayerState: { PLAYING: 1, UNSTARTED: -1, ENDED: 0, PAUSED: 2, BUFFERING: 3, CUED: 5 },
  } as unknown as typeof YT
})

describe('YouTubePlayer', () => {
  // The core regression guard for build step 55: without this, iOS
  // Safari forces the embed into native fullscreen instead of staying
  // inline, which was the confirmed cause of a real mobile UX report.
  it('passes playsinline: 1 in playerVars', () => {
    render(<YouTubePlayer videoId="abc123" onPlay={vi.fn()} />)

    expect(capturedOptions.playerVars?.playsinline).toBe(1)
  })

  it('calls onPlay when the player state changes to PLAYING', () => {
    const onPlay = vi.fn()
    render(<YouTubePlayer videoId="abc123" onPlay={onPlay} />)

    act(() => {
      capturedOptions.events?.onStateChange?.({ data: YT.PlayerState.PLAYING, target: capturedPlayer as unknown as YT.Player })
    })

    expect(onPlay).toHaveBeenCalledTimes(1)
  })

  it('calls pauseVideo() on the underlying player when pause() is called via ref', () => {
    const ref = createRef<PlayerHandle>()
    render(<YouTubePlayer ref={ref} videoId="abc123" onPlay={vi.fn()} />)

    act(() => {
      ref.current?.pause()
    })

    expect(capturedPlayer.pauseVideo).toHaveBeenCalledTimes(1)
  })

  // Regression guard for a real report ("the video does not shrink to
  // fit the frame" in Firefox mobile emulation): the YouTube IFrame API
  // preserves this div's className onto the <iframe> it replaces it
  // with, and w-full h-full is what makes that iframe actually fill its
  // aspect-ratio-box parent instead of falling back to YouTube's own
  // default 640x360 size — confirmed live via Playwright against a real
  // embed, not something jsdom can simulate (no real IFrame API runs
  // here), so this only guards the source classes stay correct.
  it('renders the SDK target container with the classes the IFrame API needs to size it responsively', () => {
    render(<YouTubePlayer videoId="abc123" onPlay={vi.fn()} />)

    const container = document.querySelector('.inset-0')!
    expect(container.className).toContain('absolute')
    expect(container.className).toContain('inset-0')
    expect(container.className).toContain('w-full')
    expect(container.className).toContain('h-full')
  })
})
