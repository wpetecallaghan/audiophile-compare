// Raw row shape returned by the Supabase votes query.
// The `technique` and `voter` joins may each arrive as an array (Supabase
// behaviour for foreign key joins) — both forms are handled inside
// computeTally.
export type RawVoteRow = {
  chosen_clip_id: string
  other_description: string | null
  observation: string | null
  technique:
    | { id: string; name: string; is_other: boolean; sort_order: number }
    | { id: string; name: string; is_other: boolean; sort_order: number }[]
  voter:
    | { display_name: string | null }
    | { display_name: string | null }[]
    | null
}

export type CuratedObservation = {
  chosenClipId: string
  observation: string
  voterName: string | null
}

export type CuratedResult = {
  techniqueId: string
  techniqueName: string
  sortOrder: number
  clipAVotes: number
  clipBVotes: number
  total: number
  /** null when tied or no votes */
  winnerClipId: string | null
  clipAPercent: number
  clipBPercent: number
  observations: CuratedObservation[]
}

export type OtherVote = {
  chosenClipId: string
  description: string
  observation: string | null
  voterName: string | null
}

export type TallyResult = {
  curated: CuratedResult[]
  others: OtherVote[]
  /**
   * True when at least two curated techniques with a clear winner
   * disagree — one prefers clip A and another prefers clip B.
   */
  divergent: boolean
}

export function computeTally(
  votes: RawVoteRow[],
  clipAId: string,
  clipBId: string,
): TallyResult {
  const curatedMap = new Map<
    string,
    {
      id: string
      name: string
      sortOrder: number
      a: number
      b: number
      observations: CuratedObservation[]
    }
  >()
  const others: OtherVote[] = []

  for (const vote of votes) {
    const tech = Array.isArray(vote.technique)
      ? vote.technique[0]
      : vote.technique
    if (!tech) continue

    const voter = Array.isArray(vote.voter) ? vote.voter[0] : vote.voter
    const voterName = voter?.display_name ?? null

    if (tech.is_other) {
      others.push({
        chosenClipId: vote.chosen_clip_id,
        description: vote.other_description ?? '',
        observation: vote.observation,
        voterName,
      })
    } else {
      const entry = curatedMap.get(tech.id) ?? {
        id: tech.id,
        name: tech.name,
        sortOrder: tech.sort_order,
        a: 0,
        b: 0,
        observations: [],
      }
      if (vote.chosen_clip_id === clipAId) {
        entry.a++
      } else if (vote.chosen_clip_id === clipBId) {
        entry.b++
      }
      if (vote.observation) {
        entry.observations.push({
          chosenClipId: vote.chosen_clip_id,
          observation: vote.observation,
          voterName,
        })
      }
      curatedMap.set(tech.id, entry)
    }
  }

  const curated: CuratedResult[] = Array.from(curatedMap.values())
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(entry => {
      const total = entry.a + entry.b
      const clipAPercent =
        total === 0 ? 0 : Math.round((entry.a / total) * 100)
      const clipBPercent = total === 0 ? 0 : 100 - clipAPercent
      let winnerClipId: string | null = null
      if (total > 0) {
        if (entry.a > entry.b) winnerClipId = clipAId
        else if (entry.b > entry.a) winnerClipId = clipBId
      }
      return {
        techniqueId: entry.id,
        techniqueName: entry.name,
        sortOrder: entry.sortOrder,
        clipAVotes: entry.a,
        clipBVotes: entry.b,
        total,
        winnerClipId,
        clipAPercent,
        clipBPercent,
        observations: entry.observations,
      }
    })

  // Divergent when techniques with a clear winner disagree on which clip won
  const winners = curated
    .filter(r => r.total > 0 && r.winnerClipId !== null)
    .map(r => r.winnerClipId)
  const divergent = new Set(winners).size > 1

  return { curated, others, divergent }
}
