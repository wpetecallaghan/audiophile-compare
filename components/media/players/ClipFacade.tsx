'use client'

import { PlayIcon } from '@/components/ui/icons'
import { EMBED_WRAPPER_CLASSES, EMBED_FILL_CLASSES } from './embedLayout'

type Props = {
  thumbnailUrl: string | null
  playLabel: string
  onActivate: () => void
}

// Rendered instead of a real YouTube/Vimeo/Google-Drive embed until the
// visitor presses play (build step 76) — mounting any of those SDKs is real,
// uncacheable work, so it's deferred rather than paid on every page load.
// Not a forwardRef player — there's no SDK instance to control yet, so it
// has no PlayerHandle to expose.
export function ClipFacade({ thumbnailUrl, playLabel, onActivate }: Props) {
  return (
    <div className={EMBED_WRAPPER_CLASSES}>
      {thumbnailUrl && (
        // Plain <img>, not next/image — a single decorative background
        // image doesn't justify a new images.remotePatterns config surface
        // (this codebase has zero existing next/image usage).
        <img
          src={thumbnailUrl}
          alt=""
          className={`${EMBED_FILL_CLASSES} object-cover`}
        />
      )}
      <button
        type="button"
        onClick={onActivate}
        aria-label={playLabel}
        className="absolute inset-0 flex items-center justify-center bg-black/30 text-white hover:bg-black/40 transition-colors"
      >
        <PlayIcon className="h-12 w-12" />
      </button>
    </div>
  )
}
