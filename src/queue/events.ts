import { QueueEvents } from 'bullmq'
import { logger } from '../lib/logger'
import { redisConnection } from './connection'
import { QUEUE_NAME, type ReportJobResult } from './report.queue'

export type JobUpdate =
  | { type: 'progress'; jobId: string; progress: number }
  | { type: 'completed'; jobId: string; result: ReportJobResult }
  | { type: 'failed'; jobId: string; error: string }

type JobUpdateListener = (update: JobUpdate) => void

// Broker: jobId -> sockets listening for that job. Sockets are removed on close.
const listeners = new Map<string, Set<JobUpdateListener>>()

export function subscribeToJob(
  jobId: string,
  listener: JobUpdateListener,
): () => void {
  let set = listeners.get(jobId)
  if (!set) {
    set = new Set()
    listeners.set(jobId, set)
  }
  set.add(listener)
  return () => {
    const current = listeners.get(jobId)
    if (!current) return
    current.delete(listener)
    if (current.size === 0) listeners.delete(jobId)
  }
}

function deliver(update: JobUpdate): void {
  const set = listeners.get(update.jobId)
  if (!set) return
  for (const listener of set) {
    try {
      listener(update)
    } catch (err) {
      logger.warn({ err, jobId: update.jobId }, 'Job update listener failed')
    }
  }
}

// QueueEvents lives ONLY in the API process (AGENTS.md 7.5), with its own
// connection.
export const reportQueueEvents = new QueueEvents(QUEUE_NAME, {
  connection: redisConnection,
})

// Without an error listener, Redis connection errors can crash the process.
reportQueueEvents.on('error', (err) => {
  logger.error({ err }, 'Report queue events error')
})

reportQueueEvents.on('progress', ({ jobId, data }) => {
  const progress =
    typeof data === 'object' && data !== null && 'progress' in data
      ? Number((data as { progress: unknown }).progress)
      : Number(data)
  if (!Number.isFinite(progress)) {
    logger.warn({ jobId, data }, 'Invalid progress payload')
    return
  }
  deliver({ type: 'progress', jobId, progress })
})

// returnvalue can be a JSON string or an object depending on BullMQ version.
reportQueueEvents.on('completed', ({ jobId, returnvalue }) => {
  let result: ReportJobResult | undefined
  if (typeof returnvalue === 'string') {
    try {
      result = JSON.parse(returnvalue) as ReportJobResult
    } catch {
      logger.warn({ jobId }, 'Completed returnvalue is not valid JSON')
    }
  } else if (typeof returnvalue === 'object' && returnvalue !== null) {
    result = returnvalue as ReportJobResult
  }

  if (!result) {
    deliver({
      type: 'failed',
      jobId,
      error: 'Hasil laporan tidak dapat dibaca',
    })
    return
  }
  deliver({ type: 'completed', jobId, result })
})

reportQueueEvents.on('failed', ({ jobId, failedReason }) => {
  deliver({ type: 'failed', jobId, error: failedReason ?? 'Laporan gagal' })
})
