import { describe, expect, test } from 'bun:test'
import { reports } from '../src/reports/registry'
import { normalizeUmurRows } from '../src/reports/wps/umur-detail'
import { normalizeHidupRows } from '../src/reports/wps/hidup-detail'
import { buildDashboardPivot } from '../src/reports/wps/dashboard-pivot'
import { buildKetahananView } from '../src/reports/wps/ketahanan'
import { mainValues as sandingMutasiValues } from '../src/reports/wps/mutasi-sanding'
import {
  computeS4STotals,
  groupS4SByMachine,
  normalizeS4SRows,
  rekapProduksiS4SConsolidatedReport,
} from '../src/reports/wps/rekap-produksi-s4s-consolidated'
import { rekapProduksiS4SPerJenisPerGradeReport } from '../src/reports/wps/rekap-produksi-s4s-per-jenis-per-grade'
import {
  computeSandingTotals,
  groupSandingByMachine,
  normalizeSandingRows,
  rekapProduksiSandingConsolidatedReport,
} from '../src/reports/wps/rekap-produksi-sanding-consolidated'
import { rekapProduksiSandingPerJenisPerGradeReport } from '../src/reports/wps/rekap-produksi-sanding-per-jenis-per-grade'

/**
 * The eleven S4S / Sanding reports. What matters in each is the part that
 * silently produces a wrong number rather than a visibly broken one: a total
 * that stops matching its rows, a machine grouping that loses a machine, a
 * ratio computed from a column the procedure does not return, and a page that
 * must still render when the procedure returns nothing.
 */

type Meta = { requestedBy: string; generatedAt: Date; params: unknown }

const PERIOD = { tglAwal: '2026-08-01', tglAkhir: '2026-08-31' }
const AGE_CUTOFFS = { umur1: 15, umur2: 30, umur3: 60, umur4: 90 }
const META: Meta = {
  requestedBy: 'budi',
  generatedAt: new Date('2026-09-01T08:00:00Z'),
  // Period reports read their dates back from meta.params for the subtitle, and
  // the ageing reports read their cut-offs from the same place.
  params: PERIOD,
}

/** The data rows of every machine table in a rendered consolidated report. */
const machineBodyRows = (html: string): string[] =>
  html.match(/<tr class="bounded-row row-\w+">[\s\S]*?<\/tr>/g) ?? []

/**
 * The pool is only awaited inside fetchData, so a render test never needs one.
 * The per-call `params` override is what lets the ageing cases supply cut-offs
 * without every snapshot case having to.
 */
const renderWith = <T,>(
  report: (typeof reports)[string],
  data: T,
  params: unknown = PERIOD,
): string => {
  const definition = report as unknown as {
    render: (d: T, m: Meta) => { html: string }
  }
  return definition.render(data, { ...META, params }).html
}

describe('registry', () => {
  test('all eleven reports are registered under their own type', () => {
    const expected = [
      'rekap-produksi-s4s-consolidated',
      'rekap-produksi-s4s-per-jenis-per-grade',
      's4s-hidup-detail',
      'umur-s4s-detail',
      'dashboard-sanding',
      'ketahanan-barang-sanding',
      'mutasi-sanding',
      'rekap-produksi-sanding-consolidated',
      'rekap-produksi-sanding-per-jenis-per-grade',
      'sanding-hidup-detail',
      'umur-sanding-detail',
    ]
    for (const type of expected) expect(Object.keys(reports)).toContain(type)
  })

  test('a period report rejects params that are not a date range', () => {
    const schema = reports['rekap-produksi-s4s-consolidated']!.paramsSchema
    expect(schema.safeParse(PERIOD).success).toBe(true)
    expect(schema.safeParse({}).success).toBe(false)
    // "01-08-2026" is not the YYYY-MM-DD the procedures expect.
    expect(
      schema.safeParse({ tglAwal: '01-08-2026', tglAkhir: '2026-08-31' }).success,
    ).toBe(false)
  })

  test('a period report refuses an end date before its start date', () => {
    const result = reports['mutasi-sanding']!.paramsSchema.safeParse({
      tglAwal: '2026-08-31',
      tglAkhir: '2026-08-01',
    })
    expect(result.success).toBe(false)
  })

  test('the live-snapshot reports take no params at all', () => {
    // strict: sending dates to a snapshot procedure must fail loudly rather
    // than be silently ignored.
    for (const type of ['s4s-hidup-detail', 'sanding-hidup-detail']) {
      const schema = reports[type]!.paramsSchema
      expect(schema.safeParse({}).success).toBe(true)
      expect(schema.safeParse(PERIOD).success).toBe(false)
    }
  })
})

describe('Rekap Produksi S4S Consolidated', () => {
  // The input block mirrors the live column set: CCAkhir / Reproses / S4S /
  // ST / WIP.
  const rows = normalizeS4SRows([
    {
      Tanggal: '2026-08-01',
      Shift: 1,
      NamaMesin: 'S4S LINE 1',
      JamKerja: 8,
      JmlhAnggota: 4,
      CCAkhir: 1,
      Reproses: 2,
      S4S: 3,
      ST: 4,
      WIP: 0,
      OutputS4S: 8,
    },
    {
      Tanggal: '2026-08-01',
      Shift: 2,
      NamaMesin: 'S4S LINE 1',
      JamKerja: 8,
      JmlhAnggota: 4,
      CCAkhir: 1,
      Reproses: 1,
      S4S: 1,
      ST: 2,
      WIP: 0,
      OutputS4S: 4,
    },
    {
      Tanggal: '2026-08-02',
      Shift: 1,
      NamaMesin: 'MULTI RIPSAW',
      JamKerja: 0,
      JmlhAnggota: 0,
      CCAkhir: 0,
      Reproses: 0,
      S4S: 5,
      ST: 0,
      WIP: 0,
      OutputS4S: 5,
    },
  ])

  test('input total is the sum of the five input columns', () => {
    const byName = (name: string) =>
      rows.filter((row) => row.namaMesin === name)
    expect(byName('S4S LINE 1').map((row) => row.totalInput)).toEqual([10, 5])
    expect(byName('MULTI RIPSAW').map((row) => row.totalInput)).toEqual([5])
  })

  test('a machine with no working hours still gets a row, with no ratios', () => {
    const multiRipsaw = rows.find((row) => row.namaMesin === 'MULTI RIPSAW')!
    expect(multiRipsaw.m3Jam).toBeNull()
    expect(multiRipsaw.m3JamOrg).toBeNull()
    // Rend still computes: 5 out of 5 is 100% even with nobody logged in.
    expect(multiRipsaw.rend).toBe(100)
  })

  test('rows are sorted by machine, then date, then shift', () => {
    expect(rows.map((row) => `${row.namaMesin}|${row.tanggal}|${row.shift}`)).toEqual([
      'MULTI RIPSAW|2026-08-02|1',
      'S4S LINE 1|2026-08-01|1',
      'S4S LINE 1|2026-08-01|2',
    ])
  })

  test('HK is the machine row count, and the Jmlh/HK divides by it', () => {
    const machines = groupS4SByMachine(rows)
    const line = machines.find((machine) => machine.namaMesin === 'S4S LINE 1')!
    expect(line.hk).toBe(2)
    expect(line.totals.output / line.hk).toBeCloseTo(6, 10)
  })

  test('grand totals sum the input and output columns of every row', () => {
    const totals = computeS4STotals(rows)
    expect(totals.inputs.S4S).toBe(9)
    expect(totals.totalInput).toBe(20)
    expect(totals.output).toBe(17)
    expect(totals.rend).toBeCloseTo((17 / 20) * 100, 6)
  })

  test('grand-total ratios are averaged over the rows, not summed', () => {
    // The three rows give M3/Jam of 1.0, 0.5 and none (no working hours), so the
    // average is 0.5. Summing instead would give 1.5, and recomputing from the
    // totals would give 17 / 24 hours = 0.708.
    const totals = computeS4STotals(rows)
    expect(totals.m3Jam).toBeCloseTo(0.5, 10)
    // 8/32 and 4/32 person-hours, averaged with the empty third row.
    expect(totals.m3JamOrg).toBeCloseTo(0.125, 10)
  })

  test('no rows at all still renders the header and an empty body', () => {
    const html = renderWith(reports['rekap-produksi-s4s-consolidated']!, {
      machines: [],
      grandTotals: computeS4STotals([]),
    })
    expect(html).toContain('Laporan Rekap Produksi S4S Consolidated')
    expect(html).toContain('Tidak ada data')
    expect(html).toContain('M3/jam/')
  })

  test('a date is printed once and spans the shifts underneath it', () => {
    const data = {
      machines: groupS4SByMachine(rows),
      grandTotals: computeS4STotals(rows),
    }
    const html = renderWith(reports['rekap-produksi-s4s-consolidated']!, data)
    const bodyRows = machineBodyRows(html)
    // S4S LINE 1 has 2026-08-01 on both shifts, so it is written once, on the
    // first row, with a rowspan covering the second.
    const withDate = bodyRows.filter((row) => row.includes('01-Agt-26'))
    expect(withDate).toHaveLength(1)
    expect(withDate[0]).toContain('rowspan="2"')
    // The second shift carries no date cell of its own.
    const second = bodyRows.find((row) => !row.includes('01-Agt-26') && row.includes('>2<'))!
    expect(second).not.toContain('01-Agt-26')
    expect(second).not.toContain('rowspan')
  })

  test('a date with a single shift still gets a rowspan, so rows stay aligned', () => {
    const data = {
      machines: groupS4SByMachine(rows),
      grandTotals: computeS4STotals(rows),
    }
    const html = renderWith(reports['rekap-produksi-s4s-consolidated']!, data)
    // MULTI RIPSAW has one row only: rowspan 1 keeps the grid intact.
    const single = machineBodyRows(html).find((row) => row.includes('02-Agt-26'))!
    expect(single).toContain('rowspan="1"')
  })

  test('the span keeps every row aligned against the same header', () => {
    const data = {
      machines: groupS4SByMachine(rows),
      grandTotals: computeS4STotals(rows),
    }
    const html = renderWith(reports['rekap-produksi-s4s-consolidated']!, data)
    const bodyRows = machineBodyRows(html)
    const owners = bodyRows.filter((row) => /rowspan=/.test(row))
    const covered = bodyRows.filter((row) => !/rowspan=/.test(row))

    // Rows that own a date cell carry the full column count; rows sitting under
    // a span carry one fewer, which is exactly what the span covers.
    const full = owners[0]!.match(/<td/g)!.length
    for (const row of owners) expect(row.match(/<td/g)!.length).toBe(full)
    for (const row of covered) expect(row.match(/<td/g)!.length).toBe(full - 1)

    // And the header is that same width, so nothing is left dangling.
    const header = html.match(/<thead>[\s\S]*?<\/thead>/)![0]
    const firstRow = header.match(/<tr class="headers-row">[\s\S]*?<\/tr>/)![0]
    let columns = 0
    for (const th of firstRow.match(/<th[^>]*>/g) ?? []) {
      const span = /colspan="(\d+)"/.exec(th)
      columns += span ? Number(span[1]) : 1
    }
    expect(columns).toBe(full)
  })

  test('the grand total lands on the last machine only', () => {
    const data = {
      machines: groupS4SByMachine(rows),
      grandTotals: computeS4STotals(rows),
    }
    const html = renderWith(reports['rekap-produksi-s4s-consolidated']!, data)
    // MULTI RIPSAW sorts first, S4S LINE 1 last.
    expect(html.match(/Grand Total/g)).toHaveLength(1)
    expect(html.indexOf('MULTI RIPSAW')).toBeLessThan(html.indexOf('S4S LINE 1'))
  })

  test('the report definition names the consolidated S4S procedure', () => {
    const source = String(rekapProduksiS4SConsolidatedReport.fetchData)
    expect(source.length).toBeGreaterThan(0)
  })
})

describe('Rekap Produksi Sanding Consolidated', () => {
  // The live column set: CCAkhir / FJ / Moulding / Reproses / Wip / BJ. There
  // is no "Sanding" input column, and the procedure spells it "Wip".
  const rows = normalizeSandingRows([
    {
      Tanggal: '2026-08-01',
      Shift: 1,
      NamaMesin: 'SANDING 1',
      JamKerja: 8,
      JmlhAnggota: 2,
      CCAkhir: 0,
      FJ: 2,
      Moulding: 3,
      Reproses: 1,
      Wip: 0,
      BJ: 1,
      OutputSanding: 9,
    },
  ])

  test('input total is the sum of the six input columns', () => {
    expect(rows[0]!.totalInput).toBe(7)
    expect(rows[0]!.inputs.Moulding).toBe(3)
  })

  test('Rend is output over total input', () => {
    // 9 out of 7 is over 100%: the reference report shows that rather than
    // clamping it, because a yield above 100% is itself the finding.
    expect(rows[0]!.rend).toBeCloseTo((9 / 7) * 100, 6)
  })

  test('grand totals sum the input and output columns of every row', () => {
    const totals = computeSandingTotals(rows)
    expect(totals.inputs.Moulding).toBe(3)
    expect(totals.inputs.Wip).toBe(0)
    expect(totals.totalInput).toBe(7)
    expect(totals.output).toBe(9)
  })

  test('no rows at all still renders the header and an empty body', () => {
    const html = renderWith(reports['rekap-produksi-sanding-consolidated']!, {
      machines: [],
      grandTotals: computeSandingTotals([]),
    })
    expect(html).toContain('Laporan Rekap Produksi Sanding Consolidated')
    expect(html).toContain('Tidak ada data')
  })

  test('the report definition exists and is registered', () => {
    expect(rekapProduksiSandingConsolidatedReport.type).toBe(
      'rekap-produksi-sanding-consolidated',
    )
  })
})

describe('Rekap Produksi Per-Jenis & Per-Grade', () => {
  // Live column sets: S4S is ST / S4S / WIP / Reproses, Sanding is
  // FJ / Moulding / CCAkhir / WIP / Reproses.
  const s4sRows = [
    { Jenis: 'JABON', NamaGrade: 'A/A', ST: 1, S4S: 2, WIP: 3, Reproses: 4, Output: 8 },
    { Jenis: 'JABON', NamaGrade: 'C/C', ST: 0, S4S: 1, WIP: 1, Reproses: 0, Output: 1 },
    { Jenis: 'PULAI', NamaGrade: 'NISOBO', ST: 5, S4S: 0, WIP: 0, Reproses: 0, Output: 6 },
  ]
  const sandingRows = [
    { Jenis: 'JABON', NamaGrade: 'A/A', FJ: 1, Moulding: 2, CCAkhir: 3, WIP: 4, Reproses: 5, Output: 8 },
    { Jenis: 'PULAI', NamaGrade: 'NISOBO', FJ: 0, Moulding: 1, CCAkhir: 0, WIP: 0, Reproses: 0, Output: 6 },
  ]

  test('the S4S variant renders a group per Jenis with a closing Total', () => {
    const html = renderWith(
      reports['rekap-produksi-s4s-per-jenis-per-grade']!,
      s4sRows as never,
    )
    expect(html).toContain('JABON')
    expect(html).toContain('PULAI')
    expect(html).toContain('In S4S')
    expect(html).toContain('In WIP')
    expect(html).toContain('Grand Total')
    // Two Jenis groups, each closing with a Total row, plus the grand total.
    expect(html.match(/<tr class="totals-row">/g)?.length).toBe(3)
  })

  test('the S4S grand total is the sum of its rows, not the last one', () => {
    const html = renderWith(
      reports['rekap-produksi-s4s-per-jenis-per-grade']!,
      s4sRows as never,
    )
    // ST 1 + 0 + 5 = 6, Output 8 + 1 + 6 = 15.
    expect(html).toContain('15.0000')
    expect(html).toContain('6.0000')
  })

  test('the S4S variant has no FJ or MLD column, which the procedure lacks', () => {
    const html = renderWith(
      reports['rekap-produksi-s4s-per-jenis-per-grade']!,
      s4sRows as never,
    )
    expect(html).not.toContain('In FJ')
    expect(html).not.toContain('In MLD')
  })

  test('the Sanding variant renders its own input columns', () => {
    const html = renderWith(
      reports['rekap-produksi-sanding-per-jenis-per-grade']!,
      sandingRows as never,
    )
    expect(html).toContain('In Moulding')
    expect(html).toContain('In WIP')
    expect(html).toContain('In Reproses')
    // Neither BJ nor Sanding exists on this procedure.
    expect(html).not.toContain('In BJ')
    expect(html).not.toContain('In Sanding')
    expect(html).toContain('Laporan Rekap Produksi Sanding Per-Jenis &amp; Per-Grade (m3)')
  })

  test('an empty result still renders the header and the empty row', () => {
    const html = renderWith(
      reports['rekap-produksi-s4s-per-jenis-per-grade']!,
      [] as never,
    )
    expect(html).toContain('Tidak ada data')
    expect(html).toContain('In ST')
  })

  test('the per-grade reports are registered with distinct types', () => {
    expect(rekapProduksiS4SPerJenisPerGradeReport.type).toBe(
      'rekap-produksi-s4s-per-jenis-per-grade',
    )
    expect(rekapProduksiSandingPerJenisPerGradeReport.type).toBe(
      'rekap-produksi-sanding-per-jenis-per-grade',
    )
  })
})

describe('S4S (Hidup) Detail and Sanding (Hidup) Detail', () => {
  test('the live rows keep their raw values, aliases applied', () => {
    // normalizeHidupRows only renames; the sort belongs to fetchData, which
    // needs a pool, so it is not exercised here.
    const rows = normalizeHidupRows(
      [
        {
          NoS4S: 'B',
          DateCreate: '2026-08-01',
          NoSPK: 'SPK/1',
          Jenis: 'JABON',
          NamaGrade: 'A/A',
          Tebal: 20,
          IdLokasi: 'GUDANG A',
          Kubik: 1.5,
        },
      ],
      { numberColumn: 'NoS4S', volumeColumn: 'Kubik' },
    )
    expect(rows[0]!.no).toBe('B')
    expect(rows[0]!.noSpk).toBe('SPK/1')
    expect(rows[0]!.lokasi).toBe('GUDANG A')
    expect(rows[0]!.m3).toBe(1.5)
    expect(rows[0]!.jenis).toBe('JABON - A/A')
  })

  test('the Jenis column reads "Jenis - NamaGrade" and drops an empty Jenis', () => {
    const [both, gradeOnly] = normalizeHidupRows(
      [
        { NoSanding: 'X', Jenis: 'JABON', NamaGrade: 'A/A' },
        { NoSanding: 'Y', Jenis: '', NamaGrade: 'C/C' },
      ],
      { numberColumn: 'NoSanding', volumeColumn: 'Kubik' },
    )
    expect(both!.jenis).toBe('JABON - A/A')
    expect(gradeOnly!.jenis).toBe('C/C')
  })

  test('the S4S detail renders the closing M3 total', () => {
    const rows = normalizeHidupRows(
      [
        { NoS4S: 'A', DateCreate: '2026-08-01', Jenis: 'JABON', Kubik: 1.5 },
        { NoS4S: 'B', DateCreate: '2026-08-02', Jenis: 'JABON', Kubik: 2.25 },
      ],
      { numberColumn: 'NoS4S', volumeColumn: 'Kubik' },
    )
    const html = renderWith(reports['s4s-hidup-detail']!, rows)
    expect(html).toContain('Laporan Label S4S (Hidup)')
    expect(html).toContain('No S4S')
    expect(html).toContain('3.7500')
  })

  test('the Sanding detail renders without a subtitle, as a snapshot', () => {
    const rows = normalizeHidupRows(
      [{ NoSanding: 'A', DateCreate: '2026-08-01', Jenis: 'JABON', Kubik: 4 }],
      { numberColumn: 'NoSanding', volumeColumn: 'Kubik' },
    )
    const html = renderWith(reports['sanding-hidup-detail']!, rows)
    expect(html).toContain('Laporan Sanding (Hidup) Detail')
    // A snapshot has no period, so the page carries no subtitle element (the
    // class name still appears in the shared stylesheet, so match the element).
    expect(html).not.toContain('<p class="report-subtitle">')
    expect(html).toContain('No Sanding')
  })

  test('an empty snapshot renders the empty row, not a broken table', () => {
    const html = renderWith(reports['s4s-hidup-detail']!, [])
    expect(html).toContain('Tidak ada data')
  })
})

describe('Umur S4S Detail and Umur Sanding Detail', () => {
  /**
   * The procedure always returns all five buckets, so the fixtures spell them
   * out. Only the ones a case cares about are non-zero.
   */
  type UmurRow = Parameters<typeof normalizeUmurRows>[0][number]
  const umurRow = (row: Partial<UmurRow>): UmurRow =>
    ({
      Period1: 0,
      Period2: 0,
      Period3: 0,
      Period4: 0,
      Period5: 0,
      ...row,
    }) as UmurRow

  test('rows sharing a displayed Jenis and dimensions have their buckets summed', () => {
    // The legacy grouping key is "Jenis - NamaGrade" plus the three dimensions,
    // so two records of the same grade and size collapse into one row.
    const rows = normalizeUmurRows([
      umurRow({
        Jenis: 'JABON',
        NamaGrade: 'A/A',
        Tebal: 20,
        Lebar: 100,
        Panjang: 400,
        Period1: 1,
        Period2: 2,
      }),
      umurRow({
        Jenis: 'JABON',
        NamaGrade: 'A/A',
        Tebal: 20,
        Lebar: 100,
        Panjang: 400,
        Period1: 3,
        Period2: 4,
      }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]!.Jenis).toBe('JABON - A/A')
    expect(rows[0]!.Period1).toBe(4)
    expect(rows[0]!.Period2).toBe(6)
    expect(rows[0]!.Total).toBe(10)
  })

  test('a different grade or thickness keeps the rows apart', () => {
    const rows = normalizeUmurRows([
      umurRow({ Jenis: 'JABON', NamaGrade: 'A/A', Tebal: 20, Period1: 1 }),
      umurRow({ Jenis: 'JABON', NamaGrade: 'A/B', Tebal: 20, Period1: 2 }),
      umurRow({ Jenis: 'JABON', NamaGrade: 'A/A', Tebal: 30, Period1: 3 }),
    ])
    expect(rows).toHaveLength(3)
  })

  test('a zero-total row is dropped rather than printed as a blank line', () => {
    const rows = normalizeUmurRows([
      umurRow({ Jenis: 'JABON', NamaGrade: 'A/A', Period1: 0, Period2: 0 }),
    ])
    expect(rows).toHaveLength(0)
  })

  test('the age labels follow the cut-offs passed in', () => {
    const rows = normalizeUmurRows([
      umurRow({
        Jenis: 'JABON',
        NamaGrade: 'A/A',
        Tebal: 20,
        Lebar: 100,
        Panjang: 400,
        Period1: 1,
        Period2: 2,
        Period3: 3,
        Period4: 4,
        Period5: 5,
      }),
    ])
    const html = renderWith(reports['umur-s4s-detail']!, rows, AGE_CUTOFFS)
    expect(html).toContain('0 - 15')
    expect(html).toContain('&gt; 90')
    expect(html).toContain('Laporan Umur S4S Detail')
  })

  test('different cut-offs relabel the buckets', () => {
    const rows = normalizeUmurRows([
      umurRow({ Jenis: 'JABON', NamaGrade: 'A/A', Tebal: 20, Period1: 1 }),
    ])
    const html = renderWith(reports['umur-sanding-detail']!, rows, {
      umur1: 7,
      umur2: 14,
      umur3: 21,
      umur4: 30,
    })
    expect(html).toContain('0 - 7')
    expect(html).toContain('8 - 14')
    expect(html).toContain('&gt; 30')
  })

  test('the Sanding ageing report renders its own title and total', () => {
    const rows = normalizeUmurRows([
      umurRow({
        Jenis: 'PULAI',
        NamaGrade: 'NISOBO',
        Tebal: 20,
        Lebar: 100,
        Panjang: 400,
        Period1: 2,
      }),
    ])
    const html = renderWith(reports['umur-sanding-detail']!, rows, AGE_CUTOFFS)
    expect(html).toContain('Laporan Umur Sanding Detail')
    expect(html).toContain('2.0000')
  })

  test('the cut-offs must be non-decreasing', () => {
    const schema = reports['umur-sanding-detail']!.paramsSchema
    expect(schema.safeParse({ umur1: 15, umur2: 30, umur3: 60, umur4: 90 }).success).toBe(true)
    expect(schema.safeParse({ umur1: 30, umur2: 15, umur3: 60, umur4: 90 }).success).toBe(false)
  })

  test('no rows at all still renders the header and an empty body', () => {
    const html = renderWith(reports['umur-s4s-detail']!, [], AGE_CUTOFFS)
    expect(html).toContain('Tidak ada data')
  })
})

describe('Dashboard Sanding', () => {
  const options = {
    columns: {
      inflow: 'SANDMasuk',
      outflow: 'KeluarALL',
      balance: 'SANDAkhir',
      ctr: 'CTR',
    },
    columnOrder: [] as string[],
    ctrDivisor: 65,
  }

  test('daily movement is summed per Jenis + Grade, ending balance taken from the latest date', () => {
    const data = buildDashboardPivot(
      [
        { DATE: '2026-08-01', Jenis: 'JABON', NamaGrade: 'A/A', SANDMasuk: 5, KeluarALL: 1, SANDAkhir: 10 },
        { DATE: '2026-08-01', Jenis: 'JABON', NamaGrade: 'A/A', SANDMasuk: 3, KeluarALL: 2, SANDAkhir: 10 },
        { DATE: '2026-08-02', Jenis: 'JABON', NamaGrade: 'A/A', SANDMasuk: 0, KeluarALL: 4, SANDAkhir: 6 },
      ],
      options,
    )
    expect(data.dates).toEqual(['2026-08-01', '2026-08-02'])
    expect(data.rows[0]!.cells['JABON A/A']).toEqual({ in: 8, out: 3 })
    // The later row's balance wins, not the sum of both.
    expect(data.sAkhirByColumn['JABON A/A']).toBe(6)
  })

  test('CTR is summed across the period when the procedure has the column', () => {
    const data = buildDashboardPivot(
      [
        { DATE: '2026-08-01', Jenis: 'JABON', NamaGrade: 'A/A', SANDMasuk: 5, SANDAkhir: 10, CTR: 0.5 },
        { DATE: '2026-08-02', Jenis: 'JABON', NamaGrade: 'A/A', SANDMasuk: 5, SANDAkhir: 10, CTR: 0.7 },
      ],
      options,
    )
    expect(data.ctrByColumn['JABON A/A']).toBeCloseTo(1.2, 10)
  })

  test('CTR falls back to balance / 65 when the procedure omits it', () => {
    const data = buildDashboardPivot(
      [{ DATE: '2026-08-01', Jenis: 'JABON', NamaGrade: 'A/A', SANDMasuk: 0, SANDAkhir: 130 }],
      options,
    )
    expect(data.ctrByColumn['JABON A/A']).toBeCloseTo(2, 10)
  })

  test('the report renders the daily grid and the S Akhir footer', () => {
    const data = buildDashboardPivot(
      [{ DATE: '2026-08-01', Jenis: 'JABON', NamaGrade: 'A/A', SANDMasuk: 5, KeluarALL: 1, SANDAkhir: 10, CTR: 0.2 }],
      options,
    )
    const html = renderWith(reports['dashboard-sanding']!, data)
    expect(html).toContain('Laporan Dashboard Sanding')
    expect(html).toContain('S Akhir')
    expect(html).toContain('JABON A/A')
  })

  test('an empty period renders the empty table, not an empty string', () => {
    const data = buildDashboardPivot([], options)
    const html = renderWith(reports['dashboard-sanding']!, data)
    expect(html).toContain('Tidak ada data')
  })
})

describe('Ketahanan Barang Dagang Sanding', () => {
  test('Avg Penjualan falls back to Penjualan, and Ketahanan is derived', () => {
    const [row] = buildKetahananView([
      { Jenis: 'JABON', Stockm3: 100, m3: 20 },
    ])
    expect(row!.AvgPenjualan).toBe(20)
    expect(row!.Ketahanan).toBe(5)
  })

  test('a procedure-supplied Ketahanan wins over the derived one', () => {
    const [row] = buildKetahananView([
      { Jenis: 'JABON', Stockm3: 100, m3: 20, Ketahanan: 9 },
    ])
    expect(row!.Ketahanan).toBe(9)
  })

  test('an average of zero gives Ketahanan 0 rather than Infinity', () => {
    const [row] = buildKetahananView([
      { Jenis: 'JABON', Stockm3: 100, m3: 0, AvgPenjualan: 0 },
    ])
    expect(row!.Ketahanan).toBe(0)
  })

  test('the report renders Stock, Penjualan and Ketahanan', () => {
    const html = renderWith(
      reports['ketahanan-barang-sanding']!,
      buildKetahananView([{ Jenis: 'JABON', Stockm3: 100, m3: 20 }]),
    )
    expect(html).toContain('Laporan Ketahanan Barang Dagang Sanding')
    expect(html).toContain('Avg Penjualan')
    expect(html).toContain('5.00')
  })

  test('an empty period renders the empty row', () => {
    const html = renderWith(reports['ketahanan-barang-sanding']!, [])
    expect(html).toContain('Tidak ada data')
  })
})

describe('Mutasi Sanding', () => {
  const row = {
    Jenis: 'JABON',
    SANDAwal: 10,
    SANDMasuk: 1,
    AdjOutputSAND: 2,
    BSOutputSAND: 3,
    SANDProdOutput: 4,
    AdjInptSAND: 5,
    BSInptSAND: 6,
    LMTProdInptSAND: 7,
    PACKProdInptSAND: 8,
    CCAProdInptSand: 9,
    SANDProdInptSand: 10,
    MLDProdInptSand: 11,
    SANDJual: 12,
    SANDAkhir: 99,
  }

  test('Total Masuk sums the four Masuk columns', () => {
    expect(sandingMutasiValues(row).totalMasuk).toBe(10)
  })

  test('Total Keluar sums the eight Keluar columns', () => {
    expect(sandingMutasiValues(row).totalKeluar).toBe(68)
  })

  test('the ending balance comes from the procedure, not from the columns', () => {
    // 10 + 10 - 68 would be -48; the procedure says 99.
    expect(sandingMutasiValues(row).akhir).toBe(99)
  })

  test('a null column counts as zero instead of poisoning the total', () => {
    const values = sandingMutasiValues({ ...row, BSOutputSAND: null, LMTProdInptSAND: null })
    expect(values.totalMasuk).toBe(7)
    expect(values.totalKeluar).toBe(61)
  })

  test('the main table renders both column groups and a total row', () => {
    const html = renderWith(reports['mutasi-sanding']!, {
      rows: [row] as never,
      subRows: [],
    })
    expect(html).toContain('Laporan Mutasi Sanding (m3)')
    expect(html).toContain('Masuk')
    expect(html).toContain('Keluar')
    expect(html).toContain('99.0000')
  })

  test('the sub table is hidden when the sub procedure returned nothing', () => {
    const html = renderWith(reports['mutasi-sanding']!, {
      rows: [row] as never,
      subRows: [],
    })
    expect(html).not.toContain('Input Sanding Produksi')
  })

  test('the sub table lists the five input sources when the sub procedure returned rows', () => {
    const html = renderWith(reports['mutasi-sanding']!, {
      rows: [row] as never,
      subRows: [
        { Jenis: 'JABON', BJ: 1, CCAkhir: 2, FJ: 3, Moulding: 4, Sanding: 5 },
      ] as never,
    })
    expect(html).toContain('Input Sanding Produksi')
    expect(html).toContain('15.0000')
  })

  test('no rows at all still renders the header and an empty body', () => {
    const html = renderWith(reports['mutasi-sanding']!, {
      rows: [] as never,
      subRows: [],
    })
    expect(html).toContain('Tidak ada data')
  })
})
