import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { loadServerConfig } from './config.js'
import { ChatAI } from './infra/chat-ai.js'
import { LLMConnectorConfig } from './infra/llm-connector-config.js'
import { ObsidianWriter } from './infra/obsidian-writer.js'
import { Store } from './infra/store.js'
import { VisionAI } from './infra/vision-ai.js'
import { DEFAULT_CHAT_PROMPT, DEFAULT_VISION_PROMPT } from './prompts/defaults.js'

const cfg = loadServerConfig(import.meta.url)
const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as {
  version: string
}

const store = Store.create({
  dbPath: cfg.dbPath,
  migrationsDir: resolve(pkgRoot, 'migrations'),
})
const llm = LLMConnectorConfig.fromConfig(cfg)

const app = createApp({
  store,
  visionAI: VisionAI.create(llm),
  chatAI: ChatAI.create(llm),
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
