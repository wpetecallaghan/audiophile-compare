---
name: audiophile-compare-build-history-33
description: Build step 33 — Forum ingestion: scraper.
---

# ✅ 33 — Forum ingestion: scraper

Standalone script — fetch the Lejonklou thread, walk its pagination, parse
each post's author/timestamp/body (converted to markdown, not raw HTML)/
quoted-post reference/links deterministically (no LLM here), enriched with
oEmbed title/author lookups for YouTube/Vimeo links to aid track
identification downstream. Writes a raw-posts JSON artifact consumed by
step 35; doesn't call the ingest route or need any credentials. Verified
directly against the real live forum, not just fixtures — this caught and
fixed a real bug (special-role usernames render as `a.username-coloured`,
silently dropping the forum's own admin/owner as an author) and corrected
an over-confident early claim about `quoted_post_url` (null only for the
thread's 2016-era posts; the forum was evidently upgraded at some point,
and 35% of a 978-post sample from its recent history resolve a real one).
Full plan: `build-history-ingestion/33-scraper.md`.
