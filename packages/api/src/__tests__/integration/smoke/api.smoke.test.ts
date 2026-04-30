import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { join, resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { ChatAI } from '../../../infra/chat-ai.js'
import { loadConfig } from '../../../config.js'
import { LLMConnectorConfig } from '../../../infra/llm-connector-config.js'
import { ObsidianWriter } from '../../../infra/obsidian-writer.js'
import { VisionAI } from '../../../infra/vision-ai.js'
import { cleanupDir, ensureCleanDir, listFiles, setupAuthedApp, tmpPath } from '../../helper.js'

/**
 * Fixture used by smoke tests for end-to-end capture checks.
 */
const screenshotPath = resolve('src/__tests__/fixtures/screenshot-sample.png')
/**
 * Connector configuration for smoke tests loaded from environment variables.
 */
const smokeLlmConfig = LLMConnectorConfig.fromConfig(loadConfig(process.env))

const SMOKE_VAULT_PATH = tmpPath('smoke-vault')
const SMOKE_CAPTURE_FOLDER = 'obsidian-smoke'
const SMOKE_CAPTURE_DIR = join(SMOKE_VAULT_PATH, SMOKE_CAPTURE_FOLDER)
const SMOKE_DATA_DIR = tmpPath('smoke-data')

/**
 * Builds an authenticated API app wired to real connectors for smoke testing.
 */
async function setupSmokeApp() {
  return setupAuthedApp({
    visionAI: VisionAI.create(smokeLlmConfig),
    chatAI: ChatAI.create(smokeLlmConfig),
    obsidianWriter: ObsidianWriter.create(),
    vaultPath: SMOKE_VAULT_PATH,
    captureFolder: SMOKE_CAPTURE_FOLDER,
    dataDir: SMOKE_DATA_DIR,
    version: 'smoke-test',
  })
}

describe('LLM smoke integration', () => {
  it('chat route returns a non-empty assistant response', async () => {
    const { app, token } = await setupSmokeApp()
    const res = await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ source: 'text', text: 'Say hello from integration test.' })

    expect(res.status).toBe(201)
    expect(typeof res.body.assistant_message.text).toBe('string')
    expect(res.body.assistant_message.text.length).toBeGreaterThan(0)
  }, 120_000)

  it('capture route returns a schema-valid vision analysis', async () => {
    const { app, token } = await setupSmokeApp()
    const res = await request(app)
      .post('/capture')
      .set('Authorization', `Bearer ${token}`)
      .field('source', 'keybind')
      .attach('image', readFileSync(screenshotPath), 'screen.png')

    expect(res.status).toBe(201)
    expect(res.body.analysis.context_kind).toBeDefined()
    expect(Array.isArray(res.body.analysis.urls)).toBe(true)
    expect(typeof res.body.analysis.summary).toBe('string')
  }, 120_000)
})

describe('Obsidian real integration', () => {
  beforeAll(() => {
    cleanupDir(SMOKE_VAULT_PATH)
    cleanupDir(SMOKE_DATA_DIR)
    ensureCleanDir(SMOKE_VAULT_PATH)
    ensureCleanDir(SMOKE_DATA_DIR)
  })

  it('captures a screenshot, chats, saves to vault, file has valid content', async () => {
    const { app, token } = await setupSmokeApp()

    const captureRes = await request(app)
      .post('/capture')
      .set('Authorization', `Bearer ${token}`)
      .field('source', 'keybind')
      .attach('image', readFileSync(screenshotPath), 'screen.png')

    expect(captureRes.status).toBe(201)

    const chatRes = await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ source: 'text', text: 'Summarise this capture and tell me what to save.' })

    expect(chatRes.status).toBe(201)

    const saveRes = await request(app)
      .post('/save')
      .set('Authorization', `Bearer ${token}`)
      .send({})

    expect(saveRes.status).toBe(201)

    const files = listFiles(SMOKE_CAPTURE_DIR)
    expect(files.length).toBe(1)
    const contents = readFileSync(files[0]!, 'utf-8')
    expect(contents).toMatch(/^---\n/)
    expect(contents).toMatch(/captured_at:/)
    expect(contents).toMatch(/session_id:/)
  }, 240_000)
})
