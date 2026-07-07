import { detectProvider } from '@/lib/clips/detect-provider'
import type { ScrapedLink } from './parse-thread-page'

// Public, unauthenticated oEmbed endpoints — no API key needed for either.
const YOUTUBE_OEMBED = 'https://www.youtube.com/oembed'
const VIMEO_OEMBED = 'https://vimeo.com/api/oembed.json'

type OEmbedFields = { oembed_title?: string; oembed_author?: string }

// Best-effort track-identification signal (build-history-ingestion.md step
// 33, decision 4) — forum creators rarely name the track in text. Only
// YouTube/Vimeo links are worth a lookup; direct file URLs have no oEmbed
// endpoint at all. Never throws — a failed/404 lookup just means no
// enrichment, not a broken scrape.
export async function fetchOEmbed(url: string): Promise<OEmbedFields> {
  const detected = detectProvider(url)
  if (detected.provider !== 'youtube' && detected.provider !== 'vimeo') {
    return {}
  }

  const endpoint = detected.provider === 'youtube' ? YOUTUBE_OEMBED : VIMEO_OEMBED

  try {
    const response = await fetch(`${endpoint}?url=${encodeURIComponent(url)}&format=json`)
    if (!response.ok) return {}

    const data = (await response.json()) as { title?: unknown; author_name?: unknown }
    return {
      oembed_title: typeof data.title === 'string' ? data.title : undefined,
      oembed_author: typeof data.author_name === 'string' ? data.author_name : undefined,
    }
  } catch {
    return {}
  }
}

export async function enrichLinksWithOEmbed(links: ScrapedLink[]): Promise<ScrapedLink[]> {
  return Promise.all(
    links.map(async (link) => ({ ...link, ...(await fetchOEmbed(link.url)) })),
  )
}
