import type { Message } from '@got-it/shared'

export type ChatRole = 'user' | 'assistant'

export type ChatTurn = {
  role: ChatRole
  content: string
}

export type ChatRequestPayload = {
  system: string
  messages: ChatTurn[]
}

export type BuildChatRequestArgs = {
  personaPrompt: string
  messagesTail: readonly Message[]
  userMessage: Message
}

export function buildChatRequest(args: BuildChatRequestArgs): ChatRequestPayload {
  const messages: ChatTurn[] = []

  const lastCapture = findLastCapture(args.messagesTail)
  if (lastCapture) {
    messages.push({ role: 'user', content: renderCaptureContext(lastCapture) })
  }

  for (const m of args.messagesTail) {
    if (m.kind === 'user_text') {
      messages.push({ role: 'user', content: m.text })
    } else if (m.kind === 'assistant') {
      messages.push({ role: 'assistant', content: m.text })
    }
  }

  if (args.userMessage.kind === 'user_text') {
    messages.push({ role: 'user', content: args.userMessage.text })
  }

  return { system: args.personaPrompt, messages }
}

function findLastCapture(
  messages: readonly Message[]
): Extract<Message, { kind: 'screen_capture' }> | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m && m.kind === 'screen_capture') return m
  }
  return null
}

function renderCaptureContext(m: Extract<Message, { kind: 'screen_capture' }>): string {
  const urls = m.analysis.urls.map((u) => `- ${u.href}`).join('\n')
  const urlsBlock = urls.length > 0 ? `\nURLs:\n${urls}` : ''
  return `Screen context (kind: ${m.analysis.context_kind}):\n${m.analysis.summary}${urlsBlock}`
}
