// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm as rmDir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateObject } from 'ai'
import { checkDirectUrl } from '@/lib/clips/check-url'
import { extractPost, type PostClassification } from '../extract-post'
import { buildCandidateIndex, saveCandidate } from '../candidate-index'
import { TUNE_METHOD_TECHNIQUE_NAME } from '../../ingest-test-payload'
import type { ScrapedPost } from '../../scrape/parse-thread-page'
import type { Candidate } from '../candidate'

vi.mock('ai', () => ({ generateObject: vi.fn() }))
vi.mock('@/lib/clips/check-url', () => ({ checkDirectUrl: vi.fn() }))

const THREAD_REF = 'lejonklou-forum:thread-3233'
const YOUTUBE_A = 'https://www.youtube.com/watch?v=aaaaaaaaaaa'
const YOUTUBE_B = 'https://www.youtube.com/watch?v=bbbbbbbbbbb'

function post(overrides: Partial<ScrapedPost> = {}): ScrapedPost {
  return {
    post_url: 'https://www.lejonklou.com/forum/viewtopic.php?p=72033#p72033',
    author: 'Charlie1',
    posted_at: '2024-01-01T00:00:00Z',
    body_markdown: 'A vs B, new DAC.',
    quoted_post_url: null,
    // clip-health.ts's isRealPostLink requires a clip URL to actually be
    // one of the post's own real links — most test-defining tests use
    // these two, so they're covered by default; tests exercising other
    // clip URLs override this.
    links: [{ url: YOUTUBE_A }, { url: YOUTUBE_B }],
    ...overrides,
  }
}

function classification(overrides: Partial<PostClassification> = {}): PostClassification {
  return {
    role: 'irrelevant',
    comparison_groups: [],
    reveals: [],
    vote: null,
    ...overrides,
  }
}

function clip(url: string, forumLabel: string, description = ''): {
  url: string
  forum_label: string
  description: string
} {
  return { url, forum_label: forumLabel, description }
}

function mockClassification(result: PostClassification): void {
  vi.mocked(generateObject).mockResolvedValue({ object: result } as never)
}

describe('extractPost', () => {
  let baseDir: string

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'extract-post-test-'))
    vi.mocked(checkDirectUrl).mockReset()
  })

  afterEach(async () => {
    await rmDir(baseDir, { recursive: true, force: true })
  })

  describe('test-defining posts', () => {
    it('creates a new pending candidate with a confidently-identified track', async () => {
      mockClassification(
        classification({
          role: 'test_defining',
          comparison_groups: [
            {
              clips: [clip(YOUTUBE_A, 'A', 'old DAC'), clip(YOUTUBE_B, 'B', 'new DAC')],
              track_artist: 'Diana Krall',
              track_title: 'The Look of Love',
              track_name_is_confident: true,
            },
          ],
        }),
      )

      const index = await buildCandidateIndex(baseDir)
      await extractPost(THREAD_REF, post(), index, baseDir)

      const sourceRef = `${THREAD_REF}:post-72033:pair-1`
      const entry = index.candidatesByRef.get(sourceRef)
      expect(entry?.status).toBe('pending') // no before_is_a yet, so never ready
      expect(entry?.candidate.payload.track).toEqual({
        artist: 'Diana Krall',
        title: 'The Look of Love',
      })
      expect(entry?.candidate.payload.author).toEqual({ forum_username: 'Charlie1' })
      expect(entry?.candidate.payload.snapshot_a).toEqual({
        system_name: "Charlie1's system",
        version_label: 'old DAC',
      })
      expect(entry?.candidate.forum_labels).toEqual(['A', 'B'])
      expect(entry?.candidate.contributing_posts).toContain(post().post_url)
      expect(entry?.candidate.issues).toEqual([])
    })

    it('flags unidentified_track and uses a per-source_ref-unique placeholder when the track is not confident', async () => {
      mockClassification(
        classification({
          role: 'test_defining',
          comparison_groups: [
            {
              clips: [clip(YOUTUBE_A, 'A', 'Laa Laa'), clip(YOUTUBE_B, 'B', 'Tinky Winky')],
              track_name_is_confident: false,
            },
          ],
        }),
      )

      const index = await buildCandidateIndex(baseDir)
      await extractPost(THREAD_REF, post(), index, baseDir)

      const sourceRef = `${THREAD_REF}:post-72033:pair-1`
      const candidate = index.candidatesByRef.get(sourceRef)?.candidate
      expect(candidate?.issues).toContain('unidentified_track')
      expect(candidate?.payload.track?.artist).toBe('Unidentified')
      expect(candidate?.payload.track?.title).toBe(`Unidentified passage — ${sourceRef}`)
    })

    it('flags dead_clip_url when a direct link fails its health check', async () => {
      vi.mocked(checkDirectUrl).mockResolvedValue({
        url_status: 'dead',
        media_type: 'audio',
        duration_ms: null,
      })
      mockClassification(
        classification({
          role: 'test_defining',
          comparison_groups: [
            {
              clips: [clip('https://example.com/a.mp3', 'A'), clip(YOUTUBE_B, 'B')],
              track_name_is_confident: false,
            },
          ],
        }),
      )

      const index = await buildCandidateIndex(baseDir)
      await extractPost(
        THREAD_REF,
        post({ links: [{ url: 'https://example.com/a.mp3' }, { url: YOUTUBE_B }] }),
        index,
        baseDir,
      )

      const sourceRef = `${THREAD_REF}:post-72033:pair-1`
      expect(index.candidatesByRef.get(sourceRef)?.candidate.issues).toContain('dead_clip_url')
      // A fatal clip issue routes straight to broken, not needs_review —
      // there's nothing a human can fix here by editing the file.
      expect(index.candidatesByRef.get(sourceRef)?.status).toBe('broken')
    })

    it('flags missing_clip_url when a comparison group clip URL is empty', async () => {
      mockClassification(
        classification({
          role: 'test_defining',
          comparison_groups: [
            {
              clips: [clip('', 'A'), clip(YOUTUBE_B, 'B')],
              track_name_is_confident: false,
            },
          ],
        }),
      )

      const index = await buildCandidateIndex(baseDir)
      await extractPost(THREAD_REF, post(), index, baseDir)

      const sourceRef = `${THREAD_REF}:post-72033:pair-1`
      expect(index.candidatesByRef.get(sourceRef)?.candidate.issues).toContain('missing_clip_url')
      expect(index.candidatesByRef.get(sourceRef)?.status).toBe('broken')
    })

    it('flags missing_clip_url when a clip URL is not actually one of the post\'s own links (a model error)', async () => {
      mockClassification(
        classification({
          role: 'test_defining',
          comparison_groups: [
            {
              clips: [clip('https://example.com/fabricated.mp3', 'A'), clip(YOUTUBE_B, 'B')],
              track_name_is_confident: false,
            },
          ],
        }),
      )

      const index = await buildCandidateIndex(baseDir)
      // post()'s default links don't include the fabricated URL.
      await extractPost(THREAD_REF, post(), index, baseDir)

      const sourceRef = `${THREAD_REF}:post-72033:pair-1`
      expect(index.candidatesByRef.get(sourceRef)?.candidate.issues).toContain('missing_clip_url')
      expect(checkDirectUrl).not.toHaveBeenCalled()
    })

    it('flags unplayable_clip_url when a link is reachable but not playable media (e.g. a Dropbox/Photos/iCloud page)', async () => {
      const pageUrl = 'https://www.dropbox.com/scl/fi/abc/clip.mov?rlkey=xyz&dl=0'
      vi.mocked(checkDirectUrl).mockResolvedValue({
        url_status: 'ok',
        media_type: 'unknown',
        duration_ms: null,
      })
      mockClassification(
        classification({
          role: 'test_defining',
          comparison_groups: [
            {
              clips: [clip(pageUrl, 'A'), clip(YOUTUBE_B, 'B')],
              track_name_is_confident: false,
            },
          ],
        }),
      )

      const index = await buildCandidateIndex(baseDir)
      await extractPost(THREAD_REF, post({ links: [{ url: pageUrl }, { url: YOUTUBE_B }] }), index, baseDir)

      const sourceRef = `${THREAD_REF}:post-72033:pair-1`
      expect(index.candidatesByRef.get(sourceRef)?.candidate.issues).toContain('unplayable_clip_url')
      expect(index.candidatesByRef.get(sourceRef)?.status).toBe('broken')
    })

    it('flags unverifiable_clip_url (and needs_review, not broken) for a google-drive link — an anonymous request can\'t tell a dead Drive file from a healthy one', async () => {
      const driveUrl = 'https://drive.google.com/file/d/abc123/view?usp=sharing'
      mockClassification(
        classification({
          role: 'test_defining',
          comparison_groups: [
            {
              clips: [clip(driveUrl, 'A'), clip(YOUTUBE_B, 'B')],
              track_name_is_confident: false,
            },
          ],
        }),
      )

      const index = await buildCandidateIndex(baseDir)
      await extractPost(THREAD_REF, post({ links: [{ url: driveUrl }, { url: YOUTUBE_B }] }), index, baseDir)

      const sourceRef = `${THREAD_REF}:post-72033:pair-1`
      expect(index.candidatesByRef.get(sourceRef)?.candidate.issues).toContain('unverifiable_clip_url')
      expect(index.candidatesByRef.get(sourceRef)?.status).toBe('needs_review')
      expect(checkDirectUrl).not.toHaveBeenCalled()
    })

    it('never calls checkDirectUrl for a youtube/vimeo link — trusted by URL shape only', async () => {
      mockClassification(
        classification({
          role: 'test_defining',
          comparison_groups: [
            { clips: [clip(YOUTUBE_A, 'A'), clip(YOUTUBE_B, 'B')], track_name_is_confident: false },
          ],
        }),
      )

      const index = await buildCandidateIndex(baseDir)
      await extractPost(THREAD_REF, post(), index, baseDir)

      expect(checkDirectUrl).not.toHaveBeenCalled()
    })

    it('flags missing_timestamp when the post itself has no resolvable posted_at', async () => {
      mockClassification(
        classification({
          role: 'test_defining',
          comparison_groups: [
            { clips: [clip(YOUTUBE_A, 'A'), clip(YOUTUBE_B, 'B')], track_name_is_confident: false },
          ],
        }),
      )

      const index = await buildCandidateIndex(baseDir)
      await extractPost(THREAD_REF, post({ posted_at: '' }), index, baseDir)

      const sourceRef = `${THREAD_REF}:post-72033:pair-1`
      const entry = index.candidatesByRef.get(sourceRef)
      expect(entry?.candidate.issues).toContain('missing_timestamp')
      expect(entry?.status).toBe('needs_review')
    })

    it('flags unresolvable_post_id and uses a content-hash key when post_url is empty', async () => {
      mockClassification(
        classification({
          role: 'test_defining',
          comparison_groups: [
            { clips: [clip(YOUTUBE_A, 'A'), clip(YOUTUBE_B, 'B')], track_name_is_confident: false },
          ],
        }),
      )

      const index = await buildCandidateIndex(baseDir)
      await extractPost(THREAD_REF, post({ post_url: '' }), index, baseDir)

      const [sourceRef] = [...index.candidatesByRef.keys()]
      expect(sourceRef).toMatch(new RegExp(`^${THREAD_REF}:unresolvable-[0-9a-f]{12}:pair-1$`))
      expect(index.candidatesByRef.get(sourceRef)?.candidate.issues).toContain('unresolvable_post_id')
    })

    it('creates one candidate per pair when a post describes multiple independent groups', async () => {
      mockClassification(
        classification({
          role: 'test_defining',
          comparison_groups: [
            { clips: [clip(YOUTUBE_A, 'A', 'A1'), clip(YOUTUBE_B, 'B', 'B1')], track_name_is_confident: false },
            { clips: [clip(YOUTUBE_A, 'X', 'A2'), clip(YOUTUBE_B, 'Y', 'B2')], track_name_is_confident: false },
          ],
        }),
      )

      const index = await buildCandidateIndex(baseDir)
      await extractPost(THREAD_REF, post(), index, baseDir)

      expect(index.candidatesByRef.has(`${THREAD_REF}:post-72033:pair-1`)).toBe(true)
      expect(index.candidatesByRef.has(`${THREAD_REF}:post-72033:pair-2`)).toBe(true)
    })

    it('decomposes a chained multi-clip group into consecutive pairs with distinguishing labels, not a flat A/B', async () => {
      // These photos.app.goo.gl-style links are real-world examples
      // (decision 15's trial run) that detectProvider classifies as
      // 'direct' — give them a healthy, real-media check so this test
      // stays focused on label decomposition, not clip-health (covered
      // separately below).
      vi.mocked(checkDirectUrl).mockResolvedValue({ url_status: 'ok', media_type: 'video', duration_ms: null })
      const clipUrls = [
        'https://photos.app.goo.gl/1',
        'https://photos.app.goo.gl/2',
        'https://photos.app.goo.gl/3',
      ]
      mockClassification(
        classification({
          role: 'test_defining',
          comparison_groups: [
            {
              clips: [
                clip(clipUrls[0], 'Brasso', 'brass footers'),
                clip(clipUrls[1], 'Brassic', 'brass-steel footers'),
                clip(clipUrls[2], 'Air', 'no footers'),
              ],
              track_name_is_confident: false,
            },
          ],
        }),
      )

      const index = await buildCandidateIndex(baseDir)
      await extractPost(THREAD_REF, post({ links: clipUrls.map((url) => ({ url })) }), index, baseDir)

      const pair1 = index.candidatesByRef.get(`${THREAD_REF}:post-72033:pair-1`)?.candidate
      const pair2 = index.candidatesByRef.get(`${THREAD_REF}:post-72033:pair-2`)?.candidate
      expect(pair1?.forum_labels).toEqual(['Brasso', 'Brassic'])
      expect(pair2?.forum_labels).toEqual(['Brassic', 'Air'])
      expect(pair1?.payload.clip_a_url).toBe('https://photos.app.goo.gl/1')
      expect(pair1?.payload.clip_b_url).toBe('https://photos.app.goo.gl/2')
      expect(pair2?.payload.clip_a_url).toBe('https://photos.app.goo.gl/2')
      expect(pair2?.payload.clip_b_url).toBe('https://photos.app.goo.gl/3')
      // The (creator, label) index must resolve each pair independently —
      // this is the exact collision found during decision 15's trial run.
      const { findOpenCandidateByCreatorLabel } = await import('../candidate-index')
      expect(findOpenCandidateByCreatorLabel(index, 'Charlie1', 'Brasso')?.payload.source_ref).toBe(
        pair1?.payload.source_ref,
      )
      expect(findOpenCandidateByCreatorLabel(index, 'Charlie1', 'Air')?.payload.source_ref).toBe(
        pair2?.payload.source_ref,
      )
    })
  })

  describe('reveal posts', () => {
    async function seedOpenCandidate(sourceRef: string, creator: string) {
      const index = await buildCandidateIndex(baseDir)
      const candidate: Candidate = {
        created_at: '2024-01-01T00:00:00Z',
        payload: {
          source_ref: sourceRef,
          author: { forum_username: creator },
          track: { artist: 'A', title: 'B' },
          snapshot_a: { system_name: `${creator}'s system`, version_label: 'old' },
          snapshot_b: { system_name: `${creator}'s system`, version_label: 'new' },
          clip_a_url: YOUTUBE_A,
          clip_b_url: YOUTUBE_B,
        },
        issues: [],
        contributing_posts: ['https://forum.example/source-post'],
        forum_labels: ['A', 'B'],
      }
      await saveCandidate(index, baseDir, 'pending', candidate)
      return index
    }

    it('closes the matching candidate via quoted_post_url and sets before_is_a', async () => {
      const sourceRef = `${THREAD_REF}:post-1:pair-1`
      const index = await seedOpenCandidate(sourceRef, 'Charlie1')

      mockClassification(
        classification({
          role: 'reveal',
          reveals: [{ target_forum_label: 'A', before_is_a: true }],
        }),
      )

      await extractPost(
        THREAD_REF,
        post({
          post_url: 'https://www.lejonklou.com/forum/viewtopic.php?p=99999#p99999',
          quoted_post_url: 'https://forum.example/source-post',
        }),
        index,
        baseDir,
      )

      const entry = index.candidatesByRef.get(sourceRef)
      expect(entry?.candidate.payload.before_is_a).toBe(true)
      expect(entry?.status).toBe('ready')
    })

    it('falls back to creator+label matching when there is no quote', async () => {
      const sourceRef = `${THREAD_REF}:post-1:pair-1`
      const index = await seedOpenCandidate(sourceRef, 'Charlie1')

      mockClassification(
        classification({
          role: 'reveal',
          reveals: [{ target_forum_label: 'B', before_is_a: false }],
        }),
      )

      await extractPost(THREAD_REF, post({ author: 'Charlie1', quoted_post_url: null }), index, baseDir)

      expect(index.candidatesByRef.get(sourceRef)?.candidate.payload.before_is_a).toBe(false)
    })

    it('closes the candidate to further matching — it no longer resolves as open', async () => {
      const sourceRef = `${THREAD_REF}:post-1:pair-1`
      const index = await seedOpenCandidate(sourceRef, 'Charlie1')

      mockClassification(
        classification({ role: 'reveal', reveals: [{ target_forum_label: 'A', before_is_a: true }] }),
      )
      await extractPost(
        THREAD_REF,
        post({ quoted_post_url: 'https://forum.example/source-post' }),
        index,
        baseDir,
      )

      const { findOpenCandidateByCreatorLabel } = await import('../candidate-index')
      expect(findOpenCandidateByCreatorLabel(index, 'Charlie1', 'A')).toBeNull()
    })

    it('is a no-op (with a warning) when no open candidate matches', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const index = await buildCandidateIndex(baseDir)

      mockClassification(
        classification({ role: 'reveal', reveals: [{ target_forum_label: 'A', before_is_a: true }] }),
      )
      await extractPost(THREAD_REF, post(), index, baseDir)

      expect(index.candidatesByRef.size).toBe(0)
      expect(warn).toHaveBeenCalled()
      warn.mockRestore()
    })
  })

  describe('vote posts', () => {
    // Deliberately no before_is_a here — a vote is only ever attributable
    // to a still-open (not yet revealed) candidate (decision 10); a
    // revealed candidate is closed to further matching.
    async function seedOpenCandidate(sourceRef: string, creator: string) {
      const index = await buildCandidateIndex(baseDir)
      const candidate: Candidate = {
        created_at: '2024-01-01T00:00:00Z',
        payload: {
          source_ref: sourceRef,
          author: { forum_username: creator },
          track: { artist: 'A', title: 'B' },
          snapshot_a: { system_name: `${creator}'s system`, version_label: 'old' },
          snapshot_b: { system_name: `${creator}'s system`, version_label: 'new' },
          clip_a_url: YOUTUBE_A,
          clip_b_url: YOUTUBE_B,
        },
        issues: [],
        contributing_posts: ['https://forum.example/source-post'],
        forum_labels: ['A', 'B'],
      }
      await saveCandidate(index, baseDir, 'pending', candidate)
      return index
    }

    it('records a vote against the candidate found via quoted_post_url', async () => {
      const sourceRef = `${THREAD_REF}:post-1:pair-1`
      const index = await seedOpenCandidate(sourceRef, 'Charlie1')

      mockClassification(
        classification({
          role: 'vote',
          vote: { target_creator: null, target_forum_label: null, chosen_label: 'A', observation: 'warmer' },
        }),
      )

      await extractPost(
        THREAD_REF,
        post({ author: 'AnotherListener', quoted_post_url: 'https://forum.example/source-post' }),
        index,
        baseDir,
      )

      const votes = index.candidatesByRef.get(sourceRef)?.candidate.payload.votes
      expect(votes).toEqual([
        {
          voter: { forum_username: 'AnotherListener' },
          chosen_label: 'A',
          technique_name: TUNE_METHOD_TECHNIQUE_NAME,
          observation: 'warmer',
          other_description: undefined,
        },
      ])
      // A vote alone never completes a candidate — before_is_a still isn't
      // set (that only comes from a reveal), so it stays pending.
      expect(index.candidatesByRef.get(sourceRef)?.status).toBe('pending')
    })

    it('records a vote found via creator+label fallback when there is no quote', async () => {
      const sourceRef = `${THREAD_REF}:post-1:pair-1`
      const index = await seedOpenCandidate(sourceRef, 'Charlie1')

      mockClassification(
        classification({
          role: 'vote',
          vote: { target_creator: 'Charlie1', target_forum_label: 'A', chosen_label: 'B' },
        }),
      )

      await extractPost(THREAD_REF, post({ author: 'AnotherListener', quoted_post_url: null }), index, baseDir)

      expect(index.candidatesByRef.get(sourceRef)?.candidate.payload.votes?.[0].chosen_label).toBe('B')
    })

    it('replaces an earlier vote from the same voter rather than appending a duplicate (decision 9)', async () => {
      const sourceRef = `${THREAD_REF}:post-1:pair-1`
      const index = await seedOpenCandidate(sourceRef, 'Charlie1')

      mockClassification(
        classification({
          role: 'vote',
          vote: { target_creator: null, target_forum_label: null, chosen_label: 'A' },
        }),
      )
      await extractPost(
        THREAD_REF,
        post({ author: 'AnotherListener', quoted_post_url: 'https://forum.example/source-post' }),
        index,
        baseDir,
      )

      mockClassification(
        classification({
          role: 'vote',
          vote: { target_creator: null, target_forum_label: null, chosen_label: 'B' },
        }),
      )
      await extractPost(
        THREAD_REF,
        post({
          post_url: 'https://www.lejonklou.com/forum/viewtopic.php?p=88888#p88888',
          author: 'AnotherListener',
          quoted_post_url: 'https://forum.example/source-post',
        }),
        index,
        baseDir,
      )

      const votes = index.candidatesByRef.get(sourceRef)?.candidate.payload.votes
      expect(votes).toHaveLength(1)
      expect(votes?.[0].chosen_label).toBe('B')
    })

    it('is a no-op when chosen_label is null (attribution not determinable)', async () => {
      const sourceRef = `${THREAD_REF}:post-1:pair-1`
      const index = await seedOpenCandidate(sourceRef, 'Charlie1')

      mockClassification(
        classification({
          role: 'vote',
          vote: { target_creator: null, target_forum_label: null, chosen_label: null },
        }),
      )
      await extractPost(
        THREAD_REF,
        post({ quoted_post_url: 'https://forum.example/source-post' }),
        index,
        baseDir,
      )

      expect(index.candidatesByRef.get(sourceRef)?.candidate.payload.votes ?? []).toHaveLength(0)
    })

    it('is a no-op (with a warning) when no open candidate matches', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const index = await buildCandidateIndex(baseDir)

      mockClassification(
        classification({
          role: 'vote',
          vote: { target_creator: 'NoSuchCreator', target_forum_label: 'A', chosen_label: 'A' },
        }),
      )
      await extractPost(THREAD_REF, post(), index, baseDir)

      expect(warn).toHaveBeenCalled()
      warn.mockRestore()
    })
  })

  describe('irrelevant posts', () => {
    it('creates or modifies no candidate at all', async () => {
      mockClassification(classification({ role: 'irrelevant' }))

      const index = await buildCandidateIndex(baseDir)
      await extractPost(THREAD_REF, post(), index, baseDir)

      expect(index.candidatesByRef.size).toBe(0)
    })
  })
})
