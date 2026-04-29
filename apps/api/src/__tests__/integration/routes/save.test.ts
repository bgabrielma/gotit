import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../../app.js'
import { Store } from '../../../infra/store.js'
import { VisionAI } from '../../../infra/vision-ai.js'
import { ChatAI } from '../../../infra/chat-ai.js'
import { ObsidianWriter } from '../../../infra/obsidian-writer.js'

const sampleAnalysis = {
  raw_text: '',
  urls: [{ href: 'https://example.com' }],
  regions: [],
  context_kind: 'browser_article' as const,
  summary: 'A page about A',
}

function makeApp(opts: { chatResponses?: string[]; writeFailure?: Error } = {}) {
  return createApp({
    store: Store.createNull(),
    visionAI: VisionAI.createNull({ analysis: sampleAnalysis }),
    chatAI: ChatAI.createNull({ responses: opts.chatResponses ?? ['Notes about the page.'] }),
    obsidianWriter: opts.writeFailure
      ? ObsidianWriter.createNull({ writeFailure: opts.writeFailure })
      : ObsidianWriter.createNull(),
    visionPrompt: 'p',
    chatPersonaPrompt: 'p',
    vaultPath: '/tmp/vault',
    captureFolder: 'GotIt!',
    dataDir: '/tmp/data',
    version: 'test',
  })
}

async function setupWithCapture(opts: Parameters<typeof makeApp>[0] = {}) {
  const app = makeApp(opts)
  const deviceRes = await request(app).post('/device').send({ install_id: 'i' })
  const token = deviceRes.body.token as string
  await request(app).post('/sessions').set('Authorization', `Bearer ${token}`)
  await request(app)
    .post('/capture')
    .set('Authorization', `Bearer ${token}`)
    .field('source', 'keybind')
    .attach('image', Buffer.from('fake-image-bytes'), 'screen.png')
  return { app, token }
}

describe('POST /save', () => {
  it('writes the file to the vault and returns vault_path and save_record_id', async () => {
    const { app, token } = await setupWithCapture()
    const res = await request(app).post('/save').set('Authorization', `Bearer ${token}`).send({})
    expect(res.status).toBe(201)
    expect(res.body.vault_path.startsWith('/tmp/vault/GotIt!/')).toBe(true)
    expect(res.body.vault_path.endsWith('.md')).toBe(true)
    expect(res.body.save_record_id).toBeTruthy()
  })

  it('uses override template when instruction supplied', async () => {
    // Two chat responses: first consumed by POST /capture, second by POST /save override
    const { app, token } = await setupWithCapture({
      chatResponses: ['Notes about the page.', '```\ncode body from AI\n```'],
    })
    const res = await request(app)
      .post('/save')
      .set('Authorization', `Bearer ${token}`)
      .send({ instruction: 'save as a code snippet' })
    expect(res.status).toBe(201)
    expect(res.body.vault_path.startsWith('/tmp/vault/GotIt!/')).toBe(true)
    expect(res.body.save_record_id).toBeTruthy()
  })

  it('returns 422 when active session has no capture yet', async () => {
    const app = makeApp()
    const deviceRes = await request(app).post('/device').send({ install_id: 'i' })
    const token = deviceRes.body.token as string
    await request(app).post('/sessions').set('Authorization', `Bearer ${token}`)
    const res = await request(app).post('/save').set('Authorization', `Bearer ${token}`).send({})
    expect(res.status).toBe(422)
  })

  it('returns 422 when vault write fails', async () => {
    const { app, token } = await setupWithCapture({
      writeFailure: new Error('ENOSPC'),
    })
    const res = await request(app).post('/save').set('Authorization', `Bearer ${token}`).send({})
    expect(res.status).toBe(422)
    expect(res.body.error).toContain('ENOSPC')
  })
})
