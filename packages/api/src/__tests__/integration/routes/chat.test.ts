import { describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import {
  createChatAIMock,
  createWebSearchAIMock,
  createPageFetcherMock,
  setupAuthedApp,
} from '../../helper.js'
import {
  ChatAI,
  type ChatBackend,
  type ChatCompleteArgs,
  type ChatCompleteOptions,
} from '../../../infra/chat-ai.js'

/**
 * Creates an authenticated app/session pair for chat route tests.
 */
async function setup(chatResponse = 'reply') {
  const chatMock = createChatAIMock({ responses: [chatResponse] })
  return setupAuthedApp({
    chatAI: chatMock.instance,
  })
}

/**
 * Simulates a ChatAI backend that invokes the tool call handler on first call.
 */
function createToolCallChatMock(opts: {
  toolCallArgs?: Record<string, string>
  finalResponse: string
}): { instance: ChatAI; complete: ReturnType<typeof vi.fn> } {
  let callCount = 0
  const complete = vi.fn(async (_args: ChatCompleteArgs, options?: ChatCompleteOptions) => {
    callCount++
    if (callCount === 1 && options?.onToolCall) {
      await options.onToolCall('web_search', opts.toolCallArgs ?? { query: 'test query' })
    }
    return opts.finalResponse
  })

  return {
    instance: ChatAI.fromBackend({ complete } as ChatBackend),
    complete,
  }
}

/**
 * Integration coverage for chat route behavior.
 */
describe('POST /chat', () => {
  it('appends user message, returns assistant reply', async () => {
    const { app, token } = await setup('hello back')
    const res = await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'hello', source: 'text' })
    expect(res.status).toBe(201)
    expect(res.body.assistant_message.text).toBe('hello back')
  })

  it('rejects empty text', async () => {
    const { app, token } = await setup()
    const res = await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: '', source: 'text' })
    expect(res.status).toBe(400)
  })

  it('rejects mic/listen sources in Phase 1a (deferred to 1b/1c)', async () => {
    const { app, token } = await setup()
    const res = await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'voice text', source: 'mic' })
    expect(res.status).toBe(400)
  })

  it('returns enriched response when LLM invokes web_search tool', async () => {
    const searchMock = createWebSearchAIMock({
      results: [{ title: 'Result 1', url: 'https://example.com', snippet: 'Example snippet' }],
    })
    const pageMock = createPageFetcherMock({
      pages: new Map([['https://example.com', 'Full page content here']]),
    })
    const chatMock = createToolCallChatMock({
      toolCallArgs: { query: 'what is example.com' },
      finalResponse: 'Based on my search, example.com is a test domain.',
    })

    const { app, token } = await setupAuthedApp({
      chatAI: chatMock.instance,
      webSearchAI: searchMock.instance,
      pageFetcher: pageMock.instance,
    })

    const res = await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Tell me about example.com', source: 'text' })

    expect(res.status).toBe(201)
    expect(res.body.assistant_message.text).toBe(
      'Based on my search, example.com is a test domain.'
    )
  })

  it('returns normal response when LLM does not invoke web_search', async () => {
    const { app, token } = await setupAuthedApp({
      chatAI: createChatAIMock({ responses: ['Simple reply'] }).instance,
    })

    const res = await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'hello', source: 'text' })

    expect(res.status).toBe(201)
    expect(res.body.assistant_message.text).toBe('Simple reply')
  })

  it('returns normal response when LLM does not call web_search even if backend would fail', async () => {
    const searchMock = createWebSearchAIMock({
      failure: new Error('SearXNG down'),
    })
    const chatMock = createChatAIMock({ responses: ['Fallback reply'] })

    const { app, token } = await setupAuthedApp({
      chatAI: chatMock.instance,
      webSearchAI: searchMock.instance,
    })

    const res = await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'search for something', source: 'text' })

    expect(res.status).toBe(201)
    expect(res.body.assistant_message.text).toBe('Fallback reply')
  })
})
