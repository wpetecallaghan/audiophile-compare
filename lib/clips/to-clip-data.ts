import { detectProvider } from './detect-provider'
import type { ClipData } from '@/components/media/MediaPlayer'

type RawClip = {
  id: string
  label: string
  source_url: string
  provider: string
  media_type: string
  url_status: string
}

export function toClipData(clip: RawClip): ClipData {
  // Re-run provider detection to recover canonical_url and embed_id
  // from the stored source_url — these aren't persisted as columns
  const detected = detectProvider(clip.source_url)

  return {
    id:            clip.id,
    label:         clip.label as 'A' | 'B',
    source_url:    clip.source_url,
    provider:      clip.provider as ClipData['provider'],
    media_type:    clip.media_type as ClipData['media_type'],
    canonical_url: detected.canonical_url,
    embed_id:      detected.embed_id,
  }
}