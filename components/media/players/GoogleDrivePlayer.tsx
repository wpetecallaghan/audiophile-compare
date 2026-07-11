'use client'

import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react'
import type { PlayerHandle } from './NativePlayer'
import { EMBED_WRAPPER_CLASSES, EMBED_FILL_CLASSES } from './embedLayout'

type Props = {
  videoId: string
  onPlay: () => void
}

// Google Drive's /preview embed has no public JS SDK — unlike YouTube's
// IFrame API and Vimeo's Player.js, there's no postMessage-based way to
// detect play events or issue a pause() command directly. Both halves are
// approximated instead (build step 53, fixing a real reported bug where
// two Drive clips wouldn't pause each other):
//
// - Detecting play: focusing a cross-origin iframe (which a click inside
//   it does) moves document.activeElement onto the <iframe> element
//   itself — readable from the parent even though the iframe's content
//   isn't. Neither event-based technique that looks plausible here
//   actually works reliably, both ruled out by testing the real
//   A-then-B-then-A workflow (not just a single click), not by
//   assumption — see build-history/53-*.md:
//     - window 'blur' only fires on the window's focused→blurred
//       transition, so it never re-fires when switching focus directly
//       between two sibling iframes while the window is already blurred
//       (works for the first click into either iframe, silently stops
//       working for every switch after that).
//     - document-level 'focusin' does not fire at all for a cross-origin
//       iframe gaining focus — activeElement updates without a
//       corresponding bubbling focus event, unlike a normal focusable
//       element.
//   The only signal that actually tracks every transition is polling
//   document.activeElement directly and diffing it against the last
//   observed value.
// - Stopping playback: no pause call exists, so pause() force-remounts
//   the iframe via a key bump instead — browsers halt all content in a
//   removed iframe immediately. This is the only available option; it
//   loses the sibling's playback position, a real trade-off versus every
//   other provider's clean pause/resume, accepted given the platform
//   constraint (see build-history/53-google-drive-pause-fix.md).
//
// A third, unfixable-from-here platform gap (build step 55, found via a
// real mobile report): Drive's /preview widget crops the video to fill
// whatever box its iframe is given, rather than letterboxing a
// non-matching aspect ratio the way YouTube's and Vimeo's players do.
// Confirmed by loading the /preview URL directly, with no wrapper CSS at
// all, at two different container shapes — it cropped both times, so
// this is Drive's own cross-origin rendering, not something our CSS
// controls. Accepted as a known limitation; no fix exists on our side.
//
// Still forwards a PlayerHandle ref, for type consistency with every
// other player (components.md §5). See build-history.md step 34,
// decision 3 for the original no-op rationale this step revises.
const GoogleDrivePlayer = forwardRef<PlayerHandle, Props>(function GoogleDrivePlayer(
  { videoId, onPlay },
  ref
) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useImperativeHandle(ref, () => ({
    pause() {
      setReloadKey(k => k + 1)
    },
  }))

  useEffect(() => {
    let lastActive: Element | null = document.activeElement
    const POLL_MS = 200
    const interval = setInterval(() => {
      const active = document.activeElement
      if (active === lastActive) return
      lastActive = active
      if (active === iframeRef.current) onPlay()
    }, POLL_MS)
    return () => clearInterval(interval)
  }, [onPlay])

  return (
    <div className={EMBED_WRAPPER_CLASSES}>
      <iframe
        key={reloadKey}
        ref={iframeRef}
        src={`https://drive.google.com/file/d/${videoId}/preview`}
        className={EMBED_FILL_CLASSES}
        allow="autoplay"
        title="Google Drive video player"
      />
    </div>
  )
})

export default GoogleDrivePlayer
