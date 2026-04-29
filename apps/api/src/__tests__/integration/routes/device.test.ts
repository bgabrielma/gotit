import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../../app.js'
import { Store } from '../../../infra/store.js'
import { VisionAI } from '../../../infra/vision-ai.js'
import { ChatAI } from '../../../infra/chat-ai.js'
import { ObsidianWriter } from '../../../infra/obsidian-writer.js'

function makeApp(store: Store) {
  return createApp({
    store,
    visionAI: VisionAI.createNull(),
    chatAI: ChatAI.createNull(),
    obsidianWriter: ObsidianWriter.createNull(),
    visionPrompt: 'p',
    chatPersonaPrompt: 'p',
    vaultPath: '/tmp/vault',
    captureFolder: 'GotIt!',
    dataDir: '/tmp/data',
    version: 'test',
  })
}

describe('POST /device', () => {
  it('issues a device_id and token', async () => {
    const app = makeApp(Store.createNull())
    const res = await request(app).post('/device').send({ install_id: 'inst-1' })
    expect(res.status).toBe(201)
    expect(res.body.device_id).toBeTruthy()
    expect(res.body.token).toBeTruthy()
  })

  it('rejects empty install_id', async () => {
    const app = makeApp(Store.createNull())
    const res = await request(app).post('/device').send({ install_id: '' })
    expect(res.status).toBe(400)
  })

  it('returns the same device on repeated registration with same install_id', async () => {
    const store = Store.createNull()
    const app = makeApp(store)
    const r1 = await request(app).post('/device').send({ install_id: 'inst-1' })
    const r2 = await request(app).post('/device').send({ install_id: 'inst-1' })
    expect(r1.body.device_id).toBe(r2.body.device_id)
  })
})
