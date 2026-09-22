import { env } from '../config/env'

/**
 * Plain options object — BullMQ creates and manages its own IORedis instance
 * per Queue/Worker/QueueEvents (AGENTS.md 7.5). Never pass a shared IORedis
 * instance around.
 */
export const redisConnection = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  ...(env.REDIS_PASSWORD ? { password: env.REDIS_PASSWORD } : {}),
}
