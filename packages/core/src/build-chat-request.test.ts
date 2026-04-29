import { describe, expect, it } from 'vitest'
import type { Message } from '@got-it/shared'
import { buildChatRequest } from './build-chat-request.js'

const personaPrompt = 'You are GotIt!, a screen-aware assistant.'
const baseAt = '2026-04-28T12:00:00Z'

const captureMsg: Message = {
  id: 'm1',
  session_id: 's1',
  kind: 'screen_capture',
  image_ref: 'images/abc.png',
  source: 'keybind',
  created_at: baseAt,
  analysis: {
    raw_text: 'GitHub README for a JSON parser',
    urls: [{ href: 'https://github.com/x/y' }],
    regions: [],
    context_kind: 'browser_article',
    summary: 'GitHub repo: a JSON parser',
  },
}

const userMsg: Message = {
  id: 'm2',
  session_id: 's1',
  kind: 'user_text',
  text: 'what does this repo do?',
  source: 'text',
  created_at: baseAt,
}

describe('buildChatRequest', () => {
  it('places persona prompt as system, threads capture analysis as text context, then user turn', () => {
    const req = buildChatRequest({
      personaPrompt,
      messagesTail: [captureMsg],
      userMessage: userMsg,
    })

    expect(req.system).toBe(personaPrompt)
    expect(req.messages).toHaveLength(2)
    expect(req.messages[0]).toMatchObject({
      role: 'user',
      content: expect.stringContaining('Screen context'),
    })
    expect(req.messages[0]?.content).toContain('GitHub repo: a JSON parser')
    expect(req.messages[0]?.content).toContain('https://github.com/x/y')
    expect(req.messages[1]).toEqual({ role: 'user', content: 'what does this repo do?' })
  })

  it('does not include image bytes in the request (text-only threading per §8.4)', () => {
    const req = buildChatRequest({
      personaPrompt,
      messagesTail: [captureMsg],
      userMessage: userMsg,
    })
    const serialized = JSON.stringify(req)
    expect(serialized).not.toMatch(/image_ref/)
    expect(serialized).not.toMatch(/base64/i)
  })

  it('handles no prior capture (chat without context)', () => {
    const req = buildChatRequest({
      personaPrompt,
      messagesTail: [],
      userMessage: userMsg,
    })
    expect(req.messages).toEqual([{ role: 'user', content: 'what does this repo do?' }])
  })

  it('uses only the most recent screen_capture when multiple are present', () => {
    const olderCapture: Message = {
      ...captureMsg,
      id: 'm0',
      analysis: { ...captureMsg.analysis, summary: 'OLD CAPTURE' },
    }
    const req = buildChatRequest({
      personaPrompt,
      messagesTail: [olderCapture, captureMsg],
      userMessage: userMsg,
    })
    expect(JSON.stringify(req)).not.toContain('OLD CAPTURE')
  })

  it('threads prior assistant + user turns in order', () => {
    const assistant: Message = {
      id: 'a1',
      session_id: 's1',
      kind: 'assistant',
      text: 'It parses JSON.',
      created_at: baseAt,
    }
    const followup: Message = { ...userMsg, id: 'u2', text: 'how fast?' }
    const req = buildChatRequest({
      personaPrompt,
      messagesTail: [captureMsg, userMsg, assistant],
      userMessage: followup,
    })
    expect(req.messages.map((m) => m.role)).toEqual(['user', 'user', 'assistant', 'user'])
    expect(req.messages.at(-1)?.content).toBe('how fast?')
  })
})
