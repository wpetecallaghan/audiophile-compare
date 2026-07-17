import { detectProvider } from './detect-provider'
import { isGooglePhotosUrl, resolveGooglePhotosVideoUrl } from './resolve-google-photos'
import { fetchVimeoThumbnail } from './fetch-vimeo-thumbnail'
import type { ClipData } from '@/components/media/MediaPlayer'

type RawClip = {
  id: string
  label: string
  source_url: string
  provider: string
  media_type: string
  url_status: string
}

export async function toClipData(clip: RawClip): Promise<ClipData> {
  // Re-run provider detection to recover canonical_url and embed_id
  // from the stored source_url — these aren't persisted as columns
  const detected = detectProvider(clip.source_url)

  // Google Photos needs a real network fetch to resolve a playable URL
  // (see resolve-google-photos.ts) — unlike every other provider, it can't
  // be derived synchronously from source_url alone, so this is the one
  // provider where canonical_url/media_type below can diverge from the
  // stored DB values on success.
  const resolvedVideoUrl =
    detected.provider === 'direct' && isGooglePhotosUrl(clip.source_url)
      ? await resolveGooglePhotosVideoUrl(clip.source_url)
      : null

  // The resolved CDN URL can't be used as a <video src> directly — it
  // redirects cross-origin to a different host, which Chromium's Opaque
  // Response Blocking rejects for a plain media element (confirmed live;
  // see resolve-google-photos.ts). Routing through our own proxy makes it a
  // same-origin request instead, sidestepping that entirely.
  const canonicalUrl = resolvedVideoUrl
    ? `/api/clips/google-photos-proxy?url=${encodeURIComponent(resolvedVideoUrl)}`
    : detected.canonical_url

  // ClipFacade's background thumbnail (build step 76), resolved per
  // provider — see fetch-vimeo-thumbnail.ts for why Vimeo needs a real
  // network call and GoogleDrivePlayer.tsx's comments for why Drive has no
  // available thumbnail at all.
  const thumbnailUrl =
    detected.provider === 'youtube' && detected.embed_id
      ? `https://img.youtube.com/vi/${detected.embed_id}/hqdefault.jpg`
      : detected.provider === 'vimeo' && detected.embed_id
        ? await fetchVimeoThumbnail(detected.embed_id)
        : null

  return {
    id:            clip.id,
    label:         clip.label as 'A' | 'B',
    source_url:    clip.source_url,
    provider:      clip.provider as ClipData['provider'],
    media_type:    resolvedVideoUrl ? 'video' : (clip.media_type as ClipData['media_type']),
    canonical_url: canonicalUrl,
    embed_id:      detected.embed_id,
    thumbnail_url: thumbnailUrl,
  }
}