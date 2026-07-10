---
name: audiophile-compare-build-history-48
description: Build step 48 — grayscale favicon generated from a supplied portrait.
---

# ✅ 48 — Monochrome favicon from a supplied portrait

**What changed:** `app/favicon.ico` was replaced with a grayscale
conversion of a supplied 120×120 illustrated portrait (`peteavatar.png`,
kept in the repo root as the source asset). No application code changed —
`app/layout.tsx` has no `<link rel="icon">` metadata, so `app/favicon.ico`
(the Next.js App Router file convention) is the only favicon surface that
exists.

**Conversion approach — no new dependency.** `sharp`/ImageMagick aren't
installed and weren't worth adding for a one-off asset conversion.
macOS's built-in `sips` did the grayscale conversion (`--matchTo` the
"Generic Gray Gamma 2.2" ICC profile) and resizing to 16×16/32×32/48×48.
`sips` has no `.ico` export, so a short throwaway Node script (not
committed — it lived only in the scratchpad, run once) assembled the
three PNGs into one valid multi-resolution `.ico` by hand-writing the
ICONDIR/ICONDIRENTRY binary header and embedding the raw PNG bytes per
entry — PNG-compressed ICO entries have been supported by every modern
browser/OS since Windows Vista.

**Grayscale, not a hard black/white threshold or a color duotone** —
preserves the illustration's shading so it stays recognizable at
16×16/32×32; a 1-bit threshold on a detailed portrait risked collapsing
to an unrecognizable blob, and there was no image tool in the project
suited to tuning that well anyway.

**Deployment note:** there is no per-environment "Vercel favicon"
setting — this is just a static file in the app source, so it goes live
on whichever branch it's deployed from (per `docs/vercel-setup.md`:
`main` → Production, any pushed branch/PR, including `Staging` → Preview).

**Verified:**
- `file app/favicon.ico` — valid multi-size Windows icon resource (3
  entries: 16×16, 32×32, 48×48, PNG-compressed, 8-bit grayscale).
- Visual check of each generated PNG (120×120 grayscale master plus the
  three resized copies) — recognizable at all sizes, correctly gray, not
  blown out.
- Local dev server: `curl -I http://localhost:3000/favicon.ico` → `200`,
  `Content-Type: image/x-icon`, correct `Content-Length`.
- No unit/E2E tests affected — static asset only, no application code or
  routes changed.
