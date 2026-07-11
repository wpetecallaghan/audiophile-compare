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
  url: string            // used as the media element's src — the playable (canonical) URL
  fallbackUrl?: string   // used for the link-out on failure; defaults to url. Diverges from
                         // url for e.g. a Dropbox clip (build step 56), where url is the
                         // rewritten raw=1 link but the fallback should point at the
                         // original, human-friendly share page instead.
  mediaType: 'audio' | 'video'
  onPlay: () => void   // called when this player starts — tells the parent to pause the other
}

// Some "direct" URLs (media_type 'unknown' server-side, e.g. a Google
// Photos share link) resolve to an HTML page, not a media file — the
// <audio>/<video> element can never play them. A previous version of
// this component guessed a bounded timeout ("give up and show the link
// if nothing's happened by Xms") — but that meant racing an arbitrary
// duration against real network variance: 3s (step 54), then 5s (step
// 56) both still produced occasional false fallbacks on perfectly
// playable Dropbox clips on a cold connection. There is no duration
// that's both short enough to not feel broken on a genuinely dead link
// and long enough to never misfire on a slow-but-working one.
//
// So there's no timeout at all now: the fallback link is the default,
// visible immediately, and playback is attempted in the background
// (the media element stays mounted, just visually hidden) — it only
// replaces the link once onLoadedMetadata actually confirms the src is
// real, playable media (parsing HTML as a media container simply can't
// produce that event). If it errors, or metadata never arrives, the
// link was already showing and just stays there — no failure state to
// detect or race against, no wrong guess possible either direction.
const NativePlayer = forwardRef<PlayerHandle, Props>(function NativePlayer(
  { url, fallbackUrl, mediaType, onPlay },
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
    // Google Photos' CDN (lh3.googleusercontent.com, used by
    // resolve-google-photos.ts) returns 429 specifically when the request
    // carries a Referer header pointing at a dev-looking host like
    // localhost — confirmed live: identical requests succeed with no
    // referrer, or with an arbitrary third-party/production-looking one,
    // and only "localhost" triggers the block. A browser's default
    // referrer policy sends the page's origin on every cross-origin
    // <video src> request, so without this the clip silently never loads
    // (NativePlayer falls back to the link, never surfacing an error).
    // Suppressing the referrer entirely is harmless for every other direct
    // URL (Dropbox etc. don't require one) and removes this whole class of
    // host-based blocking risk rather than special-casing Google Photos.
    referrerPolicy: 'no-referrer' as const,
  }

  return (
    <>
      {!hasLoaded && <UnknownPlayer url={fallbackUrl ?? url} />}
      {mediaType === 'audio' ? (
        <audio
          ref={elementRef as React.RefObject<HTMLAudioElement>}
          {...sharedProps}
        />
      ) : (
        <video
          ref={elementRef as React.RefObject<HTMLVideoElement>}
          {...sharedProps}
        />
      )}
    </>
  )
})

export default NativePlayer