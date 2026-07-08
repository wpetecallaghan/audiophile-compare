import { generateObject } from 'ai'
import { z } from 'zod'
import { detectProvider } from '@/lib/clips/detect-provider'
import { checkDirectUrl } from '@/lib/clips/check-url'
import type { ScrapedPost } from '../scrape/parse-thread-page'
import { validateIngestPayload, TUNE_METHOD_TECHNIQUE_NAME } from '../ingest-test-payload'
import { buildSourceRef } from './source-ref'
import type { Candidate, IssueCode } from './candidate'
import {
  type CandidateIndex,
  findOpenCandidateByPostUrl,
  findOpenCandidateByCreatorLabel,
  getAllCandidatesForCreator,
  getAllOpenCandidates,
  saveCandidate,
} from './candidate-index'

// build-history-ingestion.md step 35 decision 14 — Sonnet 5, one model
// throughout, via the AI Gateway using a plain provider/model string.
export const EXTRACTION_MODEL = 'anthropic/claude-sonnet-5'

// decision 14: technique_name is never part of the model's output schema —
// decision 11 hardcodes every vote to TUNE_METHOD_TECHNIQUE_NAME instead.
//
// The model describes *clips*, not pre-formed pairs — deterministic code
// (buildPairsFromGroup, below) decomposes a group into consecutive pairs.
// This was a real fix, not the original design: a first version had the
// model emit pairs directly with a flat, generic forum_labels: ['A','B']
// on every pair, which meant a creator's second (or third...) pair in the
// same post silently overwrote the first in candidate-index.ts's
// (creator, label) map — confirmed against two real posts in the trial
// sample (a 3-clip and a 5-clip chained comparison, both from a single
// creator). Describing real per-clip labels instead, and pairing them up
// in code, gives every pair its own genuinely distinguishing labels.
const ClipSchema = z.object({
  url: z.string(),
  forum_label: z
    .string()
    .describe(
      'How the creator refers to this specific clip — e.g. "A", "Brasso", "clip 2". If the post names ' +
        "nothing, use positional labels (A, B, C...) in the order the clips are presented.",
    ),
  description: z
    .string()
    .describe("What the post says about this clip's system state (e.g. 'with old DAC'). Short phrase."),
})

const ComparisonGroupSchema = z.object({
  clips: z
    .array(ClipSchema)
    .min(2)
    .describe(
      '2 or more clips being compared as one sequence about one track — 2 is a normal A/B pair; 3+ is a ' +
        'chained sequence (e.g. 5 clips exploring one variable at 5 settings, compared consecutively: ' +
        'clip 1 vs 2, 2 vs 3, 3 vs 4, 4 vs 5 — never mixed-and-matched across the whole set).',
    ),
  track_artist: z.string().optional().describe('Only if a real artist/track is genuinely named, not a nickname.'),
  track_title: z.string().optional().describe('Only if a real track title is genuinely named, not a nickname.'),
  track_name_is_confident: z
    .boolean()
    .describe(
      'False if track_artist/track_title are absent, or if what looks like a track name is really just a ' +
        'nickname/label to tell the clips apart (e.g. "Laa Laa", "Tinky Winky", "Po" are Teletubbies ' +
        'nicknames, not song titles) rather than a genuine song/artist reference.',
    ),
})

const RevealSchema = z.object({
  target_forum_label: z
    .string()
    .describe(
      'The single clip label this reveal is about (e.g. "A", "1153", or one specific clip like "2" from a ' +
        'chained sequence) — never a combined reference to two clips at once like "1/2" or "A vs B".',
    ),
  before_is_a: z.boolean().describe('True if this reveal says clip A was the "before" system state.'),
})

const VoteSchema = z.object({
  target_creator: z
    .string()
    .nullable()
    .describe(
      'The forum username of the test creator this vote is about, chosen from the OPEN_CANDIDATES context ' +
        'provided below — null if genuinely unclear which test this refers to.',
    ),
  target_forum_label: z
    .string()
    .nullable()
    .describe('The forum label mentioned (e.g. "A", "1153") — null if none was mentioned at all.'),
  chosen_label: z
    .enum(['A', 'B'])
    .nullable()
    .describe('Which of the OPEN_CANDIDATES clip pair (clip_a vs clip_b) this vote prefers, if determinable.'),
  observation: z.string().optional().describe('A short paraphrase of why, if the post explains its preference.'),
  other_description: z.string().optional().describe('Only set if the vote is genuinely "neither/no difference".'),
})

const PostClassificationSchema = z.object({
  role: z
    .enum(['test_defining', 'reveal', 'vote', 'irrelevant'])
    .describe(
      'test_defining: introduces one or more new A/B clip pairs to compare. reveal: discloses which system ' +
        'state (before/after) a clip pair actually was. vote: expresses a preference between an existing, ' +
        'currently-open clip pair. irrelevant: none of the above (most posts — general discussion, off-topic).',
    ),
  comparison_groups: z
    .array(ComparisonGroupSchema)
    .describe(
      'Only populated when role is test_defining. One entry per independent comparison in this post — ' +
        'almost always just one; more than one only when the post genuinely describes separate, unrelated ' +
        'comparisons (different tracks/topics), never for a single chained sequence (that is one group with ' +
        '3+ clips, not multiple groups).',
    ),
  reveals: z
    .array(RevealSchema)
    .describe('Only populated when role is reveal. One entry per pair this post reveals.'),
  vote: VoteSchema.nullable().describe('Only populated (non-null) when role is vote.'),
})

export type PostClassification = z.infer<typeof PostClassificationSchema>

const SYSTEM_PROMPT = `You analyze posts from a hi-fi audio forum thread where members post blind A/B \
comparisons of their own systems (e.g. "before vs after a component change") and other members vote on \
which clip they prefer, without knowing which is which. All listeners use a single agreed evaluation \
method called the "Tune Method" for every vote — never mention or invent a different technique.

Forum labels distinguishing clips are arbitrary per post — sometimes letters (A/B, X/Y), sometimes bare \
numbers (e.g. "1153" vs "1155", often file/recording numbers), sometimes descriptive names the creator \
invents (e.g. "Brasso"/"Brassic"/"Air" for different materials). Treat a bare number exactly like a letter \
label. Most posts describe exactly 2 clips — a normal pair. Occasionally a post describes 3 or more clips \
exploring one variable at several settings of the same track (e.g. 5 clips at 5 different temperatures) — \
that is a single chained sequence, one comparison group with all its clips listed in the order presented, \
never several separate groups and never mixed-and-matched out of order.

Track identification is frequently impossible from the post text alone — creators often just give clips \
nicknames to tell them apart (e.g. Teletubbies characters "Laa Laa"/"Tinky Winky"/"Po") rather than naming \
the actual song. Only set track_artist/track_title, and mark track_name_is_confident true, when the post \
genuinely names a real song/artist — otherwise leave them unset and mark not confident. A wrong-but-confident \
guess is worse than admitting the track is unidentified.

A reveal post discloses which clip (A or B) was actually the "before" system state — it does not itself \
name a track, describe a system change, or introduce new clips.

A vote post is often just casual personal preference ("more musical", "more engaging") with no explicit \
mention of the Tune Method or any technical framing at all — that's still a valid vote.`

function candidateSummary(candidate: Candidate): string {
  const creator = candidate.payload.author?.forum_username ?? 'unknown'
  const labels = candidate.forum_labels.join('/')
  const track = candidate.payload.track ? `${candidate.payload.track.artist} – ${candidate.payload.track.title}` : 'unidentified'
  return `- creator=${creator} source_ref=${candidate.payload.source_ref} forum_labels=${labels} track=${track}`
}

function buildPrompt(post: ScrapedPost, index: CandidateIndex): string {
  const quotedCandidate = post.quoted_post_url
    ? findOpenCandidateByPostUrl(index, post.quoted_post_url)
    : null

  const ownHistory = getAllCandidatesForCreator(index, post.author)
  const openCandidates = quotedCandidate ? [quotedCandidate] : getAllOpenCandidates(index)

  const links = post.links.length
    ? post.links.map((l) => `  - ${l.url}${l.oembed_title ? ` ("${l.oembed_title}" by ${l.oembed_author ?? 'unknown'})` : ''}`).join('\n')
    : '  (none)'

  return `POST
author: ${post.author}
posted_at: ${post.posted_at}
quoted_post_url: ${post.quoted_post_url ?? '(none)'}
links:
${links}
body:
${post.body_markdown}

AUTHOR_OWN_HISTORY (this post's own author's prior candidates, for continuity — may be empty)
${ownHistory.length ? ownHistory.map(candidateSummary).join('\n') : '(none)'}

OPEN_CANDIDATES (currently-open tests thread-wide — only relevant if this post is a reveal or vote)
${openCandidates.length ? openCandidates.map(candidateSummary).join('\n') : '(none)'}`
}

async function classifyPost(post: ScrapedPost, index: CandidateIndex): Promise<PostClassification> {
  const { object } = await generateObject({
    model: EXTRACTION_MODEL,
    schema: PostClassificationSchema,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(post, index),
  })
  return object
}

// decision 12: precisely mirrors POST /api/clips/verify's real branch —
// only a `direct` link gets a real network check; every other provider is
// trusted by URL shape alone. Returns the dead-or-not verdict only; zero
// new clip-validation logic.
async function isClipDead(url: string): Promise<boolean> {
  const detected = detectProvider(url)
  if (detected.provider !== 'direct') return false
  const checked = await checkDirectUrl(detected)
  return checked.url_status === 'dead'
}

function emptyCandidate(createdAt: string): Candidate {
  return {
    created_at: createdAt,
    payload: {},
    issues: [],
    contributing_posts: [],
    forum_labels: [],
  }
}

function addContributingPost(candidate: Candidate, postUrl: string): void {
  if (postUrl && !candidate.contributing_posts.includes(postUrl)) {
    candidate.contributing_posts.push(postUrl)
  }
}

function addIssue(candidate: Candidate, issue: IssueCode): void {
  if (!candidate.issues.includes(issue)) candidate.issues.push(issue)
}

// decision 13: reuse the real validateIngestPayload rather than a
// re-described equivalent; a candidate is only ever `ready` when it
// passes. Failures record 'invalid_payload' in issues and the real error
// string in notes, never mixed into issues itself (decision 1).
//
// Not yet being revealed is *not* an issue (decision 6) — before_is_a is
// legitimately absent for most of a candidate's life, so validation (which
// requires it) only ever runs once a reveal has actually arrived; before
// that, an otherwise-clean candidate is just `pending`, not flagged.
function statusForCandidate(candidate: Candidate): 'pending' | 'needs_review' | 'ready' {
  if (candidate.issues.length > 0) return 'needs_review'
  if (typeof candidate.payload.before_is_a !== 'boolean') return 'pending'

  const result = validateIngestPayload(candidate.payload, [TUNE_METHOD_TECHNIQUE_NAME])
  if (result.valid) return 'ready'

  addIssue(candidate, 'invalid_payload')
  candidate.notes = [...(candidate.notes ?? []), result.error]
  return 'needs_review'
}

type Clip = z.infer<typeof ClipSchema>
type DecomposedPair = {
  clipA: Clip
  clipB: Clip
  track_artist?: string
  track_title?: string
  track_name_is_confident: boolean
}

// Decomposes every comparison group into consecutive pairs — clip[0]-vs-
// clip[1], clip[1]-vs-clip[2], etc. A normal 2-clip group produces exactly
// one pair; a chained N-clip group (N > 2) produces N-1 pairs, each
// sharing the group's track info but carrying its own two clips' real
// labels — never a flat, generic ['A','B'] repeated across every pair,
// which is what caused two different pairs from the same creator to
// collide in candidate-index.ts's (creator, label) map (found during
// decision 15's trial run against real data: a 3-clip and a 5-clip post).
function buildPairsFromGroups(groups: PostClassification['comparison_groups']): DecomposedPair[] {
  const pairs: DecomposedPair[] = []
  for (const group of groups) {
    for (let i = 0; i < group.clips.length - 1; i++) {
      pairs.push({
        clipA: group.clips[i],
        clipB: group.clips[i + 1],
        track_artist: group.track_artist,
        track_title: group.track_title,
        track_name_is_confident: group.track_name_is_confident,
      })
    }
  }
  return pairs
}

async function applyTestDefining(
  threadRef: string,
  post: ScrapedPost,
  classification: PostClassification,
  index: CandidateIndex,
  baseDir: string,
): Promise<void> {
  const pairs = buildPairsFromGroups(classification.comparison_groups)

  for (const [i, pair] of pairs.entries()) {
    const pairIndex = i + 1
    const { sourceRef, unresolvable } = buildSourceRef(threadRef, post, pairIndex)

    const candidate = emptyCandidate(post.posted_at)
    if (!post.posted_at) addIssue(candidate, 'missing_timestamp')
    if (unresolvable) addIssue(candidate, 'unresolvable_post_id')

    const creatorSystemName = `${post.author}'s system`
    const [clipADead, clipBDead] = await Promise.all([
      isClipDead(pair.clipA.url),
      isClipDead(pair.clipB.url),
    ])
    if (clipADead || clipBDead) addIssue(candidate, 'dead_clip_url')

    const track = pair.track_name_is_confident && pair.track_artist && pair.track_title
      ? { artist: pair.track_artist, title: pair.track_title }
      : (() => {
          addIssue(candidate, 'unidentified_track')
          return { artist: 'Unidentified', title: `Unidentified passage — ${sourceRef}` }
        })()

    candidate.payload = {
      source_ref: sourceRef,
      source_url: post.post_url || undefined,
      author: { forum_username: post.author },
      track,
      snapshot_a: { system_name: creatorSystemName, version_label: pair.clipA.description || 'Unlabeled state A' },
      snapshot_b: { system_name: creatorSystemName, version_label: pair.clipB.description || 'Unlabeled state B' },
      clip_a_url: pair.clipA.url,
      clip_b_url: pair.clipB.url,
    }
    candidate.forum_labels = [pair.clipA.forum_label, pair.clipB.forum_label]
    addContributingPost(candidate, post.post_url)

    await saveCandidate(index, baseDir, statusForCandidate(candidate), candidate)
  }
}

async function applyReveal(
  post: ScrapedPost,
  classification: PostClassification,
  index: CandidateIndex,
  baseDir: string,
): Promise<void> {
  for (const reveal of classification.reveals) {
    const target =
      (post.quoted_post_url && findOpenCandidateByPostUrl(index, post.quoted_post_url)) ||
      findOpenCandidateByCreatorLabel(index, post.author, reveal.target_forum_label)

    if (!target) {
      console.warn(`extract-post: reveal in ${post.post_url} matched no open candidate — skipped`)
      continue
    }

    target.payload.before_is_a = reveal.before_is_a
    addContributingPost(target, post.post_url)

    await saveCandidate(index, baseDir, statusForCandidate(target), target)
  }
}

async function applyVote(
  post: ScrapedPost,
  classification: PostClassification,
  index: CandidateIndex,
  baseDir: string,
): Promise<void> {
  const vote = classification.vote
  if (!vote || !vote.chosen_label) return

  const target =
    (post.quoted_post_url && findOpenCandidateByPostUrl(index, post.quoted_post_url)) ||
    (vote.target_creator && vote.target_forum_label
      ? findOpenCandidateByCreatorLabel(index, vote.target_creator, vote.target_forum_label)
      : null)

  if (!target) {
    console.warn(`extract-post: vote in ${post.post_url} matched no open candidate — skipped`)
    return
  }

  const votes = target.payload.votes ?? []
  // decision 9: resolve to the final vote per voter, replacing any earlier
  // one from the same forum_username rather than appending a duplicate.
  const withoutThisVoter = votes.filter((v) => v.voter.forum_username !== post.author)
  target.payload.votes = [
    ...withoutThisVoter,
    {
      voter: { forum_username: post.author },
      chosen_label: vote.chosen_label,
      technique_name: TUNE_METHOD_TECHNIQUE_NAME,
      observation: vote.observation,
      other_description: vote.other_description,
    },
  ]
  addContributingPost(target, post.post_url)

  await saveCandidate(index, baseDir, statusForCandidate(target), target)
}

// Processes a single post: classifies it via generateObject, then applies
// the result deterministically (decisions 6-13, 16). Assumes the caller
// has already decided this post needs processing at all (decision 16's
// skip-set check happens in the walk, not here).
export async function extractPost(
  threadRef: string,
  post: ScrapedPost,
  index: CandidateIndex,
  baseDir: string,
): Promise<void> {
  const classification = await classifyPost(post, index)

  if (classification.role === 'test_defining') {
    await applyTestDefining(threadRef, post, classification, index, baseDir)
  } else if (classification.role === 'reveal') {
    await applyReveal(post, classification, index, baseDir)
  } else if (classification.role === 'vote') {
    await applyVote(post, classification, index, baseDir)
  }
  // 'irrelevant': no candidate to attach this post to, so it's never
  // recorded in any contributing_posts — decision 16's skip-set can only
  // ever cover posts that contributed to a candidate. An irrelevant post
  // is reprocessed (re-classified) on every future run; this is an
  // inherent consequence of "the candidate files are the only checkpoint,
  // no separate log" (decision 16), not a bug — flagged as a known
  // limitation, not solved here.
}
