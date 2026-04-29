import { describe, expect, it } from 'vitest'
import { loadConfig } from '../../config.js'

describe('loadConfig', () => {
  it('parses a fully populated env', () => {
    const cfg = loadConfig({
      OPENAI_API_KEY: 'sk-test',
      GOTIT_OPENAI_MODEL: 'gpt-test',
      GOTIT_LLM_CONNECTOR: 'openai',
      GOTIT_LLM_BASE_URL: '',
      GOTIT_LLM_API_KEY: '',
      GOTIT_DB_PATH: '/tmp/db.sqlite',
      GOTIT_DATA_DIR: '/tmp/data',
      PORT: '4000',
      LOG_LEVEL: 'debug',
    })
    expect(cfg.openaiApiKey).toBe('sk-test')
    expect(cfg.openaiModel).toBe('gpt-test')
    expect(cfg.llmConnector).toBe('openai')
    expect(cfg.port).toBe(4000)
    expect(cfg.logLevel).toBe('debug')
  })

  it('applies defaults for optional vars', () => {
    const cfg = loadConfig({ OPENAI_API_KEY: 'sk-test' })
    expect(cfg.openaiModel).toBe('gpt-4.1')
    expect(cfg.llmConnector).toBe('openai')
    expect(cfg.llmBaseUrl).toBe('')
    expect(cfg.llmApiKey).toBe('')
    expect(cfg.dbPath).toBe('./data/gotit.db')
    expect(cfg.dataDir).toBe('./data')
    expect(cfg.port).toBe(3000)
    expect(cfg.logLevel).toBe('info')
  })

  it('throws when OPENAI_API_KEY is missing for openai connector', () => {
    expect(() => loadConfig({})).toThrow(/OPENAI_API_KEY/)
  })

  it('accepts local connector without OPENAI_API_KEY', () => {
    const cfg = loadConfig({
      GOTIT_LLM_CONNECTOR: 'local',
      GOTIT_LLM_BASE_URL: 'http://localhost:11434/v1',
    })
    expect(cfg.llmConnector).toBe('local')
    expect(cfg.llmBaseUrl).toBe('http://localhost:11434/v1')
    expect(cfg.openaiApiKey).toBe('')
  })

  it('throws when local connector is missing GOTIT_LLM_BASE_URL', () => {
    expect(() =>
      loadConfig({
        GOTIT_LLM_CONNECTOR: 'local',
      })
    ).toThrow(/GOTIT_LLM_BASE_URL/)
  })

  it('throws on invalid PORT', () => {
    expect(() => loadConfig({ OPENAI_API_KEY: 'sk', PORT: 'not-a-number' })).toThrow()
  })

  it('throws on invalid LOG_LEVEL', () => {
    expect(() => loadConfig({ OPENAI_API_KEY: 'sk', LOG_LEVEL: 'shout' })).toThrow()
  })

  it('defaults vaultPath to empty string when GOTIT_VAULT_PATH is unset', () => {
    const cfg = loadConfig({ OPENAI_API_KEY: 'sk-test' })
    expect(cfg.vaultPath).toBe('')
  })

  it('parses a populated GOTIT_VAULT_PATH', () => {
    const cfg = loadConfig({
      OPENAI_API_KEY: 'sk-test',
      GOTIT_VAULT_PATH: '/Users/me/Vault',
    })
    expect(cfg.vaultPath).toBe('/Users/me/Vault')
  })
})
