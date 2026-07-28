---
name: audiophile-compare-known-issues
description: >
  Open, unresolved bugs and environment quirks that are not fixable from
  the app codebase — investigated and characterized, but not closed. Check
  here before re-investigating something that looks like a repeat.
---

# Audiophile Compare — Known Issues (open)

## Firefox-only dev-server reload loop (open — root cause found 2026-07-28, no safe app-side fix; see build-history step 87)

**Symptom:** `next dev` (Turbopack) home page enters a rapid, self-sustaining
full-page reload loop — every ~150–350ms, indefinitely — when opened in
Firefox. Every reload refetches the full document plus all static assets
(JS/CSS/fonts). Does not reproduce in Chrome or Safari. Only observed on
`localhost`/`127.0.0.1` in dev mode; not a production issue (no `next build`
+ `next start` repro attempted, but the mechanism is dev-server/HMR-specific
so it shouldn't apply).

**Ruled out** (each verified, not assumed):
- **Uncommitted app changes** — `git stash` still reproduced the loop.
- **App code** — grepped every `location.reload`/`location.href =`/
  `router.refresh` call site in `app/`, `components/`, `lib/`; all are gated
  behind explicit user actions (sign-out click, login submit). None fire on
  page load.
- **`middleware.ts`** — no redirect logic applies to `/` (only
  `/systems`, `/tracks`, `/profile`, `/tests/new`, `/version` are protected).
- **Server-side redirect / `<meta refresh>` / `Refresh` HTTP header** — loaded
  the page with JavaScript disabled entirely: zero loop, single navigation,
  no redirects observed. This proves the loop requires JS.
- **`location.reload()` / `.assign()` / `.replace()`** — monkey-patched all
  three via Playwright's `addInitScript`; none fired across 40+ reload
  cycles. By elimination, if it's a `location` API at all, it can only be
  `location.href = ...`.
- **Cookie size** — the leading early theory (5.6 KB Supabase auth cookie on
  the `localhost` origin). Disproved: `127.0.0.1` is a different origin with
  **zero** cookies, and the loop still occurred there.
- **Browser extensions** — reproduced in a clean/extension-free Firefox
  profile.
- **Next's documented "12 failed HMR reconnects → reload" path**
  (`node_modules/next/dist/client/dev/hot-reloader/app/web-socket.js`,
  `WEB_SOCKET_MAX_RECONNECTIONS = 12`) — timing doesn't fit (would take
  12+ seconds to accumulate; observed cadence is ~150–350ms), and this
  path reloads silently with no matching console output anyway.
- **Turbopack HMR client's own catch-block reload**
  (`[turbopack]/browser/dev/hmr-client/hmr-client.ts`: `catch (e) {
  console.warn('[Fast Refresh] performing full reload...'); location.reload()
  }`) — its distinctive `console.warn` text never appears in the captured
  console output, so this path isn't firing either.
- **Turbopack dev-server self-triggered rebuild loop** — watched
  `.next/dev/cache/turbopack/` for file-write activity during an active
  reload burst; zero writes. The server itself is idle; it isn't restarting.
- **The `next` 16.0–16.2.10 middleware/proxy-bypass CVE (GHSA-6gpp-xcg3-4w24,
  Turbopack + App Router + single-locale)** — this project matches that
  affected shape exactly (Turbopack, App Router, next-intl fixed to `en`),
  and it upgraded through the fixing version (16.2.9 → 16.2.12) for
  unrelated npm-audit reasons, making this a natural hypothesis. Re-tested
  2026-07-28: still reproduces on 16.2.12 (55 reloads/15s on `localhost`).
  Every captured document response during the loop was a clean `200` with
  no `Location` header; `middleware.ts`'s only redirect branch
  (`isProtectedPath && !user`) never covers `/`. Unrelated to this bug.
- **HMR/WebSocket client code changing between Next versions** — byte-diffed
  every HMR/reconnect-relevant client file (`web-socket.js`, `shared.js`,
  `hot-reloader-app.js`, `turbopack-hot-reloader-common.js`,
  `get-socket-url.js`, both CJS/ESM) between the 16.2.9 and 16.2.12 npm
  tarballs — identical. Also re-verified the "side effect not cause"
  conclusion with real timestamps this time (not just absent console text):
  the new `request-document` for `/` fires in the same tick as, and
  *before*, the `ChunkLoadError`/WS-interrupted messages, i.e. the browser
  cancels in-flight requests because a navigation is already underway, not
  the reverse.
- **Supabase auth-client internals** (`@supabase/auth-js`/`ssr`/
  `supabase-js`, versions 0.12.3/2.110.9) — the original app-code grep
  (2026-07-13) only covered `app/`/`components/`/`lib/`, never
  `node_modules`. Grepped `auth-js`'s `GoTrueClient` directly: every
  `window.location.assign(...)` call site sits inside explicit
  user-triggered flows (OAuth sign-in, SSO/identity-linking, reauth) —
  none reachable from a plain page load with no callback params
  (`_initialize()` skips `_getSessionFromURL` entirely in that case).
  `_onVisibilityChanged` and the cross-tab `BroadcastChannel` handler only
  call `_recoverAndRefresh`/`_notifyAllSubscribers` — never a navigation.
  Live-tested logged-in vs. logged-out in Firefox: identical reload
  cadence and count in both states, including with **zero** Supabase
  cookies present. Auth state is not a variable in this bug.

## ROOT CAUSE FOUND (2026-07-28) — see build-history/87-firefox-devtools-reload-root-cause.md

**The 2026-07-13 "not `reload()`/`assign()`/`replace()`" conclusion below was a
false negative, now corrected.** The original monkeypatch
(`window.location.reload = fn` via `addInitScript`) never actually took
effect: `Object.getOwnPropertyDescriptor(window.location, 'reload')` is
`{writable:false, configurable:false}` in Firefox, so a plain (sloppy-mode)
reassignment silently no-ops instead of throwing — there was no signal that
the patch had failed, so "none fired across 40+ cycles" was measuring an
override that was never installed, not evidence `reload()` wasn't being
called.

**Actual root cause:** `node_modules/next/dist/compiled/next-devtools/index.js`
— Next.js's own dev-mode devtools overlay bundle, never examined before —
contains two `window.location.reload()` calls. One is gated behind an
explicit "restart dev server" flow (never triggered here — zero requests to
its polling endpoint were ever observed). The other is inside a handler
whose only *gated* part is an incidental Cookie-Store-API cookie write; the
`window.location.reload()` itself fires unconditionally whenever that
handler runs. Confirmed causally with two independent tests: blocking the
`next-devtools` chunk entirely dropped navigations from 67/12s to 1/12s;
serving a byte-patched copy of the *same* file with only its two
`reload()` calls neutralized (rest of the ~700KB bundle untouched, confirmed
via byte-length delta) dropped it to 2/12s. This is Next.js's own shipped
code, not application code, and it's dev-only — consistent with every
prior finding that ruled out this codebase's own source, and with the bug
never affecting production.

Related, closed upstream bug: **vercel/next.js#94634** ("infinite refresh
loop... Firefox... PPR... reproduces on 16.2.7 & 16.2.9, not 16.2.6") — same
next-devtools/Firefox-reload mechanism class, different exact trigger (that
report requires PPR/Cache Components; this app uses neither — confirmed no
`experimental.ppr`/`'use cache'` anywhere). Corroborates this is a known bug
*pattern* in Next's own devtools code, not something unique to this app.
Also checked (and ruled out as a lead) `vercel/next.js#88234`, a closed,
unrelated next-devtools console-error loop that happened to mention a
`NEXT_DEVTOOLS_DISABLED` env var — see remediation attempts below.

**Remediations attempted and why each failed (do not re-attempt):**
1. **`devIndicators: false`** in `next.config.mjs` — tested live with a full
   dev-server restart. The `next-devtools` chunk still loads and the loop
   still happens (135 nav/12s, if anything worse). This option only hides
   the visual position-indicator badge; it doesn't gate the overlay's
   mount/effect logic at all.
2. **`turbopack.resolveAlias`** pointing `next/dist/compiled/next-devtools`
   at the existing `next/dist/next-devtools/dev-overlay.shim.js` — tested
   live. That shim is *not* a safe no-op; it's an intentional
   "unreachable code" guard meant only for server-only import paths, and its
   `renderAppDevOverlay`/`dispatcher` calls unconditionally `throw`.
   Aliasing the client bundle to it made things worse (252 nav/12s) plus a
   new console error: `"Next DevTools: Can't render in this environment.
   This is a bug in Next.js"`.
3. **`NEXT_DEVTOOLS_DISABLED` env var** — mentioned in #88234 as an
   attempted (if ineffective, for *that* bug) disable flag. Grepped the
   entire installed `next` package (16.2.12): not referenced anywhere.
   Doesn't exist in this version; can't be tested or relied on.
4. **A custom compatible shim** — considered, not attempted: would require
   reverse-engineering next-devtools' private, non-semver-guaranteed
   dispatcher/render API surface. Fragile by construction (likely to break
   on any future `next` bump), disproportionate effort for a dev-only
   cosmetic bug that already has a working, zero-cost workaround.

**Conclusion: no safe, maintainable app-side fix exists in this Next.js
version.** Every avenue that would actually touch the bug requires either
editing `next`'s own compiled code (not ours to safely alter — reverted by
any reinstall/update) or reverse-engineering an explicitly-private internal
API. Not filed upstream (a deliberate choice, not an oversight) — #94634
already gives Vercel's devtools team a live, related repro.

---

**Original 2026-07-13 findings (kept for the historical investigation
trail — the "not reload/assign/replace" line item is superseded above,
the rest still stands as-is):**

**What's confirmed:**
- Requires JavaScript (proven above).
- Firefox refused to let this be intercepted: attempting to redefine
  `Location`'s `href` accessor throws `can't redefine non-configurable
  property "href"`. This is a genuine Firefox-vs-Chromium difference and is
  *why* this reproduces in Firefox specifically and why the exact call site
  couldn't be captured via automation (Playwright has no CDP-equivalent
  stack-trace hook for Firefox) — **now moot**: the call site was found
  directly by enumerating loaded scripts and testing causally, without
  needing to intercept the property at all (see root cause above).
- Every cycle, a fresh `ws://.../_next/webpack-hmr?id=<random>` connection
  opens and is aborted (`NS_BINDING_ABORTED` / "interrupted while the page
  was loading"), and the HMR client's own async script chunk frequently
  fails to finish loading ("Loading failed for the `<script>`...") before
  the next reload cuts it off — i.e. the WebSocket/HMR failures are a
  **side effect** of the reload racing ahead of them, not the cause.
- Firefox's own Bounce Tracking Protection independently flagged
  `127.0.0.1` for repeated non-user-initiated navigation — external
  corroboration this is a real, silent, script-driven reload loop.
- Switching from `localhost` to `127.0.0.1` changes the *shape* but not the
  presence of the loop: on `localhost` it ran continuously for 28+s without
  ever stabilizing (only 5/66 WS handshakes ever completed); on
  `127.0.0.1` it self-terminates after ~36 reloads (~6s), then the HMR
  socket eventually reconnects cleanly on its own ~20s later.

**To actually pin the exact call site** (requires interactive Firefox
DevTools — not automatable, this is where the investigation stopped):
Network panel → enable "Persist Logs" → reproduce the loop → click one of
the aborted `http://127.0.0.1:3000/` document requests → check its **Stack
Trace** tab. Firefox's Netmonitor captures the initiating JS call stack per
request even though the `href` property itself can't be intercepted
programmatically.

**Current workaround (unchanged, still correct):** use Chrome or Safari for
local dev on this machine. The app itself is not implicated — confirmed
twice now, in increasing detail. This is a Firefox↔`next-devtools`
interaction bug inside Next.js's own compiled code (see root cause above),
not a bug in this codebase.

**Diagnostic artifacts (not retained):** two Firefox HAR captures
(`localhost` and `127.0.0.1` runs) and a console-export log were used
during investigation and then deleted — they contained a live Supabase
session cookie and were 300–500 MB each. If this needs re-investigating,
recapture fresh rather than looking for the originals.
