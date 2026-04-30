import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Pool } from 'pg'
import { v4 as uuid } from 'uuid'
import type { DeviceId, Message, Session, SessionId } from '@got-it/shared'

export type Device = {
  id: DeviceId
  install_id: string
  token: string
  active_session_id: SessionId | null
  created_at: string
}

export interface StoreBackend {
  registerDevice(args: { install_id: string }): Promise<{ device_id: DeviceId; token: string }>
  findDeviceByToken(token: string): Promise<Device | null>
  createSession(args: { device_id: DeviceId; now: Date }): Promise<Session>
  setActiveSession(args: { device_id: DeviceId; session_id: SessionId }): Promise<void>
  getActiveSession(device_id: DeviceId): Promise<Session | null>
  listSessions(args: { device_id: DeviceId; limit: number }): Promise<Session[]>
  getSession(session_id: SessionId): Promise<Session | null>
  appendMessage(m: Message): Promise<void>
  listMessages(args: { session_id: SessionId; limit: number }): Promise<Message[]>
}

export class Store implements StoreBackend {
  private constructor(private readonly pool: Pool) {}

  static async create(args: { databaseUrl: string; migrationsDir: string }): Promise<Store> {
    const pool = new Pool({ connectionString: args.databaseUrl })
    await runMigrations(pool, args.migrationsDir)
    return new Store(pool)
  }

  async close(): Promise<void> {
    await this.pool.end()
  }

  async registerDevice({ install_id }: { install_id: string }) {
    const existing = await this.pool.query<{ id: DeviceId; token: string }>(
      'SELECT id, token FROM devices WHERE install_id = $1',
      [install_id]
    )
    const existingRow = existing.rows[0]
    if (existingRow) {
      return { device_id: existingRow.id, token: existingRow.token }
    }

    const id = uuid()
    const token = uuid()
    await this.pool.query(
      'INSERT INTO devices(id, install_id, token, active_session_id, created_at) VALUES ($1, $2, $3, NULL, $4)',
      [id, install_id, token, new Date().toISOString()]
    )

    return { device_id: id, token }
  }

  async findDeviceByToken(token: string) {
    const result = await this.pool.query<Device>('SELECT * FROM devices WHERE token = $1', [token])
    return result.rows[0] ?? null
  }

  async createSession({ device_id, now }: { device_id: DeviceId; now: Date }) {
    const id = uuid()
    const startedAt = now.toISOString()
    await this.pool.query(
      'INSERT INTO sessions(id, device_id, started_at, ended_at, title) VALUES ($1, $2, $3, NULL, NULL)',
      [id, device_id, startedAt]
    )
    return { id, device_id, started_at: startedAt, ended_at: null, title: null }
  }

  async setActiveSession({
    device_id,
    session_id,
  }: {
    device_id: DeviceId
    session_id: SessionId
  }) {
    await this.pool.query('UPDATE devices SET active_session_id = $1 WHERE id = $2', [
      session_id,
      device_id,
    ])
  }

  async getActiveSession(device_id: DeviceId) {
    const result = await this.pool.query<Session>(
      'SELECT s.* FROM sessions s JOIN devices d ON d.active_session_id = s.id WHERE d.id = $1',
      [device_id]
    )
    return result.rows[0] ?? null
  }

  async listSessions({ device_id, limit }: { device_id: DeviceId; limit: number }) {
    const result = await this.pool.query<Session>(
      'SELECT * FROM sessions WHERE device_id = $1 ORDER BY started_at DESC LIMIT $2',
      [device_id, limit]
    )
    return result.rows
  }

  async getSession(session_id: SessionId) {
    const result = await this.pool.query<Session>('SELECT * FROM sessions WHERE id = $1', [
      session_id,
    ])
    return result.rows[0] ?? null
  }

  async appendMessage(m: Message) {
    await this.pool.query(
      'INSERT INTO messages(id, session_id, kind, payload, created_at) VALUES ($1, $2, $3, $4::jsonb, $5)',
      [m.id, m.session_id, m.kind, JSON.stringify(m), m.created_at]
    )
  }

  async listMessages({ session_id, limit }: { session_id: SessionId; limit: number }) {
    const result = await this.pool.query<{ payload: Message }>(
      'SELECT payload FROM messages WHERE session_id = $1 ORDER BY created_at ASC LIMIT $2',
      [session_id, limit]
    )
    return result.rows.map((row) => row.payload)
  }
}

export async function runMigrations(pool: Pool, migrationsDir: string): Promise<void> {
  const client = await pool.connect()
  try {
    const migrationFiles = readdirSync(migrationsDir)
      .filter((fileName) => fileName.endsWith('.sql'))
      .sort()

    for (const fileName of migrationFiles) {
      const sql = readFileSync(resolve(migrationsDir, fileName), 'utf8')
      await client.query(sql)
    }
  } finally {
    client.release()
  }
}
