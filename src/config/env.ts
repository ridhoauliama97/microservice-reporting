import { z } from 'zod'

const boolFromString = (defaultValue: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(defaultValue)
    .transform((v) => v === 'true')

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5006),
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
  // Some WPS procedures are genuinely slow: SP_LapProduktivitasDashboard
  // measures 14-18s, which is at or over the mssql default of 15s. Without a
  // raised timeout that report fails intermittently, so the floor is well
  // above the worst observed query.
  DB_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),

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
  // How often the worker sweeps expired PDFs. Without a repeating sweep the
  // cleanup only happens at startup, so a worker that stays up for months keeps
  // every file past its retention.
  //
  // Deliberately shorter than FILE_RETENTION_DAYS: sweeping on the same period
  // as the retention means a file created just after a sweep is only deleted at
  // the one after that, so it can live nearly twice as long as intended.
  FILE_CLEANUP_INTERVAL_HOURS: z.coerce.number().int().positive().default(24),
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
