import { describe, expect, it } from 'vitest'
import request from 'supertest'
import {
  createChatAIMock,
  createObsidianWriterMock,
  createSession,
  createTestApp,
  createVisionAIMock,
  registerDevice,
  setupAuthedApp,
  tmpPath,
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
 * Builds an app with mocked dependencies for save route tests.
 */
function makeApp(opts: { chatResponses?: string[]; writeFailure?: Error } = {}) {
  const visionMock = createVisionAIMock({ analysis: sampleAnalysis })
  const chatMock = createChatAIMock({ responses: opts.chatResponses ?? ['Notes about the page.'] })
  const writerMock = createObsidianWriterMock(
    opts.writeFailure ? { writeFailure: opts.writeFailure } : {}
  )

  return createTestApp({
    visionAI: visionMock.instance,
    chatAI: chatMock.instance,
    obsidianWriter: writerMock.instance,
  })
}

/**
 * Creates an authenticated app and performs one capture before save assertions.
 */
async function setupWithCapture(opts: Parameters<typeof makeApp>[0] = {}) {
  const visionMock = createVisionAIMock({ analysis: sampleAnalysis })
  const chatMock = createChatAIMock({ responses: opts.chatResponses ?? ['Notes about the page.'] })
  const writerMock = createObsidianWriterMock(
    opts.writeFailure ? { writeFailure: opts.writeFailure } : {}
  )

  const { app, token } = await setupAuthedApp({
    visionAI: visionMock.instance,
    chatAI: chatMock.instance,
    obsidianWriter: writerMock.instance,
  })
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
    expect(res.body.vault_path.startsWith(`${tmpPath('vault')}/GotIt!/`)).toBe(true)
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
    expect(res.body.vault_path.startsWith(`${tmpPath('vault')}/GotIt!/`)).toBe(true)
    expect(res.body.save_record_id).toBeTruthy()
  })

  it('returns 422 when active session has no capture yet', async () => {
    const app = makeApp()
    const token = await registerDevice(app, 'i')
    await createSession(app, token)
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
