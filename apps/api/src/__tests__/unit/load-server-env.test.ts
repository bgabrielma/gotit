import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { getServerEnvPaths, loadServerConfig } from '../../config.js'

const originalConnector = process.env.GOTIT_LLM_CONNECTOR
const originalBaseUrl = process.env.GOTIT_LLM_BASE_URL

afterEach(() => {
  if (originalConnector === undefined) {
    delete process.env.GOTIT_LLM_CONNECTOR
  } else {
    process.env.GOTIT_LLM_CONNECTOR = originalConnector
  }

  if (originalBaseUrl === undefined) {
    delete process.env.GOTIT_LLM_BASE_URL
  } else {
    process.env.GOTIT_LLM_BASE_URL = originalBaseUrl
  }
})

describe('getServerEnvPaths', () => {
  it('includes the repo-root .env derived from the API source module path', () => {
    const moduleUrl = pathToFileURL('/repo/apps/api/src/config.ts').href
    const envPaths = getServerEnvPaths('/repo/apps/api', moduleUrl)
    expect(envPaths).toContain('/repo/.env')
  })
})

describe('loadServerConfig', () => {
  it('loads repo-root .env when current working directory is apps/api', () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'gotit-env-'))
    try {
      const apiDir = resolve(repoDir, 'apps/api')
      mkdirSync(apiDir, { recursive: true })
      const srcFile = resolve(apiDir, 'src/config.ts')
      writeFileSync(
        resolve(repoDir, '.env'),
        'GOTIT_LLM_CONNECTOR=ollama\nGOTIT_LLM_BASE_URL=http://localhost:11434/v1\n'
      )

      delete process.env.GOTIT_LLM_CONNECTOR
      delete process.env.GOTIT_LLM_BASE_URL

      loadServerConfig(pathToFileURL(srcFile).href, apiDir)

      expect(process.env.GOTIT_LLM_CONNECTOR).toBe('ollama')
      expect(process.env.GOTIT_LLM_BASE_URL).toBe('http://localhost:11434/v1')
    } finally {
      rmSync(repoDir, { recursive: true, force: true })
    }
  })
})
