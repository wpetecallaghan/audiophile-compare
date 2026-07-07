'use client'

import { forwardRef, useImperativeHandle } from 'react'
import type { PlayerHandle } from './NativePlayer'

type Props = {
  videoId: string
  onPlay: () => void
}

// Google Drive's /preview embed has no public JS SDK — unlike YouTube's
// IFrame API and Vimeo's Player.js, there's no postMessage-based way to
// detect play events or issue a pause() command. pause() is therefore a
// documented no-op (the same graceful no-op UnknownPlayer already
// exercises when a sibling tries to pause it) and onPlay is never called —
// playing a Drive clip won't auto-pause a concurrently-playing sibling,
// and vice versa. Still forwards a PlayerHandle ref, for type consistency
// with every other player (components.md §5). See build-history.md step
// 34, decision 3.
const GoogleDrivePlayer = forwardRef<PlayerHandle, Props>(function GoogleDrivePlayer(
  { videoId },
  ref
) {
  useImperativeHandle(ref, () => ({
    pause() {
      // No-op — see the module-level comment above.
    },
  }))

  return (
    <div className="relative w-full max-w-full aspect-video overflow-hidden">
      <iframe
        src={`https://drive.google.com/file/d/${videoId}/preview`}
        className="absolute inset-0 w-full h-full"
        allow="autoplay"
        title="Google Drive video player"
      />
    </div>
  )
})

export default GoogleDrivePlayer
