import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../../app.js'
import { Store } from '../../../infra/store.js'
import { VisionAI } from '../../../infra/vision-ai.js'
import { ChatAI } from '../../../infra/chat-ai.js'
import { ObsidianWriter } from '../../../infra/obsidian-writer.js'
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
    obsidianWriter: ObsidianWriter.createNull(),
    visionPrompt: 'p',
    chatPersonaPrompt: 'p',
    vaultPath: '/tmp/vault',
    captureFolder: 'GotIt!',
    dataDir: '/tmp/data',
    version: 'test',
  })
  return { app, token, session }
}

describe('POST /save', () => {
  it('writes the file to the vault and returns vault_path and save_record_id', async () => {
    const { app, token } = setupWithCapture()
    const res = await request(app).post('/save').set('Authorization', `Bearer ${token}`).send({})
    expect(res.status).toBe(201)
    expect(res.body.vault_path.startsWith('/tmp/vault/GotIt!/')).toBe(true)
    expect(res.body.vault_path.endsWith('.md')).toBe(true)
    expect(res.body.save_record_id).toBeTruthy()
  })

  it('uses override template when instruction supplied', async () => {
    const { app, token } = setupWithCapture(['```\ncode body from AI\n```'])
    const res = await request(app)
      .post('/save')
      .set('Authorization', `Bearer ${token}`)
      .send({ instruction: 'save as a code snippet' })
    expect(res.status).toBe(201)
    expect(res.body.vault_path.startsWith('/tmp/vault/GotIt!/')).toBe(true)
    expect(res.body.save_record_id).toBeTruthy()
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
      obsidianWriter: ObsidianWriter.createNull(),
      visionPrompt: 'p',
      chatPersonaPrompt: 'p',
      vaultPath: '/tmp/vault',
      captureFolder: 'GotIt!',
      dataDir: '/tmp/data',
      version: 'test',
    })
    const res = await request(app).post('/save').set('Authorization', `Bearer ${token}`).send({})
    expect(res.status).toBe(422)
  })

  it('returns 422 when vault write fails', async () => {
    const store = Store.createNull()
    const { token } = store.registerDevice({ install_id: 'i' })
    const device = store.findDeviceByToken(token)!
    const session = store.createSession({ device_id: device.id, now: new Date() })
    store.setActiveSession({ device_id: device.id, session_id: session.id })
    store.appendMessage({
      ...captureMsg,
      id: 'cap2',
      session_id: session.id,
      created_at: new Date().toISOString(),
    })
    const app = createApp({
      store,
      visionAI: VisionAI.createNull(),
      chatAI: ChatAI.createNull(),
      obsidianWriter: ObsidianWriter.createNull({ writeFailure: new Error('ENOSPC') }),
      visionPrompt: 'p',
      chatPersonaPrompt: 'p',
      vaultPath: '/tmp/vault',
      captureFolder: 'GotIt!',
      dataDir: '/tmp/data',
      version: 'test',
    })
    const res = await request(app).post('/save').set('Authorization', `Bearer ${token}`).send({})
    expect(res.status).toBe(422)
    expect(res.body.error).toContain('ENOSPC')
  })
})
