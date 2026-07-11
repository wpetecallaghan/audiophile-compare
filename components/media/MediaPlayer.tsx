'use client'

import { forwardRef, useImperativeHandle, useRef } from 'react'
import NativePlayer, { type PlayerHandle } from './players/NativePlayer'
import YouTubePlayer from './players/YouTubePlayer'
import VimeoPlayer from './players/VimeoPlayer'
import GoogleDrivePlayer from './players/GoogleDrivePlayer'
import UnknownPlayer from './players/UnknownPlayer'
import type { ClipProvider, MediaType } from '@/lib/clips/detect-provider'

// This is the shape of the clip data your API returns.
// It matches the columns in your clips table.
export type ClipData = {
  id: string
  label: 'A' | 'B'
  source_url: string
  provider: ClipProvider
  media_type: MediaType
  canonical_url?: string
  embed_id?: string | null
}

type Props = {
  clip: ClipData
  onPlay: () => void   // tells the sibling player to pause
}

// MediaPlayer itself also exposes a PlayerHandle so the A/B coordinator
// above it in the tree can pause it when the other clip starts.
const MediaPlayer = forwardRef<PlayerHandle, Props>(function MediaPlayer(
  { clip, onPlay },
  ref
) {
  const innerRef = useRef<PlayerHandle>(null)

  // Forward the pause() call down to whichever inner player is rendered
  useImperativeHandle(ref, () => ({
    pause() {
      innerRef.current?.pause()
    },
  }))

  // A plain link to the clip's original source is always shown alongside
  // the embed below — not a failure-only fallback, a permanent companion —
  // since an embed can fail for reasons specific to its provider (iframe
  // blocked, video removed/region-locked, host-side hotlink protection)
  // that the listener has no other way to route around from this page.
  if (clip.provider === 'youtube' && clip.embed_id) {
    return (
      <div className="space-y-2">
        <YouTubePlayer
          ref={innerRef}
          videoId={clip.embed_id}
          onPlay={onPlay}
        />
        <UnknownPlayer url={clip.source_url} />
      </div>
    )
  }

  if (clip.provider === 'vimeo' && clip.embed_id) {
    return (
      <div className="space-y-2">
        <VimeoPlayer
          ref={innerRef}
          videoId={clip.embed_id}
          onPlay={onPlay}
        />
        <UnknownPlayer url={clip.source_url} />
      </div>
    )
  }

  if (clip.provider === 'google-drive' && clip.embed_id) {
    return (
      <div className="space-y-2">
        <GoogleDrivePlayer
          ref={innerRef}
          videoId={clip.embed_id}
          onPlay={onPlay}
        />
        <UnknownPlayer url={clip.source_url} />
      </div>
    )
  }

  if (clip.provider === 'direct') {
    return (
      <div className="space-y-2">
        <NativePlayer
          ref={innerRef}
          url={clip.canonical_url ?? clip.source_url}
          mediaType={clip.media_type === 'audio' ? 'audio' : 'video'}
          onPlay={onPlay}
        />
        <UnknownPlayer url={clip.source_url} />
      </div>
    )
  }

  return <UnknownPlayer url={clip.source_url} />
})

export default MediaPlayer