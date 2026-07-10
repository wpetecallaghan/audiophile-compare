---
name: audiophile-compare-build-history-ingestion-33
description: Forum ingestion step 33 — Scraper.
---

# ✅ 33 — Scraper

**The gap this closes:** phase 1 of the pipeline (fetch) doesn't exist.
Originally bundled with extraction as one step; split in two because they
have very different risk profiles — this step is deterministic and fully
testable, extraction (step 35) is genuinely uncertain and was already
flagged as needing its own design pass. Splitting also gives extraction a
stable, re-runnable input: iterating on extraction logic no longer means
re-scraping the forum each time.

**Decisions:**

1. **A standalone script, not a deployed route.** `scripts/scrape-lejonklou.ts`,
   run manually/locally against a thread URL. The original doc's
   aspiration of "periodic scheduled refreshes" is explicitly **not** in
   scope for this pass — running it by hand against a specific thread is
   enough for the stated goal, and scheduling can be layered on later
   without changing anything else in this plan.

2. **Deterministic HTML parsing only — no LLM, no network calls beyond
   fetching thread pages and per-link oEmbed lookups (decision 8).** Walk
   the thread's pagination and, for each post, extract: `post_url`
   (permalink — this is also what step 35 carries into each candidate's
   `source_url`, populating the "view original post" link `build-history/32-import-provenance-ui.md`
   adds to the UI), `author` (raw forum username/display name as shown),
   `posted_at` (ISO 8601, parsed from the forum's displayed timestamp),
   `body_markdown` (converted deterministically from the raw HTML — quote
   blocks become `> text`, links become `[text](url)` — rather than kept
   as raw HTML: extraction (step 35) is an LLM call, and clean, structured
   text is cheaper and more reliable input than HTML tag soup), and
   `links` (every outbound URL found in the body — a flat list, no
   judgement about which ones are "the" comparison clips; that's a
   semantic call, correctly left to step 35).

3. **Reply attribution needs a structured signal, not just prose.**
   Real thread behaviour (confirmed against how this specific forum is
   actually used): a listener's reply sometimes quotes the original test
   post, or an earlier reply, to indicate which test it's about — but
   votes also interleave across multiple open tests, so position in the
   thread alone isn't reliable. Capture `quoted_post_url: string | null`
   — the `post_url` this post quotes/replies to, when the forum's quote
   markup resolves to one — as the primary signal step 35 uses for
   attributing a reply to the right test. This won't always be present;
   step 35 still needs a fallback for replies without one (see step 35's
   decision 10).

4. **Track identification enrichment: fetch oEmbed metadata for
   YouTube/Vimeo links, deterministically, no LLM.** Forum creators rarely
   name the track in text — "sometimes... but often do not." A YouTube/
   Vimeo oEmbed lookup (public, unauthenticated, just another HTTP fetch)
   often surfaces a real title/author for official-style uploads, though
   it won't help for clips that are personal recordings of someone's own
   system (a plausible and possibly common case here) — it's a best-effort
   signal, not a guarantee. Extends each link to:
   ```typescript
   type ScrapedLink = {
     url: string
     oembed_title?: string
     oembed_author?: string
   }
   ```
   Reuses `detectProvider` (`lib/clips/detect-provider.ts`) to decide which
   links are worth an oEmbed call at all.

   Full output shape after decisions 2–4:
   ```typescript
   type ScrapedPost = {
     post_url: string
     author: string
     posted_at: string
     body_markdown: string
     quoted_post_url: string | null
     links: ScrapedLink[]
   }

   type ScrapedThread = {
     thread_url: string
     scraped_at: string
     posts: ScrapedPost[]   // thread order, oldest first
   }
   ```
   Written as a JSON file (path given via CLI arg, e.g.
   `scripts/scrape-lejonklou.ts <thread-url> <output-path>`) — this is the
   interface boundary with step 35, and the reason step 35 can be iterated
   on without re-hitting the forum. Scraped output shouldn't be committed —
   add its default output location to `.gitignore`.

5. **This step never calls `/api/internal/ingest` and needs no
   ingest-related credentials.** It only reads a public forum thread and
   makes public oEmbed lookups. `INGEST_SECRET` and payload construction
   belong entirely to steps 33/34 — resolves what was previously an
   unstated gap (the original combined step never said how the scraper
   would authenticate to the route; splitting makes the answer "it
   doesn't, because it isn't the part that calls it").

6. **Reuse `jsdom` for HTML parsing rather than adding a new dependency
   (e.g. `cheerio`).** `jsdom` is already a devDependency (used for
   component tests) and works fine for loading a fetched HTML string into
   a queryable DOM (`new JSDOM(html).window.document.querySelectorAll(...)`)
   outside of a test context. Fetching itself uses the built-in global
   `fetch` — no new dependency there either.

7. **Runtime: add `tsx` as a new devDependency.** Nothing in this repo can
   currently execute a standalone `.ts` file that resolves the `@/lib/...`
   path alias — there's no `ts-node`/`tsx` today, and this script needs
   that alias (it imports shared types alongside the plain parsing logic).
   `tsx` is zero-config and handles both TS and path-mapping. Add an npm
   script: `"scrape:lejonklou": "tsx scripts/scrape-lejonklou.ts"`.

8. **Parsing logic lives in `lib/`, not the script — same pattern as
   `create-placeholder-author.ts` (step 30) and `ingest-test-payload.ts`
   (step 31).** The script itself (`scripts/scrape-lejonklou.ts`) is a
   thin CLI wrapper: fetch each page, call the pure parsing functions, walk
   pagination, write the JSON file. The actual parsing —
   `parsePostsFromPage(html, pageUrl): ScrapedPost[]` (including the
   HTML→markdown conversion and quote-URL resolution) and
   `findNextPageUrl(html, currentUrl): string | null` — lives in
   `lib/ingestion/scrape/parse-thread-page.ts`, so it's unit-testable
   against fixture HTML without a live network call or a `.ts` runner. The
   oEmbed fetch (decision 4) is a separate, mockable function so it can be
   unit-tested without a live network call either.

**Files updated:**
- `lib/ingestion/scrape/parse-thread-page.ts` (new) — `ScrapedPost`/
  `ScrapedLink`/`ScrapedThread` types, `parsePostsFromPage`,
  `findNextPageUrl`.
- `lib/ingestion/scrape/fetch-oembed.ts` (new) — oEmbed lookup for
  YouTube/Vimeo links.
- `scripts/scrape-lejonklou.ts` (new) — CLI entrypoint.
- `package.json` — new `tsx` and `@types/jsdom` devDependencies; new
  `scrape:lejonklou` script.
- `.gitignore` — `scripts/output/` (covers this step's scraped output and
  step 35's future candidate files in one entry).
- `core.md` — build status line: step 33 done, 34–38 still planned; test
  counts updated (29 files / 308 tests).
- `testing.md` — inventory rows for the new parsing/oEmbed unit tests.

**Decisions confirmed/refined against the real forum** (fetched a live
thread page directly to ground this in actual markup, not assumed generic
phpBB structure):
- Posts are `div.post[id="p12345"]`; the byline (`p.author`) holds the
  author's username link and a `<time datetime="...">` with a
  machine-readable ISO timestamp — used directly, no date parsing needed.
- Pagination's "next" link carries a semantic `rel="next"` attribute —
  used instead of matching visible text (themeable/localizable).
- **`quoted_post_url` reliability turned out to be *era-dependent*, not a
  fixed forum-wide limitation — corrected after sampling further into the
  thread.** The first investigation (a 100-post sample from the thread's
  2016 start) found phpBB's default "Reply with quote" rendering as
  `<blockquote><div><cite>user wrote:</cite>text</div></blockquote>`, with
  no link back to the quoted post at all, and concluded `quoted_post_url`
  would resolve to `null` in the common case. A second, 978-post sample
  from the *end* of the thread (the most recent ~40 pages) told a
  different story: **342 of 978 posts (35%) resolve a real
  `quoted_post_url`.** The forum's phpBB software was evidently upgraded
  at some point between 2016 and today to a version with a "quote
  permalink" feature — recent quotes render as `<blockquote cite="...
  #p72033">` with an additional clickable `↑` anchor
  (`data-post-id="72033"`) back to the source post, confirmed to always
  co-occur 1:1 with the `cite` attribute on a real sampled page. The
  existing extraction code needed **no changes** to handle this — it
  already looked for any `blockquote a[href]` matching a post-id pattern,
  which happens to catch the new anchor too. Net effect: `quoted_post_url`
  is a *strong* signal for a real fraction of replies from the thread's
  more recent (and more voluminous) history, not the rare fallback
  originally described — step 35's reply-attribution design should treat
  it accordingly, while still needing the fallback heuristic for the
  majority of posts (either from before the upgrade, or with no quote at
  all).
- **Real bug found and fixed via the same deeper sampling: special-role
  usernames (admins, custom profile colors) render as `a.username-coloured`
  instead of `a.username`.** A class-based author selector silently
  dropped every post from this forum's own admin/owner — a very frequent
  poster in their own thread — across the entire original 100-post sample.
  Fixed by matching the structural `p.author strong a` wrapper both
  variants share, rather than a specific username class; added a
  regression test; re-verified 0 empty authors across a 978-post sample.
- Ephemeral `sid` (session id) query params are stripped from every stored
  permalink (`post_url`, resolved `quoted_post_url`) so they stay stable
  across scrapes — a `sid` is per-session, not part of a real permalink.
- Confirmed live end-to-end (not just against fixtures): ran the actual
  CLI script against the real thread for ~3 real pages (deliberately
  stopped short of the full 316-page crawl — no reason to hit someone
  else's forum harder than needed just to verify the code works), correctly
  walking pagination and extracting real posts, including a real quoted
  reply, matching the fixture-based unit test expectations exactly. Two
  further real samples (100 posts from the start, 978 posts from the last
  ~40 pages) drove the two corrections above and gave step 35 real,
  representative examples of a vote-only post with no links, a genuine
  reveal post (`A = Lingo 2 ... B = Lingo 3`, confirming letter labels are
  real alongside the bare-number style seen in the earlier sample, and
  that reveals name components/systems, not tracks — matching decision 8's
  design), and a deferred-reveal announcement ("one more shootout, then
  I'll reveal...").

**Finding from this verification, now being addressed by `build-history/34-google-drive-clip-provider.md`
(Google Drive clip provider support) — partially resolved, not
blocking this step either way:** real clip hosting has shifted over time
from Dropbox/YouTube (2016-era sample) to Google Drive, Google Photos, and
iCloud shared links (current-era sample: 74 Drive + 52 Photos + 17 iCloud
links, vs. 3 YouTube links total across both samples). None were
recognized by `detectProvider()` (`youtube`/`vimeo`/`direct`/`unknown`) —
all fell into `unknown`, where the existing clip-health check doesn't
meaningfully validate them (a share page returns `200 text/html`
regardless of whether the underlying media actually plays) and the app's
player shows a bare link rather than embedded playback. Step 34 adds
first-class `google-drive` provider support (a stable, confirmed-embeddable
`/preview` URL exists), closing the gap for the largest single host (74 of
143 links). **Google Photos and iCloud remain `unknown` by design, not as
a remaining gap** — neither has a public, stable, embeddable URL for
third-party use, and screen-scraping one would be fragile. Not blocking
this step either way.

**Refinement (built): resumable per-page caching, so a re-run doesn't
re-fetch (or re-hit) the live forum for pages it already has.** Before
this, every run walked pagination from page 1 and re-fetched every page
over the network, every time — fine for a first scrape, wasteful and
impolite to the real forum for a re-run that's only trying to pick up a
few new pages, or to re-derive output after a parser fix (like the real
`username-coloured` bug found and fixed above) without needing fresh
network content at all. Layout, derived from the CLI's own
`<output-path>` argument rather than a hardcoded location (the script's
signature is `scrape-lejonklou.ts <thread-url> <output-path>` — the
output path is caller-supplied, so the cache must be too):
```
<dirname(outputPath)>/scrape-cache/
  raw/page-0001.html, page-0002.html, ...      cached raw HTML per page
  parsed/page-0001.json, page-0002.json, ...   parsed, oEmbed-enriched
                                                ScrapedPost[] per page
<outputPath>                                    assembled ScrapedThread —
                                                 unchanged interface, still
                                                 what extraction reads
```
Walking pagination, each page checks its own `raw/` cache first: present
→ read from disk instead of fetching (no network call at all, no load on
the real forum); its `parsed/` file also checked separately — present →
skip parsing (and oEmbed enrichment, see below) too, absent → re-parse the
cached HTML (still no network call). This gives a human two distinct,
file-deletion-driven signals: delete only a page's `parsed/` file to force
a re-parse from cache (the right move after a parser fix); delete both
`raw/` and `parsed/` to force a genuine re-fetch (the right move when the
live content itself needs refreshing). The final assembled thread file —
extraction's actual input — is still written every run exactly as today;
nothing about step 35's interface to this step changes. **Accepted
limitation, not solved by this design:** caching by page assumes the
forum's own pagination boundaries stay stable between runs; if an old
post is deleted or moved on the live forum, cached pages could silently
stop corresponding to what a fresh fetch would produce, undetectable
unless the cache is deliberately cleared — reasonable for a mostly-static
historical archive, not guaranteed in general. **This is exactly why
step 35's `source_ref` (decision 2) keys candidates off the real phpBB
post ID parsed from `post_url`, not array position** — this caching
design means a re-scrape can genuinely process a different subset/order
of network activity than a prior run, and only an identifier tied to
the post's own permanent identity survives that; an array-position key
would silently drift.

**oEmbed enrichment moves per-page, folded into the `parsed/` cache —
not a separate whole-thread pass at the end.** The original draft of
this refinement only cached the fetch+parse cost; oEmbed lookups
(decision 4) still ran as one pass over every post after the whole walk
finished, regardless of caching, so a cached page would still re-pay its
oEmbed cost on every run. Fixed by enriching a page's links immediately
after parsing it, before writing that page's `parsed/` cache file — a
cached page's parsed JSON already carries its enrichment, so only
genuinely new/reprocessed pages make oEmbed calls at all. No change to
the output itself, just when enrichment happens.

**Coupling with step 35's own "delete a file to reprocess" mechanism
(decision 16), not to be confused with each other:** deleting a
candidate file forces extraction to reprocess the posts that built it,
but only using whatever's currently in the assembled thread file — if
that still reflects a stale cached page (nobody cleared `raw/`/`parsed/`
for it), the candidate gets "reprocessed" against the same old content,
not fresh content. Getting genuinely fresh live content into a
reprocessed candidate requires clearing *both* caches — this step's page
cache and step 35's candidate file — not just the one that seems
relevant.

**Files updated (this refinement):**
- `lib/ingestion/scrape/page-cache.ts` (new) — read/write helpers for a
  page's raw HTML and parsed+enriched JSON, given a base cache directory
  and page number; pure and unit-testable, no network calls, following
  this step's own established pattern (decision 8: parsing logic lives
  in `lib/`, not the script, precisely so it's testable without a live
  network call). Cache misses return `null` (never throw); any
  non-`ENOENT` read error still propagates rather than being silently
  treated as a miss.
- `scripts/scrape-lejonklou.ts` — per-page read-cache-or-fetch and
  read-cache-or-parse-and-enrich logic (`loadPage`), using
  `page-cache.ts`'s helpers; cache directory derived from
  `join(dirname(outputPath), 'scrape-cache')`; the polite
  `REQUEST_DELAY_MS` delay now only applies after a page that was
  actually fetched over the network, not a cache hit; still assembles
  and writes the final thread file unchanged at the end. Also gained a
  new optional third CLI argument, `[max-pages]`, capping how many pages
  a single invocation walks (independent of the existing `MAX_PAGES=500`
  safety constant) — added so a bounded sample near the thread's end
  could be taken and then resumed without walking the whole thread from
  page 1 to get there; `<thread-url>` was already usable with any
  `start=` offset, not just the thread's first page, so no change was
  needed there, just documented more explicitly in the script's header
  comment.
- `lib/ingestion/scrape/parse-thread-page.ts` — unchanged, as planned;
  `parsePostsFromPage`/`findNextPageUrl` have no new callers' concerns to
  accommodate.
- `.gitignore` — no change needed; `scripts/output/` already covers the
  new `scrape-cache/` subfolder since the output path stays under it.
- `__claude_context__/testing.md` / `core.md` — new inventory row and
  updated test counts (30 files / 322 tests).

**Verified:** `npx vitest run lib/ingestion/scrape/__tests__/page-cache.test.ts`
— 8/8 passing (cache miss returns `null`; raw HTML and parsed+enriched
JSON round-trip; keyed correctly per page number, not overwriting
siblings; page numbers zero-padded on disk; cache directory created on
first write without needing to pre-exist; a non-`ENOENT` read error
propagates rather than being swallowed). Full suite:
`npm run test` — 30 files / 322 tests, all passing (8 new). `npx tsc
--noEmit` — no new errors (same pre-existing, unrelated
`__tests__/supabase-*.test.ts` failures as every prior step).

**Also confirmed live, end-to-end, against the real forum** (fetched the
thread's own page 1 first, once, to read its real pagination — 316 pages,
25 posts/page, 7,878 posts total at time of testing — and compute a
starting URL 40 pages from the end, rather than walking there from page
1): ran the CLI twice against `https://www.lejonklou.com/forum/
viewtopic.php?f=2&t=3233&start=6900`, first capped at 39 pages, then
uncapped. Run 1 made 39 genuine fetches and stopped exactly one page
short of the real end (975 posts). Run 2 read all 39 pages from cache —
zero network requests for any of them — and made exactly one real fetch,
for the true last page (978 posts, the 3-post difference matching what's
actually on that page). Cache directory held 40 `raw/` + 40 `parsed/`
files afterward, one per page. This output became the new
`scripts/output/lejonklou-sample-tail/thread.json` (see decision 15 in
step 35), superseding the older one-off-script-generated sample of the
same name — now regenerable via this CLI directly rather than a
throwaway script.

**Tests:**
- **Unit:** `lib/ingestion/scrape/__tests__/parse-thread-page.test.ts` (10
  tests) — author/timestamp/permalink/body/links extraction against
  fixtures modeled on the real markup above; `sid` stripped from
  permalinks; quote → markdown conversion; `quoted_post_url` resolves to
  `null` for a default phpBB quote and to a real URL for a manually-linked
  one; links inside a quote excluded from the post's own `links`; a post
  missing its username link or timestamp doesn't throw; multiple posts
  per page extracted in document order; `findNextPageUrl` via `rel="next"`,
  `null` on the last page.
  `lib/ingestion/scrape/__tests__/fetch-oembed.test.ts` (6 tests) —
  successful YouTube/Vimeo lookups populate `oembed_title`/`oembed_author`;
  a non-YouTube/Vimeo link is skipped with no network call; a failed/404
  response or a network error is swallowed rather than thrown;
  `enrichLinksWithOEmbed` enriches each link independently, in order.
- **E2E / integration:** none planned, and none added — no app code, no
  deployed route, no DB. (Verified live against the real forum instead —
  see above.)

**Verified:** `npm run test` — 29 files / 308 tests, all passing (16 new).
`npx tsc --noEmit` — no new errors (same pre-existing, unrelated
`__tests__/supabase-*.test.ts` failures as every prior step). Parsing
logic additionally verified directly against a real, live-fetched forum
page (not just fixtures) — see "Decisions confirmed/refined" above.

---
