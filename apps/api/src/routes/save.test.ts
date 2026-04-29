import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { Store } from '../infra/store.js'
import { VisionAI } from '../infra/vision-ai.js'
import { ChatAI } from '../infra/chat-ai.js'
import type { Message } from '@got-it/shared'

const captureMsg: Omit<
  Extract<Message, { kind: 'screen_capture' }>,
  'id' | 'session_id' | 'created_at'
> = {
  kind: 'screen_capture',
  image_ref: 'r.png',
  source: 'keybind',
  analysis: {
    raw_text: '',
    urls: [{ href: 'https://example.com' }],
    regions: [],
    context_kind: 'browser_article',
    summary: 'A page about A',
  },
}

function setupWithCapture(chatResponses: string[] = []) {
  const store = Store.createNull()
  const { token } = store.registerDevice({ install_id: 'i' })
  const device = store.findDeviceByToken(token)!
  const session = store.createSession({
    device_id: device.id,
    now: new Date('2026-04-28T15:42:00Z'),
  })
  store.setActiveSession({ device_id: device.id, session_id: session.id })
  store.appendMessage({
    ...captureMsg,
    id: 'cap1',
    session_id: session.id,
    created_at: '2026-04-28T15:42:00Z',
  })
  store.appendMessage({
    id: 'a1',
    session_id: session.id,
    kind: 'assistant',
    text: 'Notes about the page.',
    created_at: '2026-04-28T15:42:01Z',
  })
  const app = createApp({
    store,
    visionAI: VisionAI.createNull(),
    chatAI: ChatAI.createNull({ responses: chatResponses }),
    visionPrompt: 'p',
    chatPersonaPrompt: 'p',
    captureFolder: 'GotIt!',
    dataDir: '/tmp/data',
    version: 'test',
  })
  return { app, token, session }
}

describe('POST /save', () => {
  it('returns a vault draft payload for client-side Vault API write', async () => {
    const { app, token } = setupWithCapture()
    const res = await request(app).post('/save').set('Authorization', `Bearer ${token}`).send({})
    expect(res.status).toBe(201)
    expect(res.body.vault_relative_path.startsWith('GotIt!/')).toBe(true)
    expect(res.body.vault_relative_path.endsWith('.md')).toBe(true)
    expect(res.body.markdown).toContain('# A page about A')
    expect(res.body.markdown).toContain('## Notes')
    expect(res.body.markdown).toContain('Notes about the page.')
    expect(res.body.save_record_id).toBeTruthy()
  })

  it('uses override template when instruction supplied', async () => {
    const { app, token } = setupWithCapture(['```\ncode body from AI\n```'])
    const res = await request(app)
      .post('/save')
      .set('Authorization', `Bearer ${token}`)
      .send({ instruction: 'save as a code snippet' })
    expect(res.status).toBe(201)
    expect(res.body.markdown).toContain('code body from AI')
    expect(res.body.markdown).not.toContain('## Notes')
  })

  it('returns 422 when active session has no capture yet', async () => {
    const store = Store.createNull()
    const { token } = store.registerDevice({ install_id: 'i' })
    const device = store.findDeviceByToken(token)!
    const session = store.createSession({ device_id: device.id, now: new Date() })
    store.setActiveSession({ device_id: device.id, session_id: session.id })
    const app = createApp({
      store,
      visionAI: VisionAI.createNull(),
      chatAI: ChatAI.createNull(),
      visionPrompt: 'p',
      chatPersonaPrompt: 'p',
      captureFolder: 'GotIt!',
      dataDir: '/tmp/data',
      version: 'test',
    })
    const res = await request(app).post('/save').set('Authorization', `Bearer ${token}`).send({})
    expect(res.status).toBe(422)
  })
})
