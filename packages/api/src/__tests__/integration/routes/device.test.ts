import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createFakeStoreBackend } from '../../fakes/store.js'
import { createTestApp } from '../../helper.js'

/**
 * Integration coverage for device registration route behavior.
 */
describe('POST /device', () => {
  it('issues a device_id and token', async () => {
    const app = createTestApp({ store: createFakeStoreBackend() })
    const res = await request(app).post('/device').send({ install_id: 'inst-1' })
    expect(res.status).toBe(201)
    expect(res.body.device_id).toBeTruthy()
    expect(res.body.token).toBeTruthy()
  })

  it('rejects empty install_id', async () => {
    const app = createTestApp({ store: createFakeStoreBackend() })
    const res = await request(app).post('/device').send({ install_id: '' })
    expect(res.status).toBe(400)
  })

  it('returns the same device on repeated registration with same install_id', async () => {
    const store = createFakeStoreBackend()
    const app = createTestApp({ store })
    const r1 = await request(app).post('/device').send({ install_id: 'inst-1' })
    const r2 = await request(app).post('/device').send({ install_id: 'inst-1' })
    expect(r1.body.device_id).toBe(r2.body.device_id)
  })
})
