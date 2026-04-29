import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { createApp } from '../../app.js'
import { Store } from '../../infra/store.js'
import { VisionAI } from '../../infra/vision-ai.js'
import { ChatAI } from '../../infra/chat-ai.js'
import { ObsidianWriter } from '../../infra/obsidian-writer.js'
import { loadConfig } from '../../config.js'
import { LLMConnectorConfig } from '../../infra/llm-connector-config.js'

// Hardcoded live vault path — real filesystem writes, cleaned up after each run.
const LIVE_VAULT_PATH = '/tmp/gotit-live-test'
const LIVE_CAPTURE_FOLDER = 'obsidian-live'

const canRunLive =
  (process.env.GOTIT_LLM_CONNECTOR === 'openai' &&
    typeof process.env.OPENAI_API_KEY === 'string' &&
    process.env.OPENAI_API_KEY.length > 0) ||
  (process.env.GOTIT_LLM_CONNECTOR === 'local' &&
    typeof process.env.GOTIT_LLM_BASE_URL === 'string' &&
    process.env.GOTIT_LLM_BASE_URL.length > 0)

// ─── Helpers ────────────────────────────────────────────────────────────────

function writtenFiles(): string[] {
  const dir = join(LIVE_VAULT_PATH, LIVE_CAPTURE_FOLDER)
  if (!existsSync(dir)) return []
  return readdirSync(dir).map((f) => join(dir, f))
}

function cleanupVault() {
  const dir = join(LIVE_VAULT_PATH, LIVE_CAPTURE_FOLDER)
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
}

function setupApp(opts: {
  chatAI: ReturnType<typeof ChatAI.createNull> | ReturnType<typeof ChatAI.create>
  visionAI: ReturnType<typeof VisionAI.createNull> | ReturnType<typeof VisionAI.create>
}) {
  const store = Store.createNull()
  const { token } = store.registerDevice({ install_id: 'obsidian-live-device' })
  const device = store.findDeviceByToken(token)!
  const session = store.createSession({ device_id: device.id, now: new Date() })
  store.setActiveSession({ device_id: device.id, session_id: session.id })

  const app = createApp({
    store,
    visionAI: opts.visionAI,
    chatAI: opts.chatAI,
    obsidianWriter: ObsidianWriter.create(),
    visionPrompt: 'Analyse this screenshot.',
    chatPersonaPrompt: 'You are a concise research assistant.',
    vaultPath: LIVE_VAULT_PATH,
    captureFolder: LIVE_CAPTURE_FOLDER,
    dataDir: '/tmp/gotit-live-data',
    version: 'live-test',
  })

  return { app, token }
}

// ─── Nullable-backed live Obsidian write ─────────────────────────────────────
// Always runs — no LLM keys needed. Tests that ObsidianWriter writes a real
// file with valid frontmatter after a nullable capture + nullable chat.

describe('Obsidian live write (nullable LLM, real fs)', () => {
  beforeAll(cleanupVault)
  afterAll(cleanupVault)

  it('writes a Markdown file to the vault folder after capture + save', async () => {
    const { app, token } = setupApp({
      visionAI: VisionAI.createNull({
        analysis: {
          raw_text: 'GotIt! is a second-brain macOS app. See https://github.com/got-it/got-it.',
          urls: [{ href: 'https://github.com/got-it/got-it' }],
          regions: [],
          context_kind: 'browser_article',
          summary: 'GotIt! — macOS second-brain app',
        },
      }),
      chatAI: ChatAI.createNull({
        responses: ['GotIt! is a macOS app for capturing and organising information quickly.'],
      }),
    })

    const captureRes = await request(app)
      .post('/capture')
      .set('Authorization', `Bearer ${token}`)
      .field('source', 'keybind')
      .attach('image', Buffer.from('fake-png-bytes'), 'screen.png')

    expect(captureRes.status).toBe(201)

    const saveRes = await request(app)
      .post('/save')
      .set('Authorization', `Bearer ${token}`)
      .send({})

    expect(saveRes.status).toBe(201)
    expect(typeof saveRes.body.vault_path).toBe('string')

    const files = writtenFiles()
    expect(files.length).toBe(1)

    const contents = readFileSync(files[0]!, 'utf-8')
    expect(contents).toMatch(/^---\n/)
    expect(contents).toMatch(/session_id:/)
    expect(contents).toMatch(/captured_at:/)
    expect(contents).toMatch(/context_kind:/)
    expect(contents).toMatch(/https:\/\/github\.com\/got-it\/got-it/)
  })

  it('writes with a save instruction (override body via chat)', async () => {
    const { app, token } = setupApp({
      visionAI: VisionAI.createNull({
        analysis: {
          raw_text: 'Interesting article about TypeScript 5.6.',
          urls: [],
          regions: [],
          context_kind: 'browser_article',
          summary: 'TypeScript 5.6 release notes',
        },
      }),
      chatAI: ChatAI.createNull({
        responses: [
          'Initial assistant reply.',
          '## Summary\n\nTypeScript 5.6 ships improved type narrowing and a new `--erasableSyntaxOnly` flag.',
        ],
      }),
    })

    await request(app)
      .post('/capture')
      .set('Authorization', `Bearer ${token}`)
      .field('source', 'keybind')
      .attach('image', Buffer.from('x'), 'screen.png')

    const saveRes = await request(app)
      .post('/save')
      .set('Authorization', `Bearer ${token}`)
      .send({ instruction: 'Write a short summary with key takeaways as bullet points.' })

    expect(saveRes.status).toBe(201)

    const files = writtenFiles()
    expect(files.length).toBeGreaterThanOrEqual(1)
    const latest = files.at(-1)!
    const contents = readFileSync(latest, 'utf-8')
    expect(contents).toMatch(/TypeScript/)
  })
})

// ─── Full live (real LLM + real fs) ──────────────────────────────────────────
// Guarded: runs only when LLM env vars are present.

const describeIfLive = canRunLive ? describe : describe.skip

describeIfLive('Obsidian live write (real LLM + real fs)', () => {
  beforeAll(cleanupVault)
  afterAll(cleanupVault)

  it('captures a screenshot, chats, saves to vault, file has valid content', async () => {
    const cfg = loadConfig(process.env)
    const llm = LLMConnectorConfig.fromConfig(cfg)

    const { app, token } = setupApp({
      visionAI: VisionAI.create(llm),
      chatAI: ChatAI.create(llm),
    })

    const png = readFileSync('src/__tests__/fixtures/screenshot-sample.png')

    const captureRes = await request(app)
      .post('/capture')
      .set('Authorization', `Bearer ${token}`)
      .field('source', 'keybind')
      .attach('image', png, 'screen.png')

    expect(captureRes.status).toBe(201)
    console.debug('live capture summary:', captureRes.body.analysis.summary)

    const chatRes = await request(app)
      .post('/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ source: 'text', text: 'Summarise this capture and tell me what to save.' })

    expect(chatRes.status).toBe(201)
    console.debug('live chat reply:', chatRes.body.assistant_message.text)

    const saveRes = await request(app)
      .post('/save')
      .set('Authorization', `Bearer ${token}`)
      .send({})

    expect(saveRes.status).toBe(201)
    console.debug('saved to:', saveRes.body.vault_path)

    const files = writtenFiles()
    expect(files.length).toBe(1)
    const contents = readFileSync(files[0]!, 'utf-8')
    expect(contents).toMatch(/^---\n/)
    expect(contents).toMatch(/captured_at:/)
    expect(contents).toMatch(/session_id:/)
  }, 120_000)
})
