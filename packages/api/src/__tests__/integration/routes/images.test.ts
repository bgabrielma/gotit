import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { setupAuthedApp, tmpPath, ensureCleanDir, cleanupDir } from '../../helper.js'

const TEST_DATA_DIR = tmpPath('images-test-data')

describe('GET /images/:imageRef', () => {
  beforeEach(() => {
    ensureCleanDir(join(TEST_DATA_DIR, 'images'))
  })

  afterEach(() => {
    cleanupDir(TEST_DATA_DIR)
  })

  it('returns 401 for missing auth token', async () => {
    const { app } = await setupAuthedApp({ dataDir: TEST_DATA_DIR })
    const res = await request(app).get('/images/test.png')
    expect(res.status).toBe(401)
  })

  it('returns 400 for imageRef containing ..', async () => {
    const { app, token } = await setupAuthedApp({ dataDir: TEST_DATA_DIR })
    const res = await request(app).get('/images/..test.png').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(400)
  })

  it('returns 400 for imageRef containing backslash', async () => {
    const { app, token } = await setupAuthedApp({ dataDir: TEST_DATA_DIR })
    const res = await request(app)
      .get('/images/foo%5Cbar.png')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(400)
  })

  it('returns 404 for unknown imageRef', async () => {
    const { app, token } = await setupAuthedApp({ dataDir: TEST_DATA_DIR })
    const res = await request(app)
      .get('/images/nonexistent.png')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(404)
  })

  it('returns 200 with PNG content-type for existing image', async () => {
    const imageRef = 'abc123.png'
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    mkdirSync(join(TEST_DATA_DIR, 'images'), { recursive: true })
    writeFileSync(join(TEST_DATA_DIR, 'images', imageRef), pngBytes)

    const { app, token } = await setupAuthedApp({ dataDir: TEST_DATA_DIR })
    const res = await request(app)
      .get(`/images/${imageRef}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.type).toBe('image/png')
  })
})
