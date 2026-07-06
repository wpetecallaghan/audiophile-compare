// Checks a user's email against the ADMIN_EMAILS allowlist (comma-separated,
// case-insensitive). No schema change, no role concept — just a fixed list
// of privileged addresses for admin-only pages like /version.
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false

  const allowlist = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(entry => entry.trim().toLowerCase())
    .filter(Boolean)

  return allowlist.includes(email.toLowerCase())
}
