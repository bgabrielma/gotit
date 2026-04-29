import { describe, expect, it } from 'vitest'
import { detectRefreshIntent } from './detect-refresh-intent.js'

describe('detectRefreshIntent', () => {
  it.each([
    ['look at the screen now', true],
    ["what's on screen?", true],
    ['look again', true],
    ['refresh the screen', true],
    ['take another look', true],
    ['summarize this', false],
    ['save this for later', false],
    ['', false],
  ])('"%s" → %s', (input, expected) => {
    expect(detectRefreshIntent(input)).toBe(expected)
  })
})
