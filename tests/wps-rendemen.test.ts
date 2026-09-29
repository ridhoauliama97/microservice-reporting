import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import {
  buildRekapRendemenRows,
  rekapRendemenNonRambungReport,
  rekapRendemenRambungReport,
} from '../src/reports/wps/rekap-rendemen'
import {
  buildRendemenSemuaProses,
  PROSES_ORDER,
  rendemenSemuaProsesReport,
} from '../src/reports/wps/rendemen-semua-proses'
import {
  buildRendemenRows as buildSpkRendemen,
  groupLabelRows,
  produksiPerSpkReport,
} from '../src/reports/wps/produksi-per-spk'

/**
 * Three reports that read the yield chain.
 *
 * The pair "Rekap Rendemen Rambung" / "Non Rambung" is one report twice: the
 * legacy services are byte-for-byte the same apart from the config key that
 * picks the stored procedure, so both come out of one factory here.
 */

describe('Rekap Rendemen pair', () => {
  const spRow = (over: Record<string, unknown> = {}) => ({
    Tahun: 2026,
    Bulan: 8,
    KBKeluarTon: 90.18,
    STMasukTon: 16.6036,
    STKeluarTon: 220.6731,
    WIPMasukM3: null,
    WIPPemakaianNetM3: null,
    BJMasukM3: null,
    ...over,
  })

  test('the two reports differ only in type, title and procedure', () => {
    expect(rekapRendemenRambungReport.type).toBe('rekap-rendemen-rambung')
    expect(rekapRendemenNonRambungReport.type).toBe('rekap-rendemen-non-rambung')
    expect(rekapRendemenRambungReport.title).toBe('Laporan Rekap Rendemen Rambung')
    expect(rekapRendemenNonRambungReport.title).toBe('Laporan Rekap Rendemen Non Rambung')
  })

  test('%ST/KB is ST Masuk over KB Keluar, as a percentage', () => {
    const [row] = buildRekapRendemenRows([spRow()])
    expect(row!.pctStKb).toBeCloseTo((16.6036 / 90.18) * 100, 9)
  })

  test('a NULL anywhere leaves the whole chain NULL rather than zero', () => {
    // WIP and BJ come back NULL for every real month, and %Total is built from
    // %BJ/ST and %ST/KB, so it has to stay NULL too. Printing 0.00% here would
    // read as "no yield" when it actually means "no data".
    const [row] = buildRekapRendemenRows([spRow()])
    expect(row!.wipMasukM3).toBeNull()
    expect(row!.pctWipSt).toBeNull()
    expect(row!.pctBjWip).toBeNull()
    expect(row!.pctBjSt).toBeNull()
    expect(row!.pctTotal).toBeNull()
  })

  test('%Total is the product of the three steps, not their sum', () => {
    const [row] = buildRekapRendemenRows([
      spRow({ WIPMasukM3: 10, WIPPemakaianNetM3: 20, BJMasukM3: 5 }),
    ])
    const stKb = (16.6036 / 90.18) * 100
    const wipSt = (10 / 220.6731) * 100
    const bjWip = (5 / 20) * 100
    const bjSt = (bjWip / 100) * (wipSt / 100) * 100
    const total = (bjSt / 100) * (stKb / 100) * 100
    expect(row!.pctBjSt).toBeCloseTo(bjSt, 9)
    expect(row!.pctTotal).toBeCloseTo(total, 9)
  })

  test('a zero denominator does not divide by zero', () => {
    const [row] = buildRekapRendemenRows([spRow({ KBKeluarTon: 0 })])
    expect(row!.pctStKb).toBeNull()
  })

  test('a value with a swapped decimal separator is still read as a number', () => {
    const [row] = buildRekapRendemenRows([spRow({ KBKeluarTon: '1.234,56' })])
    expect(row!.kbKeluarTon).toBeCloseTo(1234.56, 6)
  })

  test('the year is printed without a thousands separator', () => {
    // formatInt would render 2026 as "2,026", which is nonsense for a year.
    const html = rekapRendemenRambungReport.render(buildRekapRendemenRows([spRow()]), {
      requestedBy: 'Garda',
      generatedAt: new Date('2026-08-31T09:00:00Z'),
      params: { tahun: 2026, bulan: 8 },
    }).html
    expect(html).toContain('>2026<')
    expect(html).not.toContain('2,026')
  })

  test('the subtitle names the month the report starts at', () => {
    // The procedure returns the requested month AND the ones after it, so this
    // is a starting month, not the whole period.
    const html = rekapRendemenRambungReport.render(buildRekapRendemenRows([spRow()]), {
      requestedBy: 'Garda',
      generatedAt: new Date('2026-08-31T09:00:00Z'),
      params: { tahun: 2026, bulan: 8 },
    }).html
    expect(html).toContain('Mulai Periode Agustus 2026')
  })

  test('a NULL chain renders as empty cells, never as 0.00', () => {
    const html = rekapRendemenRambungReport.render(buildRekapRendemenRows([spRow()]), {
      requestedBy: 'Garda',
      generatedAt: new Date('2026-08-31T09:00:00Z'),
      params: { tahun: 2026, bulan: 8 },
    }).html
    expect(html).not.toContain('0.00%')
  })

  test('the percentage is not rescaled by the legacy "<= 1.5 means fraction" guess', () => {
    // That heuristic turned a real 0.5% reading into 50.0%. The service already
    // multiplied by 100, so a sub-1.5% reading must print as it stands.
    const [row] = buildRekapRendemenRows([
      spRow({ STMasukTon: 0.5, KBKeluarTon: 100 }),
    ])
    const html = rekapRendemenRambungReport.render(buildRekapRendemenRows([spRow({ STMasukTon: 0.5, KBKeluarTon: 100 })]), {
      requestedBy: 'Garda',
      generatedAt: new Date('2026-08-31T09:00:00Z'),
      params: { tahun: 2026, bulan: 8 },
    }).html
    expect(row!.pctStKb).toBeCloseTo(0.5, 9)
    expect(html).toContain('0.50%')
    expect(html).not.toContain('50.00%')
  })

  /**
   * The figures used to ask for Calibri, which resolves to Carlito in the
   * Gotenberg container. At 9px across thirteen columns the digits ran
   * together and were hard to read, so they take the body font like every
   * other column on the page.
   */
  test('the figures take the body font rather than Calibri', () => {
    const all = readFileSync(join(process.cwd(), 'src', 'reports', 'wps', 'styles.ts'), 'utf8')
    const css = /const REKAP_RENDEMEN_CSS = `([\s\S]*?)`;/.exec(all)![1]!
    const numeric = /\.rekap-rendemen-table td\.number\s*\{([^}]*)\}/.exec(css)![1]!
    expect(numeric).toMatch(/text-align:\s*right/)
    // The rule must not name a font of its own.
    expect(numeric).not.toMatch(/font-family/)
    // And nothing else in the preset may reintroduce one for these cells.
    expect(css).not.toMatch(/\.rekap-rendemen-table[^{]*\{[^}]*font-family/)
  })

  test('an empty result set says "Tidak ada data"', () => {
    const html = rekapRendemenRambungReport.render([], {
      requestedBy: 'Garda',
      generatedAt: new Date('2026-08-31T09:00:00Z'),
      params: { tahun: 2026, bulan: 8 },
    }).html
    expect(html).toContain('Tidak ada data')
  })
})

describe('Rendemen Semua Proses', () => {
  const row = (over: Record<string, unknown>) => ({
    Tanggal: '2026-08-01',
    Input: 10,
    Output: 9,
    GRP: 'S4S',
    ...over,
  })

  test('the seven processes are ordered by the production line, not alphabetically', () => {
    // The procedure answers alphabetically, so without an explicit order the
    // report would read CCA, FJ, LMT, MLD, PACK, S4S, SAND.
    const data = buildRendemenSemuaProses([
      row({ GRP: 'PACK' }),
      row({ GRP: 'SAND' }),
      row({ GRP: 'CCA' }),
      row({ GRP: 'S4S' }),
    ])
    expect(data.groups.map((g) => g.name)).toEqual(['S4S', 'SAND', 'PACK', 'CCA'])
    expect(PROSES_ORDER[0]).toBe('S4S')
  })

  test('an unrecognised process is kept and appended, not dropped', () => {
    const data = buildRendemenSemuaProses([row({ GRP: 'S4S' }), row({ GRP: 'REPROSES' })])
    expect(data.groups.map((g) => g.name)).toEqual(['S4S', 'REPROSES'])
  })

  test('a group missing from one date leaves that cell blank, not zero', () => {
    const data = buildRendemenSemuaProses([
      row({ GRP: 'S4S', Tanggal: '2026-08-01' }),
      row({ GRP: 'S4S', Tanggal: '2026-08-02' }),
      row({ GRP: 'MLD', Tanggal: '2026-08-01' }),
    ])
    expect(data.dates).toEqual(['2026-08-01', '2026-08-02'])
    const html = rendemenSemuaProsesReport.render(data, {
      requestedBy: 'Garda',
      generatedAt: new Date('2026-08-31T09:00:00Z'),
      params: { tglAwal: '2026-08-01', tglAkhir: '2026-08-31' },
    }).html
    // MLD has no line on the 2nd, so the MLD block for that date is empty.
    const row2 = html.split('02-Agt-2026')[1]!.split('</tr>')[0]!
    expect(row2).not.toContain('MLD')
  })

  test('rendemen is NULL when the input is zero, not an infinity or a zero', () => {
    const data = buildRendemenSemuaProses([row({ Input: 0, Output: 0 })])
    expect(data.groups[0]!.rendemen).toBeNull()
    expect(data.grandRendemen).toBeNull()
  })

  test('the grand totals sum every group', () => {
    const data = buildRendemenSemuaProses([
      row({ GRP: 'S4S', Input: 10, Output: 8 }),
      row({ GRP: 'MLD', Input: 5, Output: 4 }),
    ])
    expect(data.grandInput).toBeCloseTo(15, 9)
    expect(data.grandOutput).toBeCloseTo(12, 9)
    expect(data.grandRendemen).toBeCloseTo((12 / 15) * 100, 9)
  })

  test('a date with no rows at all is not listed', () => {
    const data = buildRendemenSemuaProses([row({ Tanggal: '' })])
    expect(data.dates).toEqual([])
  })

  test('the report is landscape: seven processes need 24 figure columns', () => {
    const result = rendemenSemuaProsesReport.render(buildRendemenSemuaProses([row({})]), {
      requestedBy: 'Garda',
      generatedAt: new Date('2026-08-31T09:00:00Z'),
      params: { tglAwal: '2026-08-01', tglAkhir: '2026-08-31' },
    })
    expect(result.landscape).toBe(true)
  })

  test('an empty result set says "Tidak ada data" and omits the summary', () => {
    const html = rendemenSemuaProsesReport.render(buildRendemenSemuaProses([]), {
      requestedBy: 'Garda',
      generatedAt: new Date('2026-08-31T09:00:00Z'),
      params: { tglAwal: '2026-08-01', tglAkhir: '2026-08-31' },
    }).html
    expect(html).toContain('Tidak ada data')
    expect(html).not.toContain('Rangkuman')
  })
})

describe('Produksi Per SPK', () => {
  /** Renders the report for an order that has real dimensions and a full yield. */
  const renderSpk = (): string =>
    produksiPerSpkReport.render(
      {
        header: {
          noSpk: '2026-52',
          tanggal: '28-Agt-2026',
          tujuan: 'JAPAN',
          buyer: 'HKS',
          noContract: 'RU/HKS/2026/1',
          status: 'Aktif',
        },
        dimensions: [
          { jenis: 'JABON', tebal: 20, lebar: 40 },
          { jenis: 'JABON', tebal: 25, lebar: 40 },
        ],
        rendemen: buildSpkRendemen([
          { Group: 'S4S', Input: 71.5262, Output: 77.4098, Rend: 108.23, RendGlobal: 75.27 },
          { Group: 'FJ', Input: 77.7503, Output: 66.309, Rend: 85.28, RendGlobal: 75.27 },
        ]),
        rendemenGlobal: 75.2709,
        aliveLabels: [],
        missLabels: [],
      },
      {
        requestedBy: 'Garda',
        generatedAt: new Date('2026-08-31T09:00:00Z'),
        params: { noSpk: '2026-52' },
      },
    ).html

  const preset = (): string => {
    const all = readFileSync(join(process.cwd(), 'src', 'reports', 'wps', 'styles.ts'), 'utf8')
    return /const PRODUKSI_PER_SPK_CSS = `([\s\S]*?)`;/.exec(all)![1]!
  }

  test('all seven processes are listed even when the procedure omits one', () => {
    // A process with no activity is missing from the result set entirely, which
    // would leave a hole in the table.
    const rows = buildSpkRendemen([
      { Group: 'S4S', Input: 10, Output: 9, Rend: 90, RendGlobal: 80 },
      { Group: 'PACK', Input: 3, Output: 3, Rend: 100, RendGlobal: 80 },
    ])
    expect(rows.map((r) => r.group)).toEqual([
      'S4S', 'FJ', 'MLD', 'LMT', 'CCA', 'SAND', 'PACK',
    ])
    expect(rows.find((r) => r.group === 'FJ')!.input).toBeNull()
  })

  test('the group name is matched case-insensitively', () => {
    // Upstream spells the same process both CCAkhir and CCAKHIR; the key is a
    // label and is never compared, so it only has to line up with the order.
    const rows = buildSpkRendemen([{ Group: 'ccakhir', Input: 1, Output: 1, Rend: 100 }])
    expect(rows.find((r) => r.group === 'CCA')).toBeDefined()
  })

  test('Rendemen Global is the first non-null value the procedure reports', () => {
    const data = buildSpkRendemen([
      { Group: 'S4S', Input: 1, Output: 1, Rend: 100, RendGlobal: 75.27 },
      { Group: 'FJ', Input: 1, Output: 1, Rend: 100, RendGlobal: 75.27 },
    ])
    const html = produksiPerSpkReport.render(
      {
        header: { noSpk: 'X', tanggal: '', tujuan: '', buyer: '', noContract: '', status: '' },
        dimensions: [],
        rendemen: data,
        rendemenGlobal: data.find((r) => r.rendGlobal !== null)?.rendGlobal ?? null,
        aliveLabels: [],
        missLabels: [],
      },
      { requestedBy: 'Garda', generatedAt: new Date('2026-08-31T09:00:00Z'), params: { noSpk: 'X' } },
    ).html
    expect(html).toContain('Rendemen Global : 75.27%')
  })

  test('label rows are grouped by category, known ones first in flow order', () => {
    const groups = groupLabelRows([
      { Kategori: 'PACK', Jenis: 'JABON', NoLabel: 'I.1', Total: 1 },
      { Kategori: 'S4S', Jenis: 'JABON', NoLabel: 'R.1', Total: 2 },
      { Kategori: 'S4S', Jenis: 'PULAI', NoLabel: 'R.2', Total: 3 },
      { Kategori: 'LAINNYA', Jenis: 'X', NoLabel: 'Z.1', Total: 4 },
    ])
    expect(groups.map((g) => g.name)).toEqual(['S4S', 'PACK', 'LAINNYA'])
    expect(groups[0]!.rows).toHaveLength(2)
    expect(groups[0]!.total).toBeCloseTo(5, 9)
  })

  /**
   * The two header tables sit side by side, 49% each with a 2% spacer, the
   * same split the Produksi Per Nomor Produksi reports use. Stacked, the narrow
   * dimensions table left a wide empty band beside it and the yield table
   * started a third of the way down the page.
   */
  test('the dimensions and yield tables share one row with a spacer between', () => {
    const html = renderSpk()
    // Matched on the full cell tag: the header block above also uses a
    // "meta-pane-left" cell, which a bare "left-pane" search would hit first.
    const left = '<td class="left-pane">'
    const gutter = '<td class="gutter"></td>'
    const right = '<td class="right-pane">'
    expect(html).toContain(left)
    expect(html).toContain(gutter)
    expect(html).toContain(right)
    const at = (s: string, from = 0): number => html.indexOf(s, from)
    expect(at(left)).toBeLessThan(at(gutter))
    expect(at(gutter)).toBeLessThan(at(right))
    // And the spacer sits between the two tables, not outside them.
    const dim = '<table class="report-table spk-dimension-table">'
    const yld = '<table class="report-table spk-rendemen-table">'
    const first = at(dim)
    expect(first).toBeGreaterThan(-1)
    expect(at(yld, first + dim.length)).toBeGreaterThan(at(gutter))
  })

  /**
   * Input, Output and Rend are the only figure columns in the yield table, and
   * they take the body font that Tebal and Lebar use in the dimensions table.
   * The Calibri face they used to carry made two tables on the same page look
   * like they came from different reports.
   */
  test('Input, Output and Rend take the body font, not the Calibri face', () => {
    const css = preset()
    expect(css).toMatch(/\.report-table td\.rend-value\s*\{[^}]*text-align:\s*right/)
    // The rule must not reintroduce a font-family of its own.
    expect(css).not.toMatch(/\.report-table td\.rend-value\s*\{[^}]*font-family/)
    const html = renderSpk()
    expect(html).toContain('class="rend-value"')
    // No figure cell in the yield table may still use the Calibri class.
    const tfoot = /<table class="report-table spk-rendemen-table">[\s\S]*?<\/table>/.exec(html)![0]
    expect(tfoot).not.toContain('class="number"')
  })

  test('an unknown NoSPK still renders all seven groups and the empty state', () => {
    const html = produksiPerSpkReport.render(
      {
        header: { noSpk: 'ZZ.999999', tanggal: '', tujuan: '', buyer: '', noContract: '', status: '' },
        dimensions: [],
        rendemen: buildSpkRendemen([]),
        rendemenGlobal: null,
        aliveLabels: [],
        missLabels: [],
      },
      { requestedBy: 'Garda', generatedAt: new Date('2026-08-31T09:00:00Z'), params: { noSpk: 'ZZ.999999' } },
    ).html
    for (const g of ['S4S', 'FJ', 'MLD', 'LMT', 'CCA', 'SAND', 'PACK']) {
      expect(html).toContain(`<td>${g}</td>`)
    }
    expect(html).toContain('Tidak ada data')
    expect(html).toContain('Rendemen Global<')
  })
})
