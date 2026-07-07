// A clip MediaPlayer.tsx can't embed and falls back to UnknownPlayer for —
// either the URL didn't parse (provider 'unknown') or it looked like a
// direct file but the HEAD response wasn't recognizable audio/video
// (provider 'direct', media_type 'unknown'). Shared so app/tests/[id]/
// page.tsx's decisions about this clip can't drift from MediaPlayer's own
// fallback condition — see build-history.md step 28.
export function isUnsupportedClip(clip: { provider: string; media_type: string }): boolean {
  return clip.provider === 'unknown' || (clip.provider === 'direct' && clip.media_type === 'unknown')
}
