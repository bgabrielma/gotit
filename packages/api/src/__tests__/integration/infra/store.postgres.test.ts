import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { Pool } from 'pg'
import type { Message } from '@got-it/shared'
import { Store } from '../../../infra/store.js'

const DEFAULT_DATABASE_URL = 'postgres://gotit:gotit@localhost:5432/gotit'
const DATABASE_URL = process.env.GOTIT_DATABASE_URL ?? DEFAULT_DATABASE_URL
const MIGRATIONS_DIR = resolve('migrations')

describe('Store (Postgres integration)', () => {
  let store: Store | null = null
  let pool: Pool | null = null

  beforeAll(async () => {
    store = await Store.create({ databaseUrl: DATABASE_URL, migrationsDir: MIGRATIONS_DIR })
    pool = new Pool({ connectionString: DATABASE_URL })
  })

  beforeEach(async () => {
    await pool!.query('TRUNCATE TABLE images, messages, sessions, devices RESTART IDENTITY CASCADE')
  })

  afterAll(async () => {
    if (store) {
      await store.close()
    }
    if (pool) {
      await pool.end()
    }
  })

  it('round-trips device token lookup', async () => {
    const { device_id, token } = await store!.registerDevice({ install_id: 'inst-token-1' })

    const device = await store!.findDeviceByToken(token)
    expect(device).toEqual(expect.objectContaining({ id: device_id, install_id: 'inst-token-1' }))
  })

  it('is idempotent by install_id during device registration', async () => {
    const first = await store!.registerDevice({ install_id: 'inst-idempotent-1' })
    const second = await store!.registerDevice({ install_id: 'inst-idempotent-1' })

    expect(second).toEqual(first)
  })

  it('creates a session and sets it active', async () => {
    const { device_id } = await store!.registerDevice({ install_id: 'inst-session-1' })
    const session = await store!.createSession({ device_id, now: new Date('2026-04-30T12:00:00Z') })

    await store!.setActiveSession({ device_id, session_id: session.id })
    const active = await store!.getActiveSession(device_id)

    expect(active).toEqual(expect.objectContaining({ id: session.id, device_id }))
  })

  it('round-trips JSONB message payload', async () => {
    const { device_id } = await store!.registerDevice({ install_id: 'inst-msg-1' })
    const session = await store!.createSession({ device_id, now: new Date('2026-04-30T12:00:00Z') })
    const message: Message = {
      id: 'msg-1',
      session_id: session.id,
      kind: 'user_text',
      text: 'Hello Postgres',
      source: 'text',
      created_at: '2026-04-30T12:00:01Z',
    }

    await store!.appendMessage(message)
    const messages = await store!.listMessages({ session_id: session.id, limit: 50 })

    expect(messages).toEqual([message])
  })
})
