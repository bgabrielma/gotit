import { describe, expect, it } from 'vitest'
import { nextAvailableFilename } from './next-available-filename.js'

describe('nextAvailableFilename', () => {
  it('returns the original when no collision', () => {
    expect(nextAvailableFilename('foo.md', new Set())).toBe('foo.md')
  })
  it('appends -1 on first collision', () => {
    expect(nextAvailableFilename('foo.md', new Set(['foo.md']))).toBe('foo-1.md')
  })
  it('walks until clear', () => {
    expect(nextAvailableFilename('foo.md', new Set(['foo.md', 'foo-1.md', 'foo-2.md']))).toBe(
      'foo-3.md'
    )
  })
  it('handles names with multiple dots', () => {
    expect(nextAvailableFilename('a.b.md', new Set(['a.b.md']))).toBe('a.b-1.md')
  })
})
