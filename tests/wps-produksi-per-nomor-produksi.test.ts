import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import {
  buildProduksiData,
  createProduksiPerNomorProduksiReport,
  type ProduksiSpec,
} from '../src/reports/wps/produksi-per-nomor-produksi'

/**
 * The seven "Produksi Per Nomor Produksi" reports share one builder, and the
 * only thing that differs between them is which stored procedure is called and
 * which labels fall back when a row carries none.
 *
 * `Type` splits the resultset into the two side-by-side tables, and `Group`
 * names the process on each side. These pin both, plus the two rules that are
 * easy to get wrong: the totals count DISTINCT labels rather than rows, and
 * rows are ordered by plain string comparison rather than numerically.
 */

const FJ: ProduksiSpec = {
  type: 'produksi-fj-per-nomor-produksi',
  title: 'x',
  spName: 'SPWps_LapProduksiFJ',
  machineFallback: 'FINGER JOINT',
  inputLabel: 'CCAKHIR',
  outputLabel: 'FJ',
}

const MOULDING: ProduksiSpec = { ...FJ, inputLabel: 'LAMINATING', outputLabel: 'MOULDING' }

const row = (over: Record<string, unknown>) => ({
  NoProduksi: 'SA.002738',
  NamaOperator: 'AMOS',
  NamaMesin: 'FINGER JOINT 3',
  Tanggal: '2024-11-19T00:00:00.000Z',
  Shift: 1,
  JamKerja: 7,
  JmlhAnggota: 3,
  ...over,
})

describe('Produksi per Nomor Produksi', () => {
  test('splits the rows on Type into the two tables', () => {
    const data = buildProduksiData(
      [
        row({ Group: 'CCAkhir', Type: 'Input', NoLabel: 'V.009179', JmlhBatang: 12, Kubik: 0.0478 }),
        row({ Group: 'S4S', Type: 'Input', NoLabel: 'V.009180', JmlhBatang: 10, Kubik: 0.052 }),
        row({ Group: 'FJ', Type: 'Output', NoLabel: 'S.009985', JmlhBatang: 84, Kubik: 0.3326 }),
      ],
      FJ,
      'SA.002738',
    )
    expect(data.input.rows.map((r) => r.noLabel)).toEqual(['V.009179', 'V.009180'])
    expect(data.output.rows.map((r) => r.noLabel)).toEqual(['S.009985'])
  })

  test('takes the section label from the first row of each side', () => {
    // Upstream spells the same process both CCAkhir and CCAKHIR, so the label
    // is whatever the first row says and is never compared.
    const data = buildProduksiData(
      [
        row({ Group: 'CCAkhir', Type: 'Input', NoLabel: 'V.1', Kubik: 1 }),
        row({ Group: 'CCAKHIR', Type: 'Input', NoLabel: 'V.2', Kubik: 1 }),
        row({ Group: 'FJ', Type: 'Output', NoLabel: 'S.1', Kubik: 2 }),
      ],
      FJ,
      'X',
    )
    expect(data.input.label).toBe('CCAkhir')
    expect(data.output.label).toBe('FJ')
  })

  test('falls back to the configured label when no row supplies one', () => {
    const data = buildProduksiData(
      [
        row({ Group: null, Type: 'Input', NoLabel: 'V.1', Kubik: 1 }),
        row({ Group: null, Type: 'Output', NoLabel: 'S.1', Kubik: 1 }),
      ],
      MOULDING,
      'X',
    )
    expect(data.input.label).toBe('LAMINATING')
    expect(data.output.label).toBe('MOULDING')
  })

  test('drops a row with no content at all', () => {
    // A production just started returns the header line only: every detail
    // column NULL. It must not become a row of zeros.
    const data = buildProduksiData(
      [row({ Group: null, Type: null, NoLabel: null, JmlhBatang: null, Kubik: null })],
      FJ,
      'X',
    )
    expect(data.input.rows).toEqual([])
    expect(data.output.rows).toEqual([])
  })

  test('the totals count DISTINCT labels, not rows', () => {
    // The legacy total cell is a count of labels, so the same label appearing on
    // two lines counts once while the volumes still add up on both.
    const data = buildProduksiData(
      [
        row({ Type: 'Input', NoLabel: 'V.1', JmlhBatang: 3, Kubik: 1.5 }),
        row({ Type: 'Input', NoLabel: 'V.1', JmlhBatang: 4, Kubik: 2.5 }),
        row({ Type: 'Output', NoLabel: 'S.1', JmlhBatang: 7, Kubik: 3 }),
      ],
      FJ,
      'X',
    )
    expect(data.input.totals.count).toBe(1)
    expect(data.input.totals.jmlhBatang).toBe(7)
    expect(data.input.totals.kubik).toBeCloseTo(4, 6)
  })

  test('rendemen is output over input, and null when there is no input', () => {
    const withInput = buildProduksiData(
      [
        row({ Type: 'Input', NoLabel: 'V.1', Kubik: 4 }),
        row({ Type: 'Output', NoLabel: 'S.1', Kubik: 3 }),
      ],
      FJ,
      'X',
    )
    expect(withInput.rendemen).toBeCloseTo(75, 6)

    const noInput = buildProduksiData([row({ Type: 'Output', NoLabel: 'S.1', Kubik: 3 })], FJ, 'X')
    expect(noInput.rendemen).toBeNull()
  })

  test('sorts labels as plain text, not as numbers', () => {
    // strcmp, as the legacy service did: 'V.0099' sorts after 'V.00910'
    // because the ninth character is compared as text.
    const data = buildProduksiData(
      [
        row({ Type: 'Input', NoLabel: 'V.00910', Kubik: 1 }),
        row({ Type: 'Input', NoLabel: 'V.0099', Kubik: 1 }),
        row({ Type: 'Input', NoLabel: 'V.009100', Kubik: 1 }),
      ],
      FJ,
      'X',
    )
    expect(data.input.rows.map((r) => r.noLabel)).toEqual([
      'V.00910',
      'V.009100',
      'V.0099',
    ])
  })

  test('classifies by Group when Type is missing, using the report own labels', () => {
    // The legacy fallback matched the process name against 'cca' and 'finger',
    // which only ever worked for the Finger Joint report; the other six were
    // copies of it. Matching the configured labels is right for all seven.
    const data = buildProduksiData(
      [
        row({ Type: null, Group: 'LAMINATING', NoLabel: 'T.1', Kubik: 1 }),
        row({ Type: null, Group: 'MOULDING', NoLabel: 'T.2', Kubik: 2 }),
      ],
      MOULDING,
      'X',
    )
    expect(data.input.rows.map((r) => r.noLabel)).toEqual(['T.1'])
    expect(data.output.rows.map((r) => r.noLabel)).toEqual(['T.2'])
  })

  test('the machine name falls back only when the row has none', () => {
    const named = buildProduksiData(
      [row({ Type: 'Output', NoLabel: 'S.1', NamaMesin: 'MOULDING 2', Kubik: 1 })],
      FJ,
      'X',
    )
    expect(named.meta.namaMesin).toBe('MOULDING 2')

    const blank = buildProduksiData(
      [row({ Type: 'Output', NoLabel: 'S.1', NamaMesin: null, Kubik: 1 })],
      FJ,
      'X',
    )
    expect(blank.meta.namaMesin).toBe('FINGER JOINT')
  })
})

/**
 * Input and Output sit side by side, but not touching: each table takes 49% of
 * the page and the leftover 2% is an empty spacer column between them. At a
 * plain 50/50 the two tables' outer rules met and the pair read as a single
 * twelve-column table. Each pane is `vertical-align: top`, so a table is only as
 * tall as its own data — the S4S report runs 26 input rows against 6 output rows
 * and the Output box stops at its own total.
 */
describe('Produksi per Nomor Produksi layout', () => {
  const render = (
    rows: Array<Record<string, unknown>>,
    spec: ProduksiSpec = FJ,
  ): string =>
    createProduksiPerNomorProduksiReport(spec).render(
      buildProduksiData(rows as never, spec, 'X'),
      { requestedBy: 'Garda', generatedAt: new Date('2026-08-31T09:00:00Z'), params: { noProduksi: 'X' } },
    ).html

  const lopsided = [
    ...Array.from({ length: 26 }, (_, i) =>
      row({ Group: 'CCAkhir', Type: 'Input', NoLabel: `V.${i}`, JmlhBatang: 10, Kubik: 0.5 }),
    ),
    row({ Group: 'FJ', Type: 'Output', NoLabel: 'S.1', JmlhBatang: 84, Kubik: 0.3326 }),
  ]

  test('the two tables share one row with a spacer cell between them', () => {
    const html = render(lopsided)
    // Matched on the full cell tag: the header block above also uses a
    // "meta-pane-left" cell, which a bare "left-pane" search would hit first.
    const left = '<td class="left-pane">'
    const gutter = '<td class="gutter"></td>'
    const right = '<td class="right-pane">'
    expect(html).toContain(left)
    expect(html).toContain(gutter)
    expect(html).toContain(right)

    const at = (s: string, from = 0): number => html.indexOf(s, from)
    expect(at('<table class="split-grid">')).toBeLessThan(at(left))
    expect(at(left)).toBeLessThan(at(gutter))
    expect(at(gutter)).toBeLessThan(at(right))
    // And the spacer sits between the two tables, not outside them.
    const detail = '<table class="detail-table">'
    const first = at(detail)
    const second = at(detail, first + detail.length)
    expect(at(gutter)).toBeGreaterThan(first)
    expect(at(gutter)).toBeLessThan(second)
  })

  test('each side gets its own heading and its own table', () => {
    const html = render(lopsided)
    expect(html).toContain('Input : CCAkhir')
    expect(html).toContain('Output : FJ')
    expect(html.match(/<table class="detail-table">/g)).toHaveLength(2)
  })

  test('a side with no rows still renders its own table and total', () => {
    const html = render([
      row({ Group: 'CCAkhir', Type: 'Input', NoLabel: 'V.1', JmlhBatang: 3, Kubik: 1.5 }),
    ])
    expect(html).toContain('Tidak ada data')
    expect(html.match(/<table class="detail-table">/g)).toHaveLength(2)
  })
})

/**
 * The 49/2/49 split lives in the stylesheet, so that is what is asserted: each
 * table 49%, the spacer 2%, and the panes top-aligned so neither table is
 * stretched to match the other.
 */
describe('Produksi per Nomor Produksi split', () => {
  const all = readFileSync(join(process.cwd(), 'src', 'reports', 'wps', 'styles.ts'), 'utf8')
  const css = /const PRODUKSI_PER_NOMOR_PRODUKSI_CSS = `([\s\S]*?)`;/.exec(all)![1]!

  test('each table is 49% and the 2% in between is a spacer', () => {
    expect(css).toMatch(/\.split-grid \.left-pane\s*\{\s*width:\s*49%/)
    expect(css).toMatch(/\.split-grid \.right-pane\s*\{\s*width:\s*49%/)
    expect(css).toMatch(/\.split-grid \.gutter\s*\{\s*width:\s*2%/)
  })

  test('neither pane is stretched to match the other', () => {
    expect(css).toMatch(/\.split-grid[^,{]*td\s*\{[^}]*vertical-align:\s*top/)
  })

  test('the spacer itself draws no rule', () => {
    expect(css).toMatch(/\.split-grid[^,{]*td\s*\{[^}]*border:\s*0 !important/)
  })

  /**
   * The real bug. A bare ".split-grid td" matches every td DESCENDANT, so it
   * reached into the nested detail table and its !important beat
   * ".detail-table td". The data rows lost every rule; the header kept its box
   * only because its cells are th, which that selector never matched. The reset
   * has to be scoped to the grid's own cells with a child combinator.
   */
  test('the grid reset cannot reach the nested table cells', () => {
    expect(css).not.toMatch(/\.split-grid\s+td\s*\{/)
    expect(css).not.toMatch(/\.split-grid\s+[a-z]+\s+td\s*\{/)
    expect(css).toMatch(/\.split-grid\s*>\s*tbody\s*>\s*tr\s*>\s*td\s*\{/)
  })
})

/**
 * `formatInt` renders a zero as an empty cell, which reads correctly in a data
 * cell ("no value recorded") but not in a total: a blank beside "Total :" looks
 * like a rendering fault rather than a real zero. Totals always print a figure.
 */
describe('Produksi per Nomor Produksi totals row', () => {
  const spec = FJ
  const html = createProduksiPerNomorProduksiReport(spec).render(
    buildProduksiData([], spec, 'X'),
    { requestedBy: 'Garda', generatedAt: new Date('2026-08-31T09:00:00Z'), params: { noProduksi: 'X' } },
  ).html

  test('an empty report totals a real zero rather than a blank', () => {
    const feet = [...html.matchAll(/<tfoot>([\s\S]*?)<\/tfoot>/g)].map((m) => m[1]!)
    expect(feet).toHaveLength(2)
    for (const foot of feet) {
      // Two zeros per side: the label count and the batang count.
      expect(foot.match(/>0</g)).toHaveLength(2)
    }
  })

  test('the total label still spans the three dimension columns', () => {
    expect(html).toContain('<td class="total-label" colspan="3">Total :</td>')
  })
})

/**
 * The preset once dropped the horizontal rules on data rows, so the tables read
 * as loose vertical stripes with no row structure. Every cell is fully boxed
 * here, and a table that does paginate repeats its header band.
 */
describe('Produksi per Nomor Produksi borders', () => {
  const all = readFileSync(join(process.cwd(), 'src', 'reports', 'wps', 'styles.ts'), 'utf8')
  const css = /const PRODUKSI_PER_NOMOR_PRODUKSI_CSS = `([\s\S]*?)`;/.exec(all)![1]!

  test('data rows keep the rules between rows', () => {
    expect(css).not.toMatch(/tbody\s+td\s*\{[^}]*border-top:\s*0/)
    expect(css).not.toMatch(/tbody\s+td\s*\{[^}]*border-bottom:\s*0/)
  })

  test('every cell is fully boxed', () => {
    expect(css).toMatch(/\.detail-table th,\s*\.detail-table td\s*\{[^}]*border:\s*1px solid #000/)
  })

  test('a table that spans a page repeats its header band', () => {
    expect(css).toMatch(/thead\s*\{[^}]*display:\s*table-header-group/)
  })

  test('a heading, its table and the Rendemen line stay on one page', () => {
    expect(css).toMatch(/\.report-block\s*\{[^}]*break-inside:\s*avoid/)
  })
})
