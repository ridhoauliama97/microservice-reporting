import { describe, expect, test } from 'bun:test'
import { reports } from '../src/reports/registry'
import {
  buildQcData,
  normalizeQcRow,
} from '../src/reports/wps/qc-sawmill'
import { buildQcSummaryData } from '../src/reports/wps/qc-sawmill-summary'

/**
 * The QC Sawmill family. What is worth protecting here is the tolerance rule,
 * because it decides whether a board passes QC and a boundary error in it is
 * invisible: the figures still print, they are just wrong.
 *
 * Column names verified against the live database with
 * sys.dm_exec_describe_first_result_set_for_object.
 */

const PERIOD = { tglAwal: '2026-04-01', tglAkhir: '2026-06-30' }
type Meta = { requestedBy: string; generatedAt: Date; params: unknown }

const renderWith = (type: string, data: never): string =>
  (reports[type] as unknown as { render: (d: never, m: Meta) => { html: string } }).render(data, {
    requestedBy: 'budi',
    generatedAt: new Date('2026-10-01T08:00:00Z'),
    params: PERIOD,
  }).html

const row = (over: Record<string, unknown> = {}) => ({
  NoQc: 'Q.000001',
  QcTgl: '2026-04-13',
  QcNoMeja: 1,
  NamaMeja: 'BANSAW 1',
  CuttingTebal: 54,
  CuttingLebar: 102,
  ActualTebal: 54,
  ActualLebar: 102,
  ...over,
})

describe('QC tolerance rule', () => {
  test('a deviation inside the band is accurate', () => {
    expect(normalizeQcRow(row()).isAccurate).toBe(true)
    expect(normalizeQcRow(row({ ActualTebal: 55 })).isAccurate).toBe(true)
    expect(normalizeQcRow(row({ ActualLebar: 103 })).isAccurate).toBe(true)
  })

  test('2.00 or more is over tolerance, and the boundary is exactly there', () => {
    // The live data has a board at precisely 2.00 and it must read No.
    expect(normalizeQcRow(row({ ActualTebal: 56 })).isAccurate).toBe(false)
    expect(normalizeQcRow(row({ ActualTebal: 60 })).isAccurate).toBe(false)
    expect(normalizeQcRow(row({ ActualLebar: 104 })).isAccurate).toBe(false)
  })

  test('below the cut is a failure however small the shortfall', () => {
    // -1.00 and -0.0001 are both failures; the reference guards only against
    // float noise at -0.00001, not against a real thin board.
    expect(normalizeQcRow(row({ ActualTebal: 53 })).isAccurate).toBe(false)
    expect(normalizeQcRow(row({ ActualTebal: 53.9999 })).isAccurate).toBe(false)
    expect(normalizeQcRow(row({ ActualLebar: 82 })).isAccurate).toBe(false)
  })

  test('each dimension is judged independently', () => {
    // Thick by 3mm on the width alone still fails, even though the thickness
    // is perfect.
    expect(normalizeQcRow(row({ ActualLebar: 105 })).isAccurate).toBe(false)
    expect(normalizeQcRow(row({ ActualTebal: 56, ActualLebar: 101 })).isAccurate).toBe(false)
  })

  test('deviation is actual minus cutting, and is signed', () => {
    expect(normalizeQcRow(row({ ActualTebal: 42, ActualLebar: 54 })).deviationTebal).toBe(-12)
    expect(normalizeQcRow(row({ ActualTebal: 28, ActualLebar: 54 })).deviationTebal).toBe(-26)
  })

  test('the flag prints as Yes or No, not as a boolean', () => {
    expect(normalizeQcRow(row()).accurate).toBe('Yes')
    expect(normalizeQcRow(row({ ActualTebal: 60 })).accurate).toBe('No')
  })
})

describe('QC Sawmill grouping', () => {
  const rows = [
    row(),
    row({ ActualTebal: 56 }),
    row({ QcTgl: '2026-04-14' }),
    row({ QcTgl: '2026-04-14', NamaMeja: 'BANSAW 2', QcNoMeja: 2 }),
  ]

  test('chambers come first, then dates within a chamber', () => {
    const data = buildQcData(rows, { discrepancyOnly: false })
    expect(data.mejaGroups.map((g) => g.namaMeja)).toEqual(['BANSAW 1', 'BANSAW 2'])
    // Dates are kept as ISO so both the d-M-y and j-M-Y renderings work; they
    // sort as strings, which is correct for Y-m-d.
    expect(data.mejaGroups[0]!.dateGroups.map((g) => g.tanggal)).toEqual([
      '2026-04-13',
      '2026-04-14',
    ])
  })

  test('a chamber with no name falls back to its number', () => {
    const data = buildQcData([row({ NamaMeja: '', QcNoMeja: 7 })], { discrepancyOnly: false })
    expect(data.mejaGroups[0]!.namaMeja).toBe('Meja 7')
  })

  test('the average deviation is over every row, not just the shown ones', () => {
    // The discrepancy body drops the failure, but the rate must not become 100%.
    const all = buildQcData(rows, { discrepancyOnly: false })
    const failures = buildQcData(rows, { discrepancyOnly: true })
    expect(failures.mejaGroups[0]!.dateGroups[0]!.summary.accurateRate).toBeCloseTo(50, 6)
    expect(failures.mejaGroups[0]!.dateGroups[0]!.summary.avgDeviationTebal).toBe(
      all.mejaGroups[0]!.dateGroups[0]!.summary.avgDeviationTebal,
    )
  })
})

describe('QC Sawmill Discrepancy lists only the failures', () => {
  const rows = [row(), row({ ActualTebal: 56 }), row({ ActualLebar: 82 })]

  test('the body keeps the inaccurate rows and drops the accurate ones', () => {
    const data = buildQcData(rows, { discrepancyOnly: true })
    const group = data.mejaGroups[0]!.dateGroups[0]!
    expect(group.rows).toHaveLength(2)
    expect(group.rows.every((r) => !r.isAccurate)).toBe(true)
  })

  test('the summary still counts all three', () => {
    const data = buildQcData(rows, { discrepancyOnly: true })
    const summary = data.mejaGroups[0]!.dateGroups[0]!.summary
    expect(summary.totalRows).toBe(3)
    expect(summary.totalAccurate).toBe(1)
    expect(summary.totalDiscrepancy).toBe(2)
    expect(summary.accurateRate).toBeCloseTo(100 / 3, 6)
  })

  test('plain QC Sawmill keeps every row', () => {
    const data = buildQcData(rows, { discrepancyOnly: false })
    expect(data.mejaGroups[0]!.dateGroups[0]!.rows).toHaveLength(3)
  })

  test('both reports share the tolerance and the same grouping', () => {
    // Same procedure shape, so identical input must give identical summaries.
    const a = buildQcData(rows, { discrepancyOnly: false })
    const b = buildQcData(rows, { discrepancyOnly: true })
    expect(a.grandAll.accurateRate).toBe(b.grandAll.accurateRate)
    expect(a.grandAll.avgDeviationTebal).toBe(b.grandAll.avgDeviationTebal)
  })
})

describe('QC Sawmill rendering', () => {
  const data = buildQcData([row(), row({ ActualTebal: 56 })], { discrepancyOnly: false })

  test('the three header pairs and the Accurate column are present', () => {
    const html = renderWith('qc-sawmill', data as never)
    expect(html).toContain('Cutting')
    expect(html).toContain('Actual')
    expect(html).toContain('Deviation')
    expect(html).toContain('Accurate')
  })

  test('each date group closes with its own accuracy', () => {
    const html = renderWith('qc-sawmill', data as never)
    expect(html).toContain('Per-Tanggal 13-Apr-2026')
    expect(html).toContain('Per-Meja BANSAW 1')
    expect(html).toContain('Rangkuman Grand Total')
  })

  test('an empty period still renders the empty state', () => {
    const html = renderWith('qc-sawmill', buildQcData([], { discrepancyOnly: false }) as never)
    expect(html).toContain('Tidak ada data')
  })
})

describe('QC Sawmill Summary grid', () => {
  const rows = [
    { Meja: 2, NamaMeja: 'BANSAW 2', Tgl: '2026-04-13', Accurate: 66.7, Data: 3, Acc: 2 },
    { Meja: 1, NamaMeja: 'BANSAW 1', Tgl: '2026-04-13', Accurate: 100, Data: 2, Acc: 2 },
    { Meja: 10, NamaMeja: 'BANSAW 10', Tgl: '2026-04-13', Accurate: 50, Data: 2, Acc: 1 },
    { Meja: 1, NamaMeja: 'BANSAW 1', Tgl: '2026-04-14', Accurate: 80, Data: 5, Acc: 4 },
  ]

  test('chambers sort numerically, not as strings', () => {
    const data = buildQcSummaryData(rows)
    // String order would put BANSAW 10 between 1 and 2.
    expect(data.mejaRows.map((r) => r.namaMeja)).toEqual([
      'BANSAW 1',
      'BANSAW 2',
      'BANSAW 10',
    ])
  })

  test('dates run across the top in order', () => {
    expect(buildQcSummaryData(rows).dateKeys).toEqual(['2026-04-13', '2026-04-14'])
  })

  test('the chamber average is the plain mean of its cells', () => {
    const data = buildQcSummaryData(rows)
    const first = data.mejaRows[0]!
    expect(first.avgAccurate).toBeCloseTo((100 + 80) / 2, 8)
  })

  test('a chamber with no cell for a date reads blank, not zero', () => {
    // A chamber never inspected that day is not 0% accurate.
    const data = buildQcSummaryData(rows)
    expect(data.mejaRows[1]!.byDate.has('2026-04-14')).toBe(false)
    const html = renderWith('qc-sawmill-summary', data as never)
    // The grid still carries a column for the date BANSAW 2 was never
    // inspected on; that cell is blank, which is the point.
    expect(html.match(/class="date-column"/g)).toHaveLength(2)
  })

  test('a non-numeric chamber number sorts last', () => {
    const data = buildQcSummaryData([
      ...rows,
      { Meja: 'X', NamaMeja: 'SEPJENIS A', Tgl: '2026-04-13', Accurate: 10 },
    ])
    expect(data.mejaRows[data.mejaRows.length - 1]!.namaMeja).toBe('SEPJENIS A')
  })

  test('the reference spelling of the sub-heading is kept', () => {
    // The blade says "Accrte". Not corrected here: changing it would make this
    // report's header differ from the legacy sheet for no gain.
    expect(renderWith('qc-sawmill-summary', buildQcSummaryData(rows) as never)).toContain(
      'Accrte',
    )
  })
})
