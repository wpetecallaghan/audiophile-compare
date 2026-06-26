'use client'

import { useRef } from 'react'
import MediaPlayer, { type ClipData } from './MediaPlayer'
import type { PlayerHandle } from './players/NativePlayer'

type Props = {
  clipA: ClipData
  clipB: ClipData
}

export default function ABPlayer({ clipA, clipB }: Props) {
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
    <div className="grid grid-cols-1 gap-6">
      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide">
          Clip A
        </h2>
        <MediaPlayer
          ref={playerARef}
          clip={clipA}
          onPlay={handleAPlay}
        />
      </div>
      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide">
          Clip B
        </h2>
        <MediaPlayer
          ref={playerBRef}
          clip={clipB}
          onPlay={handleBPlay}
        />
      </div>
    </div>
  )
}