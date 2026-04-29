const PATTERNS: RegExp[] = [
  /\blook (at|again)\b/i,
  /\bwhat'?s on (the )?screen\b/i,
  /\brefresh (the )?screen\b/i,
  /\btake another look\b/i,
]

export function detectRefreshIntent(text: string): boolean {
  return PATTERNS.some((p) => p.test(text))
}
