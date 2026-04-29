import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../../../app.js'
import { Store } from '../../../infra/store.js'
import { VisionAI } from '../../../infra/vision-ai.js'
import { ChatAI } from '../../../infra/chat-ai.js'
import { ObsidianWriter } from '../../../infra/obsidian-writer.js'

const sampleAnalysis = {
  raw_text: 'README for cool-lib',
  urls: [{ href: 'https://github.com/x/cool-lib' }],
  regions: [],
  context_kind: 'browser_article' as const,
  summary: 'GitHub repo: cool-lib',
}

function makeApp(
  opts: {
    visionAnalysis?: typeof sampleAnalysis
    chatResponse?: string
    visionFailure?: Error
  } = {}
) {
  return createApp({
    store: Store.createNull(),
    visionAI: opts.visionFailure
      ? VisionAI.createNull({ failure: opts.visionFailure })
      : VisionAI.createNull({ analysis: opts.visionAnalysis ?? sampleAnalysis }),
    chatAI: ChatAI.createNull({
      responses: [opts.chatResponse ?? 'Looks like a JSON parser repo.'],
    }),
    obsidianWriter: ObsidianWriter.createNull(),
    visionPrompt: 'p',
    chatPersonaPrompt: 'p',
    vaultPath: '/tmp/vault',
    captureFolder: 'GotIt!',
    dataDir: '/tmp/data',
    version: 'test',
  })
}

async function setup(opts: Parameters<typeof makeApp>[0] = {}) {
  const app = makeApp(opts)
  const deviceRes = await request(app).post('/device').send({ install_id: 'inst-1' })
  const token = deviceRes.body.token as string
  await request(app).post('/sessions').set('Authorization', `Bearer ${token}`)
  return { app, token }
}

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
    const deviceRes = await request(app).post('/device').send({ install_id: 'inst-1' })
    const token = deviceRes.body.token as string
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
