'use client'

import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react'
import { MEDIA_TYPE_AUDIO } from '@/lib/clips/detect-provider'

// forwardRef and useImperativeHandle are how you expose methods from a child
// component to a parent. The parent holds a ref; the child defines what that
// ref can do. This is the React equivalent of an interface in .NET/Java.

export type PlayerHandle = {
  pause: () => void
}

type Props = {
  url: string            // used as the media element's src — the playable (canonical) URL
  mediaType: 'audio' | 'video'
  onPlay: () => void   // called when this player starts — tells the parent to pause the other
}

// Some "direct" URLs (media_type 'unknown' server-side, e.g. a Google
// Photos share link) resolve to an HTML page, not a media file — the
// <audio>/<video> element can never play them. A previous version of this
// component guessed a bounded timeout ("give up after Xms") — but that
// meant racing an arbitrary duration against real network variance: 3s
// (step 54), then 5s (step 56) both still produced occasional false
// negatives on perfectly playable Dropbox clips on a cold connection.
//
// So there's no timeout at all: the media element is always mounted and
// attempts to load in the background, staying visually hidden until
// onLoadedMetadata actually confirms the src is real, playable media
// (parsing HTML as a media container simply can't produce that event). If
// it errors, or metadata never arrives, it just stays hidden — no failure
// state to detect or race against, no wrong guess possible either
// direction.
//
// This component has no fallback UI of its own (build step 57) — a link to
// the clip's original source is always rendered alongside it one level up,
// in MediaPlayer.tsx, regardless of provider or load state. Keeping that
// link out of here avoids a transient double-link during loading (this
// component's own copy + MediaPlayer's permanent one) and means this
// component's only job is "attempt to play this URL, reveal on success."
const NativePlayer = forwardRef<PlayerHandle, Props>(function NativePlayer(
  { url, mediaType, onPlay },
  ref
) {
  // useRef holds a reference to the DOM element itself.
  // elementRef.current will be the actual <audio> or <video> DOM node.
  const elementRef = useRef<HTMLAudioElement | HTMLVideoElement>(null)

  const [hasLoaded, setHasLoaded] = useState(false)

  useEffect(() => {
    setHasLoaded(false)
  }, [url])

  // useImperativeHandle defines what the parent sees when it holds a ref
  // to this component. We expose only pause() — the parent has no reason
  // to call play() on a player the user didn't interact with.
  useImperativeHandle(ref, () => ({
    pause() {
      elementRef.current?.pause()
    },
  }))

  const sharedProps = {
    src: url,
    controls: true,
    className: hasLoaded ? 'w-full max-w-full' : 'hidden',
    onPlay,   // fires when the user presses play on this element
    onLoadedMetadata: () => setHasLoaded(true),
  }

  return mediaType === MEDIA_TYPE_AUDIO ? (
    <audio
      ref={elementRef as React.RefObject<HTMLAudioElement>}
      {...sharedProps}
    />
  ) : (
    <video
      ref={elementRef as React.RefObject<HTMLVideoElement>}
      {...sharedProps}
    />
  )
})

export default NativePlayer
