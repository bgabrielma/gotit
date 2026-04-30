import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'
import { z } from 'zod'

const DEFAULT_DATABASE_URL = 'postgres://gotit:gotit@localhost:5432/gotit'

const ConfigSchema = z
  .object({
    OPENAI_API_KEY: z.string().default(''),
    GOTIT_OPENAI_MODEL: z.string().default('gpt-4.1'),
    GOTIT_LLM_CONNECTOR: z.enum(['openai', 'local', 'ollama', 'external']).default('openai'),
    GOTIT_LLM_BASE_URL: z.string().default(''),
    GOTIT_LLM_API_KEY: z.string().default(''),
    GOTIT_DATABASE_URL: z.string().url().default(DEFAULT_DATABASE_URL),
    GOTIT_DATA_DIR: z.string().default('./data'),
    GOTIT_VAULT_PATH: z.string().default(''),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.GOTIT_LLM_CONNECTOR === 'openai' && cfg.OPENAI_API_KEY.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'OPENAI_API_KEY is required when GOTIT_LLM_CONNECTOR=openai',
        path: ['OPENAI_API_KEY'],
      })
    }
    if (cfg.GOTIT_LLM_CONNECTOR !== 'openai' && cfg.GOTIT_LLM_BASE_URL.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `GOTIT_LLM_BASE_URL is required when GOTIT_LLM_CONNECTOR=${cfg.GOTIT_LLM_CONNECTOR}`,
        path: ['GOTIT_LLM_BASE_URL'],
      })
    }
  })

export type Config = {
  openaiApiKey: string
  openaiModel: string
  llmConnector: 'openai' | 'local' | 'ollama' | 'external'
  llmBaseUrl: string
  llmApiKey: string
  databaseUrl: string
  dataDir: string
  vaultPath: string
  port: number
  logLevel: 'error' | 'warn' | 'info' | 'debug'
}

/** Returns the ordered list of .env file paths the server should load. */
export function getServerEnvPaths(cwd: string, moduleUrl: string): string[] {
  const sourceDir = dirname(fileURLToPath(moduleUrl))
  const repoRootEnvPath = resolve(sourceDir, '../../..', '.env')
  const cwdEnvPath = resolve(cwd, '.env')
  const cwdLocalEnvPath = resolve(cwd, '.env.local')
  return Array.from(new Set([repoRootEnvPath, cwdEnvPath, cwdLocalEnvPath]))
}

/** Pure: parses and validates a raw env record into a typed Config. */
export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): Config {
  const parsed = ConfigSchema.parse(env)
  return {
    openaiApiKey: parsed.OPENAI_API_KEY,
    openaiModel: parsed.GOTIT_OPENAI_MODEL,
    llmConnector: parsed.GOTIT_LLM_CONNECTOR,
    llmBaseUrl: parsed.GOTIT_LLM_BASE_URL,
    llmApiKey: parsed.GOTIT_LLM_API_KEY,
    databaseUrl: parsed.GOTIT_DATABASE_URL,
    dataDir: parsed.GOTIT_DATA_DIR,
    vaultPath: parsed.GOTIT_VAULT_PATH,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
  }
}

/**
 * Loads .env files from the repo root and cwd, then parses process.env into Config.
 * Call once at server startup. Pass `import.meta.url` from the entrypoint.
 * The `cwd` param exists for testing only — omit it in production code.
 */
export function loadServerConfig(moduleUrl: string, cwd = process.cwd()): Config {
  const envPaths = getServerEnvPaths(cwd, moduleUrl)
  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      loadDotenv({ path: envPath, override: false })
    }
  }
  return loadConfig(process.env)
}
