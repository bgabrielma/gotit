import { Router } from 'express'
import { v4 as uuid } from 'uuid'
import { SaveRequestSchema, SaveDraftResponseSchema } from '@got-it/shared'
import { formatObsidianEntry, resolveSaveFormat, slugifySummary } from '@got-it/core'
import type { Message } from '@got-it/shared'
import type { AppDeps } from '../app.js'
import { deviceAuth } from '../middleware/auth.js'

export function saveRouter(deps: AppDeps): Router {
  const r = Router()
  r.use(deviceAuth(deps.store))

  r.post('/', async (req, res) => {
    const parsed = SaveRequestSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message })

    const device = req.device!
    const session = await deps.store.getActiveSession(device.id)
    if (!session) return res.status(409).json({ error: 'no active session' })

    const tail = await deps.store.listMessages({ session_id: session.id, limit: 50 })
    const reversed = [...tail].reverse()
    const lastCapture = reversed.find((m) => m.kind === 'screen_capture')
    const lastAssistant = reversed.find((m) => m.kind === 'assistant')
    const lastUserText = reversed.find((m) => m.kind === 'user_text')

    const plan = resolveSaveFormat(parsed.data.instruction)
    let body: string
    if (plan.template === 'default') {
      body = lastAssistant && lastAssistant.kind === 'assistant' ? lastAssistant.text : ''
    } else {
      const summary =
        lastCapture && lastCapture.kind === 'screen_capture'
          ? lastCapture.analysis.summary
          : lastUserText && lastUserText.kind === 'user_text'
            ? lastUserText.text
            : '(no content)'
      try {
        body = await deps.chatAI.complete({
          system: deps.chatPersonaPrompt,
          messages: [
            {
              role: 'user',
              content:
                `Render the following content per this instruction. Return ONLY the body markdown.\n\n` +
                `Instruction: ${plan.instruction}\n\n` +
                `Summary: ${summary}\n\n` +
                `Notes: ${lastAssistant && lastAssistant.kind === 'assistant' ? lastAssistant.text : '(none)'}`,
            },
          ],
        })
      } catch (e) {
        return res.status(502).json({ error: e instanceof Error ? e.message : 'chat failure' })
      }
    }

    const rawTitle =
      lastCapture && lastCapture.kind === 'screen_capture'
        ? lastCapture.analysis.summary
        : lastUserText && lastUserText.kind === 'user_text'
          ? lastUserText.text
          : 'Chat Session'
    const title = rawTitle.split('\n')[0] ?? 'Untitled'
    const savedAt = new Date()
    const slug = slugifySummary(title)
    const stamp = savedAt.toISOString().replace(/[:T]/g, '-').slice(0, 16)
    const filename = `${stamp}-${slug}-${uuid().slice(0, 8)}.md`
    const captureFolder = deps.captureFolder.replace(/^\/+|\/+$/g, '') || 'GotIt!'
    const relativePath = `${captureFolder}/${filename}`

    const markdown = formatObsidianEntry({
      template: plan.template,
      analysis:
        lastCapture && lastCapture.kind === 'screen_capture'
          ? lastCapture.analysis
          : { raw_text: '', urls: [], regions: [], context_kind: 'unknown' as const, summary: '' },
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
    await deps.store.appendMessage(record)

    const response = SaveDraftResponseSchema.parse({
      vault_relative_path: relativePath,
      markdown,
      save_record_id: record.id,
    })
    res.status(201).json(response)
  })

  return r
}
