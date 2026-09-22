import { z } from 'zod'

const boolFromString = (defaultValue: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(defaultValue)
    .transform((v) => v === 'true')

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5003),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),

  DB_SERVER: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(1433),
  DB_DATABASE: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_ENCRYPT: boolFromString('false'),
  DB_TRUST_CERT: boolFromString('true'),

  // Must match the WPS backend's JWT_SECRET exactly. The real WPS secret is
  // 10 chars, so the floor is deliberately low (8) — just enough to catch
  // empty/placeholder values. Do NOT raise this without syncing WPS.
  JWT_SECRET: z.string().min(8, 'JWT_SECRET must be at least 8 characters'),
  JWT_ALG: z.enum(['HS256', 'HS384', 'HS512']).default('HS256'),
  JWT_USERNAME_CLAIM: z.string().min(1).default('username'),

  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional().transform((v) => (v ? v : undefined)),

  GOTENBERG_URL: z.string().url().default('http://localhost:3100'),
  GOTENBERG_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),

  REPORT_CONCURRENCY: z.coerce.number().int().positive().default(2),
  STORAGE_DIR: z.string().min(1).default('storage'),
  FILE_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `${i.path.join('.')}: ${i.message}`)
    .join('; ')
  throw new Error(`Invalid environment variables: ${issues}`)
}

export const env = parsed.data
export type Env = z.infer<typeof envSchema>
