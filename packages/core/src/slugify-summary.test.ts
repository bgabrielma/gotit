import { describe, expect, it } from 'vitest'
import { slugifySummary } from './slugify-summary.js'

describe('slugifySummary', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugifySummary('Hello World')).toBe('hello-world')
  })
  it('strips punctuation and collapses repeats', () => {
    expect(slugifySummary("It's a test! Yes? Yes!!")).toBe('its-a-test-yes-yes')
  })
  it('truncates to 60 chars on word boundary', () => {
    const long = 'word '.repeat(40).trim()
    const out = slugifySummary(long)
    expect(out.length).toBeLessThanOrEqual(60)
    expect(out.endsWith('-')).toBe(false)
  })
  it('returns "untitled" for empty input', () => {
    expect(slugifySummary('')).toBe('untitled')
    expect(slugifySummary('   ')).toBe('untitled')
  })
})
