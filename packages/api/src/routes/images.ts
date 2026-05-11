import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { Router } from 'express'
import type { AppDeps } from '../app.js'
import { deviceAuth } from '../middleware/auth.js'

const UNSAFE_IMAGEREF = /[/\\]|\.\./

/**
 * Router for serving stored capture images.
 * Requires device authentication. Streams PNG files from {dataDir}/images/.
 */
export function imagesRouter(deps: AppDeps): Router {
  const r = Router()
  r.use(deviceAuth(deps.store))

  r.get('/:imageRef', (req, res) => {
    const { imageRef } = req.params

    if (UNSAFE_IMAGEREF.test(imageRef)) {
      res.status(400).json({ error: 'invalid imageRef' })
      return
    }

    const filePath = resolve(deps.dataDir, 'images', imageRef)
    if (!existsSync(filePath)) {
      res.status(404).json({ error: 'not found' })
      return
    }

    res.sendFile(filePath)
  })

  return r
}
