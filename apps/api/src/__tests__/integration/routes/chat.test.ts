import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../../app.js'
import { Store } from '../../../infra/store.js'
import { VisionAI } from '../../../infra/vision-ai.js'
import { ChatAI } from '../../../infra/chat-ai.js'
import { ObsidianWriter } from '../../../infra/obsidian-writer.js'

function makeApp(chatResponse = 'reply') {
  return createApp({
    store: Store.createNull(),
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
}

async function setup(chatResponse = 'reply') {
  const app = makeApp(chatResponse)
  const deviceRes = await request(app).post('/device').send({ install_id: 'i' })
  const token = deviceRes.body.token as string
  await request(app).post('/sessions').set('Authorization', `Bearer ${token}`)
  return { app, token }
}

describe('POST /chat', () => {
  it('appends user message, returns assistant reply', async () => {
    const { app, token } = await setup('hello back')
    const res = await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'hello', source: 'text' })
    expect(res.status).toBe(201)
    expect(res.body.assistant_message.text).toBe('hello back')
  })

  it('rejects empty text', async () => {
    const { app, token } = await setup()
    const res = await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: '', source: 'text' })
    expect(res.status).toBe(400)
  })

  it('rejects mic/listen sources in Phase 1a (deferred to 1b/1c)', async () => {
    const { app, token } = await setup()
    const res = await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'voice text', source: 'mic' })
    expect(res.status).toBe(400)
  })
})
