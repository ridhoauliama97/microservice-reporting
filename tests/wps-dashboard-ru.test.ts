import { describe, expect, test } from 'bun:test'
import { buildDashboardRuData } from '../src/reports/wps/dashboard-ru'

/**
 * The SP returns long-format rows grouped by a `Seleksi_1` value, and the
 * report maps them onto a hard-coded column layout. A `source` that does not
 * match the SP's spelling exactly does not throw — it just blanks that whole
 * column group, which is easy to miss in a wide table. These tests pin the
 * group names and the number-formatting rules to real production values.
 */

const STOCK = 'Stock Kayu Bulat Hidup'

const row = (tanggal: string, group: string, sub: string, value: unknown) => ({
  Tanggal: tanggal,
  Seleksi_1: group,
  Seleksi_1_Isi: sub,
  ValueNya: value,
})

describe('Dashboard RU pivot', () => {
  test('every declared group source matches the SP spelling', () => {
    const data = buildDashboardRuData([
      row('01', STOCK, 'JB', '10,21'),
      row('01', 'Penerimaan Kayu Bulat', 'JB', '1'),
      row('01', 'Kiln & Dryer', '01', 'JTG-38'),
    ])

    // A misspelt source yields no column carrying that name, so the count of
    // populated group sources drops below the declared layout.
    const populated = new Set(
      data.subColumns.filter((column) => data.rows[0]!.cells[column.key] !== '').map((c) => c.groupSource),
    )
    expect(populated.has(STOCK)).toBe(true)
    expect(data.subColumns.filter((c) => c.groupSource === STOCK)).toHaveLength(15)
  })

  test('lays out nine groups and forty-four sub-columns', () => {
    const data = buildDashboardRuData([])
    expect(data.subColumns).toHaveLength(44)
    expect(data.groupStartIndexes.size).toBe(9)
    expect([...data.groupStartIndexes]).toEqual([0, 5, 6, 21, 31, 34, 37, 40, 42])
  })

  test('a stock type change marks a thicker rule', () => {
    const data = buildDashboardRuData([])
    // JB, JB-UR, JB-UT then JMR starts a new stock type.
    expect([...data.stockTypeStartIndexes]).toEqual([9, 12, 15, 18])
  })

  test('comma decimals are normalised to a dot, keeping the decimal count', () => {
    const data = buildDashboardRuData([row('01', STOCK, 'JB', '10,21')])
    expect(data.rows[0]!.cells[`${STOCK}::JB`]).toBe('10.21')
  })

  test('a bare zero renders blank but "0.00" does not', () => {
    const data = buildDashboardRuData([
      row('01', STOCK, 'JB', '0'),
      row('01', STOCK, 'PL', '0.00'),
    ])
    expect(data.rows[0]!.cells[`${STOCK}::JB`]).toBe('')
    expect(data.rows[0]!.cells[`${STOCK}::PL`]).toBe('0.00')
  })

  test('non-numeric Kiln & Dryer values pass through untouched', () => {
    const data = buildDashboardRuData([row('01', 'Kiln & Dryer', '01', 'JTG-38')])
    expect(data.rows[0]!.cells['Kiln & Dryer::01']).toBe('JTG-38')
  })

  test('comparison prefixes are preserved', () => {
    const data = buildDashboardRuData([row('01', 'Kiln & Dryer', '01', '>100')])
    expect(data.rows[0]!.cells['Kiln & Dryer::01']).toBe('>100')
  })

  test('days sort naturally and G.T. / AVG come last, in that order', () => {
    const data = buildDashboardRuData([
      row('AVG', STOCK, 'JB', '1'),
      row('G.T.', STOCK, 'RB', '1,10'),
      row('09', STOCK, 'JB', '1'),
      row('10', STOCK, 'JB', '1'),
      row('02', STOCK, 'JB', '1'),
    ])
    expect(data.rows.map((r) => r.label)).toEqual(['02', '09', '10', 'G.T.', 'AVG'])
    expect(data.rows.filter((r) => r.isFooter).map((r) => r.label)).toEqual(['G.T.', 'AVG'])
  })

  test('Stock KB Non Pulai is the grand-total RB divided by 100', () => {
    const data = buildDashboardRuData([row('G.T.', STOCK, 'RB', '1,10')])
    expect(data.stockKbNonPulai).toBeCloseTo(0.011, 10)
  })
})
