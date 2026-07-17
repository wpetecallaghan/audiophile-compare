// Vimeo has no equivalent of YouTube's predictable img.youtube.com/vi/{id}
// thumbnail URL — the actual image lives on a per-video, per-upload CDN path
// that can only be discovered via a real API call. Vimeo's public oEmbed
// endpoint (no auth required for a public video) returns that path in its
// `thumbnail_url` field.
//
// Deliberately NOT lib/ingestion/scrape/fetch-oembed.ts, despite the name
// overlap — that module is scoped to the forum-ingestion pipeline (imports
// ingestion-only types) and doesn't extract thumbnail_url today. Reusing it
// here would mean the live page-render path importing from a
// batch-ingestion module — the wrong dependency direction. This is its own
// small, single-purpose fetch instead, following the same
// timeout/try-catch-swallow/fetch-level-cache shape as
// resolve-google-photos.ts.

const VIMEO_OEMBED_ENDPOINT = 'https://vimeo.com/api/oembed.json'

type VimeoOEmbedResponse = { thumbnail_url?: string }

export async function fetchVimeoThumbnail(
  videoId: string,
  timeoutMs = 3000
): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const url = `${VIMEO_OEMBED_ENDPOINT}?url=${encodeURIComponent(`https://vimeo.com/${videoId}`)}`
    const response = await fetch(url, {
      signal: controller.signal,
      // Thumbnails don't change for an already-published video — caching
      // the lookup avoids re-hitting Vimeo's oEmbed endpoint on every page
      // view (same rationale as resolve-google-photos.ts's revalidate).
      next: { revalidate: 86400 },
    })

    if (!response.ok) return null

    const data = (await response.json()) as VimeoOEmbedResponse
    return data.thumbnail_url ?? null
  } catch {
    // Timeout (AbortError), network error, or a private/deleted video
    // oEmbed 404s on — absence just means no thumbnail, not a broken fetch.
    return null
  } finally {
    clearTimeout(timer)
  }
}
