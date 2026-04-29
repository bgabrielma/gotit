import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { Store } from '../infra/store.js'
import { VisionAI } from '../infra/vision-ai.js'
import { ChatAI } from '../infra/chat-ai.js'
import { ObsidianWriter } from '../infra/obsidian-writer.js'

function setup(chatResponse = 'reply') {
  const store = Store.createNull()
  const { token } = store.registerDevice({ install_id: 'i' })
  const device = store.findDeviceByToken(token)!
  const session = store.createSession({ device_id: device.id, now: new Date() })
  store.setActiveSession({ device_id: device.id, session_id: session.id })
  const app = createApp({
    store,
    visionAI: VisionAI.createNull(),
    chatAI: ChatAI.createNull({ responses: [chatResponse] }),
    obsidianWriter: ObsidianWriter.createNull(),
    visionPrompt: 'p',
    chatPersonaPrompt: 'persona',
    vaultPath: '/tmp/vault',
    captureFolder: 'GotIt!',
    dataDir: '/tmp/data',
    version: 'test',
  })
  return { app, token, store, device, session }
}

describe('POST /chat', () => {
  it('appends user message, returns assistant reply', async () => {
    const { app, token } = setup('hello back')
    const res = await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'hello', source: 'text' })
    expect(res.status).toBe(201)
    expect(res.body.assistant_message.text).toBe('hello back')
  })

  it('rejects empty text', async () => {
    const { app, token } = setup()
    const res = await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: '', source: 'text' })
    expect(res.status).toBe(400)
  })

  it('rejects mic/listen sources in Phase 1a (deferred to 1b/1c)', async () => {
    const { app, token } = setup()
    const res = await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'voice text', source: 'mic' })
    expect(res.status).toBe(400)
  })
})
