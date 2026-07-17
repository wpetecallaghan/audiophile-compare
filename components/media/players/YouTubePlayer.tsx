'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { loadYouTubeApi } from '@/lib/youtube-api'
import type { PlayerHandle } from './NativePlayer'
import { EMBED_WRAPPER_CLASSES, EMBED_FILL_CLASSES } from './embedLayout'

type Props = {
  videoId: string
  onPlay: () => void
  // Mounted only after the visitor clicks ClipFacade's play button (build
  // step 76) — that click is itself the user gesture browsers require to
  // allow autoplay, so this is safe even though autoplaying media is
  // normally blocked.
  autoplay?: boolean
}

const YouTubePlayer = forwardRef<PlayerHandle, Props>(function YouTubePlayer(
  { videoId, onPlay, autoplay = false },
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
          // Without this, iOS Safari forces the embed into native
          // fullscreen on play instead of staying inline in the page —
          // the confirmed cause of a mobile UX report that the embed
          // frame made play/pause hard to reach (build step 55).
          playsinline: 1,
          autoplay: autoplay ? 1 : 0,
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
  }, [videoId, autoplay])   // re-run this effect if videoId (or autoplay) changes

  return (
    <div className={EMBED_WRAPPER_CLASSES}>
      {/* w-full h-full matters: the YouTube IFrame API preserves this
          div's className on the <iframe> it replaces it with, but without
          an explicit width/height, YouTube's own default 640x360 HTML
          attributes win over inset-0's stretch (per CSS's sizing rules
          for absolutely positioned replaced elements) — the confirmed
          cause of a real report that the embed didn't shrink to fit on
          mobile (build step 55). Matches GoogleDrivePlayer.tsx's iframe,
          which already includes these for the same reason. */}
      <div ref={containerRef} className={EMBED_FILL_CLASSES} />
    </div>
  )
})

export default YouTubePlayer