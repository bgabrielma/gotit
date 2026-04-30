import { v4 as uuid } from 'uuid'
import type { Message, Session, DeviceId, SessionId } from '@got-it/shared'
import type { Device, StoreBackend } from '../../infra/store.js'

/** Test-only storage fake for unit and non-live route integration tests. */
export class FakeStoreBackend implements StoreBackend {
  private readonly devices = new Map<DeviceId, Device>()
  private readonly byToken = new Map<string, DeviceId>()
  private readonly sessions = new Map<SessionId, Session>()
  private readonly messages = new Map<SessionId, Message[]>()

  async registerDevice({ install_id }: { install_id: string }) {
    for (const device of this.devices.values()) {
      if (device.install_id === install_id) {
        return { device_id: device.id, token: device.token }
      }
    }
    const id = uuid()
    const token = uuid()
    const device: Device = {
      id,
      install_id,
      token,
      active_session_id: null,
      created_at: new Date().toISOString(),
    }
    this.devices.set(id, device)
    this.byToken.set(token, id)
    return { device_id: id, token }
  }

  async findDeviceByToken(token: string) {
    const id = this.byToken.get(token)
    return id ? (this.devices.get(id) ?? null) : null
  }

  async createSession({ device_id, now }: { device_id: DeviceId; now: Date }) {
    const session: Session = {
      id: uuid(),
      device_id,
      started_at: now.toISOString(),
      ended_at: null,
      title: null,
    }
    this.sessions.set(session.id, session)
    return session
  }

  async setActiveSession({
    device_id,
    session_id,
  }: {
    device_id: DeviceId
    session_id: SessionId
  }) {
    const device = this.devices.get(device_id)
    if (device) {
      device.active_session_id = session_id
    }
  }

  async getActiveSession(device_id: DeviceId) {
    const device = this.devices.get(device_id)
    if (!device?.active_session_id) {
      return null
    }
    return this.sessions.get(device.active_session_id) ?? null
  }

  async listSessions({ device_id, limit }: { device_id: DeviceId; limit: number }) {
    return [...this.sessions.values()]
      .filter((session) => session.device_id === device_id)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .slice(0, limit)
  }

  async getSession(session_id: SessionId) {
    return this.sessions.get(session_id) ?? null
  }

  async appendMessage(message: Message) {
    const messages = this.messages.get(message.session_id) ?? []
    messages.push(message)
    this.messages.set(message.session_id, messages)
  }

  async listMessages({ session_id, limit }: { session_id: SessionId; limit: number }) {
    return (this.messages.get(session_id) ?? []).slice(-limit)
  }
}

export function createFakeStoreBackend(): StoreBackend {
  return new FakeStoreBackend()
}
