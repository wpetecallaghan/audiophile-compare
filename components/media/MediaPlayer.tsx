'use client'

import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import NativePlayer, { type PlayerHandle } from './players/NativePlayer'
import YouTubePlayer from './players/YouTubePlayer'
import VimeoPlayer from './players/VimeoPlayer'
import GoogleDrivePlayer from './players/GoogleDrivePlayer'
import UnknownPlayer from './players/UnknownPlayer'
import { ClipFacade } from './players/ClipFacade'
import type { ClipProvider, MediaType } from '@/lib/clips/detect-provider'
import { PROVIDER_YOUTUBE, PROVIDER_VIMEO, PROVIDER_GOOGLE_DRIVE, PROVIDER_DIRECT, MEDIA_TYPE_AUDIO, MEDIA_TYPE_VIDEO } from '@/lib/clips/detect-provider'

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
  // Background image for ClipFacade, shown before the visitor presses play
  // (build step 76) — null for a provider with no available thumbnail
  // (Google Drive has no public one; see to-clip-data.ts).
  thumbnail_url?: string | null
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
  // Defers mounting the YouTube/Vimeo/Google-Drive SDK until the visitor
  // presses play (build step 76) — SDK init is real, uncacheable work, so
  // it's paid only when actually needed. Direct/unknown clips are
  // unaffected: NativePlayer has no SDK to defer, and its own
  // background-load/reveal-on-metadata behavior already handles that case
  // (see components.md §5).
  const [activated, setActivated] = useState(false)
  const t = useTranslations('tests.clipFacade')

  // Forward the pause() call down to whichever inner player is rendered.
  // Before activation, innerRef.current is still null (nothing but the
  // facade has mounted a ref yet) — pausing an unactivated clip is
  // therefore already a safe no-op, with no special-casing needed here.
  useImperativeHandle(ref, () => ({
    pause() {
      innerRef.current?.pause()
    },
  }))

  // The facade's own click is the user gesture that makes autoplay=true
  // safe on the real player. onPlay fires immediately (optimistic
  // pause-coordination for the sibling clip) rather than waiting for the
  // SDK's own async play event, since the real player hasn't even mounted
  // yet at the moment of the click.
  function handleActivate() {
    onPlay()
    setActivated(true)
  }

  // A plain link to the clip's original source is always shown alongside
  // the embed below — not a failure-only fallback, a permanent companion —
  // since an embed can fail for reasons specific to its provider (iframe
  // blocked, video removed/region-locked, host-side hotlink protection)
  // that the listener has no other way to route around from this page.
  if (clip.provider === PROVIDER_YOUTUBE && clip.embed_id) {
    return (
      <div className="space-y-2">
        {activated ? (
          <YouTubePlayer
            ref={innerRef}
            videoId={clip.embed_id}
            onPlay={onPlay}
            autoplay
          />
        ) : (
          <ClipFacade
            thumbnailUrl={clip.thumbnail_url ?? null}
            playLabel={t('playAriaLabel', { label: clip.label })}
            onActivate={handleActivate}
          />
        )}
        <UnknownPlayer url={clip.source_url} />
      </div>
    )
  }

  if (clip.provider === PROVIDER_VIMEO && clip.embed_id) {
    return (
      <div className="space-y-2">
        {activated ? (
          <VimeoPlayer
            ref={innerRef}
            videoId={clip.embed_id}
            onPlay={onPlay}
            autoplay
          />
        ) : (
          <ClipFacade
            thumbnailUrl={clip.thumbnail_url ?? null}
            playLabel={t('playAriaLabel', { label: clip.label })}
            onActivate={handleActivate}
          />
        )}
        <UnknownPlayer url={clip.source_url} />
      </div>
    )
  }

  if (clip.provider === PROVIDER_GOOGLE_DRIVE && clip.embed_id) {
    return (
      <div className="space-y-2">
        {activated ? (
          <GoogleDrivePlayer
            ref={innerRef}
            videoId={clip.embed_id}
            onPlay={onPlay}
            autoplay
          />
        ) : (
          <ClipFacade
            thumbnailUrl={clip.thumbnail_url ?? null}
            playLabel={t('playAriaLabel', { label: clip.label })}
            onActivate={handleActivate}
          />
        )}
        <UnknownPlayer url={clip.source_url} />
      </div>
    )
  }

  if (clip.provider === PROVIDER_DIRECT) {
    return (
      <div className="space-y-2">
        <NativePlayer
          ref={innerRef}
          url={clip.canonical_url ?? clip.source_url}
          mediaType={clip.media_type === MEDIA_TYPE_AUDIO ? MEDIA_TYPE_AUDIO : MEDIA_TYPE_VIDEO}
          onPlay={onPlay}
        />
        <UnknownPlayer url={clip.source_url} />
      </div>
    )
  }

  return <UnknownPlayer url={clip.source_url} />
})

export default MediaPlayer