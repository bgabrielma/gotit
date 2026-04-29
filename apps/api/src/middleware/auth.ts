import type { NextFunction, Request, Response } from 'express'
import type { Store } from '../infra/store.js'
import type { Device } from '../infra/store.js'

declare global {
  namespace Express {
    interface Request {
      device?: Device
    }
  }
}

export function deviceAuth(store: Store) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = req.header('authorization') ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (!token) {
      res.status(401).json({ error: 'missing bearer token' })
      return
    }
    const device = store.findDeviceByToken(token)
    if (!device) {
      res.status(401).json({ error: 'invalid token' })
      return
    }
    req.device = device
    next()
  }
}
