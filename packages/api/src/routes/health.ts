import { Router } from 'express'
import type { AppDeps } from '../app.js'

export function healthRoute(deps: AppDeps): Router {
  const r = Router()
  r.get('/', (_req, res) => {
    res.json({ ok: true, version: deps.version })
  })
  return r
}
