import type { UrlStatus } from './check-url'
import { STATUS_OK, STATUS_DEGRADED, STATUS_DEAD } from './check-url'

// Gives a clip a one-day grace period before it's marked dead — a single
// bad check only ever demotes by one step (ok -> degraded), never straight
// to dead. Only a second consecutive bad daily check (degraded -> dead)
// actually confirms it. A successful check always recovers immediately, no
// grace period on the way back up. This absorbs one-off false positives
// (e.g. a host's bot-mitigation blocking the cron's request) without
// weakening detection of a URL that's actually gone for good — the cron
// re-checks every 'direct' clip daily regardless of status, so a
// persistently dead URL still reaches dead within two days.
export function nextUrlStatus(current: UrlStatus, rawCheck: UrlStatus): UrlStatus {
  if (rawCheck !== STATUS_DEAD) return rawCheck
  return current === STATUS_OK ? STATUS_DEGRADED : STATUS_DEAD
}
