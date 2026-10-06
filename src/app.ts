import { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { existsSync } from 'node:fs'
import { env } from './config/env'
import { logger } from './lib/logger'
import {
  errorResponse,
  notFoundError,
  payloadTooLargeError,
  validationError,
} from './lib/errors'
import { registerReportsRoutes } from './routes/reports'
import { reportParamComponents, reportTypeEnum } from './reports/openapi-params'
import { registerWsRoutes } from './routes/ws'
import type { AppEnv } from './types'
import { registerHealthRoutes } from './routes/health'

// OpenAPIHono (not plain Hono) so every HTTP route gets OpenAPI docs for free.
// The defaultHook formats ALL Zod validation failures uniformly.
//
// `strict: false` (Hono defaults it to true) makes /reports and /reports/ the
// same route. Strict mode treats a trailing slash as a distinct path, so
// POST /reports/ returned 404 NOT_FOUND — which reads as a wrong path rather
// than a punctuation detail, and Postman users add the slash by habit.
export const app = new OpenAPIHono<AppEnv>({
  strict: false,
  defaultHook: (result, c) => {
    if (!result.success) {
      return errorResponse(c, validationError(result.error.issues))
    }
  },
})

// Order matters (AGENTS.md §1): logger -> CORS -> body limit -> routes.

// Request logger. hono/logger was rejected deliberately: it prints the FULL
// URL including the query string, which would leak the WebSocket token
// (AGENTS.md §1). Here we log the path only.
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

// --- OpenAPI docs (AGENTS.md §1) ---

// The spec is built by hand rather than via app.doc() because the components
// block has to carry the reports' param schemas, and the generator's config
// type does not accept one. The document is otherwise the standard output.
const openApiConfig = {
  openapi: '3.1.0' as const,
  info: {
    title: 'Report Service API',
    version: '1.0.0',
    description:
      `Membuat laporan PDF secara asynchronous. Ada ${reportTypeEnum.length} jenis laporan. ` +
      'Bentuk `params` berbeda-beda per jenis; `POST /reports` memetakannya lewat `oneOf`, ' +
      'dan tiap cabang mencantumkan laporan mana yang memakai bentuk itu.',
  },
}

app.get('/docs/openapi.json', (c) => {
  const document = app.getOpenAPI31Document(openApiConfig) as unknown as Record<string, unknown>
  return c.json({
    ...document,
    components: {
      ...(document.components as Record<string, unknown> | undefined),
      schemas: {
        ...((document.components as { schemas?: Record<string, unknown> } | undefined)
          ?.schemas ?? {}),
        ...reportParamComponents(),
      },
    },
  })
})

// --- Documentation site at /docs ---
//
// `/docs` serves the Mintlify site that lives in `docs/`, not the Swagger UI.
// It is baked into the image as static files by the `docs` stage of the
// Dockerfile, which runs `mint export` and rewrites the links so the site works
// under a `/docs` prefix.
//
// The export references its assets as absolute `/_next/...` paths and those are
// left alone, so the same directory is also served at `/_next`. Serving the
// assets at the root keeps the rewrite to `href` attributes only.
//
// When the static site is absent — a checkout without a Docker build — `/docs`
// falls back to the Swagger UI, and `/swagger` is always available.
const DOCS_SITE_DIR = 'docs-site'
const docsSiteIndex = `${DOCS_SITE_DIR}/index.html`
const hasDocsSite = existsSync(docsSiteIndex)

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.md': 'text/markdown; charset=utf-8',
}

/** Maps a URL path onto a file in the exported site, or undefined if there is none. */
async function resolveDocsFile(relative: string): Promise<string | undefined> {
  const clean = relative.replace(/^\/+/, '')
  // Never walk out of the site directory.
  if (clean.includes('..')) return undefined
  for (const candidate of [
    `${DOCS_SITE_DIR}/${clean}`,
    `${DOCS_SITE_DIR}/${clean}/index.html`,
    `${DOCS_SITE_DIR}/${clean}.html`,
  ]) {
    const file = Bun.file(candidate)
    if (!(await file.exists())) continue
    const stat = await file.stat()
    if (stat && !stat.isDirectory()) return candidate
  }
  return undefined
}

async function serveDocsFile(c: Context<AppEnv>): Promise<Response> {
  const path = c.req.path
  let relative: string
  if (path === '/docs' || path === '/docs/') relative = ''
  else if (path.startsWith('/docs/')) relative = path.slice('/docs/'.length)
  else if (path.startsWith('/_next/')) relative = path
  else return c.notFound()

  const file = await resolveDocsFile(relative)
  if (!file) return c.notFound()

  const dot = file.lastIndexOf('.')
  const ext = dot === -1 ? '' : file.slice(dot).toLowerCase()
  return new Response(Bun.file(file), {
    headers: { 'content-type': MIME_TYPES[ext] ?? 'application/octet-stream' },
  })
}

// Swagger UI served as static HTML from a CDN — no extra npm package needed.
const swaggerHtml = `<!DOCTYPE html>
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

app.get('/swagger', (c) => c.html(swaggerHtml))

if (hasDocsSite) {
  app.get('/docs', serveDocsFile)
  app.get('/docs/*', serveDocsFile)
  // The export points at these from the root, so they are served there too.
  app.get('/_next/*', serveDocsFile)
} else {
  // No built site in this checkout: keep /docs working as it did before.
  app.get('/docs', (c) => c.html(swaggerHtml))
}

// --- Error handling ---

app.onError((err, c) => {
  // Uniform format: AppError keeps its own code/status; anything else becomes
  // a 500 INTERNAL_ERROR without leaking details. Real error goes to the log.
  logger.error({ err: err instanceof Error ? { message: err.message, stack: err.stack } : err }, 'Unhandled error')
  return errorResponse(c, err)
})

app.notFound((c) => errorResponse(c, notFoundError('Route tidak ditemukan')))
