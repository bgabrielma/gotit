import { describe, expect, it, beforeEach } from 'vitest'
import { Store } from '../../../infra/store.js'
import type { Message } from '@got-it/shared'

describe('Store (Nullable)', () => {
  let store: Store
  beforeEach(() => {
    store = Store.createNull()
  })

  it('issues a device token and looks it up', async () => {
    const { device_id, token } = await store.registerDevice({ install_id: 'inst-1' })
    expect(device_id).toBeTruthy()
    expect(token).toBeTruthy()
    await expect(store.findDeviceByToken(token)).resolves.toEqual(
      expect.objectContaining({ id: device_id, install_id: 'inst-1' })
    )
  })

  it('creates a session and sets it active', async () => {
    const { device_id } = await store.registerDevice({ install_id: 'inst-1' })
    const session = await store.createSession({ device_id, now: new Date('2026-04-28T10:00:00Z') })
    await store.setActiveSession({ device_id, session_id: session.id })
    await expect(store.getActiveSession(device_id)).resolves.toEqual(
      expect.objectContaining({ id: session.id })
    )
  })

  it('appends messages and reads them in order', async () => {
    const { device_id } = await store.registerDevice({ install_id: 'inst-1' })
    const session = await store.createSession({ device_id, now: new Date() })
    const m: Message = {
      id: 'm1',
      session_id: session.id,
      kind: 'user_text',
      text: 'hi',
      source: 'text',
      created_at: '2026-04-28T10:00:01Z',
    }
    await store.appendMessage(m)
    await expect(store.listMessages({ session_id: session.id, limit: 50 })).resolves.toEqual([m])
  })

  it('lists sessions reverse-chronologically per device', async () => {
    const { device_id } = await store.registerDevice({ install_id: 'inst-1' })
    const s1 = await store.createSession({ device_id, now: new Date('2026-04-28T10:00:00Z') })
    const s2 = await store.createSession({ device_id, now: new Date('2026-04-28T11:00:00Z') })
    const sessions = await store.listSessions({ device_id, limit: 10 })
    expect(sessions.map((session) => session.id)).toEqual([s2.id, s1.id])
  })
})
