import { OpenAPIHono } from '@hono/zod-openapi'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { env } from './config/env'
import { logger } from './lib/logger'
import {
  errorResponse,
  notFoundError,
  payloadTooLargeError,
  validationError,
} from './lib/errors'
import { authMiddleware } from './middleware/auth'
import { registerReportsRoutes } from './routes/reports'
import { registerWsRoutes } from './routes/ws'
import type { AppEnv } from './types'
import { registerHealthRoutes } from './routes/health'

// OpenAPIHono (not plain Hono) so every HTTP route gets OpenAPI docs for free.
// The defaultHook formats ALL Zod validation failures uniformly.
export const app = new OpenAPIHono<AppEnv>({
  defaultHook: (result, c) => {
    if (!result.success) {
      return errorResponse(c, validationError(result.error.issues))
    }
  },
})

// Order matters (AGENTS.md 7.2): logger -> CORS -> body limit -> routes.

// Request logger. hono/logger was rejected deliberately: it prints the FULL
// URL including the query string, which would leak the WebSocket token
// (AGENTS.md 7.2). Here we log the path only.
app.use('*', async (c, next) => {
  const start = performance.now()
  await next()
  logger.info(
    {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Math.round(performance.now() - start),
    },
    'request',
  )
})

app.use('*', cors({
  origin: env.CORS_ORIGINS,
  allowHeaders: ['Authorization', 'Content-Type'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
}))

const ONE_MB = 1024 * 1024
app.use('*', bodyLimit({
  maxSize: ONE_MB,
  onError: (c) => errorResponse(c, payloadTooLargeError()),
}))

registerHealthRoutes(app)
registerReportsRoutes(app)
registerWsRoutes(app)

// --- OpenAPI docs (AGENTS.md 7.13) ---

app.doc('/docs/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'Report Service API',
    version: '1.0.0',
  },
})

// Swagger UI served as static HTML from a CDN — no extra npm package needed.
const docsHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Report Service API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.addEventListener('load', () => {
      window.ui = SwaggerUIBundle({
        url: '/docs/openapi.json',
        dom_id: '#swagger-ui',
      })
    })
  </script>
</body>
</html>`

app.get('/docs', (c) => c.html(docsHtml))

// --- Error handling ---

app.onError((err, c) => {
  // Uniform format: AppError keeps its own code/status; anything else becomes
  // a 500 INTERNAL_ERROR without leaking details. Real error goes to the log.
  logger.error({ err: err instanceof Error ? { message: err.message, stack: err.stack } : err }, 'Unhandled error')
  return errorResponse(c, err)
})

app.notFound((c) => errorResponse(c, notFoundError('Route tidak ditemukan')))
