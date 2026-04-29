const MAX_LEN = 60

export function slugifySummary(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (normalized.length === 0) return 'untitled'
  if (normalized.length <= MAX_LEN) return normalized
  const truncated = normalized.slice(0, MAX_LEN)
  const lastDash = truncated.lastIndexOf('-')
  return lastDash > 0 ? truncated.slice(0, lastDash) : truncated
}
