import { describe, expect, test } from 'bun:test'
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
