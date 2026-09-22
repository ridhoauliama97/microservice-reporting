import { Queue } from 'bullmq'
import { logger } from '../lib/logger'
import { redisConnection } from './connection'

export const QUEUE_NAME = 'report'
export const JOB_NAME = 'generate'

export interface ReportJobData {
  type: string
  params: unknown
  requestedBy: string
}

export interface ReportJobResult {
  fileName: string
  size: number
  generatedAt: string
}

export const reportQueue = new Queue<ReportJobData, ReportJobResult>(
  QUEUE_NAME,
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: { age: 604800 },
    },
  },
)

// Without an error listener, Redis connection errors can crash the process.
reportQueue.on('error', (err) => {
  logger.error({ err }, 'Report queue error')
})
