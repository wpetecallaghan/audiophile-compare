---
name: audiophile-compare-build-history-index
description: >
  Index of all build steps for the Audiophile Compare app. Each step
  has its own file with full implementation notes and rationale. Load only
  the specific step file(s) relevant to your task, not this whole directory.
---

# Audiophile Compare — Build History Index

Historical build log, split one file per step. For deferred features (owned
storage, mobile app) see `deferred-features.md`. Forum-ingestion steps 30, 31,
33, 35-39 have short pointer entries here but full detail in
`build-history-ingestion/` — see that directory's own index.

| Step | Title | File |
|---|---|---|
| 1 | Supabase schema, RLS, seed data | [01-supabase-schema-rls-seed.md](01-supabase-schema-rls-seed.md) |
| 2 | Auth — Supabase Auth, middleware, magic link, callback route | [02-auth-magic-link.md](02-auth-magic-link.md) |
| 3 | Clip URL verification — `POST /api/clips/verify` | [03-clip-url-verification.md](03-clip-url-verification.md) |
| 4 | MediaPlayer — YouTube / Vimeo / native / unknown | [04-media-player.md](04-media-player.md) |
| 5 | Test creation wizard (`CreateTestForm`) | [05-test-creation-wizard.md](05-test-creation-wizard.md) |
| 6 | Test detail page + blind playback | [06-test-detail-blind-playback.md](06-test-detail-blind-playback.md) |
| 7 | Voting | [07-voting.md](07-voting.md) |
| 8 | Results by technique | [08-results-by-technique.md](08-results-by-technique.md) |
| 9 | System catalogue | [09-system-catalogue.md](09-system-catalogue.md) |
| 10 | URL health check cron | [10-url-health-check-cron.md](10-url-health-check-cron.md) |
| 11 | Public feed + pagination | [11-public-feed-pagination.md](11-public-feed-pagination.md) |
| 12 | Site header | [12-site-header.md](12-site-header.md) |
| 13 | Display name / profile | [13-display-name-profile.md](13-display-name-profile.md) |
| 14 | OAuth / Google sign-in | [14-oauth-google-sign-in.md](14-oauth-google-sign-in.md) |
| 15 | Centralised string resources (i18n) | [15-i18n-string-resources.md](15-i18n-string-resources.md) |
| 16 | Email/password auth and account management | [16-email-password-auth.md](16-email-password-auth.md) |
| 17 | End-to-end test coverage | [17-e2e-test-coverage.md](17-e2e-test-coverage.md) |
| 18 | Deployed version / commit info page | [18-version-commit-info-page.md](18-version-commit-info-page.md) |
| 19 | About / how-it-works page | [19-about-page.md](19-about-page.md) |
| 20 | Visual polish | [20-visual-polish.md](20-visual-polish.md) |
| 21 | Link component | [21-link-component.md](21-link-component.md) |
| 22 | Componentize remaining repeated form/text elements | [22-componentize-form-elements.md](22-componentize-form-elements.md) |
| 23 | Allow anonymous clip playback | [23-anonymous-clip-playback.md](23-anonymous-clip-playback.md) |
| 24 | Add `/privacy` and `/terms` pages | [24-privacy-terms-pages.md](24-privacy-terms-pages.md) |
| 25 | Fixed header/footer app shell with internal scroll region | [25-fixed-header-footer-shell.md](25-fixed-header-footer-shell.md) |
| 26 | Delete tests, snapshots, and systems | [26-delete-tests-snapshots-systems.md](26-delete-tests-snapshots-systems.md) |
| 27 | Handle verified-broken clip URLs | [27-verified-broken-clip-urls.md](27-verified-broken-clip-urls.md) |
| 28 | Concise presentation for unsupported-playback clips | [28-unsupported-playback-presentation.md](28-unsupported-playback-presentation.md) |
| 29 | Register with Google | [29-register-with-google.md](29-register-with-google.md) |
| 30 | Forum ingestion: placeholder author infrastructure | [30-ingestion-placeholder-authors.md](30-ingestion-placeholder-authors.md) |
| 31 | Forum ingestion: internal ingest API route | [31-ingestion-internal-ingest-route.md](31-ingestion-internal-ingest-route.md) |
| 32 | Import provenance UI | [32-import-provenance-ui.md](32-import-provenance-ui.md) |
| 33 | Forum ingestion: scraper | [33-ingestion-scraper.md](33-ingestion-scraper.md) |
| 34 | Google Drive clip provider support | [34-google-drive-clip-provider.md](34-google-drive-clip-provider.md) |
| 35 | Forum ingestion: extraction | [35-ingestion-extraction.md](35-ingestion-extraction.md) |
| 36 | Forum ingestion: commit | [36-ingestion-commit.md](36-ingestion-commit.md) |
| 37 | Forum ingestion: run the import, staging then production | [37-ingestion-run-import.md](37-ingestion-run-import.md) |
| 38 | Data erasure requests (votes / content / full account) | [38-data-erasure-requests.md](38-data-erasure-requests.md) |
| 39 | Claim flow (merge a placeholder into a real account) | [39-claim-flow.md](39-claim-flow.md) |
| 40 | Surface system/snapshot info consistently: test detail page + ingested test titles | [40-system-snapshot-info-consistency.md](40-system-snapshot-info-consistency.md) |
| 41 | Surface admin page links on the profile page | [41-admin-page-links-profile.md](41-admin-page-links-profile.md) |
| 42 | Correct /about, /privacy, /terms against real functionality | [42-about-privacy-terms-correction.md](42-about-privacy-terms-correction.md) |
| 43 | Hide system/component identity on blind tests | [43-hide-blind-test-system-info.md](43-hide-blind-test-system-info.md) |
| 44 | Keep the "view original post" link after a claim | [44-preserve-original-post-link-after-claim.md](44-preserve-original-post-link-after-claim.md) |
| 45 | Per-user listening technique preferences | [45-per-user-technique-preferences.md](45-per-user-technique-preferences.md) |
| 46 | Optional, editable forum discussion link | [46-forum-discussion-link.md](46-forum-discussion-link.md) |
| 47 | "Imported" badge survives a claim | [47-imported-badge-survives-claim.md](47-imported-badge-survives-claim.md) |
| 48 | Monochrome favicon from a supplied portrait | [48-monochrome-favicon.md](48-monochrome-favicon.md) |
| 49 | Format dates using the visiting browser's locale | [49-browser-locale-dates.md](49-browser-locale-dates.md) |
| 50 | Fix false-positive "dead" clips from the URL health-check cron | [50-url-check-grace-period.md](50-url-check-grace-period.md) |
| 51 | Minimum password complexity, sliding by length | [51-password-complexity.md](51-password-complexity.md) |
| 52 | Componentize repeated page-level DOM/styling | [52-componentize-page-layout.md](52-componentize-page-layout.md) |
| 53 | Fix Google Drive clips not pausing each other | [53-google-drive-pause-fix.md](53-google-drive-pause-fix.md) |
| 54 | Play direct-link clips inline, with graceful fallback | [54-inline-direct-clip-playback.md](54-inline-direct-clip-playback.md) |
| 55 | YouTube clips stay inline on mobile (`playsinline`) | [55-youtube-playsinline.md](55-youtube-playsinline.md) |
| 56 | Play Dropbox-hosted clips inline via the `raw=1` link | [56-dropbox-raw-url.md](56-dropbox-raw-url.md) |
| 57 | Voting narrowed to Tune Method only; step 45's technique preferences removed | [57-tune-method-only.md](57-tune-method-only.md) |
| 58 | Extend the URL health-check cron to cover Google Drive clips | [58-google-drive-cron-health-check.md](58-google-drive-cron-health-check.md) |
| 59 | Fix the Dropbox clip-health blind spot | [59-dropbox-cron-health-check.md](59-dropbox-cron-health-check.md) |
| 60 | Instant tap feedback (`Link`) + route-level `loading.tsx` skeletons | [60-instant-tap-feedback-loading-states.md](60-instant-tap-feedback-loading-states.md) |
| 61 | Track detail item-to-item navigation + shared `getAdjacentIds()` helper | [61-track-detail-navigation.md](61-track-detail-navigation.md) |
| 62 | Sign out via a server route instead of the browser Supabase SDK (PageSpeed fix) | [62-signout-server-route.md](62-signout-server-route.md) |
| 63 | View transition crossfade on internal navigation, replacing the hard-cut `loading.tsx` swap | [63-view-transition-page-crossfade.md](63-view-transition-page-crossfade.md) |
| 64 | 🚧 Admin override for clip-health false positives/negatives (code-complete, pending staging verification) | [64-admin-clip-override.md](64-admin-clip-override.md) |
| 65 | Show snapshot info next to Before/After clip labels in MappingBadge | [65-mapping-badge-snapshot-info.md](65-mapping-badge-snapshot-info.md) |
| 66 | Loading skeleton for feed pagination | [66-feed-pagination-loading-skeleton.md](66-feed-pagination-loading-skeleton.md) |
| 67 | Tidy revealed-test information architecture in MappingBadge | [67-mapping-badge-ia-tidy.md](67-mapping-badge-ia-tidy.md) |
| 68 | Bigger touch targets for footer step-through nav | [68-footer-nav-touch-targets.md](68-footer-nav-touch-targets.md) |
| 69 | Parallelize sequential Supabase queries + stream independent sections via Suspense (faster page loads) | [69-test-detail-query-parallelization-streaming.md](69-test-detail-query-parallelization-streaming.md) |
| 70 | Fix track info missing for anonymous visitors (`tracks` RLS gap) | [70-tracks-public-read-rls-fix.md](70-tracks-public-read-rls-fix.md) |
