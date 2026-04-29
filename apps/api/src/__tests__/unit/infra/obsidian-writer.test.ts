import { describe, expect, it } from 'vitest'
import { ObsidianWriter } from '../../../infra/obsidian-writer.js'

describe('ObsidianWriter (Nullable)', () => {
  it('records writes for inspection', async () => {
    const w = ObsidianWriter.createNull()
    const result = await w.write({
      vaultPath: '/tmp/vault',
      relativePath: 'GotIt!/file.md',
      contents: '# hi',
    })
    expect(result.fullPath).toBe('/tmp/vault/GotIt!/file.md')
    expect(w.writes).toHaveLength(1)
    expect(w.writes[0]?.contents).toBe('# hi')
  })

  it('reports existing filenames in a folder', async () => {
    const w = ObsidianWriter.createNull({
      existing: { 'GotIt!': new Set(['a.md', 'b.md']) },
    })
    expect(await w.listFolder({ vaultPath: '/tmp/vault', relativeFolder: 'GotIt!' })).toEqual(
      new Set(['a.md', 'b.md'])
    )
  })

  it('throws when vault path missing', async () => {
    const w = ObsidianWriter.createNull({ writeFailure: new Error('ENOENT') })
    await expect(
      w.write({ vaultPath: '/nope', relativePath: 'x.md', contents: '' })
    ).rejects.toThrow('ENOENT')
  })
})
