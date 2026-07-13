---
name: audiophile-compare-known-issues
description: >
  Open, unresolved bugs and environment quirks that are not fixable from
  the app codebase — investigated and characterized, but not closed. Check
  here before re-investigating something that looks like a repeat.
---

# Audiophile Compare — Known Issues (open)

## Firefox-only dev-server reload loop (open, unresolved — 2026-07-13)

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

**What's confirmed:**
- Requires JavaScript (proven above).
- Not `reload()`/`assign()`/`replace()` (proven above) — by elimination,
  must be a `location.href = ...` write somewhere.
- Firefox refused to let this be intercepted: attempting to redefine
  `Location`'s `href` accessor throws `can't redefine non-configurable
  property "href"`. This is a genuine Firefox-vs-Chromium difference and is
  *why* this reproduces in Firefox specifically and why the exact call site
  couldn't be captured via automation (Playwright has no CDP-equivalent
  stack-trace hook for Firefox).
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

**Current workaround:** use Chrome or Safari for local dev on this machine.
The app itself is not implicated — server, middleware, and all app-level
navigation code were checked and cleared. This reads as a Firefox↔
Turbopack-dev-server interaction issue (possibly specific to this Firefox
version), not a bug in this codebase.

**Diagnostic artifacts (not retained):** two Firefox HAR captures
(`localhost` and `127.0.0.1` runs) and a console-export log were used
during investigation and then deleted — they contained a live Supabase
session cookie and were 300–500 MB each. If this needs re-investigating,
recapture fresh rather than looking for the originals.
