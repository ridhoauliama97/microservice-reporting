import { describe, expect, test } from 'bun:test'
import { reports } from '../src/reports/registry'
import { buildBahanCategories } from '../src/reports/wps/bahan-yang-dihasilkan'
import { buildBongkarCategories } from '../src/reports/wps/rangkuman-bongkar-susun'
import {
  buildLabelInputGroups,
  processRank,
} from '../src/reports/wps/rangkuman-jumlah-label-input'
import {
  buildNyangkutGroups,
  resolveTotalUnit,
} from '../src/reports/wps/label-nyangkut'
import {
  buildCapacity,
  buildKapasitasData,
} from '../src/reports/wps/kapasitas-racip-kayu-bulat-hidup'

/**
 * Six reports ported from open-api-report. What each case protects is the
 * arithmetic and the ordering, because those are the parts that produce a
 * plausible-looking wrong number: a capacity division by zero, a Rendemen of
 * Infinity, a process sorted alphabetically instead of by production order, or
 * a ton figure measured in m3.
 */

const PERIOD = { tglAwal: '2026-08-01', tglAkhir: '2026-08-31' }
const ASOF = { tglAkhir: '2026-08-01' }

type Meta = { requestedBy: string; generatedAt: Date; params: unknown }
type Definition = {
  render: (data: never, meta: Meta) => { html: string }
}

const renderWith = <T,>(type: string, data: T, params: unknown): string =>
  (reports[type] as unknown as Definition).render(data as never, {
    requestedBy: 'budi',
    generatedAt: new Date('2026-09-01T08:00:00Z'),
    params,
  }).html

describe('registry and parameter shapes', () => {
  test('all six reports are registered', () => {
    for (const type of [
      'bahan-terpakai',
      'bahan-yang-dihasilkan',
      'label-nyangkut',
      'rangkuman-bongkar-susun',
      'rangkuman-jumlah-label-input',
      'kapasitas-racip-kayu-bulat-hidup',
    ]) {
      expect(Object.keys(reports)).toContain(type)
    }
  })

  test('Label Nyangkut takes no params and rejects a period', () => {
    const schema = reports['label-nyangkut']!.paramsSchema
    expect(schema.safeParse({}).success).toBe(true)
    expect(schema.safeParse(PERIOD).success).toBe(false)
  })

  test('the three single-date reports bind one date', () => {
    for (const type of [
      'bahan-terpakai',
      'bahan-yang-dihasilkan',
      'rangkuman-bongkar-susun',
    ]) {
      const schema = reports[type]!.paramsSchema
      expect(schema.safeParse(ASOF).success).toBe(true)
      expect(schema.safeParse({}).success).toBe(false)
    }
  })

  test('only the label input report and the capacity report take a range', () => {
    for (const type of [
      'rangkuman-jumlah-label-input',
      'kapasitas-racip-kayu-bulat-hidup',
    ]) {
      expect(reports[type]!.paramsSchema.safeParse(PERIOD).success).toBe(true)
    }
  })
})

describe('Bahan Terpakai', () => {
  const rows = [
    { Group: 'PROSES CCAKHIR', NamaMesin: 'CROSSCUT AKHIR', Jenis: 'LMT RAMBUNG C/C', Tebal: 25, Lebar: 60, Panjang: 1960, JmlhBatang: 132, KubikIN: 1.8679 },
    { Group: 'PROSES CCAKHIR', NamaMesin: 'DOUBLE END CUTTER', Jenis: 'LMT RAMBUNG C/C', Tebal: 14, Lebar: 1220, Panjang: 2500, JmlhBatang: 8, KubikIN: 0.3416 },
  ]
  const subRows = [
    { Group: 'PROSES S4S', NamaMesin: 'S4S LINE 1', Jenis: 'KB RAMBUNG', Tebal: 20, Lebar: 100, Ton: 10 },
  ]

  test('the sub report leads the page, with its m3 column derived from Ton', () => {
    const html = renderWith('bahan-terpakai', { rows, subRows }, ASOF)
    const subAt = html.indexOf('KB RAMBUNG')
    const mainAt = html.indexOf('LMT RAMBUNG C/C')
    expect(subAt).toBeGreaterThan(-1)
    expect(mainAt).toBeGreaterThan(-1)
    expect(subAt).toBeLessThan(mainAt)
    // 10 ton x 1.416 = 14.16 m3.
    expect(html).toContain('14.1600')
  })

  test('the group total multiplies the Ton total, not one row', () => {
    const html = renderWith(
      'bahan-terpakai',
      { rows, subRows: [{ ...subRows[0]! }, { ...subRows[0]!, Ton: 5 }] },
      ASOF,
    )
    // 10 + 5 = 15 ton, 15 x 1.416 = 21.24 m3.
    expect(html).toContain('15.0000')
    expect(html).toContain('21.2400')
  })

  test('a missing sub report leaves only the m3 tables', () => {
    const html = renderWith('bahan-terpakai', { rows, subRows: [] }, ASOF)
    expect(html).toContain('CROSSCUT AKHIR')
    expect(html).not.toContain('14.1600')
  })

  test('the subtitle reads "Per Tanggal", not a period', () => {
    const html = renderWith('bahan-terpakai', { rows, subRows: [] }, ASOF)
    expect(html).toContain('Per Tanggal : 01-Agt-2026')
    expect(html).not.toContain('s/d')
  })

  test('no rows at all still renders the empty state', () => {
    expect(
      renderWith('bahan-terpakai', { rows: [], subRows: [] }, ASOF),
    ).toContain('Tidak ada data')
  })
})

describe('Bahan Yang Dihasilkan', () => {
  const rows = [
    { Group: 'PROSES PCK', NamaMesin: 'PACKING', Jenis: 'BJ RAMBUNG', JmlhBatang: 10, KubikIN: 1.0 },
    { Group: 'PROSES S4S', NamaMesin: 'S4S LINE 1', Jenis: 'ST RAMBUNG', JmlhBatang: 20, KubikIN: 2.0 },
    { Group: 'PROSES FJ', NamaMesin: 'FINGER JOINT 1', Jenis: 'MLD RAMBUNG', JmlhBatang: 30, KubikIN: 3.0 },
    { Group: 'PROSES LAIN', NamaMesin: 'X', Jenis: 'Y', JmlhBatang: 40, KubikIN: 4.0 },
  ]

  const data = buildBahanCategories(rows)

  test('processes come in production order, not alphabetical', () => {
    // The reference CATEGORY_ORDER is S4S, FJ, MLD, LMT, CCAKHIR, SND, PCK.
    expect(data.categories.map((c) => c.name)).toEqual([
      'PROSES S4S',
      'PROSES FJ',
      'PROSES PCK',
      'PROSES LAIN',
    ])
    expect(data.categories.map((c) => c.no)).toEqual([1, 2, 3, 4])
  })

  test('an unknown process is appended, not dropped', () => {
    expect(data.categories.some((c) => c.name === 'PROSES LAIN')).toBe(true)
  })

  test('the grand totals are the sum of the process totals', () => {
    expect(data.grandRowCount).toBe(4)
    expect(data.grandPcs).toBe(100)
    expect(data.grandVolume).toBeCloseTo(10, 8)
  })

  test('the Rangkuman table lists every process with its row count', () => {
    const html = renderWith('bahan-yang-dihasilkan', data, ASOF)
    expect(html).toContain('Rangkuman')
    expect(html).toContain('Grand Total')
    expect(html).toContain('Per-Tanggal 01-Agt-2026')
  })

  test('a dimension of zero prints a dash, not a blank', () => {
    const withZero = buildBahanCategories([
      { Group: 'PROSES S4S', NamaMesin: 'S4S', Jenis: 'X', Tebal: 0, Lebar: null, Panjang: null, JmlhBatang: 1, KubikIN: 1 },
    ])
    const html = renderWith('bahan-yang-dihasilkan', withZero, ASOF)
    expect(html).toContain('>-</td>')
  })

  test('no rows at all still renders the empty state', () => {
    expect(
      renderWith('bahan-yang-dihasilkan', buildBahanCategories([]), ASOF),
    ).toContain('Tidak ada data')
  })
})

describe('Rangkuman Bongkar Susun', () => {
  const rows = [
    { Category: 'SND', NoBongkarSusun: 'Z.9', Jenis: 'RAMBUNG', InA: 5, OutA: 4 },
    { Category: 'S4S', NoBongkarSusun: 'Z.1', Jenis: 'JABON', InA: 2, OutA: 1 },
    { Category: 'S4S', NoBongkarSusun: 'Z.2', Jenis: 'PULAI', InA: 3, OutA: 2 },
  ]

  const data = buildBongkarCategories(rows)

  test('categories come in the reference order, S4S before SND', () => {
    expect(data.categories.map((c) => c.name)).toEqual(['S4S', 'SND'])
  })

  test('a category total is the sum of its own rows', () => {
    expect(data.categories[0]!.totalIn).toBe(5)
    expect(data.categories[0]!.totalOut).toBe(3)
    expect(data.categories[1]!.totalIn).toBe(5)
  })

  test('In and Out are never added together', () => {
    // 2 + 3 + 5 = 10 in and 1 + 2 + 4 = 7 out. A combined 17 would be the
    // meaningless figure: the difference between the two is the point.
    expect(data.grandIn).toBe(10)
    expect(data.grandOut).toBe(7)
    const html = renderWith('rangkuman-bongkar-susun', data, ASOF)
    const grand = html
      .match(/<tr class="total-row totals-row">[\s\S]*?<\/tr>/g)!
      .find((row) => row.includes('Grand Total'))!
    expect(grand).toContain('10.0000')
    expect(grand).toContain('7.0000')
    expect(grand).not.toContain('17.0000')
  })

  test('the row count in Rangkuman is rows, not categories', () => {
    expect(data.grandRowCount).toBe(3)
    const html = renderWith('rangkuman-bongkar-susun', data, ASOF)
    expect(html).toContain('Rangkuman')
    expect(html).toContain('Grand Total')
  })

  test('an empty category is filed under LAINNYA, not dropped', () => {
    const withBlank = buildBongkarCategories([
      { Category: '', NoBongkarSusun: 'Z.1', Jenis: 'X', InA: 1, OutA: 1 },
    ])
    expect(withBlank.categories.map((c) => c.name)).toEqual(['LAINNYA'])
  })

  test('no rows at all still renders the empty state', () => {
    expect(
      renderWith('rangkuman-bongkar-susun', buildBongkarCategories([]), ASOF),
    ).toContain('Tidak ada data')
  })
})

describe('Rangkuman Jumlah Label Input', () => {
  const rows = [
    { Group: 'PROSES PCK', NoProduksi: 'VB.1', NamaMesin: 'PACKING', LabelIn: '(1) BJ', KubikIN: 10, LabelOut: 9, KubikOut: 8 },
    { Group: 'PROSES S4S', NoProduksi: 'VA.2', NamaMesin: 'S4S LINE 1', LabelIn: '(2) ST', KubikIN: 4, LabelOut: 2, KubikOut: 1 },
    { Group: 'PROSES CCAKHIR', NoProduksi: 'VA.1', NamaMesin: 'CROSSCUT', LabelIn: '(3) LMT', KubikIN: 6, LabelOut: 3, KubikOut: 3 },
  ]

  const data = buildLabelInputGroups(rows)

  test('processRank maps the procedure names onto the reference order', () => {
    expect(processRank('PROSES S4S')).toBe(0)
    expect(processRank('PROSES FJ')).toBe(1)
    expect(processRank('PROSES CCAKHIR')).toBe(4)
    expect(processRank('PROSES PACK')).toBe(6)
    expect(processRank('PROSES APA')).toBe(7)
  })

  test('groups are ordered by production sequence, not alphabetically', () => {
    expect(data.groups.map((g) => g.name)).toEqual([
      'PROSES S4S',
      'PROSES CCAKHIR',
      'PROSES PCK',
    ])
  })

  test('Rendemen is output over input, as a percentage', () => {
    const s4s = data.groups[0]!.rows[0]!
    expect(s4s.Rendemen).toBeCloseTo(25, 8)
    const html = renderWith('rangkuman-jumlah-label-input', data, PERIOD)
    expect(html).toContain('25.0%')
    expect(html).toContain('50.0%')
  })

  test('a zero or missing input leaves Rendemen blank, not 0% or Infinity', () => {
    const edge = buildLabelInputGroups([
      { Group: 'PROSES S4S', NoProduksi: 'A', NamaMesin: 'M', LabelIn: '', KubikIN: 0, LabelOut: 5, KubikOut: 3 },
      { Group: 'PROSES S4S', NoProduksi: 'B', NamaMesin: 'M', LabelIn: '', KubikIN: null, LabelOut: null, KubikOut: null },
    ])
    expect(edge.groups[0]!.rows[0]!.Rendemen).toBeNull()
    expect(edge.groups[0]!.rows[1]!.Rendemen).toBeNull()
    const html = renderWith('rangkuman-jumlah-label-input', edge, PERIOD)
    expect(html).not.toContain('Infinity')
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('0.0%')
  })

  test('the header labels are the readable ones, not the column names', () => {
    const html = renderWith('rangkuman-jumlah-label-input', data, PERIOD)
    expect(html).toContain('Nomor Produksi')
    expect(html).toContain('Kubik In')
    expect(html).toContain('Rendemen')
  })

  test('there is no totals row, and the group is not repeated as a column', () => {
    const html = renderWith('rangkuman-jumlah-label-input', data, PERIOD)
    expect(html).not.toContain('Grand Total')
    // The Group column became the table heading.
    expect(html.match(/<th[^>]*>Group<\/th>/)).toBeNull()
  })

  test('no rows at all still renders the empty state', () => {
    expect(
      renderWith('rangkuman-jumlah-label-input', buildLabelInputGroups([]), PERIOD),
    ).toContain('Tidak ada data')
  })
})

describe('Label Nyangkut', () => {
  const rows = [
    { NoNyangkut: 'GC.2', NoLabel: 'E.2', Jenis: 'BJ RAMBUNG', Tebal: 33, Lebar: 1100, Panjang: 4500, JmlhBatang: 6, Description: 'A31', Ket: 'BJ', Total: 0.01 },
    { NoNyangkut: 'GC.1', NoLabel: 'E.1', Jenis: 'ST RAMBUNG', Tebal: 31, Lebar: 39, Panjang: 3, JmlhBatang: 4, Description: 'D07', Ket: 'ST', Total: 0.0031 },
  ]

  test('the Total unit is decided per group, not per row', () => {
    expect(resolveTotalUnit('ST')).toBe('Ton')
    expect(resolveTotalUnit('ST RAMBUNG - STD')).toBe('Ton')
    expect(resolveTotalUnit('BJ')).toBe('m3')
  })

  test('rows are grouped by Ket and sorted case-insensitively', () => {
    const data = buildNyangkutGroups(rows)
    expect(data.groups.map((g) => g.name)).toEqual(['BJ', 'ST'])
    expect(data.groups.map((g) => g.unit)).toEqual(['m3', 'Ton'])
  })

  test('each group total carries that group unit', () => {
    const data = buildNyangkutGroups(rows)
    const html = renderWith('label-nyangkut', data, {})
    expect(html).toContain('0.0100 m3')
    expect(html).toContain('0.0031 Ton')
  })

  test('the group total sums the rows, not the last one', () => {
    const data = buildNyangkutGroups([
      { ...rows[0]!, JmlhBatang: 6, Total: 1 },
      { ...rows[0]!, JmlhBatang: 10, Total: 2 },
    ])
    expect(data.groups[0]!.totalBatang).toBe(16)
    expect(data.groups[0]!.totalVolume).toBe(3)
    const html = renderWith('label-nyangkut', data, {})
    expect(html).toContain('16')
    expect(html).toContain('3.0000 m3')
  })

  test('the subtitle shows the generation date, the procedure has none', () => {
    const html = renderWith('label-nyangkut', buildNyangkutGroups(rows), {})
    expect(html).toContain('Per Tanggal : 01-Sep-2026')
  })

  test('no rows at all still renders the empty state', () => {
    expect(
      renderWith('label-nyangkut', buildNyangkapGroupsFor([]), {}),
    ).toContain('Tidak ada data')
  })
})

/** Small alias so the empty case above reads cleanly. */
const buildNyangkapGroupsFor = buildNyangkutGroups

describe('Kapasitas Racip Kayu Bulat Hidup', () => {
  test('ton per day is the rated capacity over the working days', () => {
    const capacity = buildCapacity(10, 29)
    expect(capacity.totalTon).toBeCloseTo(323.7837, 4)
    expect(capacity.tonPerHari).toBeCloseTo(32.37837, 5)
    expect(capacity.mejaPerHari).toBeCloseTo(2.9, 8)
    expect(capacity.tonPerHariMeja).toBeCloseTo(32.37837 / 2.9, 8)
  })

  test('zero working days give zero, not Infinity or NaN', () => {
    const capacity = buildCapacity(0, 29)
    expect(capacity.tonPerHari).toBe(0)
    expect(capacity.mejaPerHari).toBe(0)
    expect(capacity.tonPerHariMeja).toBe(0)
  })

  test('the two rendemen constants are applied to the two balances', () => {
    const data = buildKapasitasData(
      [{ Group: 'JABON', Ton: 100 }],
      [{ NamaGrade: 'RAMBUNG - STD', Berat: 50 }],
      10,
      29,
    )
    // Non-Rambung 100 x 0.85, Rambung 50 x 0.20.
    expect(data.nonRambung.effectiveTon).toBeCloseTo(85, 8)
    expect(data.rambung.effectiveTon).toBeCloseTo(10, 8)
    expect(data.nonRambung.rendemenPercent).toBe(85)
    expect(data.rambung.rendemenPercent).toBe(20)
  })

  test('required days are the effective ton over ton per day', () => {
    const data = buildKapasitasData(
      [{ Group: 'JABON', Ton: 100 }],
      [{ NamaGrade: 'RAMBUNG - STD', Berat: 50 }],
      10,
      29,
    )
    const tonPerHari = 323.7837 / 10
    expect(data.nonRambung.requiredDays).toBeCloseTo(85 / tonPerHari, 6)
    expect(data.totalRequiredDays).toBeCloseTo(
      85 / tonPerHari + 10 / tonPerHari,
      6,
    )
  })

  test('an empty balance gives zero days, not a division by zero', () => {
    const data = buildKapasitasData([], [], 0, 0)
    expect(data.totalRequiredDays).toBe(0)
    const html = renderWith('kapasitas-racip-kayu-bulat-hidup', data, PERIOD)
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('INF')
  })

  test('the report renders both sections and the shared capacity table twice', () => {
    const data = buildKapasitasData(
      [{ Group: 'JABON', Ton: 100 }],
      [{ NamaGrade: 'RAMBUNG - STD', Berat: 50 }],
      10,
      29,
    )
    const html = renderWith('kapasitas-racip-kayu-bulat-hidup', data, PERIOD)
    expect(html).toContain('Saldo Kayu Bulat Non Rambung')
    expect(html).toContain('Saldo Kayu Bulat Rambung')
    expect(html).toContain('Kapasitas Racip Sawmill')
    expect(html).toContain('Kesimpulan')
    expect(html).toContain('Rangkuman')
    expect(html.match(/Ton\/Hari\/Meja/g)).toHaveLength(2)
  })

  test('the metrics list and the Rangkuman line carry no table grid', () => {
    const data = buildKapasitasData(
      [{ Group: 'JABON', Ton: 100 }],
      [{ NamaGrade: 'RAMBUNG - STD', Berat: 50 }],
      10,
      29,
    )
    const html = renderWith('kapasitas-racip-kayu-bulat-hidup', data, PERIOD)
    // The shared WPS CSS borders every table, which put a rule down the left
    // of the metrics list and a box around the Rangkuman row. Both are plain
    // label/value blocks and must not pick that up.
    expect(html).toContain('class="metrics-table"')
    expect(html).toContain('class="summary-table"')
    expect(html).not.toContain('class="report-table metrics-table"')
    expect(html).not.toContain('class="report-table summary-table"')
  })

  test('no horizontal rule is drawn across the page', () => {
    const data = buildKapasitasData([], [], 10, 29)
    const html = renderWith('kapasitas-racip-kayu-bulat-hidup', data, PERIOD)
    expect(html).not.toContain('class="rule"')
  })

  test('the Rangkuman line is set larger than the body text around it', () => {
    const data = buildKapasitasData(
      [{ Group: 'JABON', Ton: 100 }],
      [{ NamaGrade: 'RAMBUNG - STD', Berat: 50 }],
      10,
      29,
    )
    const html = renderWith('kapasitas-racip-kayu-bulat-hidup', data, PERIOD)
    // It is the report's closing answer, so the shared summary-table rule for
    // this report sets it a step above the 11px body text. If that rule is
    // dropped the line silently falls back to 11px and reads as body copy.
    const style = html.match(/\.summary-table td \{[^}]*\}/)?.[0] ?? ''
    expect(style).toContain('font-size: 12px')
  })

  test('the rated capacity is shown, so the constant is visible in the output', () => {
    const html = renderWith(
      'kapasitas-racip-kayu-bulat-hidup',
      buildKapasitasData([], [], 10, 29),
      PERIOD,
    )
    expect(html).toContain('323.7837')
  })
})
