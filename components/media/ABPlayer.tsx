'use client'

import { useRef } from 'react'
import MediaPlayer, { type ClipData } from './MediaPlayer'
import type { PlayerHandle } from './players/NativePlayer'
import { ClipLabel } from './ClipLabel'

type Props = {
  clipA: ClipData
  clipB: ClipData
  // Skip rendering that slot entirely (heading + player) — used once
  // revealed for a clip that can't be embedded, whose link now lives in
  // MappingBadge instead. ABPlayer stays unaware of *why*; the caller
  // decides. See build-history.md step 28.
  hideClipA?: boolean
  hideClipB?: boolean
}

export default function ABPlayer({ clipA, clipB, hideClipA = false, hideClipB = false }: Props) {
  const playerARef = useRef<PlayerHandle>(null)
  const playerBRef = useRef<PlayerHandle>(null)

  // When A starts playing, pause B — and vice versa.
  // These callbacks are passed down through MediaPlayer into the
  // individual player components, where they fire on the play event.
  function handleAPlay() {
    playerBRef.current?.pause()
  }

  function handleBPlay() {
    playerARef.current?.pause()
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-6 w-full max-w-full">
      {!hideClipA && (
        <div className="space-y-2 min-w-0">
          <ClipLabel>Clip A</ClipLabel>
          <MediaPlayer
            ref={playerARef}
            clip={clipA}
            onPlay={handleAPlay}
          />
        </div>
      )}
      {!hideClipB && (
        <div className="space-y-2 min-w-0">
          <ClipLabel>Clip B</ClipLabel>
          <MediaPlayer
            ref={playerBRef}
            clip={clipB}
            onPlay={handleBPlay}
          />
        </div>
      )}
    </div>
  )
}