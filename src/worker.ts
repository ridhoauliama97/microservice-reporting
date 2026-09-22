import { Job, UnrecoverableError, Worker } from 'bullmq'
import { env } from './config/env'
import { closePool, lazyPool } from './db/mssql'
import { logger } from './lib/logger'
import { redisConnection } from './queue/connection'
import {
  QUEUE_NAME,
  type ReportJobData,
  type ReportJobResult,
} from './queue/report.queue'
import { reports } from './reports/registry'
import { htmlToPdf } from './services/pdf'
import { cleanupExpiredReports, saveReportPdf } from './services/storage'

const processor = async (
  job: Job<ReportJobData, ReportJobResult>,
): Promise<ReportJobResult> => {
  // 1. Resolve the report definition. Unknown type is unrecoverable — no retry.
  const definition = reports[job.data.type]
  if (!definition) {
    throw new UnrecoverableError('Jenis laporan tidak dikenal')
  }

  // 2. Re-validate params with the report's own schema (queue data is not trusted).
  const parsed = definition.paramsSchema.safeParse(job.data.params)
  if (!parsed.success) {
    throw new UnrecoverableError('Parameter laporan tidak valid')
  }
  const params = parsed.data

  // 3. Fetch data (the pool only connects if the report actually awaits it).
  await job.updateProgress(10)
  const data = await definition.fetchData(params, { pool: lazyPool() })
  await job.updateProgress(50)

  // 4. Render HTML and convert to PDF.
  const rendered = definition.render(data, {
    requestedBy: job.data.requestedBy,
    generatedAt: new Date(),
    params,
  })
  const pdf = await htmlToPdf({
    html: rendered.html,
    footerHtml: rendered.footerHtml,
    landscape: rendered.landscape,
  })
  await job.updateProgress(85)

  // 5. Save the file.
  const { fileName, size } = await saveReportPdf(job.id as string, pdf)
  await job.updateProgress(100)

  return { fileName, size, generatedAt: new Date().toISOString() }
}

export const worker = new Worker<ReportJobData, ReportJobResult>(
  QUEUE_NAME,
  processor,
  {
    connection: redisConnection,
    concurrency: env.REPORT_CONCURRENCY,
  },
)

// Without the error listener, Redis connection errors can kill the process.
worker.on('error', (err) => {
  logger.error({ err }, 'Worker error')
})

worker.on('failed', (job, err) => {
  logger.error(
    {
      jobId: job?.id,
      type: job?.data.type,
      attempt: job?.attemptsMade,
      err: err.message,
    },
    'Job failed',
  )
})

worker.on('completed', (job) => {
  logger.info({ jobId: job.id, type: job.data.type }, 'Job completed')
})

let shuttingDown = false
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, 'Worker shutting down')
  await worker.close()
  await closePool()
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

async function main(): Promise<void> {
  await cleanupExpiredReports()
  logger.info(
    { queue: QUEUE_NAME, concurrency: env.REPORT_CONCURRENCY },
    'worker ready',
  )
}

void main()
