---
name: audiophile-compare-build-history-87
description: Build step 87 — root cause found for the Firefox dev-server reload loop; no safe app-side fix exists, documented and left open.
---

# 🔍 87 — Firefox dev-server reload loop: root cause found, no safe app-side fix exists

**Why this step exists:** `known-issues.md` had tracked a Firefox-only,
dev-mode-only rapid reload loop on `/` since 2026-07-13 as unresolved
(root cause unknown). A 2026-07-28 re-investigation disproved three more
hypotheses (a `next` CVE fix, HMR/WebSocket, Supabase auth-client
internals — see that entry's own history) but still left the trigger
unidentified. This step went one step further, found the actual root
cause with hard evidence, then attempted three different app-side
remediations. None are safe to ship. This step documents that outcome so
nobody re-investigates from scratch or re-attempts an approach already
proven not to work.

**Root cause:** `node_modules/next/dist/compiled/next-devtools/index.js`
— Next.js's own dev-mode devtools overlay bundle, never examined in the
prior investigation rounds — contains two `window.location.reload()`
calls. One sits behind an explicit "restart dev server" flow (never
triggered here — zero requests to its polling endpoint were ever
observed during the loop). The other is inside a handler whose only
*gated* part is an incidental Cookie-Store-API cookie write; the
`window.location.reload()` itself fires unconditionally whenever that
handler runs.

Confirmed causally, not just correlated, with two independent tests:
1. Blocking the `next-devtools` chunk entirely via Playwright route
   interception (`page.route().abort()`): navigations dropped from
   67/12s (control, same script) to 1/12s.
2. Serving a byte-patched copy of the *same* file with only its two
   `window.location.reload()` calls replaced by a no-op (the rest of the
   ~700KB bundle left completely untouched, confirmed via a byte-length
   delta proving the replacement actually matched): 67/12s → 2/12s.

This is Next.js's own shipped code, not application code, and it only
ships in dev mode — consistent with every earlier finding that ruled out
this codebase's own source, and with the bug never reproducing in
production.

**Also corrected a stale finding from the original 2026-07-13
investigation:** that investigation concluded `location.reload()`/
`.assign()`/`.replace()` never fired, based on monkey-patching all three
via `addInitScript` and seeing none of them invoked across 40+ reload
cycles. Directly tested this round: `window.location.reload = fn` in
Firefox silently no-ops rather than throwing —
`Object.getOwnPropertyDescriptor(window.location, 'reload')` is
`{writable:false, configurable:false}`, and a sloppy-mode reassignment to
a non-writable property fails silently with no error. The original patch
never took effect; "none fired" was a false negative measuring a
no-op override, not evidence against `reload()` being called. Firefox's
refusal to let `Location.prototype.href` be redefined (also documented in
that entry) is a real, separately-confirmed restriction, but the
conclusion drawn from the reload-monkeypatch test specifically was wrong.

**Related upstream bug (closed):** `vercel/next.js#94634` — "infinite
refresh loop... Firefox... PPR... reproduces on 16.2.7 & 16.2.9, not
16.2.6." Same next-devtools/Firefox-reload mechanism class, a different
exact trigger (that report requires PPR/Cache Components; this app uses
neither — confirmed no `experimental.ppr`/`'use cache'` directive
anywhere in the codebase). This corroborates the bug as a known *pattern*
in Next's own devtools code rather than something unique to this app.
Also checked `vercel/next.js#88234` (closed, unrelated next-devtools
console-error loop) — mentioned a `NEXT_DEVTOOLS_DISABLED` env var, which
led to remediation attempt 3 below.

**Remediations attempted, and why each failed or couldn't be used:**

1. **`devIndicators: false`** in `next.config.mjs` — tested live with a
   full dev-server restart. The `next-devtools` chunk still loaded and
   the loop still happened (135 nav/12s — if anything worse than the
   67/12s baseline). This option only hides the visual position-indicator
   badge; it doesn't gate the overlay's underlying mount/effect logic.
2. **`turbopack.resolveAlias`** pointing `next/dist/compiled/next-devtools`
   at the existing `next/dist/next-devtools/dev-overlay.shim.js` — tested
   live. That shim is *not* a safe no-op: it's an intentional
   "unreachable code" guard meant only for server-only import paths where
   the overlay should genuinely never render, and its
   `renderAppDevOverlay`/`dispatcher` calls unconditionally `throw`
   (`"Next DevTools: Can't render in this environment. This is a bug in
   Next.js"`). Aliasing the *client* bundle to it made things worse
   (252 nav/12s) rather than better.
3. **`NEXT_DEVTOOLS_DISABLED` env var** — the one lead from #88234.
   Grepped the entire installed `next` package (16.2.12): not referenced
   anywhere in this version. Can't be tested or relied on here; may be a
   canary-only or not-yet-released flag.
4. **A custom compatible shim** — considered, not attempted. Would
   require reverse-engineering next-devtools' private, non-semver
   dispatcher/render API surface closely enough to produce a working
   (non-throwing) stand-in. Fragile by construction — likely to break on
   any future `next` version bump — and disproportionate effort for a
   dev-only cosmetic bug that already has a working, zero-cost
   workaround (use a different browser).

**Decision: no application code change is being made.** Every avenue
that would actually touch the bug requires either editing `next`'s own
compiled code (not ours to safely alter — any change there is reverted
by the next `npm install`/version bump) or reverse-engineering an
explicitly-private internal API not covered by semver guarantees.
Deliberately not filing a new issue upstream — #94634 already gives
Vercel's devtools team a live, related repro; a second one wasn't judged
to add enough value to justify a public filing right now.

**Current workaround (unchanged from 2026-07-13):** use Chrome or Safari
for local dev on this machine.

**Files updated:**
- Docs only: `known-issues.md` (root cause, corrected stale finding,
  remediation attempts added to the existing Firefox reload loop entry),
  this file, `build-history/index.md`.
- No application code touched. `next.config.mjs` was temporarily modified
  twice during investigation (`devIndicators: false`, then a
  `turbopack.resolveAlias` entry) and reverted both times — confirmed
  back to its original state with `git diff` showing no changes.
