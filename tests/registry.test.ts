import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { exampleReport } from '../src/reports/example'
import { periodParamsSchema } from '../src/reports/period-params'
import { reports } from '../src/reports/registry'

describe('example report paramsSchema', () => {
  test('accepts an empty object and applies defaults', () => {
    const parsed = exampleReport.paramsSchema.parse({})
    expect(parsed.title).toBe('Laporan Contoh')
    expect(parsed.rows).toBe(20)
  })

  test('rejects rows: 0', () => {
    const result = exampleReport.paramsSchema.safeParse({ rows: 0 })
    expect(result.success).toBe(false)
  })

  test('rejects rows above the maximum', () => {
    const result = exampleReport.paramsSchema.safeParse({ rows: 501 })
    expect(result.success).toBe(false)
  })
})

describe('registry', () => {
  test('registers the example report', () => {
    expect(reports['example']).toBe(exampleReport)
  })

  test('registers the mutasi-kayu-bulat report', () => {
    expect(reports['mutasi-kayu-bulat']).toBeDefined()
  })

  test('registers the mutasi-barang-jadi report', () => {
    expect(reports['mutasi-barang-jadi']).toBeDefined()
  })

  test('validates Cross Cut Akhir age cut-offs in order', () => {
    const schema = reports['umur-cross-cut-akhir-detail'].paramsSchema
    expect(schema.safeParse({ umur1: 15, umur2: 30, umur3: 60, umur4: 90 }).success).toBe(true)
    expect(schema.safeParse({ umur1: 30, umur2: 15, umur3: 60, umur4: 90 }).success).toBe(false)
  })
})

describe('every implemented WPS report is reachable', () => {
  // A report module can be fully implemented yet unreachable from the API if it
  // is only imported in registry.ts and never added to the `reports` object.
  // That silently ships dead code, so assert the wiring here.
  const wpsDir = join(import.meta.dir, '..', 'src', 'reports', 'wps')
  const registrySource = readFileSync(
    join(import.meta.dir, '..', 'src', 'reports', 'registry.ts'),
    'utf-8',
  )

  const orphans: string[] = []
  for (const file of readdirSync(wpsDir).filter((name) => name.endsWith('.ts'))) {
    const source = readFileSync(join(wpsDir, file), 'utf-8')
    // A leaf report exports a const typed as ReportDefinition<...>. Shared
    // helpers (template.ts, styles.ts, and theotone factories) do not.
    for (const match of source.matchAll(
      /export const (\w+): ReportDefinition</g,
    )) {
      const symbol = match[1]!
      if (!new RegExp(`'[^']+'\\s*:\\s*${symbol}\\b`).test(registrySource)) {
        orphans.push(`${file} -> ${symbol}`)
      }
    }
  }

  test('no report module is left unregistered', () => {
    expect(orphans).toEqual([])
  })

  test('registry keys match each report type', () => {
    for (const [key, definition] of Object.entries(reports)) {
      expect(definition.type).toBe(key)
    }
  })
})

describe('periodParamsSchema', () => {
  test('accepts valid ISO dates', () => {
    const result = periodParamsSchema.safeParse({
      tglAwal: '2025-01-01',
      tglAkhir: '2025-01-31',
    })
    expect(result.success).toBe(true)
  })

  test('rejects a non-ISO date string', () => {
    const result = periodParamsSchema.safeParse({
      tglAwal: '01/01/2025',
      tglAkhir: '2025-01-31',
    })
    expect(result.success).toBe(false)
  })

  test('rejects tglAkhir before tglAwal', () => {
    const result = periodParamsSchema.safeParse({
      tglAwal: '2025-01-31',
      tglAkhir: '2025-01-01',
    })
    expect(result.success).toBe(false)
  })
})
