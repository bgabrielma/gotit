import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import { SaveDraftResponseSchema, SaveRequestSchema } from '@got-it/shared'
import { formatObsidianEntry, resolveSaveFormat, slugifySummary } from '@got-it/core'
import type { Message } from '@got-it/shared'
import type { AppDeps } from '../app.js'
import { deviceAuth } from '../middleware/auth.js'

export function saveRouter(deps: AppDeps): Router {
  const r = Router()
  r.use(deviceAuth(deps.store))
  r.post('/', async (req, res) => {
    const parsed = SaveRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message })
      return
    }
    const device = req.device!
    const session = deps.store.getActiveSession(device.id)
    if (!session) {
      res.status(409).json({ error: 'no active session' })
      return
    }
    const tail = deps.store.listMessages({ session_id: session.id, limit: 50 })
    const lastCapture = [...tail].reverse().find((m) => m.kind === 'screen_capture')
    if (!lastCapture || lastCapture.kind !== 'screen_capture') {
      res.status(422).json({ error: 'active session has no screen capture to save' })
      return
    }
    const lastAssistant = [...tail].reverse().find((m) => m.kind === 'assistant')
    const plan = resolveSaveFormat(parsed.data.instruction)
    let body: string
    if (plan.template === 'default') {
      body = lastAssistant && lastAssistant.kind === 'assistant' ? lastAssistant.text : ''
    } else {
      const overridePayload = {
        system: deps.chatPersonaPrompt,
        messages: [
          {
            role: 'user' as const,
            content: `Render the following content per this instruction. Return ONLY the body markdown.\n\nInstruction: ${plan.instruction}\n\nSummary: ${lastCapture.analysis.summary}\n\nNotes: ${lastAssistant && lastAssistant.kind === 'assistant' ? lastAssistant.text : '(none)'}`,
          },
        ],
      }
      try {
        body = await deps.chatAI.complete(overridePayload)
      } catch (e) {
        res.status(502).json({ error: e instanceof Error ? e.message : 'chat failure' })
        return
      }
    }
    const title = lastCapture.analysis.summary.split('\n')[0] ?? 'Untitled'
    const savedAt = new Date()
    const slug = slugifySummary(title)
    const stamp = savedAt.toISOString().replace(/[:T]/g, '-').slice(0, 16)
    const filename = `${stamp}-${slug}-${uuid().slice(0, 8)}.md`
    const captureFolder = deps.captureFolder.replace(/^\/+|\/+$/g, '') || 'GotIt!'
    const relativePath = `${captureFolder}/${filename}`
    const contents = formatObsidianEntry({
      template: plan.template,
      analysis: lastCapture.analysis,
      body,
      sessionId: session.id,
      savedAt,
      title,
    })
    const record: Message = {
      id: uuid(),
      session_id: session.id,
      kind: 'save_record',
      vault_path: relativePath,
      ...(plan.instruction ? { instruction: plan.instruction } : {}),
      created_at: new Date().toISOString(),
    }
    deps.store.appendMessage(record)
    const response = SaveDraftResponseSchema.parse({
      vault_relative_path: relativePath,
      markdown: contents,
      save_record_id: record.id,
    })
    res.status(201).json(response)
  })
  return r
}
