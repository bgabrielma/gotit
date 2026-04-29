import { describe, expect, it } from 'vitest'
import type { AnalysisResult } from '@got-it/shared'
import { formatObsidianEntry } from './format-obsidian-entry.js'

const analysis: AnalysisResult = {
  raw_text: 'hello',
  urls: [{ href: 'https://a.com', anchor: 'A' }, { href: 'https://b.com' }],
  regions: [],
  context_kind: 'browser_article',
  summary: 'A page about A',
}

describe('formatObsidianEntry — default template', () => {
  const out = formatObsidianEntry({
    template: 'default',
    analysis,
    body: 'My notes',
    sessionId: 'sess_1',
    savedAt: new Date('2026-04-28T15:42:00Z'),
    title: 'A page about A',
  })

  it('contains the frontmatter block', () => {
    expect(out).toMatch(/^---\nsource: gotit\ncaptured_at: 2026-04-28T15:42:00\.000Z/)
  })
  it('lists urls in frontmatter', () => {
    expect(out).toContain('  - https://a.com')
    expect(out).toContain('  - https://b.com')
  })
  it('includes context_kind', () => {
    expect(out).toContain('context_kind: browser_article')
  })
  it('renders title and Links and Notes sections', () => {
    expect(out).toContain('# A page about A')
    expect(out).toContain('## Links')
    expect(out).toContain('- [A](https://a.com)')
    expect(out).toContain('- https://b.com')
    expect(out).toContain('## Notes\n\nMy notes')
  })
})

describe('formatObsidianEntry — override template', () => {
  it('uses supplied body verbatim and keeps frontmatter', () => {
    const out = formatObsidianEntry({
      template: 'override',
      analysis,
      body: '```ts\nconst x = 1\n```',
      sessionId: 'sess_1',
      savedAt: new Date('2026-04-28T15:42:00Z'),
      title: 'A page about A',
    })
    expect(out).toContain('---\nsource: gotit')
    expect(out).toContain('```ts\nconst x = 1\n```')
    expect(out).not.toContain('## Links')
  })
})
