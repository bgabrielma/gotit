import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createApp } from '../../app.js'
import { Store } from '../../infra/store.js'
import { VisionAI } from '../../infra/vision-ai.js'
import { ChatAI } from '../../infra/chat-ai.js'
import { ObsidianWriter } from '../../infra/obsidian-writer.js'
import { loadConfig } from '../../config.js'
import { LLMConnectorConfig } from '../../infra/llm-connector-config.js'
import { DEFAULT_VISION_PROMPT } from '../../prompts/default-vision.js'

const canRunCloudLive =
  process.env.GOTIT_LLM_CONNECTOR === 'openai' &&
  typeof process.env.OPENAI_API_KEY === 'string' &&
  process.env.OPENAI_API_KEY.length > 0

const canRunLocalLive =
  process.env.GOTIT_LLM_CONNECTOR === 'local' &&
  typeof process.env.GOTIT_LLM_BASE_URL === 'string' &&
  process.env.GOTIT_LLM_BASE_URL.length > 0

const describeIfLiveReady = canRunCloudLive || canRunLocalLive ? describe : describe.skip

describeIfLiveReady('LLM live integration', () => {
  const cfg = loadConfig(process.env)
  const llm = LLMConnectorConfig.fromConfig(cfg)
  const screenshotPath = resolve('src/__tests__/fixtures/screenshot-sample.png')

  async function setup() {
    const app = createApp({
      store: Store.createNull(),
      visionAI: VisionAI.create(llm),
      chatAI: ChatAI.create(llm),
      obsidianWriter: ObsidianWriter.createNull(),
      visionPrompt: DEFAULT_VISION_PROMPT,
      chatPersonaPrompt: 'You are a concise research assistant.',
      vaultPath: '/tmp/gotit-llm-live',
      captureFolder: 'GotIt!',
      dataDir: '/tmp/gotit-llm-live-data',
      version: 'live-test',
    })
    const deviceRes = await request(app).post('/device').send({ install_id: 'llm-live-device' })
    const token = deviceRes.body.token as string
    await request(app).post('/sessions').set('Authorization', `Bearer ${token}`)
    return { app, token }
  }

  it('chat route returns a non-empty assistant response', async () => {
    const { app, token } = await setup()
    const res = await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ source: 'text', text: 'Say hello from integration test.' })
    expect(res.status).toBe(201)
    console.debug('LLM live chat response:', res.body.assistant_message.text)
    expect(typeof res.body.assistant_message.text).toBe('string')
    expect(res.body.assistant_message.text.length).toBeGreaterThan(0)
  }, 120_000)

  it('capture route returns a schema-valid vision analysis', async () => {
    const { app, token } = await setup()
    const res = await request(app)
      .post('/capture')
      .set('Authorization', `Bearer ${token}`)
      .field('source', 'keybind')
      .attach('image', readFileSync(screenshotPath), 'screen.png')
    expect(res.status).toBe(201)
    console.debug('LLM live vision response:', {
      context_kind: res.body.analysis.context_kind,
      summary: res.body.analysis.summary,
      urls: res.body.analysis.urls,
      raw_text: res.body.analysis.raw_text,
    })
    expect(res.body.analysis.context_kind).toBeDefined()
    expect(Array.isArray(res.body.analysis.urls)).toBe(true)
    expect(typeof res.body.analysis.summary).toBe('string')
  }, 120_000)
})
