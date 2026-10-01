import { describe, expect, test } from 'bun:test'
import {
  S4S_GROUP_LABELS,
  buildS4SDashboardV1,
  buildS4SDashboardV2,
  eachDay,
} from '../src/reports/wps/dashboard-s4s'
import {
  GRADE_KEYS,
  buildGradeAbcData,
  gradeAbcHarianReport,
  normalizeGradeKey,
} from '../src/reports/wps/grade-abc-harian'
import { mainValues } from '../src/reports/wps/mutasi-s4s'
import { alphaLabel, buildLabelData } from '../src/reports/wps/label-s4s-hidup'
import {
  buildRambungData,
  rekapProduksiS4SRambungPerGradeReport,
} from '../src/reports/wps/rekap-produksi-s4s-rambung'
import { buildOutputSections } from '../src/reports/wps/output-produksi-s4s-per-grade'

/**
 * Nine S4S-family reports. What matters in each is the part that silently
 * produces a wrong number rather than a visibly broken one: a whitelist that
 * drops rows, a total that stops matching its rows, a 50,000-row result set
 * that has to be aggregated before it reaches a page.
 */

describe('Dashboard S4S v1', () => {
  test('the five whitelisted groups are always present, even with no data', () => {
    // The procedure returned only one of the five combinations for August 2026.
    // A group with no activity still has to get a column, or the report changes
    // shape depending on when it is run.
    const data = buildS4SDashboardV1([], '2026-08-01', '2026-08-31')
    expect(data.groups.map((g) => g.label)).toEqual([
      'Rambung S4S A/B',
      'Rambung S4S A/C',
      'Rambung S4S C/C',
      'Jabon Nisobo S4S',
      'Pulai Nisobo S4S',
    ])
    expect(S4S_GROUP_LABELS).toHaveLength(5)
  })

  test('a combination outside the whitelist is dropped, not added as a column', () => {
    const data = buildS4SDashboardV1(
      [
        { DATE: '2026-08-01', Jenis: 'JABON', NamaGrade: 'NISOBO', S4SAwal: 1, S4SMasuk: 2, S4SJual: 0, S4SKeluar: 0 },
        { DATE: '2026-08-01', Jenis: 'JABON', NamaGrade: 'BELAH', S4SAwal: 9, S4SMasuk: 9, S4SJual: 9, S4SKeluar: 9 },
      ],
      '2026-08-01',
      '2026-08-31',
    )
    expect(data.groups).toHaveLength(5)
    const nisobo = data.groups.find((g) => g.label === 'Jabon Nisobo S4S')!
    expect(nisobo.akhir).toBeCloseTo(3, 9)
  })

  test('the ending balance is awal + masuk - keluar, not read from the result set', () => {
    // S4SKeluar is the movement column, and S4SJual is added to it; the balance
    // has to be derived because the procedure never returns one for v1.
    const data = buildS4SDashboardV1(
      [
        {
          DATE: '2026-08-01',
          Jenis: 'JABON',
          NamaGrade: 'NISOBO',
          S4SAwal: 10,
          S4SMasuk: 3,
          S4SJual: 1,
          S4SKeluar: 2,
        },
      ],
      '2026-08-01',
      '2026-08-31',
    )
    const group = data.groups.find((g) => g.label === 'Jabon Nisobo S4S')!
    expect(group.keluar).toBeCloseTo(3, 9)
    expect(group.akhir).toBeCloseTo(10 + 3 - 3, 9)
    expect(group.container).toBeCloseTo(group.akhir / 65, 9)
  })

  test('the repeated opening balance resolves to the last non-zero value', () => {
    // The procedure repeats S4SAwal on every row of the period.
    const data = buildS4SDashboardV1(
      [
        { DATE: '2026-08-01', Jenis: 'JABON', NamaGrade: 'NISOBO', S4SAwal: 4, S4SMasuk: 0, S4SJual: 0, S4SKeluar: 0 },
        { DATE: '2026-08-02', Jenis: 'JABON', NamaGrade: 'NISOBO', S4SAwal: 4, S4SMasuk: 1, S4SJual: 0, S4SKeluar: 0 },
        { DATE: '2026-08-03', Jenis: 'JABON', NamaGrade: 'NISOBO', S4SAwal: 7, S4SMasuk: 0, S4SJual: 0, S4SKeluar: 0 },
      ],
      '2026-08-01',
      '2026-08-03',
    )
    const group = data.groups.find((g) => g.label === 'Jabon Nisobo S4S')!
    expect(group.akhir).toBeCloseTo(7 + 1, 9)
  })

  test('every day of the period gets a row, movement or not', () => {
    const data = buildS4SDashboardV1([], '2026-08-01', '2026-08-31')
    expect(data.dates).toHaveLength(31)
    expect(data.dates[0]).toBe('2026-08-01')
    expect(data.dates[30]).toBe('2026-08-31')
  })
})

describe('Dashboard S4S v2', () => {
  test('columns come from the data, so a grade the procedure never sends is absent', () => {
    const data = buildS4SDashboardV2(
      [
        { DATE: '2026-08-01', Jenis: 'JABON', NamaGrade: 'NISOBO', idGrade: 1, S4SMasuk: 1, S4SKeluar: 0, S4SAkhir: 5 },
        { DATE: '2026-08-01', Jenis: 'PULAI', NamaGrade: 'ISOBO', idGrade: 2, S4SMasuk: 2, S4SKeluar: 0, S4SAkhir: 3 },
      ],
      '2026-08-01',
      '2026-08-31',
    )
    expect(data.groups.map((g) => g.label)).toEqual(['JABON NISOBO', 'PULAI ISOBO'])
  })

  test('a Jenis reported under several grade IDs adds up, instead of one overwriting', () => {
    // v2 keys the column by Jenis + NamaGrade and tracks the latest S4SAkhir
    // per idGrade inside it, then sums them. Summing the column directly would
    // only ever keep the last idGrade's balance. Two different NamaGrade values
    // are two different columns, which is the other half of the rule.
    const data = buildS4SDashboardV2(
      [
        { DATE: '2026-08-01', Jenis: 'RAMBUNG', NamaGrade: 'A/B', idGrade: 1, S4SMasuk: 0, S4SKeluar: 0, S4SAkhir: 4 },
        { DATE: '2026-08-01', Jenis: 'RAMBUNG', NamaGrade: 'A/B', idGrade: 2, S4SMasuk: 0, S4SKeluar: 0, S4SAkhir: 6 },
      ],
      '2026-08-01',
      '2026-08-31',
    )
    expect(data.groups).toHaveLength(1)
    expect(data.groups[0]!.akhir).toBeCloseTo(10, 9)
  })

  test('two grade names under one Jenis are two columns, not one sum', () => {
    const data = buildS4SDashboardV2(
      [
        { DATE: '2026-08-01', Jenis: 'RAMBUNG', NamaGrade: 'A/B', idGrade: 1, S4SMasuk: 0, S4SKeluar: 0, S4SAkhir: 4 },
        { DATE: '2026-08-01', Jenis: 'RAMBUNG', NamaGrade: 'A/C', idGrade: 2, S4SMasuk: 0, S4SKeluar: 0, S4SAkhir: 6 },
      ],
      '2026-08-01',
      '2026-08-31',
    )
    expect(data.groups.map((g) => g.label)).toEqual(['RAMBUNG A/B', 'RAMBUNG A/C'])
  })

  test('a row with no Jenis or grade is skipped rather than becoming a blank column', () => {
    // 217 of the 248 rows v1 returned for August carry NULL Jenis/NamaGrade.
    const data = buildS4SDashboardV2(
      [
        { DATE: '2026-08-01', Jenis: null, NamaGrade: null, idGrade: 17, S4SMasuk: 0, S4SKeluar: 0, S4SAkhir: 0 },
        { DATE: '2026-08-01', Jenis: 'JABON', NamaGrade: 'NISOBO', idGrade: 5, S4SMasuk: 1, S4SKeluar: 0, S4SAkhir: 2 },
      ],
      '2026-08-01',
      '2026-08-31',
    )
    expect(data.groups.map((g) => g.label)).toEqual(['JABON NISOBO'])
  })
})

describe('Grade ABC Harian', () => {
  test('the result set is aggregated, not rendered row by row', () => {
    // A month of S4S returns 50,000+ rows: one per date per grade per label.
    const rows = Array.from({ length: 2000 }, (_, i) => ({
      DATE: '2026-08-03',
      NamaGrade: 'GRADE A',
      JmlhBatang: i % 2 === 0 ? 10 : null,
    }))
    const data = buildGradeAbcData(rows, '2026-08-01', '2026-08-31')
    expect(data.days).toHaveLength(31)
    expect(data.days[2]!.cells['GRADE A'].pcs).toBeCloseTo(10000, 9)
  })

  test('a NULL count adds nothing rather than becoming a zero row', () => {
    const data = buildGradeAbcData(
      [{ DATE: '2026-08-01', NamaGrade: 'GRADE A', JmlhBatang: null }],
      '2026-08-01',
      '2026-08-01',
    )
    expect(data.days[0]!.cells['GRADE A'].pcs).toBe(0)
    expect(data.grandTotal).toBe(0)
  })

  test('the percent is a share of that day, not of the whole period', () => {
    const data = buildGradeAbcData(
      [
        { DATE: '2026-08-01', NamaGrade: 'GRADE A', JmlhBatang: 25 },
        { DATE: '2026-08-01', NamaGrade: 'GRADE CC', JmlhBatang: 75 },
        { DATE: '2026-08-02', NamaGrade: 'GRADE A', JmlhBatang: 10 },
      ],
      '2026-08-01',
      '2026-08-02',
    )
    expect(data.days[0]!.cells['GRADE A'].percent).toBeCloseTo(25, 9)
    expect(data.days[0]!.totalPcs).toBeCloseTo(100, 9)
    expect(data.totals['GRADE A'].percent).toBeCloseTo((35 / 110) * 100, 9)
  })

  test('grade names are matched so the longer keys are not swallowed', () => {
    expect(normalizeGradeKey('GRADE AB/AC')).toBe('GRADE AB/AC')
    expect(normalizeGradeKey('GRADE A')).toBe('GRADE A')
    expect(normalizeGradeKey('GRADE CC')).toBe('GRADE CC')
    expect(normalizeGradeKey('GRADE CUT')).toBe('GRADE CUT')
    expect(normalizeGradeKey('BELAH')).toBeNull()
    expect(GRADE_KEYS).toHaveLength(4)
  })

  test('a day with no production is a zero day, not a missing day', () => {
    const data = buildGradeAbcData([], '2026-08-01', '2026-08-03')
    expect(data.days).toHaveLength(3)
    expect(data.days[1]!.totalPcs).toBe(0)
    expect(data.days[1]!.cells['GRADE A'].percent).toBe(0)
  })
})

describe('Grade ABC Harian percent column', () => {
  const meta = {
    requestedBy: 'Garda',
    generatedAt: new Date('2026-09-29T03:00:00Z'),
    params: { tglAwal: '2026-08-01', tglAkhir: '2026-08-02' },
  }
  const render = (rows: Array<Record<string, unknown>>): string =>
    gradeAbcHarianReport.render(buildGradeAbcData(rows, '2026-08-01', '2026-08-02'), meta).html

  test('a real share prints two decimals then a percent sign', () => {
    const html = render([
      { DATE: '2026-08-01', NamaGrade: 'GRADE A', JmlhBatang: 1 },
      { DATE: '2026-08-01', NamaGrade: 'GRADE CC', JmlhBatang: 1 },
    ])
    expect(html).toContain('50.00 %')
  })

  test('a zero share prints nothing, like the piece count beside it', () => {
    // A day with no production used to print 0.0 in the percent column while
    // the piece count beside it stayed blank, which read as a broken cell.
    const html = render([])
    expect(html).not.toContain('0.00 %')
    expect(html).not.toContain('0.0%')
  })

  test('the Total row uses the same two-decimal format', () => {
    // Day 1 splits 50/50, day 2 is all Grade A, so the period is 4 of 5.
    // The daily rows and the Total row therefore differ, and both have to
    // carry the same formatting.
    const html = render([
      { DATE: '2026-08-01', NamaGrade: 'GRADE A', JmlhBatang: 1 },
      { DATE: '2026-08-01', NamaGrade: 'GRADE CC', JmlhBatang: 1 },
      { DATE: '2026-08-02', NamaGrade: 'GRADE A', JmlhBatang: 3 },
    ])
    expect(html).toContain('50.00 %')
    expect(html).toContain('100.00 %')
    expect(html).toContain('80.00 %')
    expect(html).toContain('20.00 %')
  })

  test('no cell prints a percentage sign without the space', () => {
    const html = render([{ DATE: '2026-08-01', NamaGrade: 'GRADE A', JmlhBatang: 5 }])
    expect(html).not.toMatch(/\d\.\d\d%/u)
  })
})

describe('Mutasi S4S', () => {
  test('total masuk adds the four incoming columns', () => {
    const values = mainValues({
      Jenis: 'X',
      S4SAwal: null,
      S4SMasuk: null,
      AdjOutputS4S: 1,
      BSOutputS4S: 2,
      ProdOutputS4S: 3,
      CCAProdOutputS4S: 4,
      AdjInputS4S: null,
      BsInputS4S: null,
      FJinputS4S: null,
      MldInputS4S: null,
      S4SInputS4S: null,
      JualS4S: null,
      AkhirS4S: null,
    })
    expect(values.totalMasuk).toBeCloseTo(10, 9)
  })

  test('S4SMasuk stands in for ProdOutput when that is the only figure', () => {
    // The legacy blade fell back to S4SMasuk; a production that reports only the
    // direct figure would otherwise show nothing under "Prod Out S4S".
    const values = mainValues({
      Jenis: 'X',
      S4SAwal: null,
      S4SMasuk: 7,
      AdjOutputS4S: null,
      BSOutputS4S: null,
      ProdOutputS4S: null,
      CCAProdOutputS4S: null,
      AdjInputS4S: null,
      BsInputS4S: null,
      FJinputS4S: null,
      MldInputS4S: null,
      S4SInputS4S: null,
      JualS4S: null,
      AkhirS4S: null,
    })
    expect(values.prodOut).toBeCloseTo(7, 9)
  })

  test('total keluar adds the six outgoing columns', () => {
    const values = mainValues({
      Jenis: 'X',
      S4SAwal: null,
      S4SMasuk: null,
      AdjOutputS4S: null,
      BSOutputS4S: null,
      ProdOutputS4S: null,
      CCAProdOutputS4S: null,
      AdjInputS4S: 1,
      BsInputS4S: 1,
      JualS4S: 1,
      FJinputS4S: 1,
      MldInputS4S: 1,
      S4SInputS4S: 1,
      AkhirS4S: null,
    })
    expect(values.totalKeluar).toBeCloseTo(6, 9)
  })

  test('a row with every column NULL is still a row, not a dropped one', () => {
    const values = mainValues({
      Jenis: 'X',
      S4SAwal: null, S4SMasuk: null, AdjOutputS4S: null, BSOutputS4S: null,
      ProdOutputS4S: null, CCAProdOutputS4S: null, AdjInputS4S: null,
      BsInputS4S: null, FJinputS4S: null, MldInputS4S: null, S4SInputS4S: null,
      JualS4S: null, AkhirS4S: null,
    })
    expect(values.totalMasuk).toBe(0)
    expect(values.totalKeluar).toBe(0)
  })
})

describe('Label S4S hidup', () => {
  const row = (over: Record<string, unknown>) => ({
    Jenis: 'JABON',
    NamaGrade: 'A/A',
    Tebal: 35,
    Lebar: 35,
    Panjang: 1000,
    JmlhBatang: 1054,
    Kubik: 1.2911,
    ...over,
  })

  test('Jenis are lettered in alphabetical order', () => {
    const data = buildLabelData([row({ Jenis: 'RAMBUNG' }), row({ Jenis: 'JABON' })], false)
    expect(data.jenis.map((j) => j.label)).toEqual(['A. JABON', 'B. RAMBUNG'])
  })

  test('the letter wraps past Z rather than running off the alphabet', () => {
    expect(alphaLabel(0)).toBe('A')
    expect(alphaLabel(25)).toBe('Z')
    expect(alphaLabel(26)).toBe('A')
  })

  test('rows are ordered by grade then by dimension, not by database order', () => {
    const data = buildLabelData(
      [
        row({ NamaGrade: 'C/C', Tebal: 30 }),
        row({ NamaGrade: 'A/A', Tebal: 70 }),
        row({ NamaGrade: 'A/A', Tebal: 30 }),
      ],
      false,
    )
    expect(data.jenis[0]!.groups[0]!.rows.map((r) => `${r.grade}/${r.tebal}`)).toEqual([
      'A/A/30',
      'A/A/70',
      'C/C/30',
    ])
  })

  test('the detail totals come from JmlhBatang, not the legacy Pcs column', () => {
    // The legacy summary read a `Pcs` key the procedure never returns, so every
    // summary figure printed as zero.
    const data = buildLabelData([row({}), row({ JmlhBatang: 46, Kubik: 0.0482 })], false)
    expect(data.jenis[0]!.totalBatang).toBe(1100)
    expect(data.jenis[0]!.totalKubik).toBeCloseTo(1.3393, 6)
    expect(data.summary[0]!.batang).toBe(1100)
    expect(data.summary[0]!.kubik).toBeCloseTo(1.3393, 6)
  })

  test('the per-jenis summary lists one row per grade', () => {
    const data = buildLabelData(
      [row({ NamaGrade: 'A/A' }), row({ NamaGrade: 'BELAH' }), row({ NamaGrade: 'A/A' })],
      false,
    )
    expect(data.summary.map((r) => r.detail)).toEqual(['A/A', 'BELAH'])
    // Only the first row spans. A non-zero span on the continuation row emits a
    // second overlapping cell, which the browser then pushes out of the table.
    expect(data.summary.map((r) => r.jenisSpan)).toEqual([2, 0])
    expect(data.summary[0]!.batang).toBe(2108)
  })

  test('a NULL product becomes a bare prefix and sorts ahead of named ones', () => {
    // 80 of the 96 live rows carry no Produk at all, so this is the common case
    // rather than an edge case.
    const data = buildLabelData(
      [row({ Produk: 'ISOBO 40' }), row({ Produk: null }), row({ Produk: 'FJLB JEPANG 25' })],
      true,
    )
    expect(data.jenis[0]!.groups.map((g) => g.label)).toEqual([
      'A1.',
      'A2. FJLB JEPANG 25',
      'A3. ISOBO 40',
    ])
  })

  test('product numbering is per Jenis, so a second Jenis restarts at A1', () => {
    const data = buildLabelData(
      [
        row({ Jenis: 'JABON', Produk: 'ISOBO 40' }),
        row({ Jenis: 'JABON', Produk: null }),
        row({ Jenis: 'RAMBUNG', Produk: null }),
        row({ Jenis: 'RAMBUNG', Produk: 'LAKU' }),
      ],
      true,
    )
    expect(data.jenis[0]!.groups.map((g) => g.label)).toEqual(['A1.', 'A2. ISOBO 40'])
    expect(data.jenis[1]!.groups.map((g) => g.label)).toEqual(['B1.', 'B2. LAKU'])
  })

  test('the per-produk summary spans the Jenis across its product rows', () => {
    const data = buildLabelData(
      [
        row({ Jenis: 'JABON', Produk: null, JmlhBatang: 10 }),
        row({ Jenis: 'JABON', Produk: 'ISOBO 40', JmlhBatang: 20 }),
        row({ Jenis: 'PULAI', Produk: null, JmlhBatang: 5 }),
      ],
      true,
    )
    expect(data.summary).toHaveLength(3)
    // JABON spans its two products, PULAI its one, and the row after a Jenis
    // carries no cell of its own.
    expect(data.summary.map((r) => r.jenisSpan)).toEqual([2, 0, 1])
    expect(data.summary.map((r) => r.detail)).toEqual(['A1.', 'A2. ISOBO 40', 'B1.'])
    expect(data.summary.reduce((sum, r) => sum + r.batang, 0)).toBe(35)
  })

  test('a missing Jenis or grade does not collapse rows into one bucket', () => {
    const data = buildLabelData(
      [row({ Jenis: null }), row({ Jenis: null, NamaGrade: null })],
      false,
    )
    expect(data.jenis).toHaveLength(1)
    expect(data.jenis[0]!.groups[0]!.rows).toHaveLength(2)
  })

  test('an empty result set produces no sections at all', () => {
    const data = buildLabelData([], false)
    expect(data.jenis).toEqual([])
    expect(data.summary).toEqual([])
  })
})

describe('Rekap Produksi S4S Rambung Per Grade', () => {
  const row = (over: Record<string, unknown>) => ({
    Group: 'S4S',
    Type: 'Output',
    Tanggal: '2026-08-03',
    Jenis: 'A/B',
    Total: 12.4313,
    GrandTotalPerGroup: 18.1834,
    RatioDecimal: 0.6837,
    Ratio: 68.3662,
    ...over,
  })

  test('Input and Output become separate column sets', () => {
    const data = buildRambungData([
      row({ Type: 'Output' }),
      row({ Type: 'Input', Jenis: 'A/B', Total: 30, Ratio: 55 }),
    ])
    expect(data.inputGrades).toEqual(['A/B'])
    expect(data.outputGrades).toEqual(['A/B'])
    expect(data.rows).toHaveLength(1)
    expect(data.totals.input[0]!.total).toBeCloseTo(30, 9)
    expect(data.totals.output[0]!.total).toBeCloseTo(12.4313, 6)
  })

  test('the ratio is the procedure own figure, not total over the group total', () => {
    // GrandTotalPerGroup is per group, so dividing Total by it would give a
    // different number from the one the procedure reported.
    const data = buildRambungData([row({})])
    expect(data.rows[0]!.output[0]!.ratio).toBeCloseTo(68.3662, 6)
  })

  test('a date missing from one side leaves that side blank, not zero-filled', () => {
    const data = buildRambungData([
      row({ Tanggal: '2026-08-03', Jenis: 'A/B' }),
      row({ Tanggal: '2026-08-03', Jenis: 'C/C', Type: 'Input', Total: 5, Ratio: 50 }),
      row({ Tanggal: '2026-08-04', Jenis: 'A/B' }),
    ])
    expect(data.rows).toHaveLength(2)
    // A/B has no Input line on the 4th, so that cell is empty rather than 0.00.
    const fourth = data.rows.find((r) => r.date === '2026-08-04')!
    const aIndex = data.outputGrades.indexOf('A/B')
    const inAIndex = data.inputGrades.indexOf('A/B')
    expect(fourth.output[aIndex]!.total).toBeCloseTo(12.4313, 6)
    expect(inAIndex).toBe(-1)
  })
})

describe('Rekap Produksi S4S Rambung Per Grade totals', () => {
  const row = (over: Record<string, unknown>) => ({
    Group: 'S4S',
    Type: 'Output',
    Tanggal: '2026-08-03',
    Jenis: 'A/B',
    Total: 12.4313,
    GrandTotalPerGroup: 18.1834,
    RatioDecimal: 0.6837,
    Ratio: 68.3662,
    ...over,
  })

  test('the Total row ratio is each grade share of the period, not a sum of the daily ratios', () => {
    // open-api-report computes the footer as total / periodGrand * 100, so each
    // side adds up to 100%. Summing the daily percentages instead would give
    // 109.5662% for these two days, which is a share of nothing - each day's
    // ratio is relative to that day's own group total.
    const data = buildRambungData([
      row({ Tanggal: '2026-08-03', Total: 12.4313, Ratio: 68.3662 }),
      row({ Tanggal: '2026-08-04', Total: 4.5, Ratio: 41.2 }),
      row({ Tanggal: '2026-08-03', Jenis: 'BELAH', Total: 3.5, Ratio: 31.6338 }),
      row({ Tanggal: '2026-08-04', Jenis: 'BELAH', Total: 1, Ratio: 58.8 }),
    ])
    const grand = 12.4313 + 4.5 + 3.5 + 1
    const sum = data.totals.output.reduce((acc, cell) => acc + cell.ratio, 0)
    expect(sum).toBeCloseTo(100, 6)
    expect(data.totals.output[0]!.ratio).toBeCloseTo((16.9313 / grand) * 100, 6)
    expect(data.totals.output[1]!.ratio).toBeCloseTo((4.5 / grand) * 100, 6)
  })

  test('the Total row still sums the figures alongside it', () => {
    const data = buildRambungData([
      row({ Tanggal: '2026-08-03', Total: 12.4313 }),
      row({ Tanggal: '2026-08-04', Total: 4.5 }),
    ])
    expect(data.totals.output[0]!.total).toBeCloseTo(16.9313, 6)
  })
})

describe('Rekap Produksi S4S Rambung Per Grade percent column', () => {
  const meta = {
    requestedBy: 'Garda',
    generatedAt: new Date('2026-09-29T03:00:00Z'),
    params: { tglAwal: '2026-08-01', tglAkhir: '2026-08-02' },
  }
  const render = (rows: Array<Record<string, unknown>>): string =>
    rekapProduksiS4SRambungPerGradeReport.render(buildRambul(rows), meta).html
  const buildRambul = (rows: Array<Record<string, unknown>>) =>
    buildRambungData(rows)

  test('a ratio prints two decimals then a percent sign', () => {
    const html = render([
      {
        Group: 'S4S',
        Type: 'Output',
        Tanggal: '2026-08-03',
        Jenis: 'A/B',
        Total: 12.4313,
        GrandTotalPerGroup: 18.1834,
        Ratio: 1.23,
      },
    ])
    expect(html).toContain('1.23 %')
  })

  test('the Total row prints the period share in the same two-decimal format', () => {
    const html = render([
      {
        Group: 'S4S', Type: 'Output', Tanggal: '2026-08-03',
        Jenis: 'A/B', Total: 3, GrandTotalPerGroup: 4, Ratio: 75,
      },
      {
        Group: 'S4S', Type: 'Output', Tanggal: '2026-08-03',
        Jenis: 'C/C', Total: 1, GrandTotalPerGroup: 4, Ratio: 25,
      },
    ])
    // A/B is 3 of the 4 m3 produced over the period.
    expect(html).toContain('75.00 %')
    expect(html).toContain('25.00 %')
  })

  test('the Total Input / Total Output summary table is gone', () => {
    // It repeated two numbers that were already in the footer's Total columns
    // and could not be reconciled with them.
    const html = render([
      {
        Group: 'S4S', Type: 'Output', Tanggal: '2026-08-03',
        Jenis: 'A/B', Total: 3, GrandTotalPerGroup: 4, Ratio: 75,
      },
    ])
    expect(html).not.toContain('Total Input')
    expect(html).not.toContain('Total Output')
    expect(html).not.toContain('summary-table')
  })

  test('a zero ratio prints nothing', () => {
    const html = render([
      {
        Group: 'S4S', Type: 'Output', Tanggal: '2026-08-03',
        Jenis: 'A/B', Total: 1, GrandTotalPerGroup: 2, Ratio: 0,
      },
    ])
    // Scoped to the data row on purpose. The footer's share of a single-grade
    // period is 100.00%, and "100.00 %" contains the substring "0.00 %", so a
    // document-wide check for that substring fails on a correct render.
    const dataRow = html.match(/<tr class="data-row[^"]*">[\s\S]*?<\/tr>/)![0]!
    expect(dataRow).not.toContain('%')
  })
})

describe('Output Produksi S4S Per Grade', () => {
  const one = (over: Record<string, unknown>) => ({
    NamaMesin: 'S4S LINE 1',
    Tanggal: '2026-08-01',
    Jns: 'RAMBUNG',
    Jenis: 'A/B',
    Target: 20,
    Output: 2,
    ...over,
  })
  const gradesOf = (machine: { groups: Array<{ jns: string; grades: string[] }> }, jns: string): string[] =>
    machine.groups.find((g) => g.jns === jns)!.grades

  test('the column layout is fixed, so a grade with no output still gets a column', () => {
    // Only RAMBUNG A/B appears in the data, but the report still has to print
    // the full column set, or the page changes shape depending on the period.
    const [machine] = buildOutputSections([one({})], '2026-08-01', '2026-08-31')
    expect(machine!.groups.map((g) => g.jns)).toEqual(['JABON', 'JABON TG', 'PULAI', 'RAMBUNG'])
    expect(gradesOf(machine!, 'RAMBUNG')).toEqual([
      'BELAH',
      'MISS TEBAL',
      'A/A',
      'A/B',
      'A/C',
      'C/C',
    ])
    expect(gradesOf(machine!, 'JABON')).toEqual([
      'BELAH',
      'MISS TEBAL',
      'A/A',
      'ISOBO',
      'NISOBO',
    ])
  })

  test('a grade the layout does not know is appended rather than dropped', () => {
    const [machine] = buildOutputSections(
      [one({ Jns: 'JABON TG', Jenis: 'ISTIWAH' })],
      '2026-08-01',
      '2026-08-01',
    )
    expect(gradesOf(machine!, 'JABON TG')).toEqual(['A/A', 'ISTIWAH'])
  })

  test('the Multi Ripsaw has its own grade composition', () => {
    const [machine] = buildOutputSections(
      [one({ NamaMesin: 'MULTI RIPSAW', Jns: 'JABON', Jenis: 'MISS TEBAL', Target: 3 })],
      '2026-08-01',
      '2026-08-01',
    )
    // MISS TEBAL is not in the Ripsaw layout, so it lands after the fixed four.
    expect(gradesOf(machine!, 'JABON')).toEqual([
      'BELAH',
      'A/A',
      'ISOBO',
      'NISOBO',
      'MISS TEBAL',
    ])
    expect(gradesOf(machine!, 'RAMBUNG')).toEqual(['BELAH', 'A/B', 'A/C', 'C/C'])
  })

  test('the percent is the grade share of its own Jns total', () => {
    const [machine] = buildOutputSections(
      [
        one({ Output: 3 }),
        one({ Jenis: 'A/C', Output: 1 }),
        one({ Jns: 'JABON', Jenis: 'ISOBO', Output: 100 }),
      ],
      '2026-08-01',
      '2026-08-01',
    )
    const row = machine!.rows[0]!
    const rambung = row.cells.get('RAMBUNG')!
    expect(rambung.get('A/B')!.percent).toBeCloseTo(75, 9)
    expect(rambung.get('A/C')!.percent).toBeCloseTo(25, 9)
    // JABON's only grade is 100% of JABON, even though it is not 100% of the
    // machine. Dividing by the machine total would print 96.2% here.
    expect(row.cells.get('JABON')!.get('ISOBO')!.percent).toBeCloseTo(100, 9)
    expect(row.grandTotal).toBeCloseTo(104, 9)
  })

  test('Avg, Min and Max ignore the days with no production', () => {
    const [machine] = buildOutputSections(
      [
        one({ Tanggal: '2026-08-01', Output: 2 }),
        one({ Tanggal: '2026-08-03', Output: 4 }),
      ],
      '2026-08-01',
      '2026-08-03',
    )
    const at = (label: string): number =>
      machine!.summary.find((s) => s.label === label)!.row.cells.get('RAMBUNG')!.get('A/B')!.value
    expect(at('Total')).toBeCloseTo(6, 9)
    // Two producing days out of three, so 6/2. Averaging over all three days
    // would report 2.0 and make every average look like a shortfall.
    expect(at('Avg')).toBeCloseTo(3, 9)
    expect(at('Min')).toBeCloseTo(2, 9)
    expect(at('Max')).toBeCloseTo(4, 9)
  })

  test('every day of the period gets a row, production or not', () => {
    const [machine] = buildOutputSections(
      [one({ Tanggal: '2026-08-01' })],
      '2026-08-01',
      '2026-08-03',
    )
    expect(machine!.rows.map((r) => r.date)).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
    ])
    expect(machine!.rows[1]!.grandTotal).toBe(0)
  })

  test('the default target is the first non-zero target reported', () => {
    const [machine] = buildOutputSections(
      [
        one({ Tanggal: '2026-08-01', Target: null }),
        one({ Tanggal: '2026-08-02', Target: 0 }),
        one({ Tanggal: '2026-08-03', Target: 20, Output: 5 }),
      ],
      '2026-08-01',
      '2026-08-03',
    )
    expect(machine!.targetDefault).toBe(20)
    expect(machine!.rows[0]!.target).toBe(0)
    expect(machine!.rows[2]!.target).toBe(20)
  })

  test('two rows on the same day and grade add up', () => {
    const [machine] = buildOutputSections(
      [one({ Output: 1.5 }), one({ Output: 2.5 })],
      '2026-08-01',
      '2026-08-01',
    )
    expect(machine!.rows[0]!.grandTotal).toBeCloseTo(4, 9)
  })

  test('a row with no Jns or grade still registers its machine', () => {
    const sections = buildOutputSections(
      [{ NamaMesin: 'CROSSCUT AKHIR', Tanggal: '2026-08-01', Jns: null, Jenis: null, Target: 5, Output: null }],
      '2026-08-01',
      '2026-08-01',
    )
    expect(sections.map((s) => s.machine)).toEqual(['CROSSCUT AKHIR'])
    expect(sections[0]!.rows[0]!.grandTotal).toBe(0)
    expect(sections[0]!.targetDefault).toBe(5)
  })
})

describe('eachDay', () => {
  test('crosses a month boundary and includes both ends', () => {
    expect(eachDay('2026-08-30', '2026-09-02')).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
    ])
  })

  test('a reversed range yields nothing rather than looping forever', () => {
    expect(eachDay('2026-08-31', '2026-08-01')).toEqual([])
  })
})
