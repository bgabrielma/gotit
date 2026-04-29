const URL_REGEX = /\bhttps?:\/\/[^\s<>"')\]]+/gi
const TRAILING_PUNCT = /[.,;:!?)\]]+$/

export function extractUrls(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const match of text.matchAll(URL_REGEX)) {
    const cleaned = match[0].replace(TRAILING_PUNCT, '')
    if (!seen.has(cleaned)) {
      seen.add(cleaned)
      out.push(cleaned)
    }
  }
  return out
}
