'use client'

import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react'
import UnknownPlayer from './UnknownPlayer'

// forwardRef and useImperativeHandle are how you expose methods from a child
// component to a parent. The parent holds a ref; the child defines what that
// ref can do. This is the React equivalent of an interface in .NET/Java.

export type PlayerHandle = {
  pause: () => void
}

type Props = {
  url: string
  mediaType: 'audio' | 'video'
  onPlay: () => void   // called when this player starts — tells the parent to pause the other
}

// Some "direct" URLs (media_type 'unknown' server-side, e.g. a Google
// Photos share link) resolve to an HTML page, not a media file — the
// <audio>/<video> element can never play them. The browser's onError is
// the fast path for this, but it isn't reliable on its own: how quickly
// (or whether) it fires depends on network/redirect timing, and differs
// across browsers (confirmed flaky specifically on mobile — build step
// 54). onLoadedMetadata firing is proof the src really is playable media
// (parsing HTML as a media container simply can't produce it), so once
// that fires we stop worrying entirely. Until then, a bounded timeout is
// the backstop that makes "give up and show the link" deterministic
// instead of depending on how long onError happens to take.
const LOAD_TIMEOUT_MS = 3000

const NativePlayer = forwardRef<PlayerHandle, Props>(function NativePlayer(
  { url, mediaType, onPlay },
  ref
) {
  // useRef holds a reference to the DOM element itself.
  // elementRef.current will be the actual <audio> or <video> DOM node.
  const elementRef = useRef<HTMLAudioElement | HTMLVideoElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [hasError, setHasError] = useState(false)
  // Stays false for the entire uncertain window (mount → error/timeout/
  // real metadata) — the element is kept mounted so it can keep loading,
  // but visually hidden until we actually know playback will work, so a
  // slow-to-resolve clip never briefly shows a blank/broken-looking
  // native player.
  const [hasLoaded, setHasLoaded] = useState(false)

  useEffect(() => {
    setHasError(false)
    setHasLoaded(false)
    timeoutRef.current = setTimeout(() => setHasError(true), LOAD_TIMEOUT_MS)
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [url])

  function handleLoadedMetadata() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setHasLoaded(true)
  }

  // useImperativeHandle defines what the parent sees when it holds a ref
  // to this component. We expose only pause() — the parent has no reason
  // to call play() on a player the user didn't interact with.
  useImperativeHandle(ref, () => ({
    pause() {
      elementRef.current?.pause()
    },
  }))

  if (hasError) {
    return <UnknownPlayer url={url} />
  }

  const sharedProps = {
    src: url,
    controls: true,
    className: hasLoaded ? 'w-full max-w-full' : 'hidden',
    onPlay,   // fires when the user presses play on this element
    onError: () => setHasError(true),
    onLoadedMetadata: handleLoadedMetadata,
  }

  if (mediaType === 'audio') {
    return (
      <audio
        ref={elementRef as React.RefObject<HTMLAudioElement>}
        {...sharedProps}
      />
    )
  }

  return (
    <video
      ref={elementRef as React.RefObject<HTMLVideoElement>}
      {...sharedProps}
    />
  )
})

export default NativePlayer