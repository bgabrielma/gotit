import { describe, expect, it, beforeEach } from 'vitest'
import { Store } from '../../../infra/store.js'
import type { Message } from '@got-it/shared'

describe('Store (Nullable)', () => {
  let store: Store
  beforeEach(() => {
    store = Store.createNull()
  })

  it('issues a device token and looks it up', () => {
    const { device_id, token } = store.registerDevice({ install_id: 'inst-1' })
    expect(device_id).toBeTruthy()
    expect(token).toBeTruthy()
    expect(store.findDeviceByToken(token)).toEqual(
      expect.objectContaining({ id: device_id, install_id: 'inst-1' })
    )
  })

  it('creates a session and sets it active', () => {
    const { device_id } = store.registerDevice({ install_id: 'inst-1' })
    const session = store.createSession({ device_id, now: new Date('2026-04-28T10:00:00Z') })
    store.setActiveSession({ device_id, session_id: session.id })
    expect(store.getActiveSession(device_id)?.id).toBe(session.id)
  })

  it('appends messages and reads them in order', () => {
    const { device_id } = store.registerDevice({ install_id: 'inst-1' })
    const session = store.createSession({ device_id, now: new Date() })
    const m: Message = {
      id: 'm1',
      session_id: session.id,
      kind: 'user_text',
      text: 'hi',
      source: 'text',
      created_at: '2026-04-28T10:00:01Z',
    }
    store.appendMessage(m)
    expect(store.listMessages({ session_id: session.id, limit: 50 })).toEqual([m])
  })

  it('lists sessions reverse-chronologically per device', () => {
    const { device_id } = store.registerDevice({ install_id: 'inst-1' })
    const s1 = store.createSession({ device_id, now: new Date('2026-04-28T10:00:00Z') })
    const s2 = store.createSession({ device_id, now: new Date('2026-04-28T11:00:00Z') })
    expect(store.listSessions({ device_id, limit: 10 }).map((s) => s.id)).toEqual([s2.id, s1.id])
  })
})
