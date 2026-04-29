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

function setup(opts: { chatResponse?: string; visionAnalysis?: typeof sampleAnalysis } = {}) {
  const store = Store.createNull()
  const { token } = store.registerDevice({ install_id: 'inst-1' })
  store.setActiveSession({
    device_id: store.findDeviceByToken(token)!.id,
    session_id: store.createSession({
      device_id: store.findDeviceByToken(token)!.id,
      now: new Date(),
    }).id,
  })
  const app = createApp({
    store,
    visionAI: VisionAI.createNull({ analysis: opts.visionAnalysis ?? sampleAnalysis }),
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
  return { app, token, store }
}

describe('POST /capture', () => {
  it('runs vision, appends capture + assistant messages, returns analysis', async () => {
    const { app, token } = setup()
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
    const store = Store.createNull()
    const { token } = store.registerDevice({ install_id: 'inst-1' })
    const app = createApp({
      store,
      visionAI: VisionAI.createNull({ analysis: sampleAnalysis }),
      chatAI: ChatAI.createNull({ responses: ['x'] }),
      obsidianWriter: ObsidianWriter.createNull(),
      visionPrompt: 'p',
      chatPersonaPrompt: 'p',
      vaultPath: '/tmp/vault',
      captureFolder: 'GotIt!',
      dataDir: '/tmp/data',
      version: 'test',
    })
    const res = await request(app)
      .post('/capture')
      .set('Authorization', `Bearer ${token}`)
      .field('source', 'keybind')
      .attach('image', Buffer.from('x'), 'a.png')
    expect(res.status).toBe(409)
  })

  it('rejects invalid source', async () => {
    const { app, token } = setup()
    const res = await request(app)
      .post('/capture')
      .set('Authorization', `Bearer ${token}`)
      .field('source', 'bogus')
      .attach('image', Buffer.from('x'), 'a.png')
    expect(res.status).toBe(400)
  })

  it('returns 502 on vision provider failure', async () => {
    // Override visionAI on this app — cleaner: build a fresh app with failing VisionAI
    const store2 = Store.createNull()
    const { token: t2 } = store2.registerDevice({ install_id: 'i2' })
    store2.setActiveSession({
      device_id: store2.findDeviceByToken(t2)!.id,
      session_id: store2.createSession({
        device_id: store2.findDeviceByToken(t2)!.id,
        now: new Date(),
      }).id,
    })
    const app2 = createApp({
      store: store2,
      visionAI: VisionAI.createNull({ failure: new Error('vision down') }),
      chatAI: ChatAI.createNull({ responses: ['x'] }),
      obsidianWriter: ObsidianWriter.createNull(),
      visionPrompt: 'p',
      chatPersonaPrompt: 'p',
      vaultPath: '/tmp/vault',
      captureFolder: 'GotIt!',
      dataDir: '/tmp/data',
      version: 'test',
    })
    const res = await request(app2)
      .post('/capture')
      .set('Authorization', `Bearer ${t2}`)
      .field('source', 'keybind')
      .attach('image', Buffer.from('x'), 'a.png')
    expect(res.status).toBe(502)
  })

  it('enriches analysis urls from raw_text when model urls are empty', async () => {
    const { app, token } = setup({
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
    const { app, token } = setup({
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
