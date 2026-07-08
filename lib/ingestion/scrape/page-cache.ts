import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ScrapedPost } from './parse-thread-page'

// Resumable per-page cache for the scraper (build-history-ingestion.md
// step 33's "Planned refinement"). Keyed by page number, not the page's
// URL, since pagination is walked strictly sequentially — page N is
// always the Nth page visited in a given walk. Read helpers return null
// on a cache miss rather than throwing, so callers can fall through to a
// live fetch/parse; any other read error (permissions, corrupt file)
// still propagates.

function pageFileName(pageNumber: number, extension: string): string {
  return `page-${String(pageNumber).padStart(4, '0')}.${extension}`
}

async function readCached(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

export async function readCachedRawHtml(
  cacheDir: string,
  pageNumber: number,
): Promise<string | null> {
  return readCached(join(cacheDir, 'raw', pageFileName(pageNumber, 'html')))
}

export async function writeCachedRawHtml(
  cacheDir: string,
  pageNumber: number,
  html: string,
): Promise<void> {
  const dir = join(cacheDir, 'raw')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, pageFileName(pageNumber, 'html')), html)
}

// Parsed cache entries are already oEmbed-enriched — a cache hit skips
// both the fetch/parse cost and the oEmbed lookups for that page.
export async function readCachedParsedPage(
  cacheDir: string,
  pageNumber: number,
): Promise<ScrapedPost[] | null> {
  const raw = await readCached(join(cacheDir, 'parsed', pageFileName(pageNumber, 'json')))
  return raw ? (JSON.parse(raw) as ScrapedPost[]) : null
}

export async function writeCachedParsedPage(
  cacheDir: string,
  pageNumber: number,
  posts: ScrapedPost[],
): Promise<void> {
  const dir = join(cacheDir, 'parsed')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, pageFileName(pageNumber, 'json')), JSON.stringify(posts, null, 2))
}
