/**
 * End-to-end run over every report in the registry.
 *
 *   bun run scripts/e2e-all-reports.ts --from=2026-09-01 --to=2026-09-30
 *
 * For each report type it POSTs /reports, waits for the job, downloads the PDF,
 * checks it really is a PDF, and saves it.
 *
 * Params are built from each report's own Zod schema rather than from a list of
 * type names, so a new report does not need to be registered here:
 *   - a date-shaped property is filled from the window (periode1 = the month
 *     before, since that is what a two-period report is for);
 *   - a property with a default keeps it, except where the schema rejects the
 *     default (st-hidup-kering needs one of include/exclude);
 *   - a lookup key is read out of the table the stored procedure itself reads,
 *     because an invented key returns an empty sheet and proves nothing;
 *   - anything left optional is omitted.
 *
 * A report that renders "Tidak ada data" still completes, so a small PDF is
 * reported separately from a failure - "ran fine but had nothing to show" is a
 * different problem from "the job broke".
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { sign } from 'hono/jwt'
import sql from 'mssql'
import { z } from 'zod'
import { env } from '../src/config/env'
import { lazyPool } from '../src/db/mssql'
import { reports } from '../src/reports/registry'

// --- arguments -------------------------------------------------------------

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

const FROM = arg('from', '2026-09-01')
const TO = arg('to', '2026-09-30')
const BASE = arg('base', `http://localhost:${env.PORT}`)
const CONCURRENCY = Number(arg('concurrency', '3'))
const OUT_DIR = arg('out', join('storage', 'e2e'))
const POLL_MS = Number(arg('poll', '1500'))
const JOB_TIMEOUT_MS = Number(arg('timeout', '300000'))
const ONLY = arg('only', '').split(',').map((s) => s.trim()).filter(Boolean)
const SKIP = arg('skip', '').split(',').map((s) => s.trim()).filter(Boolean)
/** Below this, a PDF is almost certainly the empty-state sheet. */
const SMALL_PDF_BYTES = Number(arg('small-pdf', '20000'))

const pad = (n: number) => String(n).padStart(2, '0')

/** The month before the window, so the two-period reports compare something. */
function previousMonth(from: string): { awal: string; akhir: string } {
  const date = new Date(`${from}T00:00:00Z`)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() // 0-based, so this really is the previous month
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return { awal: `${year}-${pad(month + 1)}-01`, akhir: `${year}-${pad(month + 1)}-${pad(lastDay)}` }
}

// --- auth ------------------------------------------------------------------

async function token(): Promise<string> {
  if (env.NODE_ENV === 'production') {
    throw new Error('refusing to mint a test token when NODE_ENV=production')
  }
  const explicit = arg('token', '')
  if (explicit) return explicit
  return sign(
    { [env.JWT_USERNAME_CLAIM]: arg('user', 'e2e'), exp: Math.floor(Date.now() / 1000) + 7200 },
    env.JWT_SECRET,
    env.JWT_ALG,
  )
}

// --- lookup keys, read from the tables the procedures read -----------------

const KEY_SOURCES: Record<string, { table: string; column: string }> = {
  noProduksi: { table: 'dbo.FJProduksi_h', column: 'NoProduksi' },
  noKayuBulat: { table: 'dbo.KayuBulat_h', column: 'NoKayuBulat' },
  noJual: { table: 'dbo.Penjualan_h', column: 'NoJual' },
  noProcKd: { table: 'dbo.KD_h', column: 'NoProcKd' },
  noSpk: { table: 'dbo.MstSPK_d', column: 'NoSPK' },
  noPenST: { table: 'dbo.PenerimaanSTSawmill_h', column: 'NoPenerimaanST' },
  // SP_LapTracingST filters `WHERE NoST = @NoProduk`
  noProduk: { table: 'dbo.ST_h', column: 'NoST' },
}

const harvested = new Map<string, string>()

/** `[dbo].[Table]`, not `[dbo.Table]` - the latter is one name and does not resolve. */
function qualified(table: string): string {
  const [schema, name] = table.split('.')
  return `[${schema}].[${name}]`
}

async function topValue(
  pool: sql.ConnectionPool,
  table: string,
  column: string,
): Promise<string | null> {
  const result = await pool.request()
    .input('t', table)
    .input('c', column)
    .query(
      `SELECT TOP 1 CAST([${column}] AS nvarchar(100)) AS v
         FROM ${qualified(table)}
        WHERE [${column}] IS NOT NULL AND LTRIM(RTRIM([${column}])) <> ''
        ORDER BY [${column}] DESC`,
    )
  return (result.recordset[0] as { v?: string } | undefined)?.v ?? null
}

async function harvestKeys(pool: sql.ConnectionPool): Promise<void> {
  for (const [param, source] of Object.entries(KEY_SOURCES)) {
    try {
      const value = await topValue(pool, source.table, source.column)
      if (value) harvested.set(param, value)
      else console.warn(`  ! no value for ${param} in ${source.table}.${source.column}`)
    } catch (error) {
      console.warn(`  ! ${param}: ${(error as Error).message}`)
    }
  }

  // spk-sawmill needs a (NoSPK, IdProduk) pair that belong together.
  try {
    const result = await pool.request().query(
      `SELECT TOP 1 d.NoSPK, p.IdProdukSPK
         FROM MstSPK_dProdukSPK d
         JOIN MstProdukSPK p ON p.IdProdukSPK = d.IdProdukSPK
        WHERE d.NoSPK IS NOT NULL
        ORDER BY d.NoSPK DESC`,
    )
    const row = result.recordset[0] as { NoSPK?: string; IdProdukSPK?: number } | undefined
    if (row?.NoSPK && row.IdProdukSPK) harvested.set('spkSawmillPair', JSON.stringify(row))
  } catch (error) {
    console.warn(`  ! spk-sawmill pair: ${(error as Error).message}`)
  }

  // kd-keluar-masuk filters on a KD room.
  try {
    const result = await pool.request().query(
      `SELECT TOP 1 NoRuangKD AS v FROM KD_h WHERE NoRuangKD IS NOT NULL AND NoRuangKD > 0 ORDER BY NoRuangKD`,
    )
    const value = (result.recordset[0] as { v?: number } | undefined)?.v
    if (value) harvested.set('noRuangKd', String(value))
  } catch (error) {
    console.warn(`  ! noRuangKd: ${(error as Error).message}`)
  }

  console.log('\nHarvested key values:')
  for (const [key, value] of harvested) console.log(`  ${key.padEnd(16)} = ${value}`)
}

// --- params, derived from each report's own schema ------------------------

type JsonSchema = {
  type?: string
  pattern?: string
  default?: unknown
  format?: string
  items?: JsonSchema
}

/** Property names that are lookups rather than settings. */
const LOOKUPS = new Set([...Object.keys(KEY_SOURCES), 'noRuangKd'])

function valueFor(name: string, schema: JsonSchema, required: boolean): unknown | typeof OMIT {
  const previous = previousMonth(FROM)

  // Dates: the window, except the "period 1" of a two-period report. Some schemas
  // type a date as a plain string with no pattern, so the name decides too.
  const DATE_NAME = /^(tglAwal|tglAkhir|tanggal|periode1Awal|periode1Akhir|periode2Awal|periode2Akhir)$/
  if (DATE_NAME.test(name) || schema.pattern?.includes('\\d{4}')) {
    if (/^(periode1|tglAwal)/.test(name)) return /periode1/.test(name) ? previous.awal : FROM
    if (/^(periode1|tglAkhir)/.test(name)) return /periode1/.test(name) ? previous.akhir : TO
    return FROM
  }

  if (LOOKUPS.has(name)) {
    const value = harvested.get(name)
    if (!value) throw new Error(`no harvested value for ${name}`)
    return schema.type === 'integer' ? Number(value) : value
  }

  switch (name) {
    case 'tahun':
      return Number(FROM.slice(0, 4))
    case 'bulan':
      return Number(FROM.slice(5, 7))
    case 'hari':
      return Number(TO.slice(8, 10))
    case 'include':
    case 'exclude':
      // Both default to false and the schema requires at least one of them.
      return name === 'include'
    default:
      break
  }

  if (schema.default !== undefined) return schema.default
  if (!required) return OMIT
  if (schema.type === 'integer' || schema.type === 'number') return 1
  throw new Error(`no rule for required param "${name}" (${schema.type ?? 'unknown'})`)
}

const OMIT = Symbol('omit')

function paramsFor(type: string): Record<string, unknown> {
  const definition = reports[type]!
  const json = z.toJSONSchema(definition.paramsSchema, {
    io: 'input',
    unrepresentable: 'any',
  }) as { properties?: Record<string, JsonSchema>; required?: string[] }
  const required = new Set(json.required ?? [])

  const params: Record<string, unknown> = {}
  for (const [name, schema] of Object.entries(json.properties ?? {})) {
    const value = valueFor(name, schema, required.has(name))
    if (value !== OMIT) params[name] = value
  }

  const parsed = definition.paramsSchema.safeParse(params)
  if (!parsed.success) {
    throw new Error(
      `${parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')} ` +
        `(built ${JSON.stringify(params)})`,
    )
  }
  return parsed.data as Record<string, unknown>
}

// --- run one report --------------------------------------------------------

interface Outcome {
  type: string
  ok: boolean
  status?: string
  ms: number
  bytes?: number
  small?: boolean
  error?: string
}

async function runOne(type: string, jwt: string): Promise<Outcome> {
  const started = Date.now()
  const done = (status: string, bytes?: number, small = false, error?: string): Outcome => ({
    type,
    ok: status === 'completed',
    status,
    ms: Date.now() - started,
    bytes,
    small,
    error,
  })

  let params: Record<string, unknown>
  try {
    params = paramsFor(type)
  } catch (error) {
    return done('param-error', undefined, false, (error as Error).message)
  }

  const headers = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }
  let jobId: string
  try {
    const created = await fetch(`${BASE}/reports`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ type, params }),
    })
    if (created.status !== 202) {
      const body = await created.text()
      return done('create-failed', undefined, false, `HTTP ${created.status}: ${body.slice(0, 220)}`)
    }
    jobId = ((await created.json()) as { jobId: string }).jobId
  } catch (error) {
    return done('create-failed', undefined, false, (error as Error).message)
  }

  const deadline = Date.now() + JOB_TIMEOUT_MS
  let status = 'pending'
  while (Date.now() < deadline) {
    await Bun.sleep(POLL_MS)
    const polled = await fetch(`${BASE}/reports/${jobId}`, { headers })
    if (!polled.ok) return done('poll-failed', undefined, false, `HTTP ${polled.status}`)
    const body = (await polled.json()) as { status: string; error?: string }
    status = body.status
    if (status === 'completed' || status === 'failed') {
      if (status === 'failed') return done('failed', undefined, false, body.error ?? 'no message')
      break
    }
  }
  if (status !== 'completed') {
    return done('timeout', undefined, false, `still ${status} after ${JOB_TIMEOUT_MS}ms`)
  }

  const pdf = await fetch(`${BASE}/reports/${jobId}/download`, { headers })
  if (!pdf.ok) return done('download-failed', undefined, false, `HTTP ${pdf.status}`)
  const bytes = new Uint8Array(await pdf.arrayBuffer())
  if (bytes.length < 4 || String.fromCharCode(...bytes.slice(0, 4)) !== '%PDF') {
    return done('not-a-pdf', bytes.length, false, 'missing %PDF magic')
  }
  await writeFile(join(OUT_DIR, `${type}.pdf`), bytes)
  return done('completed', bytes.length, bytes.length < SMALL_PDF_BYTES)
}

// --- main ------------------------------------------------------------------

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true })
  const jwt = await token()

  const pool = await lazyPool()
  await harvestKeys(pool)

  const types = Object.keys(reports).sort()
    .filter((type) => (ONLY.length > 0 ? ONLY.includes(type) : true))
    .filter((type) => (SKIP.length > 0 ? !SKIP.includes(type) : true))

  console.log(
    `\nRunning ${types.length} reports against ${BASE} for ${FROM} .. ${TO} (concurrency ${CONCURRENCY})\n`,
  )

  const results: Outcome[] = []
  let cursor = 0
  const startedAt = Date.now()
  const runners = Array.from({ length: Math.min(CONCURRENCY, types.length) }, async () => {
    while (cursor < types.length) {
      const type = types[cursor++]!
      const outcome = await runOne(type, jwt)
      results.push(outcome)
      const mark = outcome.ok ? (outcome.small ? 'EMPTY?' : 'ok   ') : 'FAIL '
      console.log(
        `  [${String(results.length).padStart(3)}/${types.length}] ${mark} ${type.padEnd(46)} ` +
          `${outcome.status}${outcome.bytes !== undefined ? ` ${(outcome.bytes / 1024).toFixed(0)}KB` : ''} ${outcome.ms}ms` +
          `${outcome.error ? `\n        ${outcome.error}` : ''}`,
      )
    }
  })
  await Promise.all(runners)

  const withData = results.filter((r) => r.ok && !r.small)
  const small = results.filter((r) => r.ok && r.small)
  const failed = results.filter((r) => !r.ok)

  console.log(`\n================ summary (${((Date.now() - startedAt) / 1000).toFixed(0)}s)`)
  console.log(`  rendered with data : ${withData.length}`)
  console.log(`  completed but small (check for "Tidak ada data") : ${small.length}`)
  console.log(`  failed             : ${failed.length}`)
  if (small.length > 0) {
    console.log('\nSmall / possibly empty:')
    for (const r of small) console.log(`  ${r.type} (${(r.bytes! / 1024).toFixed(0)}KB)`)
  }
  if (failed.length > 0) {
    console.log('\nFailed:')
    for (const r of failed) console.log(`  ${r.type} [${r.status}] ${r.error}`)
  }

  await writeFile(
    join(OUT_DIR, 'e2e-report.json'),
    JSON.stringify({ from: FROM, to: TO, base: BASE, results }, null, 2),
  )
  console.log(`\nPDFs + report written to ${OUT_DIR}`)
  await pool.close()
}

void main()