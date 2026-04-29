import { z } from 'zod'

const ConfigSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  GOTIT_VISION_MODEL: z.string().default('claude-opus-4-7'),
  GOTIT_CHAT_MODEL: z.string().default('claude-opus-4-7'),
  GOTIT_DB_PATH: z.string().default('./data/gotit.db'),
  GOTIT_DATA_DIR: z.string().default('./data'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
})

export type Config = {
  anthropicApiKey: string
  visionModel: string
  chatModel: string
  dbPath: string
  dataDir: string
  port: number
  logLevel: 'error' | 'warn' | 'info' | 'debug'
}

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): Config {
  const parsed = ConfigSchema.parse(env)
  return {
    anthropicApiKey: parsed.ANTHROPIC_API_KEY,
    visionModel: parsed.GOTIT_VISION_MODEL,
    chatModel: parsed.GOTIT_CHAT_MODEL,
    dbPath: parsed.GOTIT_DB_PATH,
    dataDir: parsed.GOTIT_DATA_DIR,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
  }
}
