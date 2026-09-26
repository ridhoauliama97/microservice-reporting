import { describe, expect, test } from 'bun:test'
import { buildDashboardPivot } from '../src/reports/wps/dashboard-pivot'

const OPTIONS = {
  columns: { inflow: 'FJMasuk', outflow: 'KeluarALL', balance: 'FJAkhir', ctr: 'CTR' },
  columnOrder: ['JABON A/A', 'JABON ISOBO', 'RAMBUNG A/B'],
  ctrDivisor: 65,
}

describe('buildDashboardPivot', () => {
  test('orders columns by the legacy column_order and appends unknown keys alphabetically', () => {
    const pivot = buildDashboardPivot(
      [
        { DATE: '2026-08-01', Jenis: 'RAMBUNG', NamaGrade: 'A/B', FJMasuk: 1, KeluarALL: 0, FJAkhir: 1, CTR: 0 },
        { DATE: '2026-08-01', Jenis: 'JABON', NamaGrade: 'ISOBO', FJMasuk: 1, KeluarALL: 0, FJAkhir: 1, CTR: 0 },
        { DATE: '2026-08-01', Jenis: 'JABON', NamaGrade: 'A/A', FJMasuk: 1, KeluarALL: 0, FJAkhir: 1, CTR: 0 },
        { DATE: '2026-08-01', Jenis: 'S4S', NamaGrade: 'X', FJMasuk: 1, KeluarALL: 0, FJAkhir: 1, CTR: 0 },
      ],
      OPTIONS,
    )

    expect(pivot.columns).toEqual(['JABON A/A', 'JABON ISOBO', 'RAMBUNG A/B', 'S4S X'])
  })

  test('sums inflow and outflow per date and column', () => {
    const pivot = buildDashboardPivot(
      [
        { DATE: '2026-08-01', Jenis: 'JABON', NamaGrade: 'A/A', FJMasuk: 3, KeluarALL: 1, FJAkhir: 5, CTR: 0 },
        { DATE: '2026-08-01', Jenis: 'JABON', NamaGrade: 'A/A', FJMasuk: 2, KeluarALL: 4, FJAkhir: 5, CTR: 0 },
      ],
      OPTIONS,
    )

    expect(pivot.rows).toHaveLength(1)
    expect(pivot.rows[0]!.cells['JABON A/A']).toEqual({ in: 5, out: 5 })
  })

  test('takes the ending balance from the latest date, not a running sum', () => {
    const pivot = buildDashboardPivot(
      [
        { DATE: '2026-08-01', Jenis: 'JABON', NamaGrade: 'A/A', FJMasuk: 0, KeluarALL: 0, FJAkhir: 10, CTR: 0 },
        { DATE: '2026-08-05', Jenis: 'JABON', NamaGrade: 'A/A', FJMasuk: 0, KeluarALL: 0, FJAkhir: 4, CTR: 0 },
        { DATE: '2026-08-03', Jenis: 'JABON', NamaGrade: 'A/A', FJMasuk: 0, KeluarALL: 0, FJAkhir: 99, CTR: 0 },
      ],
      OPTIONS,
    )

    expect(pivot.sAkhirByColumn['JABON A/A']).toBe(4)
  })

  test('sums CTR across the period and falls back to the divisor when absent', () => {
    const withCtr = buildDashboardPivot(
      [
        { DATE: '2026-08-01', Jenis: 'JABON', NamaGrade: 'A/A', FJMasuk: 0, KeluarALL: 0, FJAkhir: 6, CTR: 1.5 },
        { DATE: '2026-08-02', Jenis: 'JABON', NamaGrade: 'A/A', FJMasuk: 0, KeluarALL: 0, FJAkhir: 6, CTR: 2.5 },
      ],
      OPTIONS,
    )
    expect(withCtr.ctrByColumn['JABON A/A']).toBe(4)

    const withoutCtr = buildDashboardPivot(
      [{ DATE: '2026-08-01', Jenis: 'JABON', NamaGrade: 'A/A', FJMasuk: 0, KeluarALL: 0, FJAkhir: 130 }],
      OPTIONS,
    )
    expect(withoutCtr.ctrByColumn['JABON A/A']).toBe(2)
  })

  test('computes the share of each column against the balance total', () => {
    const pivot = buildDashboardPivot(
      [
        { DATE: '2026-08-01', Jenis: 'JABON', NamaGrade: 'A/A', FJMasuk: 0, KeluarALL: 0, FJAkhir: 30, CTR: 0 },
        { DATE: '2026-08-01', Jenis: 'RAMBUNG', NamaGrade: 'A/B', FJMasuk: 0, KeluarALL: 0, FJAkhir: 10, CTR: 0 },
      ],
      OPTIONS,
    )

    expect(pivot.percentByColumn['JABON A/A']).toBeCloseTo(75)
    expect(pivot.percentByColumn['RAMBUNG A/B']).toBeCloseTo(25)
    expect(pivot.totals.sAkhir).toBe(40)
  })

  test('merges the legacy FJLB typo into the FILB column', () => {
    const pivot = buildDashboardPivot(
      [
        { DATE: '2026-08-01', Jenis: 'JABON FJLB', NamaGrade: 'A/A', FJMasuk: 0, KeluarALL: 0, FJAkhir: 1, CTR: 0 },
        { DATE: '2026-08-01', Jenis: 'JABON FILB', NamaGrade: 'A/A', FJMasuk: 0, KeluarALL: 0, FJAkhir: 2, CTR: 0 },
      ],
      OPTIONS,
    )

    expect(pivot.columns).toEqual(['JABON FILB A/A'])
    expect(pivot.sAkhirByColumn['JABON FILB A/A']).toBe(2)
  })

  test('treats locale-formatted numbers and blanks as zero', () => {
    const pivot = buildDashboardPivot(
      [
        { DATE: '2026-08-01', Jenis: 'JABON', NamaGrade: 'A/A', FJMasuk: '1.234,50', KeluarALL: '', FJAkhir: null, CTR: '3' },
      ],
      OPTIONS,
    )

    expect(pivot.rows[0]!.cells['JABON A/A']).toEqual({ in: 1234.5, out: 0 })
    expect(pivot.sAkhirByColumn['JABON A/A']).toBe(0)
  })

  test('returns an empty pivot for no rows so the report renders the empty state', () => {
    const pivot = buildDashboardPivot([], OPTIONS)

    expect(pivot.dates).toEqual([])
    expect(pivot.columns).toEqual([])
    expect(pivot.rows).toEqual([])
    expect(pivot.totals).toEqual({ sAkhir: 0, ctr: 0 })
  })
})
