import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRef } from 'react'
import { render, act } from '@testing-library/react'
import VimeoPlayer from '../VimeoPlayer'
import type { PlayerHandle } from '../NativePlayer'

// @vitest-environment jsdom

const capturedPlayer = { on: vi.fn(), off: vi.fn(), pause: vi.fn(), destroy: vi.fn() }
let capturedOptions: { id: number; responsive: boolean; autoplay: boolean }

vi.mock('@vimeo/player', () => ({
  default: vi.fn().mockImplementation(function (_el: unknown, options: typeof capturedOptions) {
    capturedOptions = options
    return capturedPlayer
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('VimeoPlayer', () => {
  it('defaults autoplay to false when the prop is omitted', () => {
    render(<VimeoPlayer videoId="123456789" onPlay={vi.fn()} />)

    expect(capturedOptions.autoplay).toBe(false)
  })

  // build step 76 — only rendered (mounted) after a real user click on
  // ClipFacade, which satisfies the browser's autoplay-requires-a-gesture
  // rule.
  it('passes autoplay: true through to the Vimeo SDK when the prop is set', () => {
    render(<VimeoPlayer videoId="123456789" onPlay={vi.fn()} autoplay />)

    expect(capturedOptions.autoplay).toBe(true)
  })

  it('calls onPlay when the SDK emits its play event', () => {
    const onPlay = vi.fn()
    render(<VimeoPlayer videoId="123456789" onPlay={onPlay} />)

    const [, handler] = capturedPlayer.on.mock.calls[0]
    act(() => {
      handler()
    })

    expect(onPlay).toHaveBeenCalledTimes(1)
  })

  it('calls pause() on the underlying player when pause() is called via ref', () => {
    const ref = createRef<PlayerHandle>()
    render(<VimeoPlayer ref={ref} videoId="123456789" onPlay={vi.fn()} />)

    act(() => {
      ref.current?.pause()
    })

    expect(capturedPlayer.pause).toHaveBeenCalledTimes(1)
  })
})
