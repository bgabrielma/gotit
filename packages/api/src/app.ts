import express, { type Express } from 'express'
import type { Store } from './infra/store.js'
import type { VisionAI } from './infra/vision-ai.js'
import type { ChatAI } from './infra/chat-ai.js'
import type { ObsidianWriter } from './infra/obsidian-writer.js'
import { healthRoute } from './routes/health.js'
import { deviceRoute } from './routes/device.js'
import { sessionsRouter } from './routes/sessions.js'
import { captureRouter } from './routes/capture.js'
import { chatRouter } from './routes/chat.js'
import { saveRouter } from './routes/save.js'

export type AppDeps = {
  store: Store
  visionAI: VisionAI
  chatAI: ChatAI
  obsidianWriter: ObsidianWriter
  visionPrompt: string
  chatPersonaPrompt: string
  vaultPath: string
  captureFolder: string
  dataDir: string
  version: string
}

export function createApp(deps: AppDeps): Express {
  const app = express()
  app.use(express.json({ limit: '10mb' }))

  app.use('/health', healthRoute(deps))
  app.use('/device', deviceRoute(deps))
  app.use('/sessions', sessionsRouter(deps))
  app.use('/capture', captureRouter(deps))
  app.use('/chat', chatRouter(deps))
  app.use('/save', saveRouter(deps))

  return app
}
