---
name: audiophile-compare-build-history-ingestion-35-decisions
description: Forum ingestion step 35 — Extraction (decisions).
---

# ✅ 35 — Extraction — Decisions

**The gap this closes:** phases 2–3 of the pipeline (semantic extraction,
clip-health filtering) don't exist. This is genuinely new capability, not
a variation on an existing pattern, and remains the highest-risk step in
this plan.

**Decisions:**

1. **Output is a candidate repository, not direct calls to
   `/api/internal/ingest`.** Extraction never talks to the deployed app at
   all — it reads step 33's `ScrapedThread` JSON and writes one JSON file
   per candidate test (a draft `IngestPayload` plus `issues`) under
   `scripts/output/candidates/`. Committing (calling the ingest route) is
   entirely step 36's job — see that step. This is the mechanism that lets
   a human fix a problem (like an unidentified track) *before* anything is
   ever sent, so the app itself never needs a "correct a field after
   ingest" feature.

   **`issues` is a typed list of codes, not free text — a separate
   `notes` field carries any human-readable detail.** Earlier drafts of
   this design mixed short codes (`"unidentified_track"`) with full
   sentences (a validation error message) in the same array — awkward
   for step 37 tooling to filter or group on, and exactly the kind of
   repeated-string-literal risk this repo's own convention exists to
   catch, since these codes are written by extraction and read by step
   37. Fixed shape:
   ```typescript
   type IssueCode =
     | 'unidentified_track'      // decision 7
     | 'unresolvable_post_id'    // decision 2
     | 'missing_timestamp'       // decision 10
     | 'ambiguous_attribution'   // decision 10
     | 'dead_clip_url'           // decision 12
     | 'invalid_payload'         // decision 13

   type Candidate = {
     payload: Partial<IngestPayload>
     issues: IssueCode[]
     notes?: string[]   // e.g. validateIngestPayload's error text
     contributing_posts: string[]   // decision 16
   }
   ```
   Every other decision below that writes to `issues` uses one of these
   codes; anything that would otherwise be free text (like
   `validateIngestPayload`'s returned `error` string, decision 13) goes
   in `notes` instead.

2. **`source_ref` gets a pair index.** A single post can describe more
   than one clip pair — "if there is more than one pair, each pair is a
   before/after of the same change, but with different tracks" — so one
   post can yield multiple independent candidates, each its own test. Key
   candidates as `<thread>:post-<n>:pair-<i>` (`pair-1` even when there's
   only one, for consistency). Every candidate also carries a `source_url`
   — step 32's (in `build-history/32-import-provenance-ui.md`) column and payload field — set to
   the initiating post's `post_url` (step 33's scraper output); all pairs
   from the same post share that post's URL.

   **`<n>` is the real phpBB post ID, parsed out of `post_url`, never
   the post's array position.** Left undefined in earlier drafts of this
   decision — a real gap, because `ScrapedPost` has no separate numeric
   ID field, only `post_url`. Array position was the tempting default
   and would work today, but it's fragile in exactly the way step 33's
   planned per-page caching refinement makes more likely, not less: if
   an old post is ever deleted from the live forum (already a named
   limitation of that caching design), every later post's array index
   shifts on a re-scrape, silently changing `source_ref` for candidates
   already sitting in `approved`/`ingested` — breaking decision 4's
   idempotency check and decision 16's `contributing_posts` skip-set,
   both keyed on that exact string. Parsing the real post ID out of
   `post_url` via the same `/[?&]p=\d+/` pattern step 33 already uses
   for `quoted_post_url` matching gives a stable identifier tied to the
   post's own permanent identity on the forum, unaffected by pagination
   or caching. This also matters for decision 7's placeholder track
   title, which embeds `source_ref` directly — an unstable `n` would
   silently rename a human-visible placeholder across re-runs, not just
   break internal bookkeeping.

   **A test-defining post whose own `post_url` has no parseable ID is
   flagged, not silently keyed on nothing.** `parse-thread-page.ts` falls
   back to `''` for `post_url` itself (`permalink ? canonicalizeUrl(...)
   : ''`), the same defensive pattern as `posted_at` — but unlike a
   missing timestamp, a missing/unparseable post ID hits the mechanism
   this whole decision exists to protect: with no stable identifier at
   all, two such posts would otherwise collide on whatever placeholder
   key they shared, exactly the "unrelated things silently merged" risk
   decision 7 already calls out for unidentified tracks. A candidate
   built from such a post still gets created — so a human has something
   to look at — but is flagged `needs_review` immediately with
   `'unresolvable_post_id'` (decision 1's typed shape), keyed on a
   clearly-marked fallback: `<thread>:unresolvable-<hash>:pair-<i>`,
   where `<hash>` is a short hash of the post's own content (`author` +
   `posted_at` + a prefix of `body_markdown`) — **not** array position.
   Array index was the first idea here and was rejected: it would just
   reintroduce, one level down, the exact instability this whole
   decision exists to eliminate — if a live-forum edit shifts positions
   between runs, an array-index fallback could either (a) silently
   duplicate an already-`approved` candidate (its shifted index no
   longer matches its own file) or, worse, (b) cause decision 4's
   "already exists in `approved/`, skip it" check to match a
   *completely different, never-before-seen* post purely because it
   landed on a now-reused index — silently dropping a real post with no
   flag at all. A content hash avoids both: it's effectively
   collision-free across two genuinely different posts, and — unlike
   array position — it's actually *stable* for the *same* post across
   runs regardless of where it sits in the array, since it doesn't
   depend on position. It only changes if the post's own content
   changes, which is exactly the case where reprocessing is arguably
   correct anyway. Still accepted as a narrow, rare-case limitation, the
   same spirit as the Photos/iCloud and pagination-stability limitations
   already accepted elsewhere in this plan — just a safer version of
   that limitation than the array-index approach would have been.

3. **Status is folder location, not a field — one subfolder per stage,
   no `status` field inside the JSON at all.**
   ```
   scripts/output/candidates/
     pending/               candidates missing something required (decision 6)
     needs_review/          complete, but extraction flagged an issue (decision 7)
     ready/                 complete, no flagged issues — assigned automatically
     approved/              a human moved it here — step 36's staging input
     ingested/staging/      step 36 moved it here after committing to staging
     ingested/production/   step 36 moved it here after committing to production
     expired/               closed automatically — no reveal within 21 days
                             of the candidate's post (decision 10); not part
                             of the approved → ingested chain, a dead end
     broken/                a human moved it here after manually checking its
                             clip URLs and finding them genuinely unusable —
                             added post-trial (decision 15's real run), once
                             candidates with real dead hosting (taken-down
                             share links, etc.) started showing up; distinct
                             from decision 12's dead_clip_url, which only
                             ever catches a direct-provider link failing its
                             HEAD check at extraction time — never a
                             youtube/vimeo/google-drive link trusted by URL
                             shape, and never a link that goes dead later
   ```
   A candidate's status is simply which folder its file is sitting in —
   "approving" a `ready` (or fixed `needs_review`) candidate means moving
   its file into `approved/`; nothing to keep in sync, no risk of a status
   field drifting from where the file actually lives. `pending` is
   materialized as soon as the initiating clip-pair post is found, even
   before any votes or reveal exist, so the repository shows what's still
   "in flight." The two `ingested/` stages form a strict chain — see step
   34 decision 1 for why `ingested/staging/` is also production's *input*
   folder, not just a record. `expired/` is the one transition extraction
   makes on its own without a human moving anything — see decision 10.
   `broken/` is the opposite: nothing ever writes there automatically,
   only a human, the same manual-edit spirit as decision 7's track
   resolution.

4. **Extraction is incremental and safe to re-run.** Re-running against an
   updated scrape (e.g. after a re-scrape picks up new posts) creates or
   updates a candidate's file in `pending/`, `needs_review/`, or `ready/`
   as more of the thread resolves, but **never touches a candidate whose
   file already exists in `approved/`, `ingested/staging/`,
   `ingested/production/`, `expired/`, or `broken/`** — checked by
   looking for that `source_ref`'s filename in those five folders first.
   A human decision, once made, isn't silently clobbered by a later run;
   a candidate already in flight through the ingest chain can't be reset
   back to `pending` by a fresh scrape; an automatically-`expired/`
   candidate (decision 10) can't be silently un-expired by a later run
   either — even if a late reveal eventually shows up in an updated
   scrape, it's ignored, consistent with "a vote/reveal after the close
   point doesn't count" — and a human's `broken/` determination can't be
   silently reversed by a later run either. This decision is about which
   *files* a re-run won't move or overwrite; decision 16 covers the
   complementary question of which
   *posts* a re-run won't bother re-sending to the model at all.

5. **Three distinct concepts, not one — clarified against how the forum
   actually works:** the *forum label* (`A`/`B`, `X`/`Y`, `A1`/`B1`, etc.
   — arbitrary, assigned by the creator per post, for discussion); the
   *app's internal blind label* (`clips.label`, assigned by us at ingest
   time, unrelated to the forum's scheme); and *before/after*
   (`clip_mapping`), stated by the creator in a separate, later reveal
   post — sometimes disclosed alongside the tracks (decision 7), often not
   disclosed at all. Votes resolve against the *forum* label as soon as a
   vote post is seen (mapped to whichever of our internal `A`/`B` the
   corresponding clip URL was assigned); before/after resolves only from a
   reveal post. **Real sampling found "forum label" isn't always a letter
   scheme** — one full test cycle in the head sample used bare numbers
   ("1153" vs "1155", presumably recording/file numbers) as its only
   reference scheme, with no letters mentioned anywhere. Extraction's
   label-matching needs to treat a bare number exactly like an `A`/`B`/`X`/
   `Y` label, not as a special case.

6. **A test that never gets revealed is never promoted to `ready`.**
   `before_is_a` is mandatory for `ingest_test` and has no other source —
   rather than guess, or add an update-after-ingest mechanism (which the
   app has no other use for and shouldn't grow just for this), an
   unrevealed test is explicitly out of scope for this import. Votes and
   snapshot data for it are simply never committed. It doesn't sit in
   `pending` forever, though — decision 10's 21-day auto-expiry moves it
   to `expired/` once it's been open that long without a reveal, rather
   than leaving it open indefinitely.

7. **Track identification: try text, then step 33's oEmbed enrichment;
   if both fail, don't skip — create a flagged placeholder.** Order of
   attempts: (a) explicit track naming in the reveal or original post,
   when present; (b) `oembed_title`/`oembed_author` from step 33, when
   present and plausible. If neither resolves, still create the candidate
   with a **per-post-unique** placeholder (e.g. `artist: "Unidentified"`,
   `title: "Unidentified passage — <source_ref>"` — never one shared
   "Unknown" row, which would incorrectly merge unrelated tracks under
   `ingest_test`'s exact-match lookup) and mark the candidate
   `needs_review` with `issues: ["unidentified_track"]`. A human resolves
   it by editing the candidate file directly — typing in the real name if
   they recognize it, or leaving the placeholder and approving anyway if
   they're satisfied with that outcome.

   **The placeholder path is the expected common outcome here, not a rare
   fallback — real data quantifies this.** oEmbed enrichment succeeded on
   only ~1–4% of links across two real samples (1/25, then 3/217). Budget
   `needs_review` review volume in step 37 accordingly: most candidates
   will need a human glance at track identity, not a handful of edge
   cases.

   **A text label distinguishing clip A from clip B is not reliably the
   real track name — a genuine risk of confidently-wrong data, not just
   missing data.** Real example: Charlie1 named three clips "Laa Laa,"
   "Tinky Winky," and "Po" — Teletubbies characters, obviously just
   nicknames to tell the clips apart, not song titles. Compare Spannko's
   "John Prine 1 Buddha," which does look like a genuine artist reference.
   Extraction must distinguish "this is what the creator calls the
   recording" from "this is genuinely identifying a song" — when unsure,
   default to the placeholder path rather than guessing. Producing a
   wrong-but-confident track name is worse than an honest
   `unidentified_track` flag.

8. **System naming is simplified: one placeholder system per creator,
   not inferred per post.** Creator posts "rarely provide much information
   about systems... to infer this would require a much deeper scan... 
   probably out of scope," but "generally say what has changed." So:
   one system per resolved creator placeholder (not named from post
   content — named from the creator's identity, e.g. `"<display name>'s
   system"`), with each post's "what changed" text becoming the new
   snapshot's `version_label`. This deliberately doesn't try to detect "is
   this description a new system entirely" — a creator with two genuinely
   distinct systems would incorrectly get merged into one, an accepted,
   documented limitation for this historical import rather than something
   worth deep inference. De-risks, but doesn't eliminate, the harder half
   of the old "continuity" problem — see decision 10.

9. **Vote revisions are resolved entirely within extraction — no change
   to `ingest_test`.** "Listeners sometimes change their vote or add a
   comment" is a real, expected occurrence, but since a candidate is only
   written once its underlying state is gathered (and re-extraction
   updates a non-`approved` candidate rather than appending to it),
   extraction always resolves to the *final* vote per (voter, technique)
   before it's ever written to a candidate file. `ingest_test`'s
   `ON CONFLICT ... DO NOTHING` remains a defensive backstop only — it
   should never actually fire if extraction has done its job; if it does,
   that's a signal of an extraction bug, not something the SQL layer
   should try to paper over.

10. **Reply-to-test attribution is resolved by processing the whole
    thread as a single chronological walk with one shared, cross-author
    index — not by grouping posts by author.** The original framing
    ("groups by author, walks posts") was wrong for what this decision
    actually needs: a voter's reply lives in the *voter's* post stream,
    but it has to match against the *creator's* pending candidate — a
    different author entirely. Grouping by author never gives a voter's
    group visibility into another author's open candidates. Instead:

    - Posts are walked in thread order (`ScrapedThread.posts` is already
      chronological, oldest first — step 33's own type comment confirms
      this), across all authors together, one post at a time.
    - One shared index is built from whatever's already on disk at
      startup — and this read spans **all six** candidate folders
      (`pending/`, `needs_review/`, `ready/`, `approved/`, `ingested/*`,
      `expired/`), not just the three writable ones, because decision
      16's `contributing_posts` skip-set needs every folder's provenance
      to avoid reprocessing a post that already contributed to an
      `approved`/`ingested`/`expired` candidate. The *open-candidate*
      matching set this decision uses, though, only ever draws from
      `pending/`, `needs_review/`, and `ready/` — a candidate in
      `approved/`, `ingested/*`, or `expired/` is closed by definition
      and never touched or offered as a match target (decision 4). Kept
      current as the walk progresses. It's queryable three ways:
      by `post_url` → candidate (the `quoted_post_url` direct hit, this
      decision's primary signal, still true — sampling found 35% of a
      978-post recent-history sample resolves this way, vs. effectively
      0% in the thread's early history, evidently after a forum software
      upgrade added a resolvable quote-permalink) — **every post
      attributed to a candidate gets indexed under this key, not just its
      test-defining post**, since a real quote chain can reply to a
      previous *reply* rather than the original post; indexing only the
      originating post would miss that case and fall through to the
      weaker label-matching fallback for something that should have been
      a direct hit; by `(creator forum_username, forum_label)` →
      candidate (the bare-label fallback — a label like "1153" only means
      something scoped to one creator); and by `creator forum_username` →
      that creator's own candidate history (this doubles as decision 8's
      continuity context — same index, just queried differently, not a
      second mechanism).
    - **A candidate is "open" (eligible for vote/label matching) only
      from its test-defining post until its creator's reveal post — a
      reveal closes it immediately**, the moment a post is classified as
      that candidate's reveal (regardless of whether the reveal data is
      clean enough to reach `ready` vs. stay `needs_review`). Any later
      post using the same label is discarded, not treated as a vote — a
      "vote" cast after the reveal isn't blind and shouldn't count.
    - **A candidate that's still open 21 days (by post timestamp, not
      wall-clock — this is historical data) after its own test-defining
      post is expired automatically**, moved to the new `expired/`
      folder (decision 3) rather than left open indefinitely. Checked
      against the currently-processed post's timestamp as the walk's
      clock, before evaluating that post.
    - **A candidate whose own test-defining post has no timestamp is
      flagged `needs_review` immediately, not tracked for expiry at
      all.** `parse-thread-page.ts` falls back to `''` for `posted_at`
      when a post's `<time datetime>` element is missing — an `Invalid
      Date`, and any comparison against it is `false`, so the 21-day
      check would otherwise silently never fire for that one candidate
      rather than erroring. Rather than let that pass as quiet
      undefined behavior, a candidate created from a timestamp-less post
      goes straight to `needs_review` with `issues: ["missing_timestamp"]`
      — consistent with decision 7's existing principle of flagging
      rather than guessing. (An arbitrary *non-candidate-defining* post
      lacking a timestamp — e.g. a vote — doesn't get this treatment; it
      just doesn't get to serve as the walk's clock for that one step,
      and expiry sweeps resume at the next post with a valid timestamp.)
    - Net effect: the set of candidates open for matching at any point
      in the walk stays small (bounded by however many tests are
      simultaneously mid-flight, not by thread length), so the fallback
      context passed to each `generateObject` call is simply "all
      currently-open candidates" — no recency window or positional
      heuristic needed.
    - **How this stays correct on a resumed run (decision 16), made
      explicit:** the walk still *visits* every post, in thread order,
      even when a post's `generateObject` call is skipped — only the
      model call is skipped, not the post's participation in the walk.
      This matters because the 21-day expiry sweep above runs "before
      evaluating that post," using that post's timestamp as the clock;
      if a skipped post were dropped from the walk entirely rather than
      just from the LLM call, the clock would stall at wherever the last
      *unskipped* post was, and a candidate that should expire somewhere
      in already-processed territory wouldn't, potentially until the
      walk reaches a post outside the skip-set — which, on a fully
      cached re-run with nothing new added, could be never. Separately,
      a *loaded* candidate's open/closed state is never replayed
      post-by-post — it's read directly off the candidate's own current
      content (whether its reveal-derived fields, like `before_is_a`,
      are already populated). `contributing_posts` (decision 16) only
      has to answer "has this post been accounted for," not "what did it
      do" — it doesn't need per-post role information to make any of
      this work.

    **Concrete real example the fallback still needs to handle:** a reply
    saying "I prefer the first one (1153)" with no link and no quote at
    all — "1153" is a bare-number forum label (decision 5) that only
    resolves to a specific candidate by matching against labels already
    open for that creator, not via any link or quote signal. This remains
    exactly the kind of ambiguity decision 7's `needs_review` mechanism
    exists for: an extraction that isn't confident which open candidate a
    vote belongs to should flag it — `'ambiguous_attribution'` added to
    `issues` (decision 1's typed shape) — rather than guess silently.

11. **Technique is hardcoded to `'Tune Method'` for every vote.** The
    forum's stated convention is that all listeners use this evaluation
    method — a valid cross-test assumption for this dataset. Removes the
    free-text-to-vocabulary mapping risk entirely for the common case; no
    attempt is made to detect a listener using a different technique.
    **Stronger evidence than "the forum generally follows this
    convention":** the live page itself carries a hidden (`display: none`)
    topic-level field reading "We use the Tune Method to evaluate
    performance" — the thread declaring its own rule directly, not just an
    inference from how individual replies happen to be phrased (most vote
    posts read as casual personal preference — "more musical," "more
    engaging" — with no explicit method name at all, which would be weak
    evidence on its own).

12. **"Unbroken" is enforced here, not in the ingest route** — by
    precisely mirroring `POST /api/clips/verify`'s real branch (`app/api/
    clips/verify/route.ts`), which is a two-way split, not a per-provider
    check: call `detectProvider` on the link; **only when
    `provider === 'direct'`** does a real network check happen, via
    `checkDirectUrl` (`lib/clips/check-url.ts` — it takes the whole
    `DetectedClip`, not a raw URL); every other provider
    (`youtube`/`vimeo`/`google-drive`/`unknown`) is trusted as
    `url_status: 'ok'` unconditionally, with **no HEAD request or any
    other network check at all** — matching URL shape is the entire
    verification for those. Drop the candidate (or mark it `needs_review`
    with `'dead_clip_url'` added to `issues`, decision 1's typed shape)
    only when a `direct` link's `checkDirectUrl` result comes back dead;
    there is no equivalent signal for any other
    provider. Zero new clip-validation logic — this decision is about
    calling the existing two functions with the same branch the deployed
    route uses, not adding a third path. **Caveat, partially resolved by
    `build-history/34-google-drive-clip-provider.md`:** Drive links get real embedded playback
    via the `google-drive` provider, still with no health check (same
    trust-the-URL-shape treatment as youtube/vimeo). Google Photos and
    iCloud links (~69 of the ~150 found across both samples) remain in
    `detectProvider`'s `unknown` bucket by design — no stable embeddable
    URL exists for either — and get **zero verification of any kind**
    under this mirrored logic, not even a weak share-page reachability
    check (there is no such check anywhere in this codebase to reuse for
    them). "Unbroken" is meaningfully enforced for direct links only, with
    youtube/vimeo/google-drive trusted by URL shape and Photos/iCloud
    links entirely unverified — an accepted limitation surfaced to a
    human at approval time (step 37), not an open question to resolve in
    code.

13. **Validation happens continuously, not as a separate "dry-run mode" —
    and reuses the real `validateIngestPayload`, not a re-described
    equivalent.** Because extraction only ever writes local candidate
    files and never calls the ingest route itself, there's no live/dry-run
    mode distinction to design — every run is inherently side-effect-free
    against the app. The original wording here ("validated against the
    same constraints `ingest_test` would enforce") was a missed
    opportunity: `lib/ingestion/ingest-test-payload.ts`'s
    `validateIngestPayload` already *is* that check (`source_ref`,
    `author.forum_username`, track/snapshot fields, `clip_a_url`/
    `clip_b_url`, `before_is_a` as boolean, and per-vote `voter`/
    `chosen_label`/`technique_name` presence), tested and used by the real
    ingest route today — extraction should call it directly on each
    assembled draft `IngestPayload`, not hand-roll an equivalent check
    that can silently drift from the real one. A candidate is marked
    `ready` only when `validateIngestPayload` returns `{ valid: true }`;
    otherwise it stays at `needs_review` with `'invalid_payload'` added to
    `issues` and the returned `error` string recorded in `notes` (decision
    1's typed shape). Decision 12's clip-health check runs
    *additionally* — `validateIngestPayload` deliberately doesn't check
    reachability, only presence, so it doesn't replace decision 12.
    **Worth knowing when building step 37's review tooling:** the real
    function returns on the *first* failing check, not a full list — a
    candidate with two separate problems shows one at a time in `notes`,
    and fixing it and re-running is what surfaces the second, not a
    single exhaustive report up front.

    **Real gap `validateIngestPayload` doesn't close: `technique_name` is
    never checked against real seeded data anywhere reusable.** The only
    place that happens today is inside the `ingest_test` SQL function
    itself (`raise exception ... unknown listening technique`), which
    extraction never calls (decision 1). Since decision 11 hardcodes
    every vote's `technique_name` to a single literal, the real risk is
    narrow — just "does that literal exactly match the seeded
    `listening_techniques.name` value" — so the fix is proportionate, not
    a new DB dependency for extraction: export the literal as a single
    named constant (`TUNE_METHOD_TECHNIQUE_NAME` in
    `ingest-test-payload.ts`, alongside the types it's already adjacent
    to) instead of an inline string in extraction code, per this repo's
    repeated-string-constants convention. Extend `validateIngestPayload`
    with an optional third parameter, `knownTechniques?: string[]` —
    when omitted (the real ingest route's existing call site is
    unaffected, since forum-import payloads there aren't restricted to
    one technique), no change in behavior; extraction calls it with
    `[TUNE_METHOD_TECHNIQUE_NAME]`, catching a typo or future drift
    between decision 11's constant and this list at validation time
    rather than only at commit time. A unit test separately pins that
    constant's value against the real seed row from
    `20260625094142_initial_schema.sql`, so a future migration renaming
    the seeded technique would be caught by a failing test, not silently.

14. **Extraction technology: Vercel AI SDK (`ai` package), `generateObject`
    with a Zod schema, via the AI Gateway using a plain
    `"anthropic/claude-..."` model string** (no separate `@ai-sdk/anthropic`
    package). Chosen over calling the Anthropic API directly or using the
    Claude Agent SDK: it fits this project's Vercel-native conventions,
    and schema-validated structured output directly satisfies decision 13
    — a malformed extraction is a catchable Zod error, not something to
    hand-roll validation for. Context passed to each call is drawn from
    decision 10's shared index — the author's own prior candidates for
    decision 8's continuity tracking, plus currently-open candidates
    thread-wide for decision 10's cross-author attribution —
    deliberately simpler than giving the model its own tool-using agent
    session, which isn't needed for what's fundamentally single-shot
    structured extraction repeated with accumulated context.

    **Model: Sonnet 5, one model throughout, no tiering.** Matches the
    reasoning bar decisions 7 and 10 actually need (distinguishing a
    genuine track name from a nickname; cross-author label matching) —
    Haiku risks silent misclassification on exactly those judgment calls
    (a wrong "irrelevant" call never surfaces in `needs_review` at all,
    unlike a wrong-but-flagged extraction), and Opus's extra quality is
    marginal here given decision 7's `needs_review` safety net already
    absorbs the uncertain cases. A cheap-triage-then-strong-model tier was
    considered and rejected as premature complexity for a one-time
    historical import.

    **Calls: one `generateObject` call per post, no pre-filter.** A
    link-based pre-filter is unsafe — decision 10's own motivating
    example ("I prefer the first one (1153)") is a real vote with no
    link at all, so filtering on link presence would silently drop real
    votes. Batching multiple posts into one call was also considered and
    rejected: decision 10's shared index needs to update *after every
    single post* so a later post in the same batch can see an earlier
    one's newly-created candidate, which batching either breaks or only
    partially preserves. A safe deterministic pre-filter is possible in
    principle (skip only when a post has no link, no `quoted_post_url`,
    and zero currently-open candidates thread-wide) but was deferred —
    its failure mode is a *silent* skip with no `needs_review` flag,
    worse than the cost of a wasted call on a boring post, and not worth
    the added code surface until a real per-run cost number shows it's
    needed.

    **`technique_name` is not part of the model's output schema at
    all.** Since decision 11 already hardcodes every vote to
    `TUNE_METHOD_TECHNIQUE_NAME` and explicitly puts detecting a
    different technique out of scope, asking the model to also produce
    this field would only add a value that's immediately discarded and a
    field it could hallucinate for no purpose. The Zod schema for a vote
    covers `voter`/`chosen_label`/`observation`/`other_description`
    only; `technique_name` is attached deterministically by extraction
    code afterward, same source as decision 13's constant.

    Needs a new `ai` (and `zod`, not currently a dependency) package, and
    the `AI_GATEWAY_API_KEY` env var in `.env.local` — the standard
    mechanism for authenticating to Vercel AI Gateway from outside a
    Vercel deployment (this is a local `tsx` script, not a deployed
    Function, so it can't rely on Vercel's runtime-native OIDC), to be
    documented in `docs/vercel-setup.md`. **Checked against real repo
    state, not just assumed:** `.env.local` already carries a
    `VERCEL_OIDC_TOKEN` from a prior `vercel env pull`/`vercel link`, so
    the Gateway might technically already be reachable locally without a
    new credential — but that token is short-lived and meant to be kept
    fresh by an active `vercel dev` session, a poor fit for a batch
    script that (per the re-run cost risk noted below) could run
    unattended for a long time. Provisioning a dedicated, stable
    `AI_GATEWAY_API_KEY` avoids the token expiring mid-run; this is the
    reasoning for preferring it over the token that's already present,
    not an oversight.

15. **Trial runs against a bounded sample precede any full-thread run.**
    Decisions 7, 8, and 10 all lean on model judgment for genuinely hard
    calls (nickname vs. real track name, system continuity, cross-author
    label attribution) that nothing in this design can validate short of
    actually running it and checking the output by hand — and a
    full-thread run is a real commitment to get wrong repeatedly while
    iterating. So extraction gets validated the same way step 33
    validated the scraper itself: against the last ~40 pages of the
    thread — `scripts/output/lejonklou-sample-tail/thread.json` is already
    scraped and available, no new scraping needed. A trial run means
    running the extraction CLI against that file, then manually auditing
    a meaningful fraction of the resulting `ready`/`needs_review`/
    `expired` candidates against the real source posts, specifically for
    the failure modes this design is most exposed to: wrong-but-confident
    track/system inference, incorrect cross-author label attribution, and
    candidates that expired when they shouldn't have (or vice versa).
    Only once a trial run's output holds up under that audit does a
    full-thread run make sense. This is validation of the *extraction
    approach*, run once or a few times while iterating — it doesn't
    replace step 37's per-candidate human approval, and it exercises
    decision 16's skip mechanism directly (re-running a trial after a
    fix should only reprocess what was actually deleted).

16. **Re-runs skip posts already accounted for on disk — the candidate
    files themselves are the checkpoint, no separate log.** Each
    candidate file gets a `contributing_posts: string[]` field — every
    post `post_url` that has been folded into it: its source
    (test-defining) post, every vote/reply post accepted for it, and its
    reveal post if closed. The same disk-read that already builds
    decision 10's shared index (across `pending/`, `needs_review/`,
    `ready/`, `approved/`, `ingested/*`, `expired/`) builds a second,
    cheap structure from the same pass: a `Set<post_url>` union of every
    candidate's `contributing_posts`. Walking the thread, a post is
    skipped (no `generateObject` call at all) only if it's already in
    that set; anything not found there — because it's genuinely new, or
    because a human deleted the file that used to account for it — gets
    processed fresh, with no special-casing between those two cases.

    **An empty `post_url` is never added to `contributing_posts`.**
    Decision 2's `unresolvable_post_id` fallback exists precisely because
    `post_url` can be `''` — and if that empty string were recorded as a
    "contributing post" like any other, it would poison the shared
    skip-set: a *second, unrelated* post that also happens to have an
    empty `post_url` (its own permalink extraction separately failing —
    rare, but the same class of event) would find `''` already in the
    set and get silently skipped, never evaluated at all. That's the
    exact "unrelated things silently merged" failure this decision and
    decision 2's fallback both exist to avoid, just arrived at from the
    other direction. So a post with no resolvable `post_url` simply gets
    no provenance entry — it stays permanently eligible for its
    `generateObject` call to re-run on every future run, rather than
    being trackable in the skip-set at all. That re-run isn't wasted
    effort forever, though: decision 2's fallback key is a content hash,
    not array position, so the same post resolves to the same
    `unresolvable-<hash>` filename each time — decision 4 correctly
    leaves it alone once a human has moved it to `approved/`, even
    though the LLM call keeps firing for it up to that point. Noisier
    than a clean skip while it's still pending, but it fails toward
    "keeps asking for attention" rather than "silently drops a different
    post," consistent with this design's default everywhere else.

    **This makes "delete a file to force re-extraction" work exactly as
    intended, because deletion is atomic per candidate.** Removing a
    candidate's file removes the *entire* record of everything that ever
    contributed to it in one move — its creation, every vote, its reveal
    — so a re-run correctly reprocesses that whole cluster of posts from
    scratch and nothing else; posts belonging to still-present candidates
    stay correctly skipped, since their own provenance lives in their own
    still-present files.

    **One real rough edge, accepted rather than solved:** decision 2
    lets a single post spawn more than one candidate (`pair-1`, `pair-2`,
    ...). Deleting only one pair's file doesn't fully "unprocess" the
    post — the skip-check is per-post, not per-pair, so that post gets
    reprocessed wholesale, regenerating every pair it originally
    produced, including ones nothing was wrong with. Reprocessing a
    sibling pair is cheap and expected to be idempotent (it should
    regenerate the same content), so this is accepted as documented
    behavior — multi-pair deletions should be done together — rather
    than building per-pair tracking within a single post for a rare
    case.

    **Not to be confused with step 33's own cache-deletion signal.**
    Deleting a candidate file only forces extraction to reprocess against
    whatever `lejonklou-thread.json` currently contains — if step 33's
    planned per-page cache still holds a stale version of the relevant
    page, "reprocessing" replays the same old content, not fresh content.
    To pick up a genuine live-forum change, both this file *and* step
    33's cached `raw/`/`parsed/` page files need clearing, not just one.

**Files to update:**
- `lib/ingestion/ingest-test-payload.ts` (existing, modified) — export
  `TUNE_METHOD_TECHNIQUE_NAME`; add `validateIngestPayload`'s optional
  third parameter, `knownTechniques?: string[]` (decision 13); no change
  to its existing single-argument call site in `app/api/internal/ingest/
  route.ts`.
- `lib/ingestion/extract/candidate.ts` (new) — candidate JSON shape:
  `IssueCode` union, `issues: IssueCode[]` plus free-text `notes?:
  string[]` (decision 1), `contributing_posts: string[]` (decision 16);
  the `pending`/`needs_review`/`ready`/`approved`/`ingested`/`expired`
  folder layout; read/move helpers that respect decision 4 (never touch
  a `source_ref` that already has a file in `approved`/`ingested`/
  `expired`); open/closed state read from a loaded candidate's own
  content (e.g. `before_is_a` populated), not replayed from
  `contributing_posts`.
- `lib/ingestion/extract/extract-post.ts` (new) — the `generateObject`
  call plus the deterministic wrapping around it (clip-health filtering
  via decision 12, technique hardcoding via `TUNE_METHOD_TECHNIQUE_NAME`,
  track-identification fallback, and a final `validateIngestPayload` call
  — decision 13 — before a candidate is marked `ready`). The model's Zod
  schema classifies a post's `role` (`test_defining`/`reveal`/`vote`/
  `irrelevant`); for `test_defining`, it describes `comparison_groups` of
  distinct *clips* (each with its own real forum label and system-state
  description), not pre-formed pairs — `buildPairsFromGroups` then
  deterministically decomposes each group into consecutive pairs
  (clip[0]-vs-clip[1], clip[1]-vs-clip[2], ...), giving every pair
  genuinely distinguishing `forum_labels` instead of a flat, colliding
  `['A','B']` (a real bug found and fixed via decision 15's trial run —
  see "Verified" below). A vote's schema also carries `target_creator`
  (which OPEN_CANDIDATES creator this vote is about), not just a bare
  label, since decision 10's cross-author fallback needs the creator to
  scope the label lookup — labels alone aren't unique across creators.
- `lib/ingestion/extract/source-ref.ts` (new) — parses the real phpBB
  post ID out of `post_url` via the same `/[?&]p=\d+/` pattern step 33
  already uses for `quoted_post_url`, to build decision 2's
  `<thread>:post-<n>:pair-<i>` key; never derives `n` from array
  position; falls back to a content-hash `unresolvable-<hash>` key
  (never array position — decision 2 explains why) and
  `'unresolvable_post_id'` (decision 1/2) when `post_url` is empty or has
  no parseable ID, rather than throwing or silently colliding two such
  posts on the same key.
- `lib/ingestion/extract/candidate-index.ts` (new) — decision 10's shared
  index: built from disk at startup, updated during the walk, queryable
  by `post_url`, by `(creator, forum_label)`, and by `creator`; owns the
  open/closed state per candidate (reveal-closes, 21-day expiry to
  `expired/`); also builds decision 16's `contributing_posts` skip-set
  from the same disk read, excluding empty `post_url` entries so two
  unrelated `unresolvable_post_id` candidates can never collide in it.
  `findOpenCandidateByCreatorLabel` also falls back to splitting a
  composite label (`"1/2"`, `"1 vs 2"`) into its parts and retrying each
  — a real fix, not speculative (finding 4 below).
- `scripts/extract-lejonklou.ts` (new) — CLI entrypoint: reads step 33's
  JSON, walks posts in thread order (chronological, not grouped by
  author — decision 10), building/updating candidates via the shared
  index.
- `package.json` — new `ai`/`zod` dependencies; new `extract:lejonklou`
  script.
- `.gitignore` — no change needed; `scripts/output/` already covers the
  candidates output location (human-edited working state, not committed
  source), same as it already covered the scraper's cache.
- `docs/vercel-setup.md` — new "Forum ingestion: `AI_GATEWAY_API_KEY`
  (local-script-only)" section: what it's for, how to provision it via
  the Vercel dashboard, and why it's added directly to `.env.local`
  rather than through the usual per-environment dashboard scopes
  (extraction never runs as a deployed Function) — plus the same
  stable-credential-vs-`VERCEL_OIDC_TOKEN` reasoning as decision 14.
- `.env.local` — `AI_GATEWAY_API_KEY` added (a human provisioned the key
  and a credit card/credits on the Vercel AI Gateway — both were
  required; a card alone still hit a free-tier rate limit on the first
  attempt, see "Verified" below).
- `core.md` / `testing.md` — test counts (34 files / 386 tests) and new
  inventory rows.
- `lib/ingestion/extract/candidate.ts` — added `broken/` to
  `CANDIDATE_STATUSES`/`STATUS_FOLDERS`/`PROTECTED_STATUSES` (finding 6).
- `lib/ingestion/extract/extract-post.ts` — `statusForCandidate` exported
  (finding 6, so `resolve-candidate-track.ts` can reuse it exactly).
- `scripts/resolve-candidate-track.ts` (new) — finding 6's per-candidate
  track-resolution tool.
- `scripts/default-before-is-a.ts` (new) — finding 6's batch
  reveal-never-matched override tool.
- `lib/ingestion/extract/candidate.ts` — `CandidateStatusValue` named-
  constant object replacing the `CANDIDATE_STATUSES` array literal
  (`CandidateStatus` now `(typeof CandidateStatusValue)[keyof typeof
  CandidateStatusValue]`); every status literal across this pipeline
  (`candidate.ts`, `candidate-index.ts`, `extract-post.ts`,
  `default-before-is-a.ts`, `recheck-clip-health.ts`) now reads from it
  instead of a bare string. Scope deliberately limited to `CandidateStatus`
  only, not `IssueCode` — a human instruction, not an oversight. Also adds
  `FATAL_CLIP_ISSUES` (finding 7).
- `lib/ingestion/extract/clip-health.ts` (new) — finding 7's thorough clip
  check, replacing the inline `isClipDead` helper that used to live in
  `extract-post.ts`. `checkClipStatus(url, postLinks)` combines
  `isRealPostLink` (catches a model-hallucinated clip URL not actually in
  the post — see finding 3's sibling issue) with `checkClipHealth`, which
  tightens decision 12's original reachability-only check into a real
  media check for `direct`-provider URLs, and returns `'unverifiable'`
  for `google-drive` URLs without any network call (finding 7 explains
  why).
- `lib/ingestion/extract/extract-post.ts` — `issueForClipStatus` maps
  `ClipHealthStatus` to the right `IssueCode`; `statusForCandidate` now
  checks `FATAL_CLIP_ISSUES` *before* the general "any issue ->
  needs_review" rule, routing straight to `broken` (finding 7).
- `lib/ingestion/extract/candidate-index.ts` — new `candidateByPostUrl:
  Map<string, string>` field on `CandidateIndex` (every contributing
  post's URL -> its candidate's `source_ref`, any status, not just open
  ones) and `isReplyToBrokenCandidate(index, quotedPostUrl)`, letting the
  walk skip a `generateObject` call entirely for a reply that directly
  quotes an already-`broken` candidate's post (finding 7).
- `scripts/extract-lejonklou.ts` — wires `isReplyToBrokenCandidate` into
  the main walk loop, alongside decision 16's existing
  `isPostAccountedFor` skip; logs a separate `skippedBroken` count.
- `scripts/recheck-clip-health.ts` (new) — a standalone, non-LLM
  retroactive sweep for candidates extracted before finding 7's thorough
  check existed. Re-derives clip health directly from each candidate's
  stored `clip_a_url`/`clip_b_url` rather than re-running extraction;
  only ever touches `pending/`, `needs_review/`, and `ready/` (the
  non-protected statuses), same protection principle as everywhere else
  in this pipeline.

**Tests:**
- **Unit:** candidate status-transition logic (new candidate → `pending`;
  becomes `ready`/`needs_review` once complete; re-running never
  regresses an `approved`/`ingested`/`expired` candidate); the shared
  candidate index (all three lookup keys; `post_url` resolves for every
  post attributed to a candidate, not just its originating post; a
  reveal closes its candidate to further matching; a still-open
  candidate expires to `expired/` at 21 days measured from its own post
  timestamp, not wall-clock; a candidate whose own post has no timestamp
  goes to `needs_review` with `issues: ["missing_timestamp"]` instead of
  entering expiry tracking at all); decision 16's skip mechanism (a post
  already present in some candidate's `contributing_posts` is skipped —
  no `generateObject` call; deleting a candidate file makes every post
  that contributed to it eligible for reprocessing again; a multi-pair
  post with only one sibling pair's file deleted reprocesses the whole
  post, regenerating every pair; a skipped post still advances the
  walk's expiry clock, so a candidate expires correctly even when every
  post in its window was skipped on a resumed run; two different posts
  that both have an empty `post_url` are never conflated — neither ever
  enters `contributing_posts`, so both stay eligible for reprocessing on
  every run rather than one silently skipping because of the other);
  the typed `issues`
  shape (every needs_review-triggering path adds the right `IssueCode`,
  never a raw string; `validateIngestPayload` failures land in `notes`,
  not `issues`); `source-ref.ts`'s post-ID parsing (extracts the real
  numeric ID from a realistic `post_url`, stable regardless of the
  post's position in the array — never falls back to array position for
  a normal post; an empty or unparseable `post_url` gets a content-hash
  `unresolvable-<hash>` fallback key and `'unresolvable_post_id'` —
  never array position; two different posts that both lack a
  `post_url` get two different hashes, never colliding; the same post's
  hash is identical across runs regardless of where it sits in the
  array); track-identification
  fallback (produces a unique placeholder per `source_ref`, never a shared
  one); the clip-health filter (thin wrapper over already-tested
  `detect-provider`/`check-url` — just confirm correct usage, only
  `direct` links get a real check per decision 12); `validateIngestPayload`'s
  new `knownTechniques` parameter (rejects a vote whose `technique_name`
  isn't in the list when passed; unchanged behavior when omitted, so the
  existing ingest-route tests keep passing unmodified); a pinned test
  asserting `TUNE_METHOD_TECHNIQUE_NAME === 'Tune Method'` against the
  real seed row in `20260625094142_initial_schema.sql`; Zod schema
  validation itself. The `generateObject` call is mocked in these tests —
  the model call itself isn't unit-testable in the traditional sense.
- **E2E / integration:** none — no deployed route is touched.
- **Manual (not automated):** decision 15's trial run — extract against
  `scripts/output/lejonklou-sample-tail/thread.json` (the last ~40 pages,
  already scraped), then hand-audit a meaningful fraction of the
  resulting `ready`/`needs_review`/`expired` candidates against the real
  source posts before a full-thread run is attempted. **Done — twice**
  (once before findings 3/4's fixes, once after); see findings 3-5 above
  for what it found and "Verified" below for the final numbers.

**Verified:** `npm run test` — 35 files / 405 tests, all passing (83 new
relative to step 33's 322: 4 in the existing `ingest-test-payload.test.ts`,
19 more across four new `lib/ingestion/extract/__tests__/*.test.ts` files
from finding 6's work, including regression tests for findings 3 and 4;
one new `clip-health.test.ts` file plus additions to `extract-post.test.ts`
and `candidate-index.test.ts` from finding 7 below). `npx tsc --noEmit` —
no new errors (same pre-existing, unrelated `__tests__/supabase-*.test.ts`
failures as every prior step).
