import type { NextFunction, Request, Response } from 'express'
import type { Device, StoreBackend } from '../infra/store.js'

declare global {
  namespace Express {
    interface Request {
      device?: Device
    }
  }
}

export function deviceAuth(store: StoreBackend) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = req.header('authorization') ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (!token) {
      res.status(401).json({ error: 'missing bearer token' })
      return
    }
    const device = await store.findDeviceByToken(token)
    if (!device) {
      res.status(401).json({ error: 'invalid bearer token' })
      return
    }
    req.device = device
    next()
  }
}
