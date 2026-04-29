import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { ChatAI } from './infra/chat-ai.js'
import { ObsidianWriter } from './infra/obsidian-writer.js'
import { Store } from './infra/store.js'
import { VisionAI } from './infra/vision-ai.js'
import { DEFAULT_CHAT_PROMPT } from './prompts/default-chat.js'
import { DEFAULT_VISION_PROMPT } from './prompts/default-vision.js'

const cfg = loadConfig(process.env)
const pkg = JSON.parse(readFileSync(resolve('apps/api/package.json'), 'utf8')) as {
  version: string
}

const store = Store.create({
  dbPath: cfg.dbPath,
  migrationsDir: resolve('apps/api/migrations'),
})

const app = createApp({
  store,
  visionAI: VisionAI.create({ apiKey: cfg.anthropicApiKey, model: cfg.visionModel }),
  chatAI: ChatAI.create({ apiKey: cfg.anthropicApiKey, model: cfg.chatModel }),
  obsidianWriter: ObsidianWriter.create(),
  visionPrompt: DEFAULT_VISION_PROMPT,
  chatPersonaPrompt: DEFAULT_CHAT_PROMPT,
  vaultPath: cfg.vaultPath,
  captureFolder: 'GotIt!',
  dataDir: cfg.dataDir,
  version: pkg.version,
})

app.listen(cfg.port, () => {
  console.warn(`got-it api listening on ${cfg.port}`)
})
