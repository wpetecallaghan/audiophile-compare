'use client'

import { forwardRef, useImperativeHandle, useRef } from 'react'
import NativePlayer, { type PlayerHandle } from './players/NativePlayer'
import YouTubePlayer from './players/YouTubePlayer'
import VimeoPlayer from './players/VimeoPlayer'
import GoogleDrivePlayer from './players/GoogleDrivePlayer'
import UnknownPlayer from './players/UnknownPlayer'

// This is the shape of the clip data your API returns.
// It matches the columns in your clips table.
export type ClipData = {
  id: string
  label: 'A' | 'B'
  source_url: string
  provider: 'youtube' | 'vimeo' | 'google-drive' | 'direct' | 'unknown'
  media_type: 'audio' | 'video' | 'unknown'
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

  if (clip.provider === 'youtube' && clip.embed_id) {
    return (
      <YouTubePlayer
        ref={innerRef}
        videoId={clip.embed_id}
        onPlay={onPlay}
      />
    )
  }

  if (clip.provider === 'vimeo' && clip.embed_id) {
    return (
      <VimeoPlayer
        ref={innerRef}
        videoId={clip.embed_id}
        onPlay={onPlay}
      />
    )
  }

  if (clip.provider === 'google-drive' && clip.embed_id) {
    return (
      <GoogleDrivePlayer
        ref={innerRef}
        videoId={clip.embed_id}
        onPlay={onPlay}
      />
    )
  }

  if (clip.provider === 'direct') {
    return (
      <NativePlayer
        ref={innerRef}
        url={clip.source_url}
        mediaType={clip.media_type === 'audio' ? 'audio' : 'video'}
        onPlay={onPlay}
      />
    )
  }

  return <UnknownPlayer url={clip.source_url} />
})

export default MediaPlayer