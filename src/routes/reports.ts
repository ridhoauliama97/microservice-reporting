import { createRoute, type OpenAPIHono } from '@hono/zod-openapi'
import { z } from 'zod'
import { errorBody, fileExpiredError, notFoundError, reportNotReadyError, unknownReportTypeError, validationError } from '../lib/errors'
import { authMiddleware } from '../middleware/auth'
import { JOB_NAME, reportQueue, type ReportJobResult } from '../queue/report.queue'
import { reports } from '../reports/registry'
import { getReportFile } from '../services/storage'
import type { AppEnv } from '../types'

const createReportBodySchema = z.object({
  type: z.string(),
  params: z.unknown().optional(),
})

const createReportResponseSchema = z.object({
  jobId: z.string().uuid(),
  status: z.literal('pending'),
})

const reportStatusSchema = z.object({
  id: z.string(),
  type: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  progress: z.number(),
  result: z
    .object({
      fileName: z.string(),
      size: z.number(),
      generatedAt: z.string(),
    })
    .optional(),
  error: z.string().optional(),
  createdAt: z.string(),
})

const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
})

const paramsSchema = z.object({
  id: z.string(),
})

const createReportRoute = createRoute({
  method: 'post',
  path: '/reports',
  request: {
    body: {
      content: { 'application/json': { schema: createReportBodySchema } },
      required: true,
    },
  },
  responses: {
    202: {
      content: { 'application/json': { schema: createReportResponseSchema } },
      description: 'Job created',
    },
    400: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Unknown report type or invalid params',
    },
    401: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Unauthorized',
    },
  },
})

const getReportRoute = createRoute({
  method: 'get',
  path: '/reports/{id}',
  request: { params: paramsSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: reportStatusSchema } },
      description: 'Job status',
    },
    404: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Job not found or not owned by the caller',
    },
    401: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Unauthorized',
    },
  },
})

const downloadReportRoute = createRoute({
  method: 'get',
  path: '/reports/{id}/download',
  request: { params: paramsSchema },
  responses: {
    200: {
      description: 'The generated PDF file',
    },
    404: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Job not found or not owned by the caller',
    },
    409: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Report not completed yet',
    },
    410: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'PDF file already removed by retention',
    },
    401: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Unauthorized',
    },
  },
})

type ReportStatus = z.infer<typeof reportStatusSchema>['status']

/** Maps BullMQ job states to the API-facing status values. */
export function mapJobStatus(state: string | undefined): ReportStatus {
  switch (state) {
    case 'active':
      return 'processing'
    case 'completed':
      return 'completed'
    case 'failed':
      return 'failed'
    default:
      // waiting, delayed, prioritized, waiting-children, unknown
      return 'pending'
  }
}

/** BullMQ may store the returnvalue as a JSON string depending on version. */
export function parseJobResult(value: unknown): ReportJobResult | undefined {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value)
      return isResultShape(parsed) ? parsed : undefined
    } catch {
      return undefined
    }
  }
  return isResultShape(value) ? value : undefined
}

function isResultShape(value: unknown): value is ReportJobResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'fileName' in value &&
    'size' in value &&
    'generatedAt' in value
  )
}

export function registerReportsRoutes(app: OpenAPIHono<AppEnv>): void {
  app.use('/reports', authMiddleware())
  app.use('/reports/*', authMiddleware())

  app.openapi(createReportRoute, async (c) => {
    const { type, params } = c.req.valid('json')

    const definition = reports[type]
    if (!definition) {
      return c.json(errorBody(unknownReportTypeError(type)), 400 as const)
    }

    const parsed = definition.paramsSchema.safeParse(params ?? {})
    if (!parsed.success) {
      return c.json(errorBody(validationError(parsed.error.issues)), 400 as const)
    }

    const jobId = crypto.randomUUID()
    await reportQueue.add(
      JOB_NAME,
      { type, params: parsed.data, requestedBy: c.get('username') },
      { jobId },
    )

    return c.json({ jobId, status: 'pending' as const }, 202 as const)
  })

  app.openapi(getReportRoute, async (c) => {
    const { id } = c.req.valid('param')
    const job = await reportQueue.getJob(id)
    if (!job || job.data.requestedBy !== c.get('username')) {
      return c.json(errorBody(notFoundError('Laporan tidak ditemukan')), 404 as const)
    }

    const state = await job.getState()
    const status = mapJobStatus(state)
    const result = parseJobResult(job.returnvalue)
    const failed = status === 'failed'

    return c.json(
      {
        id: job.id as string,
        type: job.data.type,
        status,
        progress: typeof job.progress === 'number' ? job.progress : 0,
        ...(result && status === 'completed' ? { result } : {}),
        ...(failed ? { error: job.failedReason ?? 'Laporan gagal' } : {}),
        createdAt: new Date(job.timestamp).toISOString(),
      },
      200 as const,
    )
  })

  app.openapi(downloadReportRoute, async (c) => {
    const { id } = c.req.valid('param')
    const job = await reportQueue.getJob(id)
    if (!job || job.data.requestedBy !== c.get('username')) {
      return c.json(errorBody(notFoundError('Laporan tidak ditemukan')), 404 as const)
    }

    const state = await job.getState()
    if (state !== 'completed') {
      return c.json(errorBody(reportNotReadyError()), 409 as const)
    }

    const file = getReportFile(job.id as string)
    if (!(await file.exists())) {
      return c.json(errorBody(fileExpiredError()), 410 as const)
    }

    // Registry keys are ours, but stay defensive: only safe filename chars.
    const safeType = job.data.type.replace(/[^a-zA-Z0-9_-]/g, '') || 'report'
    return new Response(file, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeType}-${job.id}.pdf"`,
      },
    }) as never
  })
}
