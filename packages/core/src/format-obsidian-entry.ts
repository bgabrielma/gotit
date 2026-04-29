import type { AnalysisResult, SessionId } from '@got-it/shared'

export type RenderTemplate = 'default' | 'override'

export type FormatObsidianEntryArgs = {
  template: RenderTemplate
  analysis: AnalysisResult
  body: string
  sessionId: SessionId
  savedAt: Date
  title: string
}

export function formatObsidianEntry(args: FormatObsidianEntryArgs): string {
  const fm = renderFrontmatter(args)
  if (args.template === 'override') {
    return `${fm}\n\n# ${args.title}\n\n${args.body}\n`
  }
  const links = args.analysis.urls
    .map((u) => (u.anchor ? `- [${u.anchor}](${u.href})` : `- ${u.href}`))
    .join('\n')
  const linksSection = links.length > 0 ? `## Links\n\n${links}\n\n` : ''
  return `${fm}\n\n# ${args.title}\n\n${args.analysis.summary}\n\n${linksSection}## Notes\n\n${args.body}\n`
}

function renderFrontmatter(args: FormatObsidianEntryArgs): string {
  const urlLines = args.analysis.urls.map((u) => `  - ${u.href}`).join('\n')
  const urlsBlock = args.analysis.urls.length > 0 ? `urls:\n${urlLines}\n` : ''
  return [
    '---',
    'source: gotit',
    `captured_at: ${args.savedAt.toISOString()}`,
    `session_id: ${args.sessionId}`,
    urlsBlock.trimEnd(),
    `context_kind: ${args.analysis.context_kind}`,
    '---',
  ]
    .filter((l) => l !== '')
    .join('\n')
}
