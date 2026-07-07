import { createAdminClient } from '@/lib/supabase/admin'

// Subdomain of the domain already used for the privacy/terms pages. No
// DNS/MX records needed — these accounts are created pre-confirmed
// (email_confirm: true) and never need to send or receive real mail.
const PLACEHOLDER_EMAIL_DOMAIN = 'import.audiophile-compare.uk'

// Exported so the test file can reference the same table names rather
// than re-hardcoding them — see repeated-string-constants.md.
export const USERS_TABLE = 'users'
export const IMPORT_AUTHORS_TABLE = 'import_authors'

export type CreatePlaceholderAuthorInput = {
  source: string            // e.g. 'lejonklou-forum'
  externalUsername: string  // raw, unmodified forum username
  displayName?: string      // falls back to externalUsername
}

// Lowercase; strip to [a-z0-9-]; collapse repeats; trim leading/trailing
// dashes; truncate to 40 chars. Deliberately lossy (case/unicode/
// punctuation stripped) — collisions are resolved separately, by checking
// the resulting email against existing users, not by making this perfect.
export function slugify(username: string): string {
  return username
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

// Resolves an existing placeholder author by (source, externalUsername),
// or creates one. Keying on the raw external_username (via import_authors)
// rather than a derived email is deliberate — see build-history-ingestion.md
// step 30, decision 6: slugification is lossy and collision-order-dependent,
// so a raw username can't be reliably resolved back from an email alone.
export async function createPlaceholderAuthor({
  source,
  externalUsername,
  displayName,
}: CreatePlaceholderAuthorInput): Promise<string> {
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from(IMPORT_AUTHORS_TABLE)
    .select('user_id')
    .eq('source', source)
    .eq('external_username', externalUsername)
    .maybeSingle()

  if (existing) return existing.user_id

  const baseSlug = slugify(externalUsername)
  const email = await resolveAvailableEmail(admin, baseSlug)

  // Admin SDK method, not a raw SQL insert — correctly handles GoTrue's
  // internal bookkeeping (identities, etc.) for a helper that runs
  // automatically and repeatedly, unlike a one-off manual account fix.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: displayName ?? externalUsername },
  })

  if (createError || !created?.user) {
    throw new Error(
      `createPlaceholderAuthor: failed to create auth user — ${createError?.message ?? 'unknown error'}`,
    )
  }

  const userId = created.user.id

  // handle_new_user already created the matching public.users row from
  // user_metadata.full_name — mark it as a placeholder without touching
  // that trigger.
  const { error: updateError } = await admin
    .from(USERS_TABLE)
    .update({ is_placeholder: true })
    .eq('id', userId)

  if (updateError) {
    throw new Error(`createPlaceholderAuthor: failed to mark placeholder: ${updateError.message}`)
  }

  const { error: mappingError } = await admin
    .from(IMPORT_AUTHORS_TABLE)
    .insert({ source, external_username: externalUsername, user_id: userId })

  if (mappingError) {
    throw new Error(`createPlaceholderAuthor: failed to record import_authors mapping: ${mappingError.message}`)
  }

  return userId
}

// Appends -2, -3, ... on collision. Checks public.users.email (kept in
// sync with auth.users.email by the existing handle_user_email_updated
// trigger) rather than the auth schema directly — simpler, and equivalent.
async function resolveAvailableEmail(
  admin: ReturnType<typeof createAdminClient>,
  baseSlug: string,
): Promise<string> {
  let suffix = 1
  let candidateSlug = baseSlug

  for (;;) {
    const email = `${candidateSlug}@${PLACEHOLDER_EMAIL_DOMAIN}`
    const { data } = await admin
      .from(USERS_TABLE)
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (!data) return email

    suffix += 1
    candidateSlug = `${baseSlug}-${suffix}`
  }
}
