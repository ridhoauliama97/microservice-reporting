import { Hono } from 'hono'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { errorResponse, notFoundError } from '../lib/errors'
import { upgradeWebSocket } from '../lib/ws'
import { logger } from '../lib/logger'
import { authMiddleware } from '../middleware/auth'
import { subscribeToJob } from '../queue/events'
import { reportQueue } from '../queue/report.queue'
import { mapJobStatus, parseJobResult } from './reports'
import type { AppEnv } from '../types'

export const wsApp = new Hono<AppEnv>()

// All checks happen BEFORE the upgrade (AGENTS.md 6):
// 1. verify the token (query param — browsers cannot send headers on WS)
wsApp.use('/reports/:jobId', authMiddleware({ allowQueryToken: true }))

// 2. the job must exist and belong to the caller
wsApp.use('/reports/:jobId', async (c, next) => {
  const job = await reportQueue.getJob(c.req.param('jobId'))
  if (!job || job.data.requestedBy !== c.get('username')) {
    return errorResponse(c, notFoundError('Laporan tidak ditemukan'))
  }
  await next()
})

wsApp.get(
  '/reports/:jobId',
  upgradeWebSocket((c) => {
    const jobId = c.req.param('jobId')
    let unsubscribe: (() => void) | undefined

    return {
      onOpen: async (_event, ws) => {
        // Always send a snapshot first — the job may have finished before the
        // WebSocket connected.
        const job = await reportQueue.getJob(jobId as string)
        if (!job) {
          ws.close(1008, 'Laporan tidak ditemukan')
          return
        }

        const state = await job.getState()
        const status = mapJobStatus(state)
        const progress = typeof job.progress === 'number' ? job.progress : 0

        ws.send(JSON.stringify({ type: 'snapshot', jobId, status, progress }))

        if (status === 'completed' || status === 'failed') {
          if (status === 'completed') {
            const result = parseJobResult(job.returnvalue)
            if (result) {
              ws.send(JSON.stringify({ type: 'completed', jobId, result }))
            }
          } else {
            ws.send(
              JSON.stringify({
                type: 'failed',
                jobId,
                error: job.failedReason ?? 'Laporan gagal',
              }),
            )
          }
          // Server closes the connection after a terminal message.
          ws.close(1000, 'Selesai')
          return
        }

        unsubscribe = subscribeToJob(jobId as string, (update) => {
          try {
            ws.send(JSON.stringify(update))
            if (update.type === 'completed' || update.type === 'failed') {
              ws.close(1000, 'Selesai')
            }
          } catch {
            logger.debug({ jobId }, 'Tried to send on closed socket')
          }
        })
      },
      onClose: () => {
        unsubscribe?.()
      },
    }
  }),
)

export function registerWsRoutes(app: OpenAPIHono<AppEnv>): void {
  app.route('/ws', wsApp)
}
