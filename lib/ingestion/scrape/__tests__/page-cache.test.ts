// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  readCachedRawHtml,
  writeCachedRawHtml,
  readCachedParsedPage,
  writeCachedParsedPage,
} from '../page-cache'
import type { ScrapedPost } from '../parse-thread-page'

const post = (url: string): ScrapedPost => ({
  post_url: url,
  author: 'someone',
  posted_at: '2020-01-01T00:00:00Z',
  body_markdown: 'hello',
  quoted_post_url: null,
  links: [],
})

describe('page-cache', () => {
  let cacheDir: string

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'page-cache-test-'))
  })

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true })
  })

  it('returns null for raw HTML on a cache miss', async () => {
    await expect(readCachedRawHtml(cacheDir, 1)).resolves.toBeNull()
  })

  it('round-trips raw HTML through the cache', async () => {
    await writeCachedRawHtml(cacheDir, 1, '<html>page one</html>')

    await expect(readCachedRawHtml(cacheDir, 1)).resolves.toBe('<html>page one</html>')
  })

  it('keys raw HTML by page number, not overwriting other pages', async () => {
    await writeCachedRawHtml(cacheDir, 1, '<html>page one</html>')
    await writeCachedRawHtml(cacheDir, 2, '<html>page two</html>')

    await expect(readCachedRawHtml(cacheDir, 1)).resolves.toBe('<html>page one</html>')
    await expect(readCachedRawHtml(cacheDir, 2)).resolves.toBe('<html>page two</html>')
  })

  it('zero-pads page numbers so cache files sort in walk order on disk', async () => {
    await writeCachedRawHtml(cacheDir, 1, '<html>one</html>')

    const { readFile } = await import('node:fs/promises')
    await expect(readFile(join(cacheDir, 'raw', 'page-0001.html'), 'utf-8')).resolves.toBe(
      '<html>one</html>',
    )
  })

  it('returns null for a parsed page on a cache miss', async () => {
    await expect(readCachedParsedPage(cacheDir, 1)).resolves.toBeNull()
  })

  it('round-trips parsed, already-enriched posts through the cache', async () => {
    const posts = [post('https://forum.example/viewtopic.php?p=1')]
    await writeCachedParsedPage(cacheDir, 1, posts)

    await expect(readCachedParsedPage(cacheDir, 1)).resolves.toEqual(posts)
  })

  it('creates the cache directory on first write, without requiring it to pre-exist', async () => {
    const nestedCacheDir = join(cacheDir, 'does', 'not', 'exist', 'yet')

    await writeCachedRawHtml(nestedCacheDir, 1, '<html></html>')

    await expect(readCachedRawHtml(nestedCacheDir, 1)).resolves.toBe('<html></html>')
  })

  it('propagates a non-ENOENT read error rather than treating it as a cache miss', async () => {
    // Write a directory where a file is expected, forcing an EISDIR on read.
    const { mkdir } = await import('node:fs/promises')
    await mkdir(join(cacheDir, 'raw'), { recursive: true })
    await mkdir(join(cacheDir, 'raw', 'page-0001.html'), { recursive: true })

    await expect(readCachedRawHtml(cacheDir, 1)).rejects.toThrow()
  })
})
