import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildMonthColumns, buildTimelineData, columnWidths } from '../src/reports/wps/timeline-rekap-penjualan-per-produk'
import { buildRekapPenjualanPerProduk } from '../src/reports/wps/rekap-penjualan-per-produk'
import {
  buildRekapPenjualanEkspor,
  PER_BUYER_PER_PRODUK_AXIS,
  PER_PRODUK_PER_BUYER_AXIS,
} from '../src/reports/wps/rekap-penjualan-ekspor'
import { buildPenjualanLokalData } from '../src/reports/wps/penjualan-lokal'
import { renderPenjualanDetailTable, toRoman } from '../src/reports/wps/penjualan-shared'

/**
 * The Rekap Penjualan family. Each of these reports folds a flat SP resultset
 * into nested groups and derives ratio columns from it, and several of the
 * totals come from SP columns that repeat the same figure on every line rather
 * than from the lines themselves. These tests pin that behaviour to real
 * production values from Aug-2026.
 */

const FJLB_AB = 'RAMBUNG - FJLB A/B'

describe('Rekap Penjualan Per-Produk', () => {
  const rows = [
    { Product: FJLB_AB, Tebal: 33, Lebar: 1100, Panjang: 4500, JmlhBatang: 240, M3: 39.204 },
    { Product: FJLB_AB, Tebal: 22, Lebar: 1100, Panjang: 4500, JmlhBatang: 180, M3: 19.602 },
    { Product: FJLB_AB, Tebal: 18, Lebar: 1100, Panjang: 4500, JmlhBatang: 216, M3: 19.2456 },
    { Product: 'JABON - FJLB A/A', Tebal: 25, Lebar: 600, Panjang: 4200, JmlhBatang: 150, M3: 9.45 },
  ]

  test('drops rows with no product name and sums each product', () => {
    const data = buildRekapPenjualanPerProduk([...rows, { Product: '   ' }])
    expect(data.products.map((p) => p.name)).toEqual([FJLB_AB, 'JABON - FJLB A/A'])
    expect(data.products[0]!.totalM3).toBeCloseTo(78.0516, 4)
    expect(data.grandTotalM3).toBeCloseTo(87.5016, 4)
  })

  test('keeps the sections in the order the SP returned them', () => {
    const data = buildRekapPenjualanPerProduk(rows)
    expect(data.products.map((p) => p.name)).toEqual([FJLB_AB, 'JABON - FJLB A/A'])
  })

  test('stops printing the running ratio once it passes 70%', () => {
    // Three equal rows: 33.33% / 66.67% / 100.00%. The last cumulative value is
    // hidden, which is what stops the column repeating a 100% total.
    const equal = buildRekapPenjualanPerProduk([
      { Product: 'X', M3: 1 },
      { Product: 'X', M3: 1 },
      { Product: 'X', M3: 1 },
    ])
    expect(equal.products[0]!.rows.map((r) => r.ratio?.toFixed(2))).toEqual([
      '33.33',
      '33.33',
      '33.33',
    ])
    expect(equal.products[0]!.cumulative[0]).toBeCloseTo(33.3333, 3)
    expect(equal.products[0]!.cumulative[1]).toBeCloseTo(66.6667, 3)
    expect(equal.products[0]!.cumulative[2]).toBeNull()
  })

  test('a product with no volume has a null ratio rather than a division by zero', () => {
    const data = buildRekapPenjualanPerProduk([{ Product: 'X', M3: 0 }])
    expect(data.products[0]!.rows[0]!.ratio).toBeNull()
    expect(data.products[0]!.summaryRatio).toBeNull()
  })
})

const PER_PRODUK_PER_BUYER = PER_PRODUK_PER_BUYER_AXIS

describe('Rekap Penjualan Ekspor (dua arah)', () => {
  // Real Aug-2026 shape: the subtotal columns repeat the same figure on every
  // line, so a group's total is the last line's value, not the sum of the lines.
  const rows = [
    { Product: FJLB_AB, Pembeli: 'DHB', M3: 39.204, BJM3: 117.2376, PembeliBJM3: 117.2376 },
    { Product: FJLB_AB, Pembeli: 'SPK', M3: 19.602, BJM3: 117.2376, PembeliBJM3: 47.0279 },
    { Product: 'JABON - FJLB A/A', Pembeli: 'IKC', M3: 9.45, BJM3: 35.028, PembeliBJM3: 35.028 },
  ]

  test('reads the subtotal columns instead of summing the lines', () => {
    const data = buildRekapPenjualanEkspor(rows, PER_PRODUK_PER_BUYER)
    const first = data.groups[0]!
    expect(first.name).toBe(FJLB_AB)
    expect(first.totalM3).toBeCloseTo(117.2376, 4)
    // The grand total is the sum of the SP's per-group subtotals, which is why
    // it can differ from the sum of the M3 lines.
    expect(data.grandTotalM3).toBeCloseTo(152.2656, 4)
  })

  test('sorts the outer groups by share, largest first', () => {
    const data = buildRekapPenjualanEkspor(rows, PER_PRODUK_PER_BUYER)
    expect(data.groups.map((g) => g.name)).toEqual([FJLB_AB, 'JABON - FJLB A/A'])
  })

  test('an inner group shares its parent, and a line shares its group', () => {
    const data = buildRekapPenjualanEkspor(rows, PER_PRODUK_PER_BUYER)
    const [dhb] = data.groups[0]!.inners
    expect(dhb!.summaryRatio).toBeCloseTo(100, 2)
    expect(dhb!.rows[0]!.ratio).toBeCloseTo((39.204 / 117.2376) * 100, 2)
  })

  test('the mirrored axis swaps which column each level reads', () => {
    const perBuyer = buildRekapPenjualanEkspor(
      [
        { Product: FJLB_AB, Pembeli: 'DHB', M3: 39.204, PembeliM3: 117.2376, PembeliBJM3: 117.2376 },
        { Product: 'JABON - FJLB A/A', Pembeli: 'DHB', M3: 9.45, PembeliM3: 117.2376, PembeliBJM3: 35.028 },
      ],
      PER_BUYER_PER_PRODUK_AXIS,
    )
    expect(perBuyer.groups.map((g) => g.name)).toEqual(['DHB'])
    expect(perBuyer.groups[0]!.inners.map((i) => i.name)).toEqual([FJLB_AB, 'JABON - FJLB A/A'])
    // The outer level reads PembeliM3, the inner level PembeliBJM3.
    expect(perBuyer.groups[0]!.totalM3).toBeCloseTo(117.2376, 4)
    expect(perBuyer.groups[0]!.inners.map((i) => i.totalM3)).toEqual([
      expect.closeTo(117.2376, 4),
      expect.closeTo(35.028, 4),
    ])
  })

  test('a blank inner name shows as "-" but a blank outer name drops the row', () => {
    const data = buildRekapPenjualanEkspor(
      [
        { Product: FJLB_AB, Pembeli: '', M3: 1, BJM3: 1, PembeliBJM3: 1 },
        { Product: '', Pembeli: 'DHB', M3: 1, BJM3: 1, PembeliBJM3: 1 },
      ],
      PER_PRODUK_PER_BUYER,
    )
    expect(data.groups).toHaveLength(1)
    expect(data.groups[0]!.inners.map((i) => i.name)).toEqual(['-'])
  })
})

describe('Timeline Rekap Penjualan Per-Produk', () => {
  test('builds one column per month in the period, even months with no sales', () => {
    expect(buildMonthColumns('2026-08-01', '2026-08-31').map((m) => m.short)).toEqual(['Agt'])
    expect(buildMonthColumns('2026-01-15', '2026-04-02').map((m) => m.short)).toEqual([
      'Jan',
      'Feb',
      'Mar',
      'Apr',
    ])
    expect(buildMonthColumns('2026-07-01', '2026-08-31').map((m) => m.key)).toEqual([
      '2026-07',
      '2026-08',
    ])
  })

  test('a reversed period still yields a usable column set', () => {
    const columns = buildMonthColumns('2026-08-31', '2026-08-01')
    expect(columns).toHaveLength(1)
    expect(columns[0]!.key).toBe('2026-08')
  })

  test('a year boundary rolls over into the next January', () => {
    expect(buildMonthColumns('2025-12-01', '2026-02-28').map((m) => m.key)).toEqual([
      '2025-12',
      '2026-01',
      '2026-02',
    ])
  })

  test('merges the same size sold on several dates into one row', () => {
    const data = buildTimelineData(
      [
        { Product: FJLB_AB, Tebal: 33, Lebar: 1100, Panjang: 4500, JmlhBatang: 240, M3: 39.204, TglJual: '2026-08-31' },
        { Product: FJLB_AB, Tebal: 33, Lebar: 1100, Panjang: 4500, JmlhBatang: 10, M3: 1.5, TglJual: '2026-08-06' },
      ],
      buildMonthColumns('2026-08-01', '2026-08-31'),
    )
    expect(data.products[0]!.rows).toHaveLength(1)
    expect(data.products[0]!.rows[0]!.total).toBeCloseTo(40.704, 4)
    expect(data.products[0]!.rows[0]!.jmlhBatang).toBe(250)
    expect(data.products[0]!.total).toBeCloseTo(40.704, 4)
  })

  test('groups the flattened rows by thickness, in first-appearance order', () => {
    const data = buildTimelineData(
      [
        { Product: 'X', Tebal: 33, Lebar: 1100, Panjang: 4500, M3: 1, TglJual: '2026-08-01' },
        { Product: 'X', Tebal: 22, Lebar: 1100, Panjang: 4500, M3: 1, TglJual: '2026-08-01' },
        { Product: 'X', Tebal: 33, Lebar: 650, Panjang: 4500, M3: 2, TglJual: '2026-08-01' },
      ],
      buildMonthColumns('2026-08-01', '2026-08-31'),
    )
    const groups = data.products[0]!.tebalGroups
    expect(groups.map((g) => g.tebal)).toEqual([33, 22])
    expect(groups[0]!.rows).toHaveLength(2)
  })

  test('a date outside the period columns cannot create a phantom column', () => {
    const data = buildTimelineData(
      [{ Product: 'X', M3: 5, TglJual: '2025-01-15' }],
      buildMonthColumns('2026-08-01', '2026-08-31'),
    )
    // The line still counts towards the total; only its month cell is dropped,
    // because there is no column to put it in.
    expect(data.grandTotal).toBeCloseTo(5, 4)
    expect([...data.monthTotals.values()]).toEqual([0])
  })
})

/**
 * Column widths are computed in the report rather than declared in CSS, because
 * `table-layout: fixed` scales every declared width up when they do not add up
 * to 100. That is what left a single-month period with a month column 47% of
 * the page wide. The two invariants below are what the CSS could not express.
 */
describe('Timeline column widths', () => {
  test('always add up to 100%, counting each month column', () => {
    for (const months of [1, 2, 3, 4, 6, 9, 12, 18]) {
      const w = columnWidths(months)
      // `month` is the width of ONE month column, so it is counted months times.
      const fixed = w.produk + w.tebal + w.lebar + w.panjang + w.subTotal + w.ratio
      const sum = fixed + w.month * months
      // Rounding to a tenth of a point leaves a small residual.
      expect(Math.abs(sum - 100)).toBeLessThan(0.6)
    }
  })

  test('the product column is never narrower than a month column', () => {
    for (const months of [1, 2, 3, 4, 5, 6, 9, 12]) {
      const w = columnWidths(months)
      expect(w.produk).toBeGreaterThanOrEqual(w.month)
    }
  })

  test('a month column stays modest for a short period', () => {
    // The reported case: one month must not outgrow the product name.
    expect(columnWidths(1).month).toBe(12)
    expect(columnWidths(1).produk).toBeGreaterThan(50)
  })

  test('the narrow columns are sized from their widest heading, not their data', () => {
    // Measured off the rendered page at 10px: "Lebar" is 24.7pt and "Panjang"
    // 33.6pt, while the data under them needs only 18.6pt. At the old 5% and 6%
    // the two headings overhung their column lines by 2.7pt and 3.2pt and ran
    // into the neighbouring column. Each share must cover the heading plus the
    // 6pt of cell padding around it, out of a 559pt text column.
    const TEXT_WIDTH = 559
    const PADDING = 6
    const headings: Record<string, number> = {
      tebal: 23.1,
      lebar: 24.7,
      panjang: 33.6,
      subTotal: 31.2,
      ratio: 25.5,
    }
    for (const months of [1, 4, 8, 12]) {
      const w = columnWidths(months) as unknown as Record<string, number>
      for (const [field, headingWidth] of Object.entries(headings)) {
        const columnPoints = (w[field]! / 100) * TEXT_WIDTH
        expect(columnPoints).toBeGreaterThanOrEqual(headingWidth + PADDING - 0.5)
      }
    }
  })

  test('the colspan=2 span is wide enough for the figure under it', () => {
    // "Sub Total" and the share beside it are ONE header cell with colspan="2",
    // so the browser halves the declared span rather than honouring the two
    // shares separately. Each half has to clear the volume figure on its own:
    // "117.2376" is 31.2pt, plus 6pt of padding, about 6.7% of the text width.
    const TEXT_WIDTH = 559
    const PADDING = 6
    const figure = 31.2
    for (const months of [1, 4, 8]) {
      const w = columnWidths(months)
      // Each half of the span, in points.
      const half = ((w.subTotal + w.ratio) / 2 / 100) * TEXT_WIDTH
      expect(half).toBeGreaterThanOrEqual(figure + PADDING - 0.5)
    }
  })

  test('a month column holds a full figure up to eight months', () => {
    // "117.2376" is 31.2pt at 10px, so a month column needs about 37pt, 6.7%.
    // The 56% cap is what buys this, and it is also what keeps the product
    // column the wider of the two. Past eight months the figures start to clip.
    for (const months of [1, 2, 4, 6, 8]) {
      const w = columnWidths(months)
      expect((w.month / 100) * 559).toBeGreaterThanOrEqual(37)
    }
    expect((columnWidths(9).month / 100) * 559).toBeLessThan(37)
  })
})

describe('Penjualan Lokal', () => {
  test('drops zero and negative tons, and sorts each section by volume', () => {
    const data = buildPenjualanLokalData([
      { Proses: 'ST', Jenis: 'KAYU LAT JABON', NamaGrade: null, TonAndm3: 1.7432 },
      { Proses: 'ST', Jenis: 'KAYU LAT PULAI', NamaGrade: null, TonAndm3: 0.0359 },
      { Proses: 'ST', Jenis: 'KAYU LAT RAMBUNG', NamaGrade: null, TonAndm3: 1.3545 },
      { Proses: 'ST', Jenis: 'NOL', NamaGrade: null, TonAndm3: 0 },
      { Proses: 'S4S', Jenis: 'S4S A', NamaGrade: 'A', TonAndm3: 5 },
    ])
    expect(data.sections.map((s) => s.proses)).toEqual(['ST', 'S4S'])
    expect(data.sections[0]!.rows.map((r) => r.jenis)).toEqual([
      'KAYU LAT JABON',
      'KAYU LAT RAMBUNG',
      'KAYU LAT PULAI',
    ])
    expect(data.sections[0]!.subtotal).toBeCloseTo(3.1336, 4)
    expect(data.grandTotal).toBeCloseTo(8.1336, 4)
  })

  test('a blank process name becomes LAINNYA', () => {
    const data = buildPenjualanLokalData([{ Proses: '  ', Jenis: 'X', TonAndm3: 1 }])
    expect(data.sections[0]!.proses).toBe('LAINNYA')
  })

  test('no rows at all yields no sections, so the report can show the empty state', () => {
    expect(buildPenjualanLokalData([])).toEqual({ sections: [], grandTotal: 0 })
  })
})

describe('Roman numerals', () => {
  test('formats the section numbers the legacy service produced', () => {
    expect([1, 4, 9, 14, 40, 90, 400, 1987].map(toRoman)).toEqual([
      'I',
      'IV',
      'IX',
      'XIV',
      'XL',
      'XC',
      'CD',
      'MCMLXXXVII',
    ])
  })
})

/**
 * A detail table whose header, body and total rows disagree on the column count
 * renders as a borderless empty strip down one side. It looks like a layout
 * glitch and nothing throws, so these check the counts line up.
 */
const columnCount = (row: string): number =>
  [...row.matchAll(/<td([^>]*)>/g)].reduce(
    (sum, m) => sum + Number(/colspan="(\d+)"/.exec(m[1] ?? '')?.[1] ?? 1),
    0,
  )
const cellCount = (fragment: string, tag: 'th' | 'td'): number =>
  (fragment.match(new RegExp(`<${tag}[\\s>]`, 'g')) ?? []).length

/** Header width, first data row and total row of a rendered detail table. */
const tableShape = (html: string) => {
  const [head, body] = html.split('<tbody>')
  const rows = body!.match(/<tr[\s\S]*?<\/tr>/g) ?? []
  return {
    header: cellCount(head!.split('</thead>')[0]!, 'th'),
    data: columnCount(rows[0] ?? ''),
    // The total row is the last one inside the single tbody.
    total: columnCount(rows[rows.length - 1] ?? ''),
  }
}

describe('detail table column count', () => {
  const rows = [
    { tebal: 33, lebar: 1100, panjang: 4500, jmlhBatang: 240, m3: 39.204, ratio: 33.44 },
    { tebal: 22, lebar: 1100, panjang: 4500, jmlhBatang: 180, m3: 19.602, ratio: 16.72 },
  ]

  test('without a cumulative column, header, body and total all span 7', () => {
    const shape = tableShape(
      renderPenjualanDetailTable({
        rows,
        totalM3: 117.2376,
        totalRatio: 100,
        totalLabel: 'Total ',
      }),
    )
    expect(shape).toEqual({ header: 7, data: 7, total: 7 })
  })

  test('with a cumulative column, all three span 8', () => {
    const shape = tableShape(
      renderPenjualanDetailTable({
        rows,
        cumulative: [33.44, 50.16],
        totalM3: 117.2376,
        totalRatio: 100,
        totalLabel: 'Total',
      }),
    )
    expect(shape).toEqual({ header: 8, data: 8, total: 8 })
  })

  test('the empty row spans the same width as the header', () => {
    const html = renderPenjualanDetailTable({
      rows: [],
      totalM3: 0,
      totalRatio: null,
      totalLabel: 'Total ',
    })
    expect(html).toContain('colspan="7"')
  })
})

/**
 * The shared stylesheet once zeroed border-left on every header and total-row
 * cell, which removed the column separators from exactly the two bands that
 * need them. Blanket `border-left: 0` selectors are what caused it, so they are
 * banned in this preset; only :first-child may drop its left rule. Scoped to
 * REKAP_PENJUALAN_CSS because other reports legitimately use
 * "vertical separators only" on their data rows.
 */
describe('Rekap Penjualan border rules', () => {
  const all = readFileSync(
    join(process.cwd(), 'src', 'reports', 'wps', 'styles.ts'),
    'utf8',
  )
  const css = /const REKAP_PENJUALAN_CSS = `([\s\S]*?)`;/.exec(all)![1]!

  test('no rule blanks border-left on a whole header or total row', () => {
    expect(css).not.toMatch(/thead\s+th\s*\{[^}]*border-left:\s*0/)
    expect(css).not.toMatch(/totals-row\s+td\s*\{[^}]*border-left:\s*0/)
  })

  test('the first cell of a row is the only one that drops its left rule', () => {
    expect(css).toMatch(
      /th:first-child,\s*\.report-table\s+td:first-child\s*\{[^}]*border-left:\s*0/,
    )
  })
})
