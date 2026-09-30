import { describe, expect, test } from 'bun:test'
import { reports } from '../src/reports/registry'
import { buildDashboardPivot } from '../src/reports/wps/dashboard-pivot'
import { buildKdGroups, calcDays } from '../src/reports/wps/mutasi-kd'

/**
 * The three Sawn Timber reports. What each case protects is the part that
 * silently produces a wrong number: a balance column summed instead of taken
 * from its latest row, a day count made absolute when the reference keeps its
 * sign, and the ALL-suffixed columns being picked up where the plain ones are
 * the ones the reference reads.
 */

const PERIOD = { tglAwal: '2026-08-01', tglAkhir: '2026-08-31' }

type Meta = { requestedBy: string; generatedAt: Date; params: unknown }
type Definition = { render: (data: never, meta: Meta) => { html: string } }

const renderWith = <T,>(type: string, data: T): string =>
  (reports[type] as unknown as Definition).render(data as never, {
    requestedBy: 'budi',
    generatedAt: new Date('2026-09-01T08:00:00Z'),
    params: PERIOD,
  }).html

describe('registry and parameter shapes', () => {
  test('all three are registered', () => {
    for (const type of [
      'mutasi-sawn-timber-ton',
      'mutasi-kd',
      'dashboard-sawn-timber',
    ]) {
      expect(Object.keys(reports)).toContain(type)
    }
  })

  test('all three take a period', () => {
    for (const type of [
      'mutasi-sawn-timber-ton',
      'mutasi-kd',
      'dashboard-sawn-timber',
    ]) {
      const schema = reports[type]!.paramsSchema
      expect(schema.safeParse(PERIOD).success).toBe(true)
      expect(
        schema.safeParse({ tglAwal: '2026-08-31', tglAkhir: '2026-08-01' }).success,
      ).toBe(false)
    }
  })
})

describe('Mutasi Sawn Timber (Ton)', () => {
  test('the four adjustment headers are renamed as in the reference', () => {
    // The raw procedure names AdjustmentPlus / BongkarSusunMinus.
    const html = renderWith('mutasi-sawn-timber-ton', [
      {
        Jenis: 'KAYU LAT JABON',
        Awal: null,
        Masuk: 1.784,
        Beli: null,
        AdjustmentPlus: null,
        AdjustmentMinus: null,
        BongkarSusunPlus: null,
        BongkarSusunMinus: null,
        Jual: 1.7432,
        Keluar: null,
        Akhir: 0.0408,
      },
    ])
    expect(html).toContain('Adjust (+)')
    expect(html).toContain('Adjust (-)')
    expect(html).toContain('B.Susun (+)')
    expect(html).toContain('B.Susun (-)')
    expect(html).not.toContain('>AdjustmentPlus<')
    expect(html).not.toContain('>BongkarSusunMinus<')
  })

  test('every numeric column is totalled', () => {
    const html = renderWith('mutasi-sawn-timber-ton', [
      { Jenis: 'A', Masuk: 1.5, Jual: 0.5, Akhir: 1 },
      { Jenis: 'B', Masuk: 2.5, Jual: 1.5, Akhir: 2 },
    ])
    const totals = html.match(/<tr class="totals-row">[\s\S]*?<\/tr>/)![0]!
    const text = totals.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
    expect(text).toContain('4.0000') // Masuk 1.5 + 2.5
    expect(text).toContain('2.0000') // Jual 0.5 + 1.5
    expect(text).toContain('3.0000') // Akhir 1 + 2
  })

  test('a null column totals as zero rather than blanking the row', () => {
    const html = renderWith('mutasi-sawn-timber-ton', [
      { Jenis: 'A', Masuk: 1, Beli: null, AdjustmentPlus: null },
    ])
    const totals = html.match(/<tr class="totals-row">[\s\S]*?<\/tr>/)![0]!
    expect(totals.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')).toContain('1.0000')
  })

  test('an empty period renders the empty row', () => {
    expect(renderWith('mutasi-sawn-timber-ton', [])).toContain('Tidak ada data')
  })
})

describe('Mutasi KD', () => {
  const rows = [
    { NoRuangKD: 2, TglMasuk: '2026-08-04', TonIn: 6.1709, TglKeluar: '2026-08-18', TonOut: 6.1709 },
    { NoRuangKD: 1, TglMasuk: '2026-08-10', TonIn: 11.8791, TglKeluar: '2026-08-22', TonOut: 11.8791 },
    { NoRuangKD: 1, TglMasuk: '2026-07-29', TonIn: 22.1065, TglKeluar: '2026-08-10', TonOut: 22.1065 },
    { NoRuangKD: 0, TglMasuk: '2026-08-01', TonIn: 99, TglKeluar: '2026-08-02', TonOut: 99 },
  ]

  test('a chamber numbered zero is dropped, as in the reference', () => {
    const data = buildKdGroups(rows)
    expect(data.groups.map((g) => g.noRuangKd)).toEqual([1, 2])
    expect(data.groups.flatMap((g) => g.rows)).toHaveLength(3)
  })

  test('chambers come in numeric order, not string order', () => {
    // String sorting would put 10 before 2.
    const data = buildKdGroups([
      { NoRuangKD: 10, TglMasuk: '2026-08-01', TonIn: 1, TglKeluar: null, TonOut: 0 },
      { NoRuangKD: 2, TglMasuk: '2026-08-01', TonIn: 1, TglKeluar: null, TonOut: 0 },
    ])
    expect(data.groups.map((g) => g.noRuangKd)).toEqual([2, 10])
  })

  test('rows inside a chamber are sorted by TglMasuk', () => {
    const data = buildKdGroups(rows)
    const dates = data.groups[0]!.rows.map((row) => String(row.TglMasuk))
    expect(dates).toEqual(['2026-07-29', '2026-08-10'])
  })

  test('a chamber total is the sum of its own lots', () => {
    const data = buildKdGroups(rows)
    expect(data.groups[0]!.tonIn).toBeCloseTo(33.9856, 8)
    expect(data.groups[1]!.tonIn).toBeCloseTo(6.1709, 8)
    expect(data.grandTonIn).toBeCloseTo(40.1565, 8)
  })

  test('the day count is signed, and 0 when a date is missing', () => {
    expect(calcDays('2026-08-04', '2026-08-18')).toBe(14)
    // Went out before it came in: the reference keeps the sign.
    expect(calcDays('2026-08-18', '2026-08-04')).toBe(-14)
    expect(calcDays('2026-08-04', null)).toBe(0)
    expect(calcDays(null, '2026-08-18')).toBe(0)
  })

  test('the chamber day total is the sum of the signed differences', () => {
    const data = buildKdGroups(rows)
    // (10 Aug - 29 Jul) + (22 Aug - 10 Aug) = 12 + 12 = 24.
    expect(data.groups[0]!.totalDays).toBe(24)
  })

  test('a Date value from the driver and an ISO string give the same day count', () => {
    expect(calcDays(new Date('2026-08-04T00:00:00Z'), new Date('2026-08-18T00:00:00Z'))).toBe(
      14,
    )
  })

  test('a Date from the driver prints d-M-y, not its toString', () => {
    // The driver returns SQL date columns as Date at UTC midnight; stringifying
    // it would put "Wed Jul 29 2026 07:00:00 GMT+0700" in the cell.
    const data = buildKdGroups([
      {
        NoRuangKD: 1,
        TglMasuk: new Date('2026-07-29T00:00:00Z'),
        TonIn: 1,
        TglKeluar: new Date('2026-08-10T00:00:00Z'),
        TonOut: 1,
      },
    ])
    const html = renderWith('mutasi-kd', data)
    expect(html).toContain('29-Jul-26')
    expect(html).toContain('10-Agt-26')
    expect(html).not.toContain('GMT')
    expect(html).not.toContain('(Western')
  })

  test('the report renders one table per chamber with a tfoot total', () => {
    const data = buildKdGroups(rows)
    const html = renderWith('mutasi-kd', data)
    expect(html).toContain('No KD : 1')
    expect(html).toContain('No KD : 2')
    expect(html).toContain('24 Hari')
    expect(html.match(/<tfoot>/g)).toHaveLength(2)
  })

  test('no rows at all still renders the empty state', () => {
    expect(renderWith('mutasi-kd', buildKdGroups([]))).toContain('Tidak ada data')
  })
})

describe('Dashboard Sawn Timber', () => {
  const options = {
    columns: {
      inflow: 'Masuk',
      outflow: 'Keluar',
      balance: 'Akhir',
      ctr: 'CTR',
    },
    columnOrder: ['JABON', 'PULAI', 'RAMBUNG - STD'],
    ctrDivisor: 75,
  }

  test('daily movement is summed per Jenis, balance taken from the latest date', () => {
    const data = buildDashboardPivot(
      [
        { DATE: '2026-08-01', Jenis: 'PULAI', Masuk: 5, Keluar: 1, Akhir: 10, CTR: 0.5 },
        { DATE: '2026-08-02', Jenis: 'PULAI', Masuk: 2, Keluar: 3, Akhir: 9, CTR: 0.4 },
      ],
      options,
    )
    expect(data.rows[0]!.cells['PULAI']).toEqual({ in: 5, out: 1 })
    // 10 then 9: the later row wins. Summing the running balance would give 19.
    expect(data.sAkhirByColumn['PULAI']).toBe(9)
  })

  test('the ALL-suffixed columns are not what the dashboard reads', () => {
    // MasukALL and Akhir2 exist in the result and differ from Masuk and Akhir.
    const data = buildDashboardPivot(
      [
        {
          DATE: '2026-08-01',
          Jenis: 'JABON TG',
          Masuk: 5.8728,
          MasukALL: 5.9279,
          Keluar: 2.5669,
          KeluarALL: 2.5669,
          Akhir: 352.2964,
          Akhir2: 11.3644,
          CTR: 0.0048,
        },
      ],
      options,
    )
    expect(data.rows[0]!.cells['JABON TG']).toEqual({ in: 5.8728, out: 2.5669 })
    expect(data.sAkhirByColumn['JABON TG']).toBe(352.2964)
  })

  test('CTR is summed across the period when the column exists', () => {
    const data = buildDashboardPivot(
      [
        { DATE: '2026-08-01', Jenis: 'PULAI', Masuk: 1, Akhir: 10, CTR: 0.10 },
        { DATE: '2026-08-02', Jenis: 'PULAI', Masuk: 1, Akhir: 10, CTR: 0.15 },
      ],
      options,
    )
    expect(data.ctrByColumn['PULAI']).toBeCloseTo(0.25, 10)
  })

  test('CTR falls back to balance / 75, the divisor this dashboard uses', () => {
    const withoutCtr = { ...options, columns: { ...options.columns, ctr: 'CTR' } }
    const data = buildDashboardPivot(
      [{ DATE: '2026-08-01', Jenis: 'PULAI', Masuk: 0, Akhir: 150 }],
      withoutCtr,
    )
    expect(data.ctrByColumn['PULAI']).toBeCloseTo(2, 10)
  })

  test('a Jenis outside the configured order is appended, not dropped', () => {
    const data = buildDashboardPivot(
      [
        { DATE: '2026-08-01', Jenis: 'SEMBARANG', Masuk: 1, Akhir: 1, CTR: 0 },
        { DATE: '2026-08-01', Jenis: 'PULAI', Masuk: 1, Akhir: 1, CTR: 0 },
      ],
      options,
    )
    // Configured types first, then anything extra alphabetically.
    expect(data.columns).toEqual(['PULAI', 'SEMBARANG'])
  })

  test('the report renders the grid, the footer and the total table', () => {
    const data = buildDashboardPivot(
      [
        { DATE: '2026-08-01', Jenis: 'PULAI', Masuk: 5, Keluar: 1, Akhir: 10, CTR: 0.2 },
        { DATE: '2026-08-01', Jenis: 'JABON', Masuk: 3, Keluar: 0, Akhir: 6, CTR: 0.1 },
      ],
      options,
    )
    const html = renderWith('dashboard-sawn-timber', data)
    expect(html).toContain('Laporan Dashboard Sawn Timber')
    expect(html).toContain('S Akhir')
    expect(html).toContain('# Ctr')
    expect(html).toContain('JABON')
  })

  test('an empty period renders the empty table', () => {
    const html = renderWith('dashboard-sawn-timber', buildDashboardPivot([], options))
    expect(html).toContain('Tidak ada data')
  })
})
