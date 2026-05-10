import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import { ChatRequestSchema } from '@got-it/shared'
import { buildChatRequest } from '@got-it/core'
import type { Message } from '@got-it/shared'
import type { AppDeps } from '../app.js'
import type { ChatCompleteOptions, ToolCallHandler } from '../infra/chat-ai.js'
import type { SearchResult } from '../tools/web-search-ai.js'
import { DEFAULT_WEB_SEARCH_TOOL } from '../prompts/defaults.js'
import { deviceAuth } from '../middleware/auth.js'

export function chatRouter(deps: AppDeps): Router {
  const r = Router()
  r.use(deviceAuth(deps.store))

  r.post('/', async (req, res) => {
    const parsed = ChatRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message })
      return
    }
    if (parsed.data.source !== 'text') {
      res.status(400).json({ error: 'only source=text is supported in Phase 1a' })
      return
    }
    const device = req.device!
    const session = await deps.store.getActiveSession(device.id)
    if (!session) {
      res.status(409).json({ error: 'no active session' })
      return
    }

    const userMessage: Message = {
      id: uuid(),
      session_id: session.id,
      kind: 'user_text',
      text: parsed.data.text,
      source: 'text',
      created_at: new Date().toISOString(),
    }
    await deps.store.appendMessage(userMessage)

    const tail = await deps.store.listMessages({ session_id: session.id, limit: 50 })
    const payload = buildChatRequest({
      personaPrompt: deps.chatPersonaPrompt,
      messagesTail: tail.slice(0, -1),
      userMessage,
    })

    const onToolCall: ToolCallHandler = async (name, args) => {
      if (name !== 'web_search') {
        return 'Unknown tool'
      }
      const query = args['query'] ?? ''
      const results = await deps.webSearchAI.search(query, 3)
      const pages = await deps.pageFetcher.fetchAll(results.map((r) => r.url))
      return formatSearchResults(results, pages)
    }

    const options: ChatCompleteOptions = {
      tools: [DEFAULT_WEB_SEARCH_TOOL],
      onToolCall,
    }

    let assistantText: string
    try {
      assistantText = await deps.chatAI.complete(payload, options)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'chat failure'
      res.status(502).json({ error: msg })
      return
    }

    const assistant: Message = {
      id: uuid(),
      session_id: session.id,
      kind: 'assistant',
      text: assistantText,
      created_at: new Date().toISOString(),
    }
    await deps.store.appendMessage(assistant)
    res.status(201).json({ message_id: userMessage.id, assistant_message: assistant })
  })

  return r
}

function formatSearchResults(results: SearchResult[], pages: Map<string, string>): string {
  const sections = results.map((r) => {
    const pageContent = pages.get(r.url)
    const pageBlock = pageContent ? `\nPage content:\n${pageContent}` : ''
    return `Title: ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}${pageBlock}`
  })
  return `Web search results:\n\n${sections.join('\n\n---\n\n')}`
}
