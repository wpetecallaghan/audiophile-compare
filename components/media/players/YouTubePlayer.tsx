'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { loadYouTubeApi } from '@/lib/youtube-api'
import type { PlayerHandle } from './NativePlayer'

type Props = {
  videoId: string
  onPlay: () => void
}

const YouTubePlayer = forwardRef<PlayerHandle, Props>(function YouTubePlayer(
  { videoId, onPlay },
  ref
) {
  // containerRef points to the <div> that YouTube replaces with its iframe
  const containerRef = useRef<HTMLDivElement>(null)
  // playerRef holds the YT.Player SDK instance
  const playerRef = useRef<YT.Player | null>(null)

  useImperativeHandle(ref, () => ({
    pause() {
      // pauseVideo() is the YouTube SDK method
      playerRef.current?.pauseVideo()
    },
  }))

  // useEffect runs after the component mounts in the browser.
  // It's the right place for side effects like loading external scripts
  // and setting up SDK instances. Think of it as the constructor body
  // for browser-only setup — the component renders first (server-safe),
  // then this runs client-side.
  useEffect(() => {
    let player: YT.Player

    loadYouTubeApi(() => {
      if (!containerRef.current) return

      player = new YT.Player(containerRef.current, {
        videoId,
        playerVars: {
          origin: window.location.origin,
        },
        events: {
          onStateChange(event) {
            // YT.PlayerState.PLAYING = 1
            if (event.data === YT.PlayerState.PLAYING) {
              onPlay()
            }
          },
        },
      })

      playerRef.current = player
    })

    // The function returned from useEffect is the cleanup function —
    // it runs when the component unmounts. Equivalent to IDisposable
    // in .NET or defer in Go. Always destroy SDK instances here.
    return () => {
      player?.destroy()
      playerRef.current = null
    }
  }, [videoId])   // re-run this effect if videoId changes

  return (
    <div className="relative w-full aspect-video">
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  )
})

export default YouTubePlayer