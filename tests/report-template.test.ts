import { describe, expect, test } from 'bun:test'
import {
  buildReportTable,
  createSingleTableReport,
  type ReportColumn,
} from '../src/reports/wps/template'
import type { RenderMeta } from '../src/reports/types'

const columns: ReportColumn[] = [
  { label: 'No', kind: 'no', width: '30px' },
  { label: 'Jenis', kind: 'label', field: 'Jenis' },
  { label: 'Awal', kind: 'number', field: 'Awal' },
  { label: 'Total', kind: 'number', field: 'Total', bold: true },
]

describe('buildReportTable', () => {
  test('renders a flat header row and zebra body rows', () => {
    const html = buildReportTable({
      columns,
      rows: [{ Jenis: 'Meranti', Awal: 1234.5, Total: 1234.5 }],
    })
    expect(html).toContain('<table class="report-table">')
    expect(html).toContain('<th rowspan="2" style="width: 30px;">No</th>')
    expect(html).toContain('<td class="label">Meranti</td>')
    expect(html).toContain('1,234.5000')
    expect(html).toContain('row-odd')
  })

  test('grouped columns render a colspan group header and a child header row', () => {
    const grouped: ReportColumn[] = [
      { label: 'Jenis', kind: 'label', field: 'Jenis' },
      { label: 'Adj', kind: 'number', field: 'adj', group: 'Masuk' },
      { label: 'BS', kind: 'number', field: 'bs', group: 'Masuk' },
      { label: 'Jual', kind: 'number', field: 'jual' },
    ]
    const html = buildReportTable({ columns: grouped, rows: [] })
    expect(html).toContain('<th colspan="2">Masuk</th>')
    expect(html).toContain('<th rowspan="2">Jenis</th>')
    expect(html).toContain('<th>Adj</th>')
  })

  test('totals row spans the leading columns and formats values', () => {
    const html = buildReportTable({ columns, rows: [], totals: { values: { Awal: 12 } } })
    expect(html).toContain(
      '<td colspan="2" class="blank" style="text-align:center">Total</td>',
    )
    expect(html).toContain('12.0000')
  })

  test('empty rows render the empty message with full colspan', () => {
    const html = buildReportTable({ columns, rows: [] })
    expect(html).toContain('colspan="4"')
    expect(html).toContain('Tidak ada data untuk periode ini')
  })
})

describe('createSingleTableReport', () => {
  const meta: RenderMeta<{ tglAwal: string; tglAkhir: string }> = {
    requestedBy: 'garda',
    generatedAt: new Date(),
    params: { tglAwal: '2026-09-01', tglAkhir: '2026-09-21' },
  }

  test('builds a ReportDefinition bound to the period params schema', () => {
    const report = createSingleTableReport({
      type: 'dummy',
      title: 'Laporan Dummy',
      spName: 'SP_Dummy',
      columns,
    })
    expect(report.type).toBe('dummy')
    expect(
      report.paramsSchema.safeParse({ tglAwal: '2026-09-01', tglAkhir: '2026-09-21' })
        .success,
    ).toBe(true)
  })

  test('render uses the standard shell: title, subtitle, table, footer', () => {
    const report = createSingleTableReport({
      type: 'dummy',
      title: 'Laporan Dummy',
      spName: 'SP_Dummy',
      columns,
    })
    const rendered = report.render([{ Jenis: 'Meranti', Awal: 1, Total: 2 }], meta)
    expect(rendered.html).toContain('Laporan Dummy')
    expect(rendered.html).toContain('01-Sep-2026 s/d 21-Sep-2026')
    expect(rendered.html).toContain('Meranti')
    expect(rendered.footerHtml).toContain('Dicetak oleh: garda')
    expect(rendered.landscape).toBeUndefined()
  })

  test('totals: true sums every number column', () => {
    const report = createSingleTableReport({
      type: 'dummy',
      title: 'Laporan Dummy',
      spName: 'SP_Dummy',
      columns,
      totals: true,
    })
    const rendered = report.render(
      [
        { Jenis: 'A', Awal: 1.5, Total: 2 },
        { Jenis: 'B', Awal: 2.5, Total: 3 },
        { Jenis: 'C', Awal: null, Total: 1 },
      ],
      meta,
    )
    expect(rendered.html).toContain('4.0000')
    expect(rendered.html).toContain('3.0000')
  })
})
