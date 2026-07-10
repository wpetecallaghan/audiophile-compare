// Takes the first (highest-priority) language tag from an Accept-Language
// header, e.g. 'en-GB,en;q=0.9' -> 'en-GB'. Real browsers always list their
// configured locale first, so this skips full RFC 4647 quality-value
// sorting. Validates the tag via Intl before returning it, since the header
// is client-controlled input and a malformed BCP 47 tag throws a
// RangeError from toLocaleDateString at render time.
export function parseAcceptLanguage(header: string | null): string | undefined {
  if (!header) return undefined
  const tag = header.split(',')[0]?.split(';')[0]?.trim()
  if (!tag || tag === '*') return undefined
  try {
    new Intl.DateTimeFormat(tag)
    return tag
  } catch {
    return undefined
  }
}
