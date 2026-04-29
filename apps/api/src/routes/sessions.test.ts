import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { Store } from '../infra/store.js'
import { VisionAI } from '../infra/vision-ai.js'
import { ChatAI } from '../infra/chat-ai.js'
import { ObsidianWriter } from '../infra/obsidian-writer.js'

function setup() {
  const store = Store.createNull()
  const { token } = store.registerDevice({ install_id: 'inst-1' })
  const app = createApp({
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
  return { app, store, token }
}

describe('sessions routes', () => {
  it('POST /sessions creates and activates a new session', async () => {
    const { app, token } = setup()
    const res = await request(app).post('/sessions').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(201)
    expect(res.body.session_id).toBeTruthy()
    expect(res.body.started_at).toBeTruthy()
  })

  it('GET /sessions/active returns the active session and tail', async () => {
    const { app, token } = setup()
    await request(app).post('/sessions').set('Authorization', `Bearer ${token}`)
    const res = await request(app).get('/sessions/active').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.session.id).toBeTruthy()
    expect(res.body.messages_tail).toEqual([])
  })

  it('POST /sessions/:id/activate sets the given session active', async () => {
    const { app, token } = setup()
    const r1 = await request(app).post('/sessions').set('Authorization', `Bearer ${token}`)
    const sid1 = r1.body.session_id
    await request(app).post('/sessions').set('Authorization', `Bearer ${token}`)
    const res = await request(app)
      .post(`/sessions/${sid1}/activate`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.session.id).toBe(sid1)
  })

  it('GET /sessions lists newest first', async () => {
    const { app, token } = setup()
    await request(app).post('/sessions').set('Authorization', `Bearer ${token}`)
    await request(app).post('/sessions').set('Authorization', `Bearer ${token}`)
    const res = await request(app).get('/sessions').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.sessions).toHaveLength(2)
    expect(res.body.sessions[0].started_at >= res.body.sessions[1].started_at).toBe(true)
  })

  it('rejects unauthenticated requests', async () => {
    const { app } = setup()
    const res = await request(app).get('/sessions/active')
    expect(res.status).toBe(401)
  })
})
