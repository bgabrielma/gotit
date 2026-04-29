import { z } from 'zod'

const ConfigSchema = z
  .object({
    OPENAI_API_KEY: z.string().default(''),
    GOTIT_OPENAI_MODEL: z.string().default('gpt-4.1'),
    GOTIT_LLM_CONNECTOR: z.enum(['openai', 'local']).default('openai'),
    GOTIT_LLM_BASE_URL: z.string().default(''),
    GOTIT_LLM_API_KEY: z.string().default(''),
    GOTIT_DB_PATH: z.string().default('./data/gotit.db'),
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
    if (cfg.GOTIT_LLM_CONNECTOR === 'local' && cfg.GOTIT_LLM_BASE_URL.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'GOTIT_LLM_BASE_URL is required when GOTIT_LLM_CONNECTOR=local',
        path: ['GOTIT_LLM_BASE_URL'],
      })
    }
  })

export type Config = {
  openaiApiKey: string
  openaiModel: string
  llmConnector: 'openai' | 'local'
  llmBaseUrl: string
  llmApiKey: string
  dbPath: string
  dataDir: string
  vaultPath: string
  port: number
  logLevel: 'error' | 'warn' | 'info' | 'debug'
}

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): Config {
  const parsed = ConfigSchema.parse(env)
  return {
    openaiApiKey: parsed.OPENAI_API_KEY,
    openaiModel: parsed.GOTIT_OPENAI_MODEL,
    llmConnector: parsed.GOTIT_LLM_CONNECTOR,
    llmBaseUrl: parsed.GOTIT_LLM_BASE_URL,
    llmApiKey: parsed.GOTIT_LLM_API_KEY,
    dbPath: parsed.GOTIT_DB_PATH,
    dataDir: parsed.GOTIT_DATA_DIR,
    vaultPath: parsed.GOTIT_VAULT_PATH,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
  }
}
