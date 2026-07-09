import { detectProvider } from '@/lib/clips/detect-provider'
import { checkDirectUrl } from '@/lib/clips/check-url'

export type ClipHealthStatus = 'ok' | 'missing' | 'dead' | 'unplayable' | 'unverifiable'

// Deterministically catches a real model-classification error (found via
// build-history-ingestion.md step 35 decision 15's trial run): the model
// can classify a post as test_defining and invent/mistranscribe a clip
// URL that was never actually in the post at all — one real example had
// zero links in the post, yet the model produced two empty-string "clip"
// URLs. Checked here in code, never left to the model to always get
// right.
export function isRealPostLink(url: string, postLinks: string[]): boolean {
  return url.trim() !== '' && postLinks.includes(url)
}

// Checks whether a clip URL is genuinely usable — not just reachable.
// decision 12 (and the real POST /api/clips/verify route it mirrors)
// only ever checks reachability for a `direct`-provider link, and
// otherwise trusts youtube/vimeo/google-drive by URL shape alone. That's
// the right call for the live app — a human submitting a URL there has
// already confirmed it plays before creating the test — but decision 15's
// real trial run found it isn't enough for extraction's historical,
// second-hand URLs: a Dropbox preview page, a Google Photos share link,
// and an iCloud share link all return a healthy `200 text/html` response
// — reachable, but not a playable media file the app can actually embed.
// None of them need special-casing: all three already fall into
// `detectProvider`'s generic `direct` bucket (none match the
// youtube/vimeo/google-drive URL patterns), so a single tightened
// media_type check catches all three uniformly. A Dropbox `dl=0` ->
// `dl=1` rewrite was considered and rejected — verified against real
// broken examples (both HEAD and GET) that it does not actually change
// the response; still `text/html` either way, so no fix to attempt.
//
// google-drive is its own case, found while building the retroactive
// recheck script: unlike Dropbox/Photos/iCloud, a `drive.google.com`
// link can't even be checked by a network request in the first place.
// Verified against real examples — a confirmed-broken (deleted) file id
// and a still-unreviewed one both returned an *identical* anonymous 404
// "Page not found" page (tried `/preview`, `/view`, and the
// `uc?export=download` redirect chain, with and without a browser
// User-Agent). Drive's file endpoints require a real signed-in browser
// session to render, so an unauthenticated request can't distinguish
// dead from healthy — trying anyway would flag every Drive link as dead,
// including ones that work fine for an actual visitor. So this never
// makes a network call for google-drive; it reports 'unverifiable' and
// leaves the real judgment to a human (see `unverifiable_clip_url`).
//
// This deliberately does not touch `lib/clips/detect-provider.ts` /
// `check-url.ts` — the same functions `POST /api/clips/verify` and the
// live app's player use — so live-app behavior is unaffected; this is an
// extraction-only tightening, wrapping the same primitives rather than
// changing them.
export async function checkClipHealth(url: string): Promise<ClipHealthStatus> {
  const detected = detectProvider(url)

  if (detected.provider === 'google-drive') return 'unverifiable'

  // youtube/vimeo: trusted by URL shape, decision 12, unchanged — their
  // embed endpoints are genuinely public and don't require a session.
  if (detected.provider !== 'direct') return 'ok'

  const checked = await checkDirectUrl(detected)
  if (checked.url_status === 'dead') return 'dead'
  // 'degraded' (timeout / 5xx) is deliberately left as passable, matching
  // decision 12's original leniency for a possibly-transient condition —
  // this tightening only refines what counts as a genuine 'ok', not what
  // counts as 'dead'.
  if (checked.url_status === 'ok' && checked.media_type === 'unknown') return 'unplayable'
  return 'ok'
}

// The combined check extraction actually uses: a clip URL first has to be
// a real link from the post it supposedly came from, then has to be
// genuinely healthy. Never makes a network call for a URL that fails the
// first check.
export async function checkClipStatus(url: string, postLinks: string[]): Promise<ClipHealthStatus> {
  if (!isRealPostLink(url, postLinks)) return 'missing'
  return checkClipHealth(url)
}
