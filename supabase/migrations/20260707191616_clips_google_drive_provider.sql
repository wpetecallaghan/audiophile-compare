-- Step 34 (Google Drive clip provider support): allows 'google-drive' as a
-- clips.provider value. See build-history.md step 34 for the full design.
--
-- Drive share links (drive.google.com/file/d/{id}/...) have a stable,
-- confirmed-embeddable /preview URL, unlike Google Photos and iCloud
-- shared links, which have no equivalent and remain 'unknown' by design.

alter table public.clips
  drop constraint clips_provider_check,
  add constraint clips_provider_check
    check (provider in ('youtube', 'vimeo', 'google-drive', 'direct', 'unknown'));
