import { describe, expect, it } from 'vitest'
import { resolveSaveFormat } from './resolve-save-format.js'

describe('resolveSaveFormat', () => {
  it('returns default when no instruction provided', () => {
    expect(resolveSaveFormat(undefined)).toEqual({ template: 'default', instruction: null })
    expect(resolveSaveFormat('')).toEqual({ template: 'default', instruction: null })
    expect(resolveSaveFormat('  ')).toEqual({ template: 'default', instruction: null })
  })
  it('returns override when instruction is non-empty', () => {
    expect(resolveSaveFormat('save as a code snippet')).toEqual({
      template: 'override',
      instruction: 'save as a code snippet',
    })
  })
  it('trims instruction whitespace', () => {
    expect(resolveSaveFormat('  do this  ')).toEqual({
      template: 'override',
      instruction: 'do this',
    })
  })
})
