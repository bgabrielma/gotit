import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.js'

describe('loadConfig', () => {
  it('parses a fully populated env', () => {
    const cfg = loadConfig({
      ANTHROPIC_API_KEY: 'sk-test',
      GOTIT_VISION_MODEL: 'm-vision',
      GOTIT_CHAT_MODEL: 'm-chat',
      GOTIT_DB_PATH: '/tmp/db.sqlite',
      GOTIT_DATA_DIR: '/tmp/data',
      PORT: '4000',
      LOG_LEVEL: 'debug',
    })
    expect(cfg.anthropicApiKey).toBe('sk-test')
    expect(cfg.visionModel).toBe('m-vision')
    expect(cfg.port).toBe(4000)
    expect(cfg.logLevel).toBe('debug')
  })

  it('applies defaults for optional vars', () => {
    const cfg = loadConfig({ ANTHROPIC_API_KEY: 'sk-test' })
    expect(cfg.dbPath).toBe('./data/gotit.db')
    expect(cfg.dataDir).toBe('./data')
    expect(cfg.port).toBe(3000)
    expect(cfg.logLevel).toBe('info')
  })

  it('throws when ANTHROPIC_API_KEY is missing', () => {
    expect(() => loadConfig({})).toThrow(/ANTHROPIC_API_KEY/)
  })

  it('throws on invalid PORT', () => {
    expect(() => loadConfig({ ANTHROPIC_API_KEY: 'sk', PORT: 'not-a-number' })).toThrow()
  })

  it('throws on invalid LOG_LEVEL', () => {
    expect(() => loadConfig({ ANTHROPIC_API_KEY: 'sk', LOG_LEVEL: 'shout' })).toThrow()
  })

  it('defaults vaultPath to empty string when GOTIT_VAULT_PATH is unset', () => {
    const cfg = loadConfig({ ANTHROPIC_API_KEY: 'sk-test' })
    expect(cfg.vaultPath).toBe('')
  })

  it('parses a populated GOTIT_VAULT_PATH', () => {
    const cfg = loadConfig({
      ANTHROPIC_API_KEY: 'sk-test',
      GOTIT_VAULT_PATH: '/Users/me/Vault',
    })
    expect(cfg.vaultPath).toBe('/Users/me/Vault')
  })
})
