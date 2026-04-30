import { describe, expect, it } from 'vitest'
import request from 'supertest'
import {
  createChatAIMock,
  createTestApp,
  createVisionAIMock,
  registerDevice,
  setupAuthedApp,
} from '../../helper.js'

/**
 * Default analysis payload used in capture route integration tests.
 */
const sampleAnalysis = {
  raw_text: 'README for cool-lib',
  urls: [{ href: 'https://github.com/x/cool-lib' }],
  regions: [],
  context_kind: 'browser_article' as const,
  summary: 'GitHub repo: cool-lib',
}

/**
 * Builds an app with mocked vision and chat backends for capture route tests.
 */
function makeApp(
  opts: {
    visionAnalysis?: typeof sampleAnalysis
    chatResponse?: string
    visionFailure?: Error
  } = {}
) {
  const visionMock = createVisionAIMock(
    opts.visionFailure
      ? { analysis: opts.visionAnalysis ?? sampleAnalysis, failure: opts.visionFailure }
      : { analysis: opts.visionAnalysis ?? sampleAnalysis }
  )
  const chatMock = createChatAIMock({
    responses: [opts.chatResponse ?? 'Looks like a JSON parser repo.'],
  })

  return createTestApp({
    visionAI: visionMock.instance,
    chatAI: chatMock.instance,
  })
}

/**
 * Creates an authenticated app/session pair for capture route tests.
 */
async function setup(opts: Parameters<typeof makeApp>[0] = {}) {
  const visionMock = createVisionAIMock(
    opts.visionFailure
      ? { analysis: opts.visionAnalysis ?? sampleAnalysis, failure: opts.visionFailure }
      : { analysis: opts.visionAnalysis ?? sampleAnalysis }
  )
  const chatMock = createChatAIMock({
    responses: [opts.chatResponse ?? 'Looks like a JSON parser repo.'],
  })

  return setupAuthedApp({
    visionAI: visionMock.instance,
    chatAI: chatMock.instance,
  })
}

/**
 * Integration coverage for capture route behavior.
 */
describe('POST /capture', () => {
  it('runs vision, appends capture + assistant messages, returns analysis', async () => {
    const { app, token } = await setup()
    const res = await request(app)
      .post('/capture')
      .set('Authorization', `Bearer ${token}`)
      .field('source', 'keybind')
      .attach('image', Buffer.from('fake-image-bytes'), 'screen.png')
    expect(res.status).toBe(201)
    expect(res.body.analysis.summary).toBe('GitHub repo: cool-lib')
    expect(res.body.assistant_message.text).toMatch(/JSON parser/)
  })

  it('rejects when no active session', async () => {
    const app = makeApp()
    const token = await registerDevice(app)
    const res = await request(app)
      .post('/capture')
      .set('Authorization', `Bearer ${token}`)
      .field('source', 'keybind')
      .attach('image', Buffer.from('x'), 'a.png')
    expect(res.status).toBe(409)
  })

  it('rejects invalid source', async () => {
    const { app, token } = await setup()
    const res = await request(app)
      .post('/capture')
      .set('Authorization', `Bearer ${token}`)
      .field('source', 'bogus')
      .attach('image', Buffer.from('x'), 'a.png')
    expect(res.status).toBe(400)
  })

  it('returns 502 on vision provider failure', async () => {
    const { app, token } = await setup({ visionFailure: new Error('vision down') })
    const res = await request(app)
      .post('/capture')
      .set('Authorization', `Bearer ${token}`)
      .field('source', 'keybind')
      .attach('image', Buffer.from('x'), 'a.png')
    expect(res.status).toBe(502)
  })

  it('enriches analysis urls from raw_text when model urls are empty', async () => {
    const { app, token } = await setup({
      visionAnalysis: {
        ...sampleAnalysis,
        raw_text: 'Landing page at google.com and https://docs.example.org.',
        urls: [],
      },
    })
    const res = await request(app)
      .post('/capture')
      .set('Authorization', `Bearer ${token}`)
      .field('source', 'keybind')
      .attach('image', Buffer.from('x'), 'a.png')
    expect(res.status).toBe(201)
    expect(res.body.analysis.urls).toEqual([
      { href: 'https://google.com' },
      { href: 'https://docs.example.org' },
    ])
  })

  it('merges model urls with extracted raw_text urls without duplicates', async () => {
    const { app, token } = await setup({
      visionAnalysis: {
        ...sampleAnalysis,
        raw_text: 'Seen on google.com and docs.example.org/reference.',
        urls: [{ href: 'https://google.com' }],
      },
    })
    const res = await request(app)
      .post('/capture')
      .set('Authorization', `Bearer ${token}`)
      .field('source', 'keybind')
      .attach('image', Buffer.from('x'), 'a.png')
    expect(res.status).toBe(201)
    expect(res.body.analysis.urls).toEqual([
      { href: 'https://google.com' },
      { href: 'https://docs.example.org/reference' },
    ])
  })
})
