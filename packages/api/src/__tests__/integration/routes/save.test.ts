import { describe, expect, it } from 'vitest'
import request from 'supertest'
import {
  createChatAIMock,
  createSession,
  createTestApp,
  createVisionAIMock,
  registerDevice,
  setupAuthedApp,
} from '../../helper.js'

/**
 * Default analysis payload used in save route integration tests.
 */
const sampleAnalysis = {
  raw_text: '',
  urls: [{ href: 'https://example.com' }],
  regions: [],
  context_kind: 'browser_article' as const,
  summary: 'A page about A',
}

/**
 * Creates an authenticated app and performs one capture before save assertions.
 */
async function setupWithCapture(opts: { chatResponses?: string[] } = {}) {
  const visionMock = createVisionAIMock({ analysis: sampleAnalysis })
  const chatMock = createChatAIMock({ responses: opts.chatResponses ?? ['Notes about the page.'] })

  const { app, token } = await setupAuthedApp({
    visionAI: visionMock.instance,
    chatAI: chatMock.instance,
  })
  await request(app)
    .post('/capture')
    .set('Authorization', `Bearer ${token}`)
    .field('source', 'keybind')
    .attach('image', Buffer.from('fake-image-bytes'), 'screen.png')
  return { app, token }
}

describe('POST /save', () => {
  it('returns vault_relative_path + markdown without touching disk', async () => {
    const visionMock = createVisionAIMock({ analysis: sampleAnalysis })
    const chatMock = createChatAIMock({ responses: ['Notes about the page.'] })

    const { app, token } = await setupAuthedApp({
      visionAI: visionMock.instance,
      chatAI: chatMock.instance,
    })

    await request(app)
      .post('/capture')
      .set('Authorization', `Bearer ${token}`)
      .field('source', 'keybind')
      .attach('image', Buffer.from('fake-image-bytes'), 'screen.png')

    const res = await request(app).post('/save').set('Authorization', `Bearer ${token}`).send({})

    expect(res.status).toBe(201)
    expect(res.body.vault_relative_path).toMatch(/^GotIt!\/\d{4}-\d{2}-\d{2}-/)
    expect(res.body.markdown).toContain('# ')
    expect(res.body.save_record_id).toBeTruthy()
    // No obsidianWriter in AppDeps — disk writes are the client's responsibility
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
    expect(res.body.vault_relative_path).toMatch(/^GotIt!\/\d{4}-\d{2}-\d{2}-/)
    expect(res.body.save_record_id).toBeTruthy()
  })

  it('succeeds with empty analysis when active session has no capture yet', async () => {
    const visionMock = createVisionAIMock({ analysis: sampleAnalysis })
    const chatMock = createChatAIMock({ responses: ['Notes.'] })

    const app = createTestApp({
      visionAI: visionMock.instance,
      chatAI: chatMock.instance,
    })
    const token = await registerDevice(app, 'i')
    await createSession(app, token)
    const res = await request(app).post('/save').set('Authorization', `Bearer ${token}`).send({})
    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('vault_relative_path')
  })
})
