'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import VimeoSDK from '@vimeo/player'
import type { PlayerHandle } from './NativePlayer'

type Props = {
  videoId: string
  onPlay: () => void
}

const VimeoPlayer = forwardRef<PlayerHandle, Props>(function VimeoPlayer(
  { videoId, onPlay },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<VimeoSDK | null>(null)

  useImperativeHandle(ref, () => ({
    pause() {
      // Vimeo SDK methods return Promises — pause() is async.
      // We don't await here because pause() on an already-paused
      // player is harmless and we don't need to handle the result.
      playerRef.current?.pause()
    },
  }))

  useEffect(() => {
    if (!containerRef.current) return

    const player = new VimeoSDK(containerRef.current, {
      id: Number(videoId),
      responsive: true,
    })

    player.on('play', onPlay)
    playerRef.current = player

    return () => {
      player.off('play', onPlay)
      player.destroy()
      playerRef.current = null
    }
  }, [videoId])

  return (
    <div className="relative w-full max-w-full aspect-video overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  )
})

export default VimeoPlayer