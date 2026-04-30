import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import { ChatRequestSchema } from '@got-it/shared'
import { buildChatRequest } from '@got-it/core'
import type { Message } from '@got-it/shared'
import type { AppDeps } from '../app.js'
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
    const session = deps.store.getActiveSession(device.id)
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
    deps.store.appendMessage(userMessage)

    const tail = deps.store.listMessages({ session_id: session.id, limit: 50 })
    const payload = buildChatRequest({
      personaPrompt: deps.chatPersonaPrompt,
      messagesTail: tail.slice(0, -1),
      userMessage,
    })

    let assistantText: string
    try {
      assistantText = await deps.chatAI.complete(payload)
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
    deps.store.appendMessage(assistant)
    res.status(201).json({ message_id: userMessage.id, assistant_message: assistant })
  })

  return r
}
