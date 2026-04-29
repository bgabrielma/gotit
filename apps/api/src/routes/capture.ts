import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import { v4 as uuid } from 'uuid'
import { CaptureSourceSchema } from '@got-it/shared'
import { buildChatRequest, extractUrls } from '@got-it/core'
import type { Message } from '@got-it/shared'
import type { AppDeps } from '../app.js'
import { deviceAuth } from '../middleware/auth.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

export function captureRouter(deps: AppDeps): Router {
  const r = Router()
  r.use(deviceAuth(deps.store))

  r.post('/', upload.single('image'), async (req, res) => {
    const sourceParse = CaptureSourceSchema.safeParse(req.body.source)
    if (!sourceParse.success) {
      res.status(400).json({ error: 'invalid source' })
      return
    }
    if (!req.file) {
      res.status(400).json({ error: 'image is required' })
      return
    }
    const device = req.device!
    const session = deps.store.getActiveSession(device.id)
    if (!session) {
      res.status(409).json({ error: 'no active session — call POST /sessions first' })
      return
    }

    let analysis
    try {
      analysis = await deps.visionAI.analyze({ image: req.file.buffer, prompt: deps.visionPrompt })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'vision failure'
      res.status(502).json({ error: msg })
      return
    }
    const refinedUrls = new Map(analysis.urls.map((url) => [url.href, url] as const))
    for (const href of extractUrls(analysis.raw_text)) {
      if (!refinedUrls.has(href)) {
        refinedUrls.set(href, { href })
      }
    }
    analysis = { ...analysis, urls: [...refinedUrls.values()] }

    const imageRef = `${uuid()}.png`
    const imagesDir = join(deps.dataDir, 'images')
    await mkdir(imagesDir, { recursive: true })
    await writeFile(join(imagesDir, imageRef), req.file.buffer)

    const now = new Date().toISOString()
    const captureMessage: Message = {
      id: uuid(),
      session_id: session.id,
      kind: 'screen_capture',
      image_ref: imageRef,
      analysis,
      source: sourceParse.data,
      created_at: now,
    }
    deps.store.appendMessage(captureMessage)

    const tail = deps.store.listMessages({ session_id: session.id, limit: 50 })
    const userTextStub: Message = {
      id: uuid(),
      session_id: session.id,
      kind: 'user_text',
      text: 'Summarize the screen.',
      source: 'text',
      created_at: now,
    }
    const chatPayload = buildChatRequest({
      personaPrompt: deps.chatPersonaPrompt,
      messagesTail: tail,
      userMessage: userTextStub,
    })
    let assistantText: string
    try {
      assistantText = await deps.chatAI.complete(chatPayload)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'chat failure'
      res.status(502).json({ error: msg })
      return
    }

    const assistantMessage: Message = {
      id: uuid(),
      session_id: session.id,
      kind: 'assistant',
      text: assistantText,
      created_at: new Date().toISOString(),
    }
    deps.store.appendMessage(assistantMessage)

    res.status(201).json({
      message_id: captureMessage.id,
      analysis,
      assistant_message: assistantMessage,
    })
  })

  return r
}
