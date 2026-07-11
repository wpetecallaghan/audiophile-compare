import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRef } from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import NativePlayer, { type PlayerHandle } from '../NativePlayer'

// @vitest-environment jsdom

const LOAD_TIMEOUT_MS = 3000

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('NativePlayer', () => {
  it('renders an <audio> element for mediaType audio', () => {
    render(<NativePlayer url="https://example.com/audio.mp3" mediaType="audio" onPlay={vi.fn()} />)

    expect(document.querySelector('audio')).not.toBeNull()
    expect(document.querySelector('video')).toBeNull()
  })

  it('renders a <video> element for mediaType video', () => {
    render(<NativePlayer url="https://example.com/clip.mov" mediaType="video" onPlay={vi.fn()} />)

    expect(document.querySelector('video')).not.toBeNull()
    expect(document.querySelector('audio')).toBeNull()
  })

  it('calls onPlay when the media element fires its play event', () => {
    const onPlay = vi.fn()
    render(<NativePlayer url="https://example.com/clip.mov" mediaType="video" onPlay={onPlay} />)

    fireEvent.play(document.querySelector('video')!)

    expect(onPlay).toHaveBeenCalledTimes(1)
  })

  // The core behavior for build step 54: media_type is often 'unknown'
  // server-side (an unreliable Content-Type header, not proof the file
  // can't play), so NativePlayer always attempts playback first and only
  // falls back to the link-out UnknownPlayer when the element itself
  // reports a real error.
  it('falls back to the UnknownPlayer link when the media element errors', () => {
    const url = 'https://example.com/not-actually-playable'
    render(<NativePlayer url={url} mediaType="video" onPlay={vi.fn()} />)

    fireEvent.error(document.querySelector('video')!)

    expect(document.querySelector('video')).toBeNull()
    const link = screen.getByRole('link') as HTMLAnchorElement
    expect(link.href).toBe(url)
  })

  it('does not throw when pause() is called via ref after an error fallback', () => {
    const ref = createRef<PlayerHandle>()
    render(<NativePlayer ref={ref} url="https://example.com/clip.mov" mediaType="video" onPlay={vi.fn()} />)

    fireEvent.error(document.querySelector('video')!)

    expect(() => ref.current?.pause()).not.toThrow()
  })

  // Regression guard for a real reported bug (build step 54): a "direct"
  // URL that's actually an HTML share page (e.g. a Google Photos share
  // link) never fires a play error reliably on some browsers — onError
  // alone left the fallback flaky/inconsistent. A bounded timeout is the
  // deterministic backstop.
  it('falls back after the load timeout elapses with no error or metadata event', () => {
    const url = 'https://photos.app.goo.gl/abc123'
    render(<NativePlayer url={url} mediaType="video" onPlay={vi.fn()} />)

    expect(document.querySelector('video')).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(LOAD_TIMEOUT_MS)
    })

    expect(document.querySelector('video')).toBeNull()
    const link = screen.getByRole('link') as HTMLAnchorElement
    expect(link.href).toBe(url)
  })

  it('does not fall back once real media metadata has loaded, even after the timeout would have elapsed', () => {
    const url = 'https://example.com/clip.mov'
    render(<NativePlayer url={url} mediaType="video" onPlay={vi.fn()} />)

    fireEvent.loadedMetadata(document.querySelector('video')!)

    act(() => {
      vi.advanceTimersByTime(LOAD_TIMEOUT_MS)
    })

    expect(document.querySelector('video')).not.toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  // Requested follow-up: don't show a blank/broken-looking native player
  // during the uncertain window — keep it mounted (so it keeps loading)
  // but visually hidden until we know it actually works.
  it('keeps the media element hidden until metadata loads, then reveals it', () => {
    render(<NativePlayer url="https://example.com/clip.mov" mediaType="video" onPlay={vi.fn()} />)

    const video = document.querySelector('video')!
    expect(video.className).toContain('hidden')

    fireEvent.loadedMetadata(video)

    expect(video.className).not.toContain('hidden')
  })

  it('never reveals the hidden media element when it falls back to the link instead', () => {
    render(<NativePlayer url="https://example.com/not-actually-playable" mediaType="video" onPlay={vi.fn()} />)

    fireEvent.error(document.querySelector('video')!)

    expect(document.querySelector('video')).toBeNull()
    expect(screen.getByRole('link')).toBeInTheDocument()
  })
})
