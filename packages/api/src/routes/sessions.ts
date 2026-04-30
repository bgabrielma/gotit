import { Router } from 'express'
import type { AppDeps } from '../app.js'
import { deviceAuth } from '../middleware/auth.js'

export function sessionsRouter(deps: AppDeps): Router {
  const r = Router()
  r.use(deviceAuth(deps.store))

  r.post('/', (req, res) => {
    const device = req.device!
    const session = deps.store.createSession({ device_id: device.id, now: new Date() })
    deps.store.setActiveSession({ device_id: device.id, session_id: session.id })
    res.status(201).json({ session_id: session.id, started_at: session.started_at })
  })

  r.get('/active', (req, res) => {
    const device = req.device!
    const session = deps.store.getActiveSession(device.id)
    if (!session) {
      res.status(404).json({ error: 'no active session' })
      return
    }
    const messages_tail = deps.store.listMessages({ session_id: session.id, limit: 50 })
    res.json({ session, messages_tail })
  })

  r.post('/:id/activate', (req, res) => {
    const device = req.device!
    const session_id = req.params.id
    const session = deps.store.getSession(session_id)
    if (!session || session.device_id !== device.id) {
      res.status(404).json({ error: 'session not found' })
      return
    }
    deps.store.setActiveSession({ device_id: device.id, session_id })
    const messages_tail = deps.store.listMessages({ session_id, limit: 50 })
    res.json({ session, messages_tail })
  })

  r.get('/', (req, res) => {
    const device = req.device!
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200)
    const sessions = deps.store.listSessions({ device_id: device.id, limit })
    res.json({ sessions })
  })

  return r
}
