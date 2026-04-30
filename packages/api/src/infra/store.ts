import Database from 'better-sqlite3'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { v4 as uuid } from 'uuid'
import type { Message, Session, DeviceId, SessionId } from '@got-it/shared'

export type Device = {
  id: DeviceId
  install_id: string
  token: string
  active_session_id: SessionId | null
  created_at: string
}

export interface StoreBackend {
  registerDevice(args: { install_id: string }): { device_id: DeviceId; token: string }
  findDeviceByToken(token: string): Device | null
  createSession(args: { device_id: DeviceId; now: Date }): Session
  setActiveSession(args: { device_id: DeviceId; session_id: SessionId }): void
  getActiveSession(device_id: DeviceId): Session | null
  listSessions(args: { device_id: DeviceId; limit: number }): Session[]
  getSession(session_id: SessionId): Session | null
  appendMessage(m: Message): void
  listMessages(args: { session_id: SessionId; limit: number }): Message[]
}

export class Store {
  private constructor(private readonly backend: StoreBackend) {}

  static create(args: { dbPath: string; migrationsDir: string }): Store {
    mkdirSync(dirname(resolve(args.dbPath)), { recursive: true })
    const db = new Database(args.dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    const sql = readFileSync(resolve(args.migrationsDir, '001_init.sql'), 'utf8')
    db.exec(sql)
    const backend = new SqliteBackend(db)
    return new Store(backend)
  }

  static createNull(): Store {
    const backend = new InMemoryBackend()
    return new Store(backend)
  }

  registerDevice(args: { install_id: string }) {
    return this.backend.registerDevice(args)
  }
  findDeviceByToken(token: string) {
    return this.backend.findDeviceByToken(token)
  }
  createSession(args: { device_id: DeviceId; now: Date }) {
    return this.backend.createSession(args)
  }
  setActiveSession(args: { device_id: DeviceId; session_id: SessionId }) {
    return this.backend.setActiveSession(args)
  }
  getActiveSession(device_id: DeviceId) {
    return this.backend.getActiveSession(device_id)
  }
  listSessions(args: { device_id: DeviceId; limit: number }) {
    return this.backend.listSessions(args)
  }
  getSession(session_id: SessionId) {
    return this.backend.getSession(session_id)
  }
  appendMessage(m: Message) {
    return this.backend.appendMessage(m)
  }
  listMessages(args: { session_id: SessionId; limit: number }) {
    return this.backend.listMessages(args)
  }
}

// ───── In-memory backend (production code, used by createNull) ─────
class InMemoryBackend implements StoreBackend {
  private devices = new Map<DeviceId, Device>()
  private byToken = new Map<string, DeviceId>()
  private sessions = new Map<SessionId, Session>()
  private messages = new Map<SessionId, Message[]>()

  registerDevice({ install_id }: { install_id: string }) {
    for (const d of this.devices.values()) {
      if (d.install_id === install_id) {
        const result = { device_id: d.id, token: d.token }
        return result
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
  findDeviceByToken(token: string) {
    const id = this.byToken.get(token)
    return id ? (this.devices.get(id) ?? null) : null
  }
  createSession({ device_id, now }: { device_id: DeviceId; now: Date }) {
    const s: Session = {
      id: uuid(),
      device_id,
      started_at: now.toISOString(),
      ended_at: null,
      title: null,
    }
    this.sessions.set(s.id, s)
    return s
  }
  setActiveSession({ device_id, session_id }: { device_id: DeviceId; session_id: SessionId }) {
    const d = this.devices.get(device_id)
    if (d) d.active_session_id = session_id
  }
  getActiveSession(device_id: DeviceId) {
    const d = this.devices.get(device_id)
    if (!d?.active_session_id) return null
    return this.sessions.get(d.active_session_id) ?? null
  }
  listSessions({ device_id, limit }: { device_id: DeviceId; limit: number }) {
    return [...this.sessions.values()]
      .filter((s) => s.device_id === device_id)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .slice(0, limit)
  }
  getSession(session_id: SessionId) {
    return this.sessions.get(session_id) ?? null
  }
  appendMessage(m: Message) {
    const arr = this.messages.get(m.session_id) ?? []
    arr.push(m)
    this.messages.set(m.session_id, arr)
  }
  listMessages({ session_id, limit }: { session_id: SessionId; limit: number }) {
    return (this.messages.get(session_id) ?? []).slice(-limit)
  }
}

// ───── SQLite backend ─────
class SqliteBackend implements StoreBackend {
  constructor(private readonly db: Database.Database) {}

  registerDevice({ install_id }: { install_id: string }) {
    const existing = this.db
      .prepare('SELECT id, token FROM devices WHERE install_id = ?')
      .get(install_id) as { id: string; token: string } | undefined
    if (existing) {
      return { device_id: existing.id, token: existing.token }
    }
    const id = uuid()
    const token = uuid()
    this.db
      .prepare(
        'INSERT INTO devices(id, install_id, token, active_session_id, created_at) VALUES (?, ?, ?, NULL, ?)'
      )
      .run(id, install_id, token, new Date().toISOString())
    return { device_id: id, token }
  }
  findDeviceByToken(token: string) {
    return (
      (this.db.prepare('SELECT * FROM devices WHERE token = ?').get(token) as Device | undefined) ??
      null
    )
  }
  createSession({ device_id, now }: { device_id: DeviceId; now: Date }) {
    const id = uuid()
    const startedAt = now.toISOString()
    this.db
      .prepare(
        'INSERT INTO sessions(id, device_id, started_at, ended_at, title) VALUES (?, ?, ?, NULL, NULL)'
      )
      .run(id, device_id, startedAt)
    return { id, device_id, started_at: startedAt, ended_at: null, title: null }
  }
  setActiveSession({ device_id, session_id }: { device_id: DeviceId; session_id: SessionId }) {
    this.db
      .prepare('UPDATE devices SET active_session_id = ? WHERE id = ?')
      .run(session_id, device_id)
  }
  getActiveSession(device_id: DeviceId) {
    const row = this.db
      .prepare(
        'SELECT s.* FROM sessions s JOIN devices d ON d.active_session_id = s.id WHERE d.id = ?'
      )
      .get(device_id)
    return (row as Session | undefined) ?? null
  }
  listSessions({ device_id, limit }: { device_id: DeviceId; limit: number }) {
    return this.db
      .prepare('SELECT * FROM sessions WHERE device_id = ? ORDER BY started_at DESC LIMIT ?')
      .all(device_id, limit) as Session[]
  }
  getSession(session_id: SessionId) {
    return (
      (this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(session_id) as
        | Session
        | undefined) ?? null
    )
  }
  appendMessage(m: Message) {
    this.db
      .prepare(
        'INSERT INTO messages(id, session_id, kind, payload, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(m.id, m.session_id, m.kind, JSON.stringify(m), m.created_at)
  }
  listMessages({ session_id, limit }: { session_id: SessionId; limit: number }) {
    const rows = this.db
      .prepare('SELECT payload FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ?')
      .all(session_id, limit) as { payload: string }[]
    return rows.map((r) => JSON.parse(r.payload) as Message)
  }
}
