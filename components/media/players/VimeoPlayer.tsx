'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import VimeoSDK from '@vimeo/player'
import type { PlayerHandle } from './NativePlayer'
import { EMBED_WRAPPER_CLASSES } from './embedLayout'

type Props = {
  videoId: string
  onPlay: () => void
  // See YouTubePlayer.tsx's comment — only ever true after a real user
  // click on ClipFacade's play button, which satisfies the browser's
  // autoplay-requires-a-gesture requirement.
  autoplay?: boolean
}

const VimeoPlayer = forwardRef<PlayerHandle, Props>(function VimeoPlayer(
  { videoId, onPlay, autoplay = false },
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
      autoplay,
    })

    player.on('play', onPlay)
    playerRef.current = player

    return () => {
      player.off('play', onPlay)
      player.destroy()
      playerRef.current = null
    }
  }, [videoId, autoplay])

  return (
    <div className={EMBED_WRAPPER_CLASSES}>
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  )
})

export default VimeoPlayer