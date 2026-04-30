import { Router } from 'express'
import { DeviceRegistrationRequestSchema } from '@got-it/shared'
import type { AppDeps } from '../app.js'

export function deviceRoute(deps: AppDeps): Router {
  const r = Router()
  r.post('/', async (req, res) => {
    const parsed = DeviceRegistrationRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message })
      return
    }
    const { device_id, token } = await deps.store.registerDevice({
      install_id: parsed.data.install_id,
    })
    res.status(201).json({ device_id, token })
  })
  return r
}
