// A clip with no player to even attempt — the URL never parsed at all
// (lib/clips/detect-provider.ts only returns provider 'unknown' when `new
// URL(rawUrl)` itself throws). 'direct' clips are NOT included here even
// when media_type is 'unknown': NativePlayer always attempts playback and
// falls back to the same link client-side if it errors (build step 54).
// Shared so app/tests/[id]/page.tsx's decisions about this clip can't
// drift from MediaPlayer's own fallback condition — see build-history.md
// step 28.
export function isUnsupportedClip(clip: { provider: string }): boolean {
  return clip.provider === 'unknown'
}
