---
name: audiophile-compare-build-history-ingestion-35-findings
description: Forum ingestion step 35 — Extraction (findings).
---

# ✅ 35 — Extraction — Findings

**Five real findings from actually building this, not caught by any prior
review pass:**

1. **A genuine bug, found and fixed by the tests themselves:**
   `statusForCandidate`'s first draft called `validateIngestPayload`
   unconditionally and treated *any* failure as `'invalid_payload'` —
   which meant every ordinary not-yet-revealed candidate (the normal
   state for most of its life, since `before_is_a` legitimately doesn't
   exist until a reveal arrives) got flagged as if something were wrong
   with it. Fixed: a candidate with no other issues and no `before_is_a`
   yet is simply `pending` — `validateIngestPayload` (and thus
   `'invalid_payload'`) only ever runs once a reveal has actually set
   `before_is_a`.
2. **Decision 16's skip-set structurally cannot cover `irrelevant`
   posts, discovered only while implementing it, not during any review
   pass.** `contributing_posts` lives *inside* a candidate file — but an
   `irrelevant` post (the majority of posts in this thread, per earlier
   sampling) never contributes to any candidate at all, so it never gets
   a provenance entry anywhere. That means every `irrelevant` post is
   re-classified (a real `generateObject` call) on *every* future run,
   full-thread or trial — decision 16 only actually saves cost for posts
   that end up attached to a candidate (test-defining, reveal, vote).
   Deliberately not "fixed" with a separate log — that would directly
   contradict decision 16's own "no separate log, candidate files are
   the only checkpoint" principle for the sake of optimizing the
   majority-case posts it was never designed to cover. Left as an
   accepted, now-documented limitation rather than solved unilaterally;
   worth real cost numbers from the trial run below before deciding if
   it's worth revisiting.
3. **A real bug found by decision 15's own trial run against real data,
   not by any unit test:** the model's Zod schema originally had it
   describe pre-formed pairs directly, each getting a flat, generic
   `forum_labels: ['A', 'B']`. Two posts in an 8-post smoke sample
   (a 3-clip and a 5-clip chained comparison, both single-creator,
   single-post) immediately exposed the consequence: every pair from the
   same post shared the same `(creator, label)` key in
   `candidate-index.ts`'s map, so each `saveCandidate` call silently
   overwrote the previous pair's entry — only the *last* pair of a
   multi-pair post was ever reachable via the bare-label fallback.
   **Fixed by changing what the model describes, not by patching the
   index:** the schema now has the model list distinct *clips* (each
   with its own real forum label, or a positional fallback) grouped into
   comparison groups, and deterministic code (`buildPairsFromGroups`)
   decomposes each group into consecutive pairs — clip[0]-vs-clip[1],
   clip[1]-vs-clip[2], etc. — so every pair carries its own genuinely
   distinguishing labels. Reconfirmed against the same two real posts
   after the fix: `springwood64`'s 3-clip post now yields
   `['Brasso','Brassic']` and `['Brassic','Air']`; `lejonklou`'s 5-clip
   post yields `['1','2']`, `['2','3']`, `['3','4']`, `['4','5']`
   (the model fell back to positional numbering, matching the clips'
   own `1.MOV`–`5.MOV` filenames, since nothing else was named). This
   also surfaced a real, *irreducible* ambiguity distinct from the bug:
   a shared middle label in a chain (`'Brassic'` belongs to both
   adjacent pairs) can't be fully disambiguated from a bare label alone
   — genuine source-material ambiguity, not something to solve further.
   (It doesn't actually get flagged `'ambiguous_attribution'` today — see
   finding 5.)
4. **A second real bug, found by the *full* 978-post trial run (not the
   earlier 8-post smoke sample) — the model echoing `candidateSummary`'s
   own display format back as a match target.** `lejonklou`'s real
   5-clip reveal (post 72339, one day after its 4-pair test-defining
   post) failed to match *any* of its 4 candidates on the first full
   run — a genuine bug, not the accepted middle-label ambiguity above.
   Diagnosed by replaying the exact 89-post prefix leading up to it with
   temporary logging: the model returned `target_forum_label` values
   like `"1/2"`, `"2/3"` — copying the composite `forum_labels=1/2`
   format `candidateSummary` uses to *display* a pair's two labels in
   the OPEN_CANDIDATES context, rather than picking one of the two
   individual clip labels the matching code actually needs. **Fixed on
   the lookup side, not just the prompt:** `findOpenCandidateByCreatorLabel`
   now falls back to splitting a composite label on common separators
   (`/`, `vs`, `-`, `and`, `&`) and retrying each part, since natural-
   language phrasing varies regardless of how precisely the schema is
   worded (the schema description was also tightened, as a first line of
   defense, not a substitute for the robust fallback). Reconfirmed
   against the same real 89-post prefix: 3 of the 4 reveal entries now
   match correctly (the 4th lands on finding 3's already-accepted
   shared-middle-label ambiguity, not a new failure).
5. **`'ambiguous_attribution'` is a defined `IssueCode` that the real
   code never actually sets — found by auditing the full 978-post trial
   run's output, not by a unit test.** Every real `needs_review`
   candidate in the trial carries `unidentified_track` and nothing else;
   `'ambiguous_attribution'` never appears once. The reason: when a
   label lookup could plausibly match more than one open candidate
   (finding 3's shared-middle-label case), the current code doesn't
   detect that ambiguity at all — `findOpenCandidateByCreatorLabel`
   (and its `Map`-based index) only ever returns *one* candidate,
   whichever last-write-wins happened to leave there, with no signal
   that another candidate was equally plausible. So genuine multi-
   candidate ambiguity resolves silently today, rather than being
   flagged for a human to look at, which is what decision 10 originally
   intended `'ambiguous_attribution'` for. **Documented as a known,
   accepted gap, not fixed** — the real-world impact observed so far is
   narrow (it affected 1 of 4 pairs in the one chained-sequence example
   found in this trial), and closing it properly means changing the
   lookup to detect and report multiple matches, which is a real design
   change to `candidate-index.ts`, not a quick patch — left for a
   deliberate follow-up rather than a reactive fix.

   **Full second trial run, after fixes 3 and 4 above, for the record:**
   978 posts → 104 candidates (1 `ready`, 23 `needs_review` — all
   `unidentified_track` only, no dead links/missing timestamps/
   unresolvable IDs/invalid payloads — 80 `expired`). 87 reveal/vote
   posts (16 reveal, 71 vote) still didn't match anything; sampling
   several against real source text found them to be *correct*
   rejections, not bugs — votes cast literally the day after their
   test's own reveal (correctly excluded as non-blind, decision 10), or
   referencing a test whose defining post falls outside this 40-page
   window (an inherent bounded-sample limitation, not a defect). Spot
   checks against real text found genuinely high-quality output: a real
   track ("Henri Texier – Annobon") correctly identified with two
   plausible votes attached; a single post describing three independent
   tracks correctly split into three separate candidates with their
   real, non-colliding labels (`A1/B1`, `A2/B2`, `A3/B3`), each
   correctly scoped to only the votes that actually discussed it.

6. **Human-review tooling, built during the actual post-trial review
   (not anticipated in the original plan), plus a new status decision 3
   didn't originally have.** Manually reviewing the trial's real
   `needs_review`/`expired` output surfaced two concrete needs:
   - `scripts/resolve-candidate-track.ts <candidate-json-path> <artist>
     <title>` — automates the mechanical part of decision 7's manual
     track-resolution workflow: set the real track, clear
     `unidentified_track`, recompute status via the same
     `statusForCandidate` extraction itself uses (now exported), and
     move the file if that was the only thing outstanding.
   - `scripts/default-before-is-a.ts <candidates-dir>` — a batch human
     override for candidates whose reveal never matched at all (as
     opposed to matching incorrectly, findings 3/4's territory):
     defaults `before_is_a: true` for every candidate in `needs_review/`
     and `expired/` that doesn't already have a real boolean value,
     recomputes status, and moves accordingly. Deliberately bypasses
     `candidate-index.ts`'s `saveCandidate` (which throws on a move out
     of a protected status) in favor of `candidate.ts`'s lower-level
     `writeCandidate`/`deleteCandidate` directly — the same pattern
     `resolve-candidate-track.ts` already established — since a human
     overriding an automated `expired/` determination is exactly the
     case decision 4's protection exists to defer to a human, not
     something the automated walk should ever do to itself.
   - **A new `broken/` status** (decision 3), added after manually
     checking every candidate that had ended up in `expired/` and
     finding their clip URLs genuinely dead. Distinct from decision 12's
     `dead_clip_url`: that only ever catches a `direct`-provider link
     failing its HEAD check *at extraction time* — a youtube/vimeo/
     google-drive link is trusted by URL shape alone (decision 12's own
     accepted limitation) and a link that goes dead *after* extraction
     has no automated check at all. `broken/` is protected the same way
     `approved/` is — nothing writes there automatically, only a human,
     and a re-run can't silently reverse the determination.

   One real, human-caught near-miss during this process, worth recording
   precisely because it *wasn't* a code bug: two revealed (real,
   correctly-matched `before_is_a`) candidates were briefly suspected of
   being another candidate-index bug — a revealed candidate sitting in
   `expired/` looks exactly like decision 10's "closed candidates are
   immune to expiry" invariant being violated. They turned out to be
   manual misfilings by the human reviewer while browsing the output,
   not a bug — moved back to `needs_review/` once clarified. Diagnosing
   this consumed real investigation effort (isolated replay of the exact
   post sequence with temporary logging) before the explanation arrived;
   worth noting as a reminder that "looks exactly like a known bug
   pattern" isn't the same as "is that bug."

7. **A more thorough clip-health check, token-saving fatal-issue routing,
   a retroactive sweep script, and a real limitation found while building
   it — all from continued manual review of finding 6's `broken/`
   candidates.** Manually checking every clip in `broken/` found three
   distinct failure shapes decision 12's original check never caught,
   since it only ever checked reachability (`url_status`), never whether
   the response was actually playable media: a missing clip URL on a
   comparison group, a clip URL that doesn't resolve to media (a Dropbox
   preview page, a Google Photos share link, an iCloud share link — all
   return a healthy `200 text/html`, all fall into `detectProvider`'s
   generic `direct` bucket since none match the youtube/vimeo/
   google-drive patterns), and a genuinely dead link. `checkClipHealth`
   now checks `media_type` as well as `url_status` for any `direct` link,
   catching all three uniformly with one tightened check — no
   provider-specific special-casing needed. A Dropbox `dl=0` -> `dl=1`
   URL-rewrite fix was considered and rejected: verified against real
   broken examples (both HEAD and GET) that it doesn't change the
   response at all.

   Two new non-fatal-adjacent `IssueCode`s were added for this
   (`missing_clip_url`, `unplayable_clip_url`), joining `dead_clip_url` in
   a new `FATAL_CLIP_ISSUES` set — issues a human can't fix by editing the
   candidate file, since the clip itself is unusable. A candidate carrying
   any of them now routes straight to `broken` in `statusForCandidate`,
   checked *before* the general "any issue -> needs_review" rule, closing
   it to further matching immediately. This directly enables a token
   saving: `isReplyToBrokenCandidate` lets the walk skip the
   `generateObject` call entirely for a reply that directly quotes an
   already-`broken` candidate's post — there's no point spending tokens
   figuring out a vote for a test nobody can ever actually watch. This
   only catches *direct* quotes of a broken candidate's own contributing
   posts; a reply-to-a-reply chain with no quote at all still gets a real
   classification call, same as any other bare-label reference (decision
   10's existing fallback).

   **A real, curl-verified limitation found while building the
   retroactive sweep, that reversed an in-flight decision:** the original
   plan (per a human's explicit choice) was to add a real network check
   for `google-drive` URLs too, the same way `direct` URLs already get
   one. Building it turned up a hard technical wall: a confirmed-broken
   (deleted) Drive file id and a still-unreviewed one both returned an
   *identical* anonymous 404 "Page not found" page — tried `/preview`,
   `/view`, and the `uc?export=download` redirect chain, with and without
   a browser User-Agent, all four combinations identical for both file
   ids. Zero `drive.google.com` links exist anywhere in `ready/` either,
   so there was no confirmed-healthy example to compare against. Google
   Drive's file endpoints require a real signed-in browser session to
   render; an unauthenticated automated request can't distinguish a dead
   file from a healthy one, so a network check would flag *every* Drive
   link as broken, healthy or not. Brought back to a human for a decision
   rather than shipped anyway: settled on a third path — `checkClipHealth`
   returns a new `'unverifiable'` status for any `google-drive` URL,
   mapped to a new non-fatal `unverifiable_clip_url` IssueCode, which
   routes to `needs_review` (not `broken`) so it surfaces for a human to
   check by hand, same as the workflow already in use for
   `unidentified_track`.

   `scripts/recheck-clip-health.ts` re-derives clip health directly from
   each candidate's stored clip URLs — a purely deterministic operation —
   rather than re-running the expensive LLM-backed extraction pipeline
   just to redo a network check. Run for real against the actual
   `scripts/output/candidates/` repository: 83 candidates moved or
   updated out of `pending`/`needs_review`/`ready` (`pending` and `ready`
   both empty going in/out), `broken/` grew from 43 to 52 (previously
   undetected non-media-page and missing-URL cases), and 32 of the 34
   candidates left in `needs_review/` carry the new
   `unverifiable_clip_url` issue — the google-drive links the retroactive
   sweep can only flag for a human, not resolve itself.

   This deliberately does not touch `lib/clips/detect-provider.ts` /
   `check-url.ts` — the same functions `POST /api/clips/verify` and the
   live app's player use — so live-app behavior for a human submitting a
   URL there (who has already confirmed it plays) is unaffected; this is
   an extraction-only tightening, wrapping the same primitives rather
   than changing them.

---
