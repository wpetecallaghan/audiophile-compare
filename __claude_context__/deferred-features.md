---
name: audiophile-compare-deferred-features
description: >
  Architectural notes for features not yet under active development:
  agentic ingestion pipeline, owned blob storage, and mobile app.
  Load this when beginning work on any of these areas.
---

# Audiophile Compare — Deferred Features

## Agentic / programmatic API

There are exactly two anticipated non-browser callers. No public API, no versioned contract, no API keys, no OpenAPI documentation — both callers are first-party and controlled.

**Architectural decision — Go vs Next.js:** A separate Go service was considered and rejected. Both use cases are low-frequency and operate on the same data model as the browser. A Go service would add a second deployment, second secret management, and a second codebase to keep in sync with the schema, with no performance benefit at this scale. Go remains an option if sustained high concurrency or long-running operations become a concrete requirement; extraction would be mechanical since Supabase is the shared data layer.

Neither use case is currently implemented. `source_ref` is already included in the initial schema migration — no additional migration needed when the ingestion pipeline is built.

### Use case 1 — Forum ingestion pipeline

**No longer purely deferred — actively planned as build-history.md steps
30–34, with the full step-by-step plan in `build-history-ingestion.md`.**
That plan diverges from the "single `ingestion_bot` owns everything" model
described just below: it attributes each import to a per-forum-author
placeholder identity instead, so a later merge step can hand real people
their own content once they join. The rest of this section remains as
background/rationale for the parts that didn't change (idempotency via
`source_ref`, the ingest endpoint's general shape, the "no separate Go
service" decision) — see `build-history-ingestion.md` for what's current.

An AI process reads Lejonklou forum threads, extracts recordings and listening comparisons, and writes them into the database as tests, tracks, clips, and votes. Periodic scheduled refreshes catch new posts.

**Authentication:** A single dedicated `ingestion_bot` user in `auth.users`, created manually. The ingestion service authenticates as this user via Supabase Auth (magic link issued once; token stored in the service's environment). No API key table needed. Subject to standard RLS — no policy exceptions required.

*(Superseded by `build-history-ingestion.md` step 31: per-author placeholder identities via the admin/service-role client, not a single session-based bot user — see that file for why.)*

**Idempotency:** Forum posts must not produce duplicate tests on repeated runs. The `source_ref` column on `tests` (UNIQUE, nullable) records forum provenance (e.g. `'lejonklou-forum:thread-42:post-187'`). Before inserting a test, check `source_ref` — skip if already present.

**Ingest endpoint:** `POST /api/internal/ingest` — not part of any public surface. Protected by a shared secret in an environment variable (`INGEST_SECRET`), not Supabase Auth, since this is a server-to-server call:

```typescript
// app/api/internal/ingest/route.ts
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-ingest-secret')
  if (secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // ... write track, test, clips, clip_mapping, votes atomically
  // using the ingestion_bot user's supabase client
}
```

`INGEST_SECRET` is set in Vercel environment variables and in the ingestion service's environment. Never committed to source control. CORS is not needed — server-to-server call, no browser involved.

**Payload shape** (one test per call):
```typescript
type IngestPayload = {
  source_ref: string           // unique identifier for the forum post
  track: {
    artist: string
    title: string
    album?: string
    passage_note?: string
  }
  snapshot_a: {
    system_name: string        // matched or created by name
    version_label: string
    components?: object[]
  }
  snapshot_b: {
    system_name: string
    version_label: string
    components?: object[]
  }
  clip_a_url: string
  clip_b_url: string
  before_is_a: boolean
  votes?: Array<{
    chosen_label: 'A' | 'B'
    technique_name: string     // matched against listening_techniques.name
    observation?: string
    other_description?: string
  }>
}
```

The ingest route resolves or creates tracks, systems, and snapshots by name before writing the test — the same logic as the web creation flow, but automated. All writes are attributed to the `ingestion_bot` user.

### Use case 2 — Mobile app

The mobile app is a first-party client. It authenticates users via Supabase Auth directly (magic link or OAuth), storing tokens in `expo-secure-store` rather than cookies. It then calls the same `/api/` routes as the browser. **No separate auth mechanism needed** — existing RLS policies and route auth checks apply unchanged.

**Upload flow** (when owned storage is implemented):
```
Mobile → POST /api/clips/upload-url   (authenticated as user; returns presigned URL)
Mobile → PUT  {presignedUrl}          (direct to storage; no server involvement)
Mobile → POST /api/clips/confirm      (marks clip row as uploaded)
```

**CORS:** Needed only if the mobile app calls `/api/` routes directly rather than via the Supabase JS client. Add to `middleware.ts` if required:
```typescript
if (request.nextUrl.pathname.startsWith('/api/') &&
    request.headers.get('x-client') === 'mobile') {
  // set CORS headers
}
```
In practice, using the Supabase JS client for reads and the existing `/api/` routes for mutations (with the user's session token) avoids CORS entirely.

See the **Mobile app** and **Owned blob storage** sections below for technology choices and the full upload/transcoding architecture.

---

## Owned blob storage

**Context:** The current model is BYOS — users supply URLs; the app never handles audio/video bytes. This section records architectural decisions for when owned storage is added. No current code needs to change to keep these options open.

**Preferred storage options (in order):**

| Option | Notes |
|---|---|
| Supabase Storage | Already in the stack; RLS policies mirror DB rules; signed URLs for time-limited playback; direct upload from mobile without proxying. Lowest operational overhead. |
| Cloudflare R2 | S3-compatible; no egress fees (important for media replayed many times); pairs well with Vercel. Use if Supabase Storage proves limiting. |
| AWS S3 | Standard but egress costs accumulate at scale for media. Avoid unless other AWS services already in use. |

**Schema migration needed (no data migration):**
```sql
ALTER TABLE public.clips
  DROP CONSTRAINT clips_provider_check,
  ADD CONSTRAINT clips_provider_check
    CHECK (provider IN ('youtube', 'vimeo', 'direct', 'unknown', 'supabase', 'r2'));

ALTER TABLE public.clips ADD COLUMN storage_key text;
-- storage_key stores the internal object path; separate from the public/signed URL which may rotate
```

**Retention policy** must be decided before launch — retain permanently, archive after N years, or delete when parent test is deleted. Affects whether `archived_at` needs to be added to `clips`.

**Upload flow (files of any meaningful size upload directly to storage — never through the Next.js server):**
```
Mobile → POST /api/v1/clips/upload-url   (authenticated; returns presigned URL + clipId)
Mobile → PUT  {presignedUrl}             (direct to storage; server not involved)
Mobile → POST /api/v1/clips/confirm      (tells server upload is complete)
Server →      updates clip row, optionally enqueues transcode job
```

**Transcoding:** Raw mobile recordings (AAC/M4A, MP4) may need normalisation for consistent cross-device playback.
- **Recommended:** accept raw and transcode server-side using **Inngest** or **Trigger.dev** (both integrate with Vercel; support durable jobs beyond the 5-minute function limit).
- Vercel Cron is **not suitable** for transcoding — jobs may exceed the cron execution window.
- Requiring the app to transcode before upload is simpler server-side but worse UX; not recommended for a first version.

---

## Mobile app

**Context:** The mobile app is a first-party client. It authenticates users via Supabase Auth directly, storing tokens in `expo-secure-store` rather than cookies. It calls the same `/api/` routes as the browser. No separate auth mechanism is needed.

**Technology options:**

| Option | Fit | Notes |
|---|---|---|
| React Native + Expo | Best for speed | TypeScript reuse; Supabase JS client works; `expo-av` has recording APIs; cross-platform iOS + Android |
| Swift (iOS only) | Best for audio quality | Native CoreAudio/AVFoundation; sample-accurate recording; significant language investment |
| Flutter | Middle ground | Cross-platform; Dart approachable from a Java/Go background; good Supabase client |

**Recommendation:** React Native + Expo if time-to-working-app is the priority. Swift if the audiophile community is iOS-dominated and recording fidelity at the hardware level is central to the value proposition.

**Auth difference from web:** Mobile apps cannot use cookies — Supabase Auth tokens stored in `expo-secure-store`. Existing RLS policies and route auth checks apply unchanged.

**Neither owned storage nor the mobile app is currently under active development.** Begin work only after build steps 1–16 are stable in production.
