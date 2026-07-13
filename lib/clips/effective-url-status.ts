import type { UrlStatus } from './check-url'

// An admin-set override (step 64) takes precedence over the cron's own
// url_status wherever "is this clip broken" is decided — correcting a
// false positive (e.g. a host's bot-mitigation tripping the cron) or a
// false negative (e.g. a YouTube/Vimeo embed the cron can never detect as
// dead, step 27) without touching the cron's own daily-written value.
// Clearing the override (adminOverride = null) instantly reverts to
// whatever the cron last measured — no grace period on the way back,
// same as nextUrlStatus's own recovery-to-ok behaviour.
export function effectiveUrlStatus(urlStatus: UrlStatus, adminOverride: UrlStatus | null): UrlStatus {
  return adminOverride ?? urlStatus
}
