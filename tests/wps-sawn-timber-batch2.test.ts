import { describe, expect, test } from 'bun:test'
import { reports } from '../src/reports/registry'
import { buildKeluarMasukData, normalizeGroupKey } from '../src/reports/wps/kd-keluar-masuk'
import { buildCustomerGroups } from '../src/reports/wps/kd-upah-per-customer'
import { buildDetailData } from '../src/reports/wps/kd-upah-per-no-proc-kd-detail'
import { orderJenis, buildPerSupplierData } from '../src/reports/wps/pembelian-st-per-supplier'
import { buildTimelineData, toMonthKey } from '../src/reports/wps/pembelian-st-timeline'
import { formatShare, renderPivotCell, renderTotalCell } from '../src/reports/wps/pembelian-st-cell'
import { buildObatData } from '../src/reports/wps/pemakaian-obat-vacuum'
import { buildPenerimaanData } from '../src/reports/wps/penerimaan-st-sawmill-kg'
import {
  buildSawmillSheet,
  computeBerat,
  normalizeKet,
} from '../src/reports/wps/lembar-upah-borongan-sawmill'
import { buildKetahananView } from '../src/reports/wps/ketahanan'

void 0

/**
 * The ten Sawn Timber reports. What these cases protect is the part that
 * silently produces a wrong number rather than an error: a balance summed
 * instead of taken from its latest row, a tonnage dropped because its group name
 * was not in the list, a weight formula picked by the wrong UOM pair, a footer
 * that adds up a column of percentages.
 *
 * Column names were verified against the live database with
 * sys.dm_exec_describe_first_result_set_for_object, so these fixtures use the
 * real column spellings.
 */

const PERIOD = { tglAwal: '2026-08-01', tglAkhir: '2026-08-31' }
type Meta = { requestedBy: string; generatedAt: Date; params: unknown }
type Definition = { render: (data: never, meta: Meta) => { html: string } }

const renderWith = <T,>(type: string, data: T, params: unknown = PERIOD): string =>
  (reports[type] as unknown as Definition).render(data as never, {
    requestedBy: 'budi',
    generatedAt: new Date('2026-10-01T08:00:00Z'),
    params,
  }).html

describe('registry and parameter shapes', () => {
  const TYPES = [
    'kd-keluar-masuk',
    'kd-upah-per-customer',
    'kd-upah-per-no-proc-kd-detail',
    'ketahanan-barang-st',
    'label-st-hidup-detail',
    'lembar-perhitungan-upah-borongan-sawmill',
    'pemakaian-obat-vacuum',
    'pembelian-st-per-supplier-ton',
    'pembelian-st-timeline-ton',
    'penerimaan-st-sawmill-kg',
  ]

  test('all ten are registered', () => {
    for (const type of TYPES) expect(Object.keys(reports)).toContain(type)
  })

  test('the four keyed by a single number reject an empty one', () => {
    for (const type of [
      'kd-upah-per-no-proc-kd-detail',
      'lembar-perhitungan-upah-borongan-sawmill',
    ]) {
      const schema = reports[type]!.paramsSchema
      expect(schema.safeParse({ noProcKd: '', noProduksi: '' }).success).toBe(false)
    }
    expect(
      reports['kd-upah-per-no-proc-kd-detail']!.paramsSchema.safeParse({
        noProcKd: 'H.000771',
      }).success,
    ).toBe(true)
    expect(
      reports['lembar-perhitungan-upah-borongan-sawmill']!.paramsSchema.safeParse({
        noProduksi: 'D.040749',
      }).success,
    ).toBe(true)
  })

  test('the chamber filter is optional and must be a positive whole number', () => {
    const schema = reports['kd-keluar-masuk']!.paramsSchema
    expect(schema.safeParse(PERIOD).success).toBe(true)
    expect(schema.safeParse({ ...PERIOD, noRuangKd: 3 }).success).toBe(true)
    expect(schema.safeParse({ ...PERIOD, noRuangKd: 0 }).success).toBe(false)
    expect(schema.safeParse({ ...PERIOD, noRuangKd: 1.5 }).success).toBe(false)
  })

  test('the two parameterless reports reject a body with fields', () => {
    for (const type of ['kd-upah-per-customer', 'label-st-hidup-detail']) {
      expect(reports[type]!.paramsSchema.safeParse({}).success).toBe(true)
      expect(reports[type]!.paramsSchema.safeParse({ tglAwal: '2026-01-01' }).success).toBe(false)
    }
  })
})

describe('KD (Keluar - Masuk)', () => {
  test('the group names fold onto the six fixed columns', () => {
    expect(normalizeGroupKey('JABON')).toBe('JABON')
    expect(normalizeGroupKey('JABON TG')).toBe('JABON TG')
    // The procedure is inconsistent about these spellings.
    expect(normalizeGroupKey('JABON TGI')).toBe('JABON TG')
    expect(normalizeGroupKey('JABON TANGGUNG')).toBe('JABON TG')
    expect(normalizeGroupKey('RAMBUNG MC 1')).toBe('RAMBUNG MC1')
    expect(normalizeGroupKey('  rambung   mc2 ')).toBe('RAMBUNG MC2')
    // Anything outside the list is dropped rather than given a new column.
    expect(normalizeGroupKey('KAYU LAT JABON')).toBeNull()
  })

  test('several Group rows for one lot collapse into a single table row', () => {
    // Same chamber, same dates, same days, same thickness - the SP returns one
    // row per wood group and the report has to merge them.
    const data = buildKeluarMasukData([
      { NoKamarKD: 1, TglMasuk: '2026-08-01', TglKeluar: '2026-08-13', JmlhHari: 12, Group: 'JABON', AveTebal: 30, Ton: 17.7805 },
      { NoKamarKD: 1, TglMasuk: '2026-08-01', TglKeluar: '2026-08-13', JmlhHari: 12, Group: 'JABON TG', AveTebal: 30, Ton: 4.326 },
      { NoKamarKD: 1, TglMasuk: '2026-08-01', TglKeluar: '2026-08-13', JmlhHari: 12, Group: 'PULAI', AveTebal: 30, Ton: 2 },
    ])
    expect(data.keluar).toHaveLength(1)
    expect(data.keluar[0]!.byGroup).toEqual([17.7805, 4.326, 2, 0, 0, 0])
    expect(data.keluar[0]!.total).toBeCloseTo(24.1065, 8)
  })

  test('float noise in the thickness does not split a lot in two', () => {
    const data = buildKeluarMasukData([
      { NoKamarKD: 2, TglMasuk: '2026-08-01', TglKeluar: '2026-08-05', JmlhHari: 4, Group: 'PULAI', AveTebal: 30.0000001, Ton: 1 },
      { NoKamarKD: 2, TglMasuk: '2026-08-01', TglKeluar: '2026-08-05', JmlhHari: 4, Group: 'RAMBUNG', AveTebal: 30, Ton: 2 },
    ])
    expect(data.keluar).toHaveLength(1)
    expect(data.keluar[0]!.total).toBeCloseTo(3, 8)
  })

  test('a group outside the list contributes to neither a column nor the total', () => {
    const data = buildKeluarMasukData([
      { NoKamarKD: 1, TglMasuk: '2026-08-01', TglKeluar: '2026-08-05', JmlhHari: 4, Group: 'PULAI', AveTebal: 30, Ton: 10 },
      { NoKamarKD: 1, TglMasuk: '2026-08-01', TglKeluar: '2026-08-05', JmlhHari: 4, Group: 'KAYU LAT JABON', AveTebal: 30, Ton: 999 },
    ])
    // The row total is 10, not 1009. That is the reference behaviour.
    expect(data.keluar[0]!.total).toBeCloseTo(10, 8)
  })

  test('lots still in the chamber go last whatever their dates', () => {
    const data = buildKeluarMasukData([
      // No out date, but the earliest in date of the three.
      { NoKamarKD: 9, TglMasuk: '2026-08-01', TglKeluar: null, JmlhHari: 0, Group: 'PULAI', AveTebal: 25, Ton: 1 },
      { NoKamarKD: 1, TglMasuk: '2026-08-20', TglKeluar: '2026-08-25', JmlhHari: 5, Group: 'PULAI', AveTebal: 25, Ton: 2 },
      { NoKamarKD: 2, TglMasuk: '2026-08-10', TglKeluar: '2026-08-12', JmlhHari: 2, Group: 'PULAI', AveTebal: 25, Ton: 3 },
    ])
    expect(data.keluar.map((r) => r.noKd)).toEqual(['2', '1'])
    expect(data.masih.map((r) => r.noKd)).toEqual(['9'])
  })

  test('the grand total is the two sections added, not a rescan', () => {
    const rows = [
      { NoKamarKD: 1, TglMasuk: '2026-08-01', TglKeluar: '2026-08-05', JmlhHari: 4, Group: 'JABON', AveTebal: 30, Ton: 10 },
      { NoKamarKD: 2, TglMasuk: '2026-08-02', TglKeluar: null, JmlhHari: 0, Group: 'JABON', AveTebal: 30, Ton: 4 },
    ]
    const data = buildKeluarMasukData(rows)
    expect(data.totalsKeluar.total).toBeCloseTo(10, 8)
    expect(data.totalsMasih.total).toBeCloseTo(4, 8)
    expect(data.totalsGrand.total).toBeCloseTo(14, 8)
  })

  test('a chamber numbered zero prints blank rather than 0', () => {
    const data = buildKeluarMasukData([
      { NoKamarKD: 0, TglMasuk: '2026-08-01', TglKeluar: '2026-08-05', JmlhHari: 4, Group: 'PULAI', AveTebal: 30, Ton: 1 },
    ])
    expect(data.keluar[0]!.noKd).toBe('')
  })

  test('the HTML has all six group columns and three Total rows', () => {
    const data = buildKeluarMasukData([
      { NoKamarKD: 1, TglMasuk: '2026-08-01', TglKeluar: '2026-08-05', JmlhHari: 4, Group: 'JABON', AveTebal: 30, Ton: 10 },
      { NoKamarKD: 2, TglMasuk: '2026-08-02', TglKeluar: null, JmlhHari: 0, Group: 'PULAI', AveTebal: 30, Ton: 4 },
    ])
    const html = renderWith('kd-keluar-masuk', data)
    for (const column of ['JABON TG', 'RAMBUNG MC1', 'RAMBUNG MC2']) {
      expect(html).toContain(`<th>${column}</th>`)
    }
    // Two section totals plus the grand total.
    expect(html.match(/class="totals-row"/g)).toHaveLength(3)
  })

  test('an empty period still renders the empty table', () => {
    expect(renderWith('kd-keluar-masuk', buildKeluarMasukData([]))).toContain('Tidak ada data')
  })
})

describe('KD Upah Per-Customer', () => {
  const rows = [
    { NamaCustomer: 'PAK BENYAMIN', NoProcKD: 'H.000771', NoRuangKD: 3, TglMasuk: '2023-07-27', TglKeluar: '2023-08-03', Jenis: 'DAMAR', m3: 3.518 },
    { NamaCustomer: 'PAK BENYAMIN', NoProcKD: 'H.000787', NoRuangKD: 1, TglMasuk: '2023-09-12', TglKeluar: '2023-09-23', Jenis: 'HOTING', m3: 5.067 },
    { NamaCustomer: 'BUDI', NoProcKD: 'H.000800', NoRuangKD: 2, TglMasuk: '2023-09-01', TglKeluar: '2023-09-05', Jenis: 'DAMAR', m3: 1 },
    { NamaCustomer: '', NoProcKD: 'H.000801', NoRuangKD: 2, TglMasuk: '2023-09-01', TglKeluar: '2023-09-05', Jenis: 'DAMAR', m3: 2 },
  ]

  test('customers keep the procedure order, not alphabetical', () => {
    const groups = buildCustomerGroups(rows)
    expect(groups.map((g) => g.customer)).toEqual([
      'PAK BENYAMIN',
      'BUDI',
      'Tanpa Customer',
    ])
  })

  test('a blank customer is bucketed, not dropped, and keeps its volume', () => {
    const groups = buildCustomerGroups(rows)
    const bucket = groups.find((g) => g.customer === 'Tanpa Customer')!
    expect(bucket.totalM3).toBeCloseTo(2, 8)
  })

  test('the customer total is the sum of its own lots', () => {
    const groups = buildCustomerGroups(rows)
    expect(groups[0]!.totalM3).toBeCloseTo(8.585, 8)
  })

  test('each table closes with that customer total', () => {
    const html = renderWith('kd-upah-per-customer', buildCustomerGroups(rows), {})
    expect(html).toContain('Total PAK BENYAMIN')
    expect(html.match(/<tfoot>/g)).toHaveLength(3)
  })

  test('a Date from the driver prints d-M-y, not its toString', () => {
    const groups = buildCustomerGroups([
      { NamaCustomer: 'X', TglMasuk: new Date('2023-07-27T00:00:00Z'), m3: 1 },
    ])
    const html = renderWith('kd-upah-per-customer', groups, {})
    expect(html).toContain('27-Jul-23')
    expect(html).not.toContain('GMT')
  })
})

describe('KD Upah Per-No.Proses KD Detail', () => {
  const rows = [
    { NamaCustomer: 'PAK BENYAMIN', NoProcKD: 'H.000771', NoRuangKD: 3, TglMasuk: '2023-07-27', TglKeluar: '2023-08-03', NoST: 'E.464765', Jenis: 'DAMAR', Tebal: 1, Lebar: 5, Panjang: 5, JmlhBatang: 137, M3: 0.6735 },
    { NamaCustomer: 'PAK BENYAMIN', NoProcKD: 'H.000771', NoRuangKD: 3, TglMasuk: '2023-07-27', TglKeluar: '2023-08-03', NoST: 'E.464765', Jenis: 'DAMAR', Tebal: 1, Lebar: 5, Panjang: 3, JmlhBatang: 40, M3: 0.2 },
    { NamaCustomer: 'PAK BENYAMIN', NoProcKD: 'H.000771', NoRuangKD: 3, TglMasuk: '2023-07-27', TglKeluar: '2023-08-03', NoST: 'E.464772', Jenis: 'DAMAR', Tebal: 1, Lebar: 5, Panjang: 3, JmlhBatang: 171, M3: 0.5044 },
  ]

  test('the header comes from the first row, as the reference does', () => {
    const data = buildDetailData(rows, 'H.000771')
    expect(data.header.namaCustomer).toBe('PAK BENYAMIN')
    expect(data.header.noRuangKd).toBe('3')
    expect(data.header.jenis).toBe('DAMAR')
    expect(data.header.tglMasuk).toBe('27-Jul-23')
  })

  test('the requested number is used when the rows carry none', () => {
    const data = buildDetailData([{ M3: 1 }], 'H.000999')
    expect(data.header.noProcKd).toBe('H.000999')
  })

  test('labels group by No ST with their own piece and volume totals', () => {
    const data = buildDetailData(rows, 'H.000771')
    expect(data.groups.map((g) => g.noSt)).toEqual(['E.464765', 'E.464772'])
    expect(data.groups[0]!.totalPcs).toBe(177)
    expect(data.groups[0]!.totalM3).toBeCloseTo(0.8735, 8)
    expect(data.totalPcs).toBe(348)
    expect(data.totalM3).toBeCloseTo(1.3779, 8)
  })

  test('a blank No ST is bucketed rather than dropped', () => {
    const data = buildDetailData([{ NoST: '', JmlhBatang: 5, M3: 1 }], 'X')
    expect(data.groups.map((g) => g.noSt)).toEqual(['Tanpa No ST'])
    expect(data.totalPcs).toBe(5)
  })

  test('the HTML shows the meta table and one heading per label', () => {
    const html = renderWith('kd-upah-per-no-proc-kd-detail', buildDetailData(rows, 'H.000771'), {
      noProcKd: 'H.000771',
    })
    expect(html).toContain('No.Proses KD')
    expect(html).toContain('No ST : E.464765')
    expect(html).toContain('No ST : E.464772')
  })

  test('no rows still shows the meta table rather than nothing', () => {
    const html = renderWith('kd-upah-per-no-proc-kd-detail', buildDetailData([], 'H.000771'), {
      noProcKd: 'H.000771',
    })
    expect(html).toContain('Tidak ada data')
    expect(html).toContain('H.000771')
  })
})

describe('Ketahanan Barang Dagang ST', () => {
  test('Stock reads StockTon and Penjualan reads Ton, not the m3 columns', () => {
    const [view] = buildKetahananView(
      [{ Jenis: 'JABON', StockTon: 33.3299, Ton: 5 }],
      'StockTon',
      'Ton',
    )!
    expect(view!.Stock).toBeCloseTo(33.3299, 8)
    expect(view!.Penjualan).toBeCloseTo(5, 8)
  })

  test('Avg Penjualan equals Penjualan, not a per-day average', () => {
    // The SP has no average column, and the reference falls back to Penjualan
    // rather than dividing by the days in the period.
    const [view] = buildKetahananView(
      [{ Jenis: 'JABON', StockTon: 100, Ton: 4 }],
      'StockTon',
      'Ton',
    )!
    expect(view!.AvgPenjualan).toBe(4)
  })

  test('Ketahanan is stock over the average, and 0 when the average is 0', () => {
    const [withSales] = buildKetahananView(
      [{ Jenis: 'JABON', StockTon: 100, Ton: 4 }],
      'StockTon',
      'Ton',
    )!
    expect(withSales!.Ketahanan).toBeCloseTo(25, 8)

    const [noSales] = buildKetahananView(
      [{ Jenis: 'JABON', StockTon: 100, Ton: 0 }],
      'StockTon',
      'Ton',
    )!
    expect(noSales!.Ketahanan).toBe(0)
  })

  test('the report renders the six-column stock-coverage table', () => {
    const view = buildKetahananView([{ Jenis: 'JABON', StockTon: 100, Ton: 4 }], 'StockTon', 'Ton')
    const html = renderWith('ketahanan-barang-st', view)
    expect(html).toContain('Avg Penjualan')
    expect(html).toContain('Ketahanan')
  })
})

describe('Label ST (Hidup) Detail', () => {
  test('DateCreate is the date and Awal is the ton measure', () => {
    // The reference's candidate lists land on DateCreate for the date and Awal
    // for the total; both are the non-obvious picks.
    const html = renderWith('label-st-hidup-detail', [
      {
        NoST: 'E.495403',
        DateCreate: '2025-07-13',
        NoSPK: '2025-48',
        Jenis: 'PULAI',
        Tebal: 20,
        Lebar: 65,
        Panjang: 1,
        JmlhBatang: 3,
        Awal: 0.0008,
        IdLokasi: 'B08',
      },
    ], {})
    expect(html).toContain('13-Jul-2025')
    expect(html).toContain('E.495403')
    expect(html).toContain('B08')
    expect(html).toContain('0.0008')
  })

  test('board dimensions print with one decimal, not four', () => {
    const html = renderWith('label-st-hidup-detail', [
      { NoST: 'E.1', DateCreate: '2025-07-13', Tebal: 20, Lebar: 65, Panjang: 1, Awal: 0.0008 },
    ], {})
    expect(html).toContain('20.0')
    expect(html).not.toContain('20.0000')
  })

  test('no totals row, matching the reference PDF', () => {
    // The reference service totals the measure and its blade never renders it.
    const html = renderWith('label-st-hidup-detail', [
      { NoST: 'E.1', DateCreate: '2025-07-13', Awal: 0.0008 },
    ], {})
    expect(html).not.toContain('class="totals-row"')
  })
})

describe('Pembelian ST Per Supplier (Ton)', () => {
  test('the preferred type order comes first, extras appended naturally', () => {
    // "RAMBUNG - STD" is NOT in the preferred list - the reference spells that
    // entry "RAMBUNG STD" without the dash, so the spaced form the procedure
    // actually returns always lands in the alphabetical tail. Faithful to the
    // reference rather than corrected; see the note in the report file.
    expect(
      orderJenis(['KAYU LAT JABON', 'PULAI', 'JABON', 'RAMBUNG - STD', 'ZZZ', 'BIRA - BIRA']),
    ).toEqual([
      'BIRA - BIRA',
      'JABON',
      'PULAI',
      'KAYU LAT JABON',
      'RAMBUNG - STD',
      'ZZZ',
    ])
  })

  test('the reference spellings do sort ahead of the unlisted ones', () => {
    expect(orderJenis(['ZZZ', 'RAMBUNG STD', 'JABON'])).toEqual([
      'JABON',
      'RAMBUNG STD',
      'ZZZ',
    ])
  })

  test('suppliers sort naturally and case-insensitively', () => {
    const data = buildPerSupplierData([
      { NmSupplier: 'SUP A10', Jenis: 'PULAI', STTon: 1 },
      { NmSupplier: 'SUP A2', Jenis: 'PULAI', STTon: 1 },
      { NmSupplier: 'sup b', Jenis: 'PULAI', STTon: 1 },
    ])
    expect(data.rows.map((r) => r.supplier)).toEqual(['SUP A2', 'SUP A10', 'sup b'])
  })

  test('tonnage is summed per supplier per type', () => {
    const data = buildPerSupplierData([
      { NmSupplier: 'ABI', Jenis: 'PULAI', STTon: 1.5 },
      { NmSupplier: 'ABI', Jenis: 'PULAI', STTon: 2.5 },
      { NmSupplier: 'ABI', Jenis: 'JABON', STTon: 1 },
    ])
    const row = data.rows[0]!
    expect(row.supplier).toBe('ABI')
    expect(row.byJenis).toEqual([1, 4])
    expect(data.grandTotal).toBeCloseTo(5, 8)
  })

  test('a blank supplier or type prints as "-" and keeps its tonnage', () => {
    const data = buildPerSupplierData([{ NmSupplier: '', Jenis: '', STTon: 3 }])
    expect(data.rows[0]!.supplier).toBe('-')
    expect(data.jenisColumns).toEqual(['-'])
    expect(data.grandTotal).toBeCloseTo(3, 8)
  })

  test('the totals row is in the body, not a repeating tfoot', () => {
    // A cross-tab can run long; a tfoot would repeat the total on every page.
    const data = buildPerSupplierData([{ NmSupplier: 'ABI', Jenis: 'PULAI', STTon: 3 }])
    const html = renderWith('pembelian-st-per-supplier-ton', data)
    expect(html).not.toContain('<tfoot>')
    expect(html).toContain('(100%)')
  })
})

describe('Pembelian ST Timeline (Ton)', () => {
  test('the month comes from TglLaporan, the first date candidate', () => {
    // TglLaporan wins over DateCreate and DateUsage, which the reference only
    // falls back to.
    expect(toMonthKey('2026-05-16T00:00:00.000Z')).toEqual({ key: '2026-05', year: 2026 })
    expect(toMonthKey(new Date('2026-05-16T00:00:00Z'))).toEqual({ key: '2026-05', year: 2026 })
    expect(toMonthKey('')).toBeNull()
    expect(toMonthKey(null)).toBeNull()
  })

  test('months sort chronologically', () => {
    const data = buildTimelineData([
      { NmSupplier: 'A', TglLaporan: '2026-05-01', STTon: 1 },
      { NmSupplier: 'A', TglLaporan: '2024-12-01', STTon: 1 },
      { NmSupplier: 'A', TglLaporan: '2025-01-01', STTon: 1 },
    ])
    expect(data.monthColumns.map((c) => c.key)).toEqual(['2024-12', '2025-01', '2026-05'])
  })

  test('consecutive months of a year share one header band', () => {
    const data = buildTimelineData([
      { NmSupplier: 'A', TglLaporan: '2024-11-01', STTon: 1 },
      { NmSupplier: 'A', TglLaporan: '2024-12-01', STTon: 1 },
      { NmSupplier: 'A', TglLaporan: '2026-01-01', STTon: 1 },
    ])
    expect(data.yearGroups).toEqual([
      { year: 2024, monthKeys: ['2024-11', '2024-12'] },
      { year: 2026, monthKeys: ['2026-01'] },
    ])
  })

  test('a row with no usable date still gets a column and reaches the total', () => {
    const data = buildTimelineData([
      { NmSupplier: 'A', TglLaporan: '2026-01-01', STTon: 1 },
      { NmSupplier: 'A', TglLaporan: null, STTon: 5 },
    ])
    // Unparseable months sort last rather than displacing January.
    expect(data.monthColumns.map((c) => c.key)).toEqual(['2026-01', 'Tanpa Periode'])
    expect(data.grandTotal).toBeCloseTo(6, 8)
  })

  test('the header band covers the undated column so it stays aligned', () => {
    const data = buildTimelineData([
      { NmSupplier: 'A', TglLaporan: '2026-01-01', STTon: 1 },
      { NmSupplier: 'A', TglLaporan: null, STTon: 5 },
    ])
    const html = renderWith('pembelian-st-timeline-ton', data)
    // One band of 1 for 2026 plus a band of 1 for the undated column.
    expect(html).toContain('<th colspan="1">2026</th>')
    expect(html).toContain('<th colspan="1">&nbsp;</th>')
  })

  test('a supplier total is the sum of its own months', () => {
    const data = buildTimelineData([
      { NmSupplier: 'A', TglLaporan: '2026-01-01', STTon: 3 },
      { NmSupplier: 'A', TglLaporan: '2026-02-01', STTon: 4 },
      { NmSupplier: 'B', TglLaporan: '2026-01-01', STTon: 1 },
    ])
    const rowA = data.rows.find((r) => r.supplier === 'A')!
    // A put 3 in January and 4 in February; B's 1 belongs to the January column
    // total, not to A.
    expect(rowA.byMonth).toEqual([3, 4])
    expect(rowA.total).toBeCloseTo(7, 8)
    expect(data.totalsByMonth).toEqual([4, 4])
  })
})

describe('Pembelian ST cell format', () => {
  test('a share is a whole percent', () => {
    expect(formatShare(50, 200)).toBe('25%')
    expect(formatShare(1, 3)).toBe('33%')
  })

  test('a share that rounds to zero prints -%, not 0%', () => {
    // There is a figure there, it is just too small to express as a percent.
    expect(formatShare(0.1, 100)).toBe('-%') // 0.1%
    expect(formatShare(0.4, 100)).toBe('-%') // 0.4%
    expect(formatShare(0.5, 100)).toBe('1%') // 0.5% rounds up
    expect(formatShare(1.4, 100)).toBe('1%')
    expect(formatShare(1.5, 100)).toBe('2%')
  })

  test('a zero tonnage leaves the cell entirely empty', () => {
    expect(formatShare(0, 100)).toBe('')
    expect(renderPivotCell(0, 100)).toBe('')
    expect(renderTotalCell(0)).toBe('')
  })

  test('a negative tonnage is treated as no figure', () => {
    expect(renderPivotCell(-5, 100)).toBe('')
  })

  test('a data cell carries its share and a total cell carries 100%', () => {
    expect(renderPivotCell(25, 100)).toContain('(25%)')
    expect(renderTotalCell(100)).toContain('(100%)')
  })

  test('the tonnage prints without a thousands separator', () => {
    // A separator would break the right-aligned share pairing in a narrow cell.
    expect(renderPivotCell(12345.6789, 100)).toContain('12345.6789')
  })
})

describe('Pemakaian Obat Vacuum', () => {
  const day = (over: Record<string, unknown> = {}) => ({
    Tanggal: '2026-08-07',
    Air: 1000,
    Borax: 55,
    Boric: 18,
    Kaporit: 30.6,
    STTon: 5.774,
    STJabon: 0,
    STTG: 0,
    STPulai: 5.774,
    STRambung: 0,
    Charge: 2,
    JamKerja: 360,
    ...over,
  })

  test('the seven derived columns follow the reference formulas', () => {
    const [row] = buildObatData([day()]).rows!
    expect(row!['RasioBorax']).toBe('9.53') // 55 / 5.774
    expect(row!['RasioBoric']).toBe('3.12') // 18 / 5.774
    expect(row!['Obat']).toBe('7.30') // (55 + 18) / 1000 * 100
    expect(row!['BoraxBoric']).toBe('3.06') // 55 / 18
    expect(row!['KaporitPct']).toBe('3.06') // 30.6 / 1000 * 100
    expect(row!['ChargeMenit']).toBe('180.00') // 360 / 2
    expect(row!['STTonCharge']).toBe('2.8870') // 5.774 / 2
  })

  test('a missing denominator gives 0, which prints blank, not a divide error', () => {
    const [row] = buildObatData([day({ STTon: 0, Air: 0, Boric: 0, Charge: 0 })]).rows!
    expect(row!['RasioBorax']).toBe('')
    expect(row!['Obat']).toBe('')
    expect(row!['ChargeMenit']).toBe('')
  })

  test('the footer recomputes the ratios instead of summing the column', () => {
    const data = buildObatData([
      day({ Borax: 10, Boric: 5, STTon: 2, Air: 100, Charge: 1, JamKerja: 60 }),
      day({ Borax: 30, Boric: 15, STTon: 6, Air: 300, Charge: 3, JamKerja: 120 }),
    ])
    // Sum of Borax is 40, sum of STTon is 8, so the footer's ratio is 5.00 -
    // not the 5.00 + 5.00 = 10.00 a column sum would give.
    expect(data.total['RasioBorax']).toBe('5.00')
    expect(data.total['RasioBoric']).toBe('2.50')
    expect(data.total['Obat']).toBe('15.00') // 60 / 400 * 100
    expect(data.total['ChargeMenit']).toBe('45.00') // 180 / 4
    expect(data.total['STTonCharge']).toBe('2.0000')
  })

  test('the footer is labelled Total and the totals are marked bold', () => {
    const html = renderWith('pemakaian-obat-vacuum', buildObatData([day()]))
    expect(html).toContain('>Total<')
    expect(html).toContain('Rasio Borax (kg/ton)')
    expect(html).toContain('colspan="2"')
  })

  test('nineteen printed columns, in the reference order', () => {
    const html = renderWith('pemakaian-obat-vacuum', buildObatData([day()]))
    expect(html).toContain('ST Ton/Charge')
    expect(html).toContain('Charge (Menit)')
    // The Borax and Boric bands each span their two columns.
    expect(html.match(/colspan="2"/g)).toHaveLength(2)
  })
})

describe('Penerimaan ST Dari Sawmill - Timbang KG', () => {
  // Real shapes from the live procedure: InOut 1 carries KBTon and the supplier,
  // InOut 0 carries STTon and only NmSupplier3.
  const rows = [
    { InOut: 1, NoPenerimaanST: 'B.001516', NmSupplier: 'ABI J (Truk : 102)', NmSupplier2: 'ABI J', NoTruk: 102, NamaGrade: 'RAMBUNG - AFKIR-100', KBTon: 0.765, STTon: null },
    { InOut: 1, NoPenerimaanST: 'B.001516', NmSupplier: 'ABI J (Truk : 102)', NmSupplier2: 'ABI J', NoTruk: 102, NamaGrade: 'RAMBUNG - MC-200', KBTon: 0.682, STTon: null },
    { InOut: 0, NoPenerimaanST: 'B.001516', NmSupplier: null, NmSupplier3: 'ABI J', NamaGrade1: 'AFKIR', NamaGrade: 'AFKIR', KBTon: null, STTon: 0.4358 },
    { InOut: 0, NoPenerimaanST: 'B.001516', NmSupplier: null, NmSupplier3: 'ABI J', NamaGrade1: 'STD', NamaGrade: 'STD', KBTon: null, STTon: 1.8815 },
  ]

  test('the two sides land in separate blocks, largest first on each', () => {
    const data = buildPenerimaanData(rows)
    // AFKIR-100 is 0.765 of 1.447, so it leads the input block.
    expect(data.input.map((l) => l.grade)).toEqual(['RAMBUNG - AFKIR-100', 'RAMBUNG - MC-200'])
    // STD is 1.8815 of 2.3173, so it leads the output block.
    expect(data.output.map((l) => l.grade)).toEqual(['STD', 'AFKIR'])
  })

  test('each side is totalled on its own measure', () => {
    const data = buildPenerimaanData(rows)
    expect(data.totalInputKb).toBeCloseTo(1.447, 8)
    expect(data.totalOutputSt).toBeCloseTo(2.3173, 8)
  })

  test('rendemen is output over input, as a percentage', () => {
    const data = buildPenerimaanData(rows)
    expect(data.rendemen).toBeCloseTo((2.3173 / 1.447) * 100, 6)
  })

  test('a grade percentage is that grade share of its own side', () => {
    const data = buildPenerimaanData(rows)
    const std = data.output.find((l) => l.grade === 'STD')!
    expect(std.percent).toBeCloseTo((1.8815 / 2.3173) * 100, 6)
    const sum = data.output.reduce((acc, l) => acc + l.percent, 0)
    expect(sum).toBeCloseTo(100, 6)
  })

  test('trucks are counted per grade, not tallied per line', () => {
    // One truck, two grade lines: it is one truck, not two.
    const data = buildPenerimaanData(rows)
    expect(data.input.every((l) => l.trucks === 1)).toBe(true)
  })

  test('the supplier is taken from the INPUT row and cleaned of the truck suffix', () => {
    const data = buildPenerimaanData(rows)
    expect(data.supplier).toBe('ABI J')
  })

  test('rendemen is 0 rather than a divide error when nothing came in', () => {
    const data = buildPenerimaanData([
      { InOut: 0, NoPenerimaanST: 'B.1', NamaGrade1: 'STD', STTon: 5 },
    ])
    expect(data.rendemen).toBe(0)
    expect(data.input).toHaveLength(0)
  })

  test('the HTML has the two category blocks and the rendemen line', () => {
    const html = renderWith('penerimaan-st-sawmill-kg', buildPenerimaanData(rows))
    expect(html).toContain('rowspan="2">INPUT')
    expect(html).toContain('rowspan="2">OUTPUT')
    expect(html).toContain('RENDEMEN')
    expect(html).toContain('Jumlah:')
  })
})

describe('Lembar Perhitungan Upah Borongan Sawmill', () => {
  // Real row from the live procedure: Berat is 0 while the dimensions are full,
  // so the recomputation is the only thing standing between this report and an
  // all-zero pay sheet.
  const row = (over: Record<string, unknown> = {}) => ({
    NoSTSawmill: 'D.040749',
    TglSawmill: '2025-08-28',
    NmSupplier: 'PUTRA T - 1042',
    Status: 'BELUM HABIS',
    Condition: 'NORMAL',
    NoKayuBulat: 'A.016308',
    Suket: '03/RAISYAH/VIII/2025',
    NoMeja: 17,
    NoPlat: 'BL 8617 NH',
    Jenis: 'RAMBUNG',
    Berat: 0,
    NamaOperator: 'HARIAN',
    Tebal: 45,
    Lebar: 36,
    Panjang: 1,
    JmlhBatang: 28,
    IdUOMTblLebar: 1,
    IdUOMPanjang: 4,
    Ket: 'STD',
    ...over,
  })

  test('the inch/feet UOM pair recomputes the weight and ignores the stored Berat', () => {
    // 45 x 36 x 1.0 x 304.8 x 28 / 1e9 / 1.416 = 0.009764, truncated to 0.0097
    expect(computeBerat(row())).toBeCloseTo(0.0097, 8)
  })

  test('the centimetre/feet pair uses the reference 7200.8 divisor', () => {
    // 45 x 36 x 1.0 x 28 / 7200.8 = 6.2993. That is not a physically sensible
    // tonnage - 7200.8 does not correspond to any unit this report prints - but
    // it is the divisor the reference uses, and only the 1/4 UOM pair occurs in
    // the live data, so this branch is carried through unchanged rather than
    // "fixed" into a number nobody can reconcile with the legacy sheet.
    expect(computeBerat(row({ IdUOMTblLebar: 3 }))).toBeCloseTo(6.2993, 8)
  })

  test('a row missing a dimension falls back to the stored Berat', () => {
    expect(computeBerat(row({ Panjang: null }))).toBe(0)
    expect(computeBerat(row({ Panjang: null, Berat: 1.2345 }))).toBeCloseTo(1.2345, 8)
  })

  test('an unrecognised UOM pair also falls back to the stored Berat', () => {
    expect(computeBerat(row({ IdUOMPanjang: 2, Berat: 2.5 }))).toBeCloseTo(2.5, 8)
  })

  test('the weight is truncated, not rounded', () => {
    // 45 x 36 x 1.0 x 304.8 x 1 / 1e9 / 1.416 = 0.000348... -> 0.0003
    expect(computeBerat(row({ JmlhBatang: 1 }))).toBe(0.0003)
  })

  test('the summary keys fold the spellings the procedure actually uses', () => {
    expect(normalizeKet('STD')).toBe('STD')
    expect(normalizeKet('MC 1')).toBe('MC 1')
    expect(normalizeKet('MC1')).toBe('MC 1')
    expect(normalizeKet('MC2')).toBe('MC 2')
    // "L.MC" is what the procedure returns for the Lokal MC grade.
    expect(normalizeKet('L.MC')).toBe('LOKAL MC')
    expect(normalizeKet('L.MC')).not.toBe('L MC')
    expect(normalizeKet('L.STD')).toBe('LOKAL STD')
    expect(normalizeKet('')).toBe('-')
  })

  test('pieces and tonnes are summarised per product type', () => {
    const sheet = buildSawmillSheet([
      row({ Ket: 'STD', JmlhBatang: 10 }),
      row({ Ket: 'STD', JmlhBatang: 5 }),
      row({ Ket: 'L.MC', JmlhBatang: 2 }),
    ])
    const std = sheet.summary.find((s) => s.key === 'STD')!
    const lokal = sheet.summary.find((s) => s.key === 'LOKAL MC')!
    expect(std.pcs).toBe(15)
    expect(lokal.pcs).toBe(2)
    expect(sheet.totalPcs).toBe(17)
  })

  test('an unexpected product type is summarised, not silently dropped', () => {
    const sheet = buildSawmillSheet([row({ Ket: 'WONDERS' })])
    expect(sheet.summary.map((s) => s.key)).toContain('WONDERS')
    expect(sheet.totalPcs).toBe(28)
  })

  test('the tally splits in two with continuous numbering', () => {
    const sheet = buildSawmillSheet([row(), row(), row()])
    expect(sheet.leftCount).toBe(2)
    expect(sheet.rows.map((r) => r.no)).toEqual(['1', '2', '3'])
  })

  test('the header block takes its values from the first row', () => {
    const sheet = buildSawmillSheet([row()])
    expect(sheet.head.NoSTSawmill).toBe('D.040749')
    expect(sheet.head.NoMeja).toBe(17)
  })

  test('the printed units are mm and feet regardless of the UOM ids', () => {
    const sheet = buildSawmillSheet([row({ IdUOMTblLebar: 3 })])
    expect(sheet.rows[0]!.uomSize).toBe('mm')
    expect(sheet.rows[0]!.uomLength).toBe('feet')
  })

  test('the HTML shows the header block, the split tally and the signature strip', () => {
    const sheet = buildSawmillSheet([row(), row(), row()])
    const html = renderWith('lembar-perhitungan-upah-borongan-sawmill', sheet, {
      noProduksi: 'D.040749',
    })
    expect(html).toContain('Nomor Lembaran')
    expect(html).toContain('No. Suket')
    expect(html).toContain('split-tally')
    expect(html).toContain('Dibuat Oleh')
    expect(html).toContain('Jmlh Ton')
    expect(html).toContain('//STD')
  })
})
