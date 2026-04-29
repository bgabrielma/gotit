const URL_OR_DOMAIN_REGEX =
  /\b(?:https?:\/\/[^\s<>"')\]]+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"')\]]*)?)/gi
const TRAILING_PUNCT = /[.,;:!?)\]]+$/

export function extractUrls(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const match of text.matchAll(URL_OR_DOMAIN_REGEX)) {
    const raw = match[0].replace(TRAILING_PUNCT, '')
    const start = match.index ?? 0
    const prev = start > 0 ? text[start - 1] : ''
    if (prev === '@') {
      continue
    }
    const cleaned = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`
    if (!seen.has(cleaned)) {
      seen.add(cleaned)
      out.push(cleaned)
    }
  }
  return out
}
