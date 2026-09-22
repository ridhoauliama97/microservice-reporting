import { createRoute, type OpenAPIHono } from '@hono/zod-openapi'
import { z } from 'zod'
import { env } from '../config/env'
import { getPool } from '../db/mssql'
import { reportQueue } from '../queue/report.queue'
import type { AppEnv } from '../types'

const statusResponseSchema = z.object({
  status: z.literal('ok'),
})

const readyResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  components: z.record(z.string(), z.boolean()),
})

const REDIS_PING_TIMEOUT_MS = 3000
const GOTENBERG_TIMEOUT_MS = 3000

async function checkDb(): Promise<boolean> {
  try {
    const pool = await getPool()
    await pool.request().query('SELECT 1')
    return true
  } catch {
    return false
  }
}

async function checkRedis(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    // BullMQ 6.x no longer exposes the raw Redis client; any command that
    // round-trips to Redis proves connectivity just as well.
    await Promise.race([
      reportQueue.getWaitingCount(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('redis ping timeout')),
          REDIS_PING_TIMEOUT_MS,
        )
      }),
    ])
    return true
  } catch {
    return false
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Only booleans are reported — never error details.
 */
async function checkComponents(): Promise<Record<string, boolean>> {
  const [db, redis, gotenberg] = await Promise.all([
    checkDb(),
    checkRedis(),
    checkGotenberg(),
  ])
  return { db, redis, gotenberg }
}

async function checkGotenberg(): Promise<boolean> {
  try {
    const response = await fetch(`${env.GOTENBERG_URL}/health`, {
      signal: AbortSignal.timeout(GOTENBERG_TIMEOUT_MS),
    })
    return response.ok
  } catch {
    return false
  }
}

const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  responses: {
    200: {
      content: {
        'application/json': { schema: statusResponseSchema },
      },
      description: 'Service is alive',
    },
  },
})

const readyRoute = createRoute({
  method: 'get',
  path: '/health/ready',
  responses: {
    200: {
      content: { 'application/json': { schema: readyResponseSchema } },
      description: 'All components are healthy',
    },
    503: {
      content: { 'application/json': { schema: readyResponseSchema } },
      description: 'At least one component is unhealthy',
    },
  },
})

export function registerHealthRoutes(app: OpenAPIHono<AppEnv>): void {
  app.openapi(healthRoute, (c) => c.json({ status: 'ok' as const }, 200 as const))

  app.openapi(readyRoute, async (c) => {
    const components = await checkComponents()
    const ok = Object.values(components).every(Boolean)
    const body = {
      status: ok ? ('ok' as const) : ('degraded' as const),
      components,
    }
    return ok
      ? c.json(body, 200 as const)
      : c.json(body, 503 as const)
  })
}
