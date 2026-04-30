import { describe, expect, it, vi } from 'vitest'
import { ObsidianWriter } from '../../../infra/obsidian-writer.js'

/**
 * Unit tests for ObsidianWriter using injected mocked backends.
 */
describe('ObsidianWriter', () => {
  it('delegates writes to the configured backend', async () => {
    const write = vi.fn(async () => ({ fullPath: '/tmp/vault/GotIt!/file.md' }))
    const listFolder = vi.fn(async () => new Set<string>())
    const writer = ObsidianWriter.fromBackend({ write, listFolder })

    const result = await writer.write({
      vaultPath: '/tmp/vault',
      relativePath: 'GotIt!/file.md',
      contents: '# hi',
    })

    expect(result.fullPath).toBe('/tmp/vault/GotIt!/file.md')
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('delegates folder listing to the configured backend', async () => {
    const write = vi.fn(async () => ({ fullPath: '/tmp/vault/GotIt!/file.md' }))
    const listFolder = vi.fn(async () => new Set(['a.md', 'b.md']))
    const writer = ObsidianWriter.fromBackend({ write, listFolder })

    const files = await writer.listFolder({ vaultPath: '/tmp/vault', relativeFolder: 'GotIt!' })
    expect(files).toEqual(new Set(['a.md', 'b.md']))
    expect(listFolder).toHaveBeenCalledTimes(1)
  })

  it('propagates backend write failures', async () => {
    const write = vi.fn(async () => {
      throw new Error('ENOENT')
    })
    const listFolder = vi.fn(async () => new Set<string>())
    const writer = ObsidianWriter.fromBackend({ write, listFolder })

    await expect(
      writer.write({ vaultPath: '/nope', relativePath: 'x.md', contents: '' })
    ).rejects.toThrow('ENOENT')
  })
})
