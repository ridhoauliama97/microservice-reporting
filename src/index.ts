import { app } from './app'
import { env } from './config/env'
import { closePool } from './db/mssql'
import { logger } from './lib/logger'
import { reportQueueEvents } from './queue/events'
import { reportQueue } from './queue/report.queue'
import { websocket } from './lib/ws'

// Bun requires the websocket handler to be exported at the entrypoint;
// `export default app` alone is NOT enough for WebSocket upgrades.
export default {
  port: env.PORT,
  fetch: app.fetch,
  websocket,
}

logger.info({ port: env.PORT }, 'API ready')

let shuttingDown = false
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, 'API shutting down')
  try {
    // Order matters: stop the QueueEvents broker first so no progress event
    // reaches a socket while the queue is closing (AGENTS.md 7.11).
    await reportQueueEvents.close()
    await reportQueue.close()
    await closePool()
  } finally {
    process.exit(0)
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
