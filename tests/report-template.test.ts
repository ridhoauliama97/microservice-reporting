import { describe, expect, test } from 'bun:test'
import {
  buildEmptyTable,
  buildReportTable,
  createSingleDateTableReport,
  createSingleTableReport,
  createSnapshotTableReport,
  formatInt,
  renderWpsReportPage,
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

  test('date columns format Date objects and ISO strings as dd-Mon-yyyy', () => {
    const cols: ReportColumn[] = [{ label: 'Tgl', kind: 'date', field: 'Tgl' }]
    const html = buildReportTable({
      columns: cols,
      rows: [
        { Tgl: new Date('2026-09-01T00:00:00.000Z') },
        { Tgl: '2026-12-25' },
        { Tgl: null },
      ],
    })
    expect(html).toContain('01-Sep-2026')
    expect(html).toContain('25-Des-2026')
    expect(html).not.toContain('T00:00:00')
  })

  test('custom column format applies to data cells and totals cells', () => {
    const cols: ReportColumn[] = [
      { label: 'Jenis', kind: 'label', field: 'Jenis' },
      {
        label: 'Berat',
        kind: 'number',
        field: 'Berat',
        format: (v) => (v === null || v === undefined ? '' : `${v} X`),
      },
    ]
    const html = buildReportTable({
      columns: cols,
      rows: [{ Jenis: 'A', Berat: 5 }],
      totals: { values: { Berat: 1000 } },
    })
    expect(html).toContain('>5 X</td>')
    expect(html).toContain('>1000 X</td>')
  })

  test('totals row spans the leading columns and formats values', () => {
    const html = buildReportTable({ columns, rows: [{ Jenis: 'A' }], totals: { values: { Awal: 12 } } })
    expect(html).toContain(
      '<td colspan="2" class="blank" style="text-align:center">Total</td>',
    )
    expect(html).toContain('12.0000')
  })

  test('empty rows render the shared empty state with full colspan', () => {
    const html = buildReportTable({ columns, rows: [] })
    expect(html).toContain('colspan="4"')
    expect(html).toContain('class="empty-cell"')
    expect(html).toContain('Tidak ada data')
    expect(html).not.toContain('Tidak ada data untuk periode ini')
  })

  test('standalone empty tables use the shared empty state', () => {
    const html = buildEmptyTable(7, 'production-table')
    expect(html).toContain('class="production-table"')
    expect(html).toContain('colspan="7"')
    expect(html).toContain('class="empty-cell"')
    expect(html).toContain('Tidak ada data')
  })

  test('empty rows do not render a totals row', () => {
    const html = buildReportTable({
      columns,
      rows: [],
      totals: { values: { Awal: 10, Total: 10 } },
    })
    expect(html).toContain('class="empty-cell"')
    expect(html).not.toContain('class="totals-row"')
  })
})

describe('new template capabilities', () => {
  test('formatInt renders whole numbers with separators', () => {
    expect(formatInt(1234)).toBe('1,234')
    expect(formatInt(7)).toBe('7')
    expect(formatInt(null)).toBe('')
    expect(formatInt(0)).toBe('')
  })

  test('int columns render in the totals row like numbers', () => {
    const intCols: ReportColumn[] = [
      { label: 'Jenis', kind: 'label', field: 'Jenis' },
      { label: 'Pcs', kind: 'int', field: 'Pcs' },
    ]
    const html = buildReportTable({
      columns: intCols,
      rows: [{ Jenis: 'A', Pcs: 10 }, { Jenis: 'B', Pcs: 20 }],
      totals: { values: { Pcs: 30 } },
    })
    expect(html).toContain('>30<')
  })

  test('label cells take the first value when the driver returns an array', () => {
    const html = buildReportTable({
      columns: [{ label: 'Jenis', kind: 'label', field: 'Jenis' }],
      rows: [{ Jenis: ['A.017209', 'A.017209'] }],
    })
    expect(html).toContain('>A.017209<')
    expect(html).not.toContain('A.017209,A.017209')
  })

  test('date cells normalize SP strings like "18 Sep 2026"', () => {
    const cols: ReportColumn[] = [{ label: 'Tgl', kind: 'date', field: 'Tgl' }]
    const html = buildReportTable({
      columns: cols,
      rows: [{ Tgl: '18 Sep 2026' }, { Tgl: '01 May 2026' }, { Tgl: '01 Aug 2026' }],
    })
    expect(html).toContain('18-Sep-2026')
    expect(html).toContain('01-Mei-2026')
    expect(html).toContain('01-Agt-2026')
  })

  test('sumInTotal: false keeps the cell empty in the totals row', () => {
    const cols: ReportColumn[] = [
      { label: 'Jenis', kind: 'label', field: 'Jenis' },
      { label: 'Masuk', kind: 'number', field: 'Masuk' },
      { label: 'Tebal', kind: 'number', field: 'Tebal', sumInTotal: false },
    ]
    const html = buildReportTable({
      columns: cols,
      rows: [{ Jenis: 'A', Masuk: 2, Tebal: 3 }],
      totals: { values: { Masuk: 2, Tebal: null } },
    })
    expect(html).toContain('2.0000')
    const totalsRow = html.slice(html.indexOf('totals-row'))
    expect(totalsRow).not.toContain('3.0000')
  })

  test('snapshot factory: no params, no subtitle', () => {
    const report = createSnapshotTableReport({
      type: 'dummy-snapshot',
      title: 'Laporan Snapshot',
      spName: 'SP_Snapshot',
      columns,
    })
    expect(report.paramsSchema.safeParse({}).success).toBe(true)
    // strict: the SP takes no parameters — dates must be rejected loudly.
    expect(report.paramsSchema.safeParse({ tglAwal: '2026-09-01' }).success).toBe(false)
    const rendered = report.render([{ Jenis: 'A' }], {
      requestedBy: 'garda',
      generatedAt: new Date(),
      params: {},
    })
    expect(rendered.html).toContain('Laporan Snapshot')
    expect(rendered.html).not.toContain('<p class="report-subtitle"')
    // no subtitle -> title carries its own bottom gap
    expect(rendered.html).toContain('margin-bottom: 22px')
  })

  test('single-date factory validates { tgl } and subtitles "Per Tanggal :"', () => {
    const report = createSingleDateTableReport({
      type: 'dummy-single-date',
      title: 'Laporan Harian',
      spName: 'SP_Harian',
      inputName: 'EndDate',
      columns,
    })
    expect(
      report.paramsSchema.safeParse({ tgl: '2026-09-23' }).success,
    ).toBe(true)
    expect(report.paramsSchema.safeParse({}).success).toBe(false)
    expect(
      report.paramsSchema.safeParse({ tgl: '23-09-2026' }).success,
    ).toBe(false)
    const rendered = report.render(
      [{ Jenis: 'ST RACIP RAMBUNG' }],
      { requestedBy: 'garda', generatedAt: new Date(), params: { tgl: '2026-09-23' } },
    )
    expect(rendered.html).toContain('Per Tanggal : 23-Sep-2026')
  })

  test('totals object without values auto-sums (label/colspan overrides kept)', () => {
    const report = createSingleDateTableReport({
      type: 'dummy-single-date',
      title: 'Laporan Harian',
      spName: 'SP_Harian',
      inputName: 'EndDate',
      columns: [
        { label: 'No', kind: 'no', width: '40px' },
        { label: 'Jenis', kind: 'label', field: 'Jenis' },
        { label: 'Tebal', kind: 'number', field: 'Tebal', sumInTotal: false },
        { label: 'Masuk', kind: 'number', field: 'Masuk' },
      ],
      totals: { label: 'Total', colspan: 3 },
    })
    const rendered = report.render(
      [
        { Jenis: 'A', Tebal: 3, Masuk: 1.5 },
        { Jenis: 'B', Tebal: 4, Masuk: 2.5 },
      ],
      { requestedBy: 'garda', generatedAt: new Date(), params: { tgl: '2026-09-23' } },
    )
    const totalsRow = rendered.html.slice(rendered.html.indexOf('totals-row'))
    expect(totalsRow).toContain('colspan="3"')
    expect(totalsRow).toContain('4.0000') // Masuk total
    expect(totalsRow).not.toContain('7.0000') // Tebal tidak dijumlahkan
  })

  test('transformRows computes derived columns before totals', () => {
    const report = createSnapshotTableReport({
      type: 'dummy-snapshot',
      title: 'Laporan Rasio',
      spName: 'SP_Snapshot',
      columns: [
        { label: 'Group', kind: 'label', field: 'Group' },
        { label: 'Ton', kind: 'number', field: 'Ton' },
        { label: 'Rasio (%)', kind: 'number', field: 'Rasio', format: (v) => (v === null || v === undefined ? '' : `${v.toFixed(2)}%`) },
      ],
      totals: true,
      transformRows(rows) {
        const total = rows.reduce(
          (sum, r) => sum + (typeof r.Ton === 'number' ? r.Ton : 0),
          0,
        )
        return rows.map((r) => ({
          ...r,
          Rasio: typeof r.Ton === 'number' && total > 0 ? (r.Ton / total) * 100 : null,
        }))
      },
    })
    const rendered = report.render(
      [
        { Group: 'A', Ton: 8.185 },
        { Group: 'B', Ton: 8.185 },
      ],
      { requestedBy: 'garda', generatedAt: new Date(), params: {} },
    )
    expect(rendered.html).toContain('50.00%')
    expect(rendered.html).toContain('100.00%') // total rasio
    expect(rendered.html).toContain('16.3700') // total Ton
  })

  test('single-table endOnly binding still validates the period schema', () => {
    const report = createSingleTableReport({
      type: 'dummy-end-only',
      title: 'Laporan End Only',
      spName: 'SP_EndOnly',
      inputNames: { tglAkhir: 'EndDate' },
      bindMode: 'endOnly',
      columns,
    })
    expect(
      report.paramsSchema.safeParse({ tglAwal: '2026-09-01', tglAkhir: '2026-09-23' })
        .success,
    ).toBe(true)
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

  test('totals: true sums number and int columns, honoring sumInTotal: false', () => {
    const report = createSingleTableReport({
      type: 'dummy-sum',
      title: 'Laporan Sum',
      spName: 'SP_Dummy',
      columns: [
        { label: 'Jenis', kind: 'label', field: 'Jenis' },
        { label: 'Masuk', kind: 'number', field: 'Masuk' },
        { label: 'Tebal', kind: 'number', field: 'Tebal', sumInTotal: false },
        { label: 'Jlh Btg', kind: 'int', field: 'JlhBtg' },
      ],
      totals: true,
    })
    const rendered = report.render(
      [
        { Jenis: 'A', Masuk: 1.5, Tebal: 3, JlhBtg: 10 },
        { Jenis: 'B', Masuk: 2.5, Tebal: 4, JlhBtg: 20 },
      ],
      meta,
    )
    expect(rendered.html).toContain('4.0000') // Masuk total
    expect(rendered.html).toContain('>30</td>') // Jlh Btg int total
    const totalsRow = rendered.html.slice(rendered.html.indexOf('totals-row'))
    expect(totalsRow).not.toContain('7.0000') // Tebal tidak dijumlahkan
  })

  test('named style preset is applied by the shared shell', () => {
    const rendered = renderWpsReportPage({
      title: 'Laporan Styling',
      bodyHtml: '<p>Isi</p>',
      style: 'dashboard_reproses',
    })
    expect(rendered.html).toContain('.dashboard-reproses-table')
    expect(rendered.html).toContain('border: 0.6px solid #000')
  })
})
