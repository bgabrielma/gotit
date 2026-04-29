import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { Store } from '../infra/store.js'
import { VisionAI } from '../infra/vision-ai.js'
import { ChatAI } from '../infra/chat-ai.js'

function makeApp() {
  return createApp({
    store: Store.createNull(),
    visionAI: VisionAI.createNull(),
    chatAI: ChatAI.createNull(),
    visionPrompt: 'p',
    chatPersonaPrompt: 'p',
    captureFolder: 'GotIt!',
    dataDir: '/tmp/data',
    version: 'test',
  })
}

describe('GET /health', () => {
  it('returns ok and version', async () => {
    const app = makeApp()
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, version: 'test' })
  })
})
