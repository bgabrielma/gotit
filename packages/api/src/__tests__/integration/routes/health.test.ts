import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createTestApp } from '../../helper.js'

/**
 * Integration coverage for health route behavior.
 */
describe('GET /health', () => {
  it('returns ok and version', async () => {
    const app = createTestApp()
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, version: 'test' })
  })
})
