import { describe, expect, test } from 'bun:test'
import { reports } from '../src/reports/registry'
import { buildPenerimaanHasilSawmillData } from '../src/reports/wps/penerimaan-st-hasil-sawmill'
import { buildPerMejaData } from '../src/reports/wps/rekap-hasil-sawmill-per-meja'
import { buildBoronganData } from '../src/reports/wps/rekap-hasil-sawmill-per-meja-borongan'
import { buildRekapKamarKdData } from '../src/reports/wps/rekap-kamar-kd'
import { buildNonRambungData } from '../src/reports/wps/rekap-penerimaan-st-non-rambung'
import {
  buildProduktivitasData,
  mapJenisToColumn,
} from '../src/reports/wps/rekap-produktivitas-sawmill'

/**
 * Regression tests for the nine Sawmill reports that shipped without any.
 *
 * Every case here guards something that fails SILENTLY. A missing column, a
 * wrong divisor or a dropped row does not throw - it prints a plausible sheet
 * with the wrong figure on it, which is the failure mode this file exists to
 * prevent. The fixtures use the real column spellings, taken from
 * sys.dm_exec_describe_first_set_result_set_for_object against the live
 * database, and the arithmetic was checked by hand against rendered output.
 */

const PERIOD = { tglAwal: '2026-08-01', tglAkhir: '2026-08-31' }
type Meta = { requestedBy: string; generatedAt: Date; params: unknown }

const renderWith = (type: string, data: never, params: unknown = PERIOD): string =>
  (reports[type] as unknown as { render: (d: never, m: Meta) => { html: string } }).render(data, {
    requestedBy: 'budi',
    generatedAt: new Date('2026-10-01T08:00:00Z'),
    params,
  }).html

// ---------------------------------------------------------------------------
// Penerimaan ST Hasil Sawmill
// ---------------------------------------------------------------------------

describe('Penerimaan ST Hasil Sawmill divides quantity by three', () => {
  // The single most dangerous thing about this report. JmlhBatang and Hasil
  // arrive in a unit three times the one printed. Skip the divisor and the
  // report still looks entirely plausible - it is just three times too big.
  const main = (over: Record<string, unknown> = {}) => ({
    NamaGrade: 'STD',
    Tebal: 20,
    Lebar: 150,
    IdTblLebar: 'mm',
    Panjang: 4,
    IdPanjang: 'feet',
    JmlhBatang: 300,
    Hasil: 15,
    NoKayuBulat: 'A.014232',
    NoPenerimaanST: 'B.001516',
    TglLaporan: '2023-05-16',
    NmSupplier: 'ABI J',
    NoTruk: 102,
    Jenis: 'RAMBUNG',
    Suket: '03/RAISYAH/VIII/2025',
    TglMasuk: '2023-05-15',
    ...over,
  })

  test('pieces are the procedure count divided by three, rounded', () => {
    const data = buildPenerimaanHasilSawmillData([main()], [])
    expect(data.totalPcs).toBe(100)
  })

  test('tonnage is the procedure figure divided by three', () => {
    const data = buildPenerimaanHasilSawmillData([main()], [])
    expect(data.totalTon).toBeCloseTo(5, 8)
  })

  test('a remainder still rounds, so 2 of 3 becomes 1', () => {
    const data = buildPenerimaanHasilSawmillData([main({ JmlhBatang: 2 })], [])
    expect(data.totalPcs).toBe(1)
  })

  test('a quantity of zero stays zero rather than becoming a fraction', () => {
    const data = buildPenerimaanHasilSawmillData([main({ JmlhBatang: 0 })], [])
    expect(data.totalPcs).toBe(0)
  })

  test('a second length is its own column, and the totals add up', () => {
    const data = buildPenerimaanHasilSawmillData(
      [main(), main({ Panjang: 8, JmlhBatang: 300, Hasil: 30 })],
      [],
    )
    expect(data.lengthColumns.map((c) => c.key)).toEqual(['4', '8'])
    expect(data.lengthColumns.map((c) => c.raw)).toEqual([4, 8])
    expect(data.totalPcs).toBe(200)
  })

  test('a length of 1 and one of 1.0 are the same column', () => {
    // Trailing zeros are trimmed from the key, or float formatting splits one
    // length into two columns and halves every piece count between them.
    const data = buildPenerimaanHasilSawmillData(
      [main({ Panjang: 1 }), main({ Panjang: 1.0, JmlhBatang: 300 })],
      [],
    )
    expect(data.lengthColumns).toHaveLength(1)
    expect(data.totalPcs).toBe(200)
  })

  test('pieces accumulate into the cell for their own length', () => {
    const data = buildPenerimaanHasilSawmillData(
      [main(), main({ JmlhBatang: 60, Hasil: 3 })],
      [],
    )
    const row = data.gradeGroups[0]!.tebalGroups[0]!.rows[0]!
    expect(row.cells.get('4')).toBe(120) // 100 + round(60/3)
  })

  test('grades sort in the fixed order, not alphabetically', () => {
    // Alphabetical would put KAYU LAT between the MC grades and STD last.
    const data = buildPenerimaanHasilSawmillData(
      [
        main({ NamaGrade: 'KAYU LAT' }),
        main({ NamaGrade: 'STD' }),
        main({ NamaGrade: 'MC 1' }),
        main({ NamaGrade: 'MC 2' }),
      ],
      [],
    )
    expect(data.gradeGroups.map((g) => g.grade)).toEqual(['STD', 'MC 2', 'MC 1', 'KAYU LAT'])
  })

  test('a blank grade is bucketed, not dropped', () => {
    const data = buildPenerimaanHasilSawmillData([main({ NamaGrade: '' })], [])
    expect(data.gradeGroups[0]!.grade).toBe('Tanpa Grade')
    expect(data.totalPcs).toBe(100)
  })

  test('a blank width unit prints as a dash rather than an empty cell', () => {
    const data = buildPenerimaanHasilSawmillData([main({ IdTblLebar: '' })], [])
    expect(data.gradeGroups[0]!.tebalGroups[0]!.rows[0]!.uom).toBe('-')
  })

  test('the sub procedure cross-check is totalled', () => {
    const data = buildPenerimaanHasilSawmillData(
      [main()],
      [
        { IdGradeKB: 1, NamaGrade: 'JABON', Berat: 1.5 },
        { IdGradeKB: 2, NamaGrade: 'PULAI', Berat: 2.5 },
      ],
    )
    expect(data.subTotalBerat).toBeCloseTo(4, 8)
  })

  test('the report renders the header block and the length columns', () => {
    const data = buildPenerimaanHasilSawmillData([main()], [])
    const html = renderWith('penerimaan-st-hasil-sawmill', data as never, {
      noPenST: 'B.001516',
    })
    expect(html).toContain('B.001516')
    expect(html).toContain('Panjang')
    expect(html).toContain('Jumlah')
  })

  test('a date from the driver prints d-M-y, not its toString', () => {
    const data = buildPenerimaanHasilSawmillData(
      [main({ TglLaporan: new Date('2023-05-16T00:00:00Z'), TglMasuk: new Date('2023-05-15T00:00:00Z') })],
      [],
    )
    const html = renderWith('penerimaan-st-hasil-sawmill', data as never, {
      noPenST: 'B.001516',
    })
    expect(html).toContain('16-Mei-23')
    expect(html).toContain('15-Mei-23')
    expect(html).not.toContain('GMT')
  })

  test('No. Plat is blank rather than repeating the truck number', () => {
    // The reference reads it from a table this service does not query. Showing
    // the truck number here would be a different figure under the wrong label.
    const data = buildPenerimaanHasilSawmillData([main({ NoTruk: 102 })], [])
    const html = renderWith('penerimaan-st-hasil-sawmill', data as never, {
      noPenST: 'B.001516',
    })
    // The label is there, and the value cell after it is a dash.
    expect(html).toMatch(/No\. Plat<\/td>[\s\S]{0,200}?<td>-<\/td>/)
  })
})

// ---------------------------------------------------------------------------
// Rekap Hasil Sawmill Per-Meja
// ---------------------------------------------------------------------------

describe('Rekap Hasil Sawmill Per-Meja cross-tab', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    NoMeja: 3,
    TglSawmill: '2026-08-01',
    Tebal: 45,
    UOM: 'mm',
    TonRacip: 0.179,
    ...over,
  })

  test('the row key is thickness AND unit, not thickness alone', () => {
    // The same nominal thickness in mm and in inches is a different board.
    // Merging them would add two different numbers into one cell.
    const data = buildPerMejaData([row(), row({ UOM: 'inch', TonRacip: 0.5 })])
    expect(data.mejaGroups[0]!.rows).toHaveLength(2)
  })

  test('the same thickness and unit collapses into one row', () => {
    const data = buildPerMejaData([row({ TonRacip: 0.1 }), row({ TonRacip: 0.2 })])
    expect(data.mejaGroups[0]!.rows).toHaveLength(1)
    expect(data.mejaGroups[0]!.rows[0]!.rowTotal).toBeCloseTo(0.3, 8)
  })

  test('tonnage lands in the cell for its own date', () => {
    const data = buildPerMejaData([
      row({ TglSawmill: '2026-08-01', TonRacip: 0.179 }),
      row({ TglSawmill: '2026-08-03', TonRacip: 0.5 }),
    ])
    expect(data.dateKeys).toEqual(['2026-08-01', '2026-08-03'])
    const r = data.mejaGroups[0]!.rows[0]!
    expect(r.values.get('2026-08-01')).toBeCloseTo(0.179, 8)
    expect(r.values.get('2026-08-03')).toBeCloseTo(0.5, 8)
  })

  test('the grand total is the sum of every chamber and row', () => {
    const data = buildPerMejaData([
      row({ NoMeja: 3, TonRacip: 1 }),
      row({ NoMeja: 4, Tebal: 31, TonRacip: 2 }),
    ])
    expect(data.grandTotal).toBeCloseTo(3, 8)
    expect(data.totalsByDate.reduce((a, b) => a + b, 0)).toBeCloseTo(3, 8)
  })

  test('a date with no production still gets a column', () => {
    const data = buildPerMejaData([
      row({ TglSawmill: '2026-08-01' }),
      row({ TglSawmill: '2026-08-05' }),
    ])
    expect(data.dateKeys).toEqual(['2026-08-01', '2026-08-05'])
  })

  test('a row with no date contributes to no cell and no total', () => {
    const data = buildPerMejaData([row({ TglSawmill: null })])
    expect(data.dateKeys).toEqual([])
    expect(data.grandTotal).toBeCloseTo(0, 8)
  })

  test('rows sort by thickness, then unit', () => {
    const data = buildPerMejaData([
      row({ Tebal: 45 }),
      row({ Tebal: 18 }),
      row({ Tebal: 18, UOM: 'inch' }),
    ])
    // Within a thickness the unit breaks the tie, and 'inch' precedes 'mm'.
    expect(data.mejaGroups[0]!.rows.map((r) => `${r.tebal}/${r.uom}`)).toEqual([
      '18/inch',
      '18/mm',
      '45/mm',
    ])
  })

  test('the report renders a Sub Total row per chamber', () => {
    const data = buildPerMejaData([row()])
    const html = renderWith('rekap-hasil-sawmill-per-meja', data as never)
    expect(html).toContain('Sub Total Meja 3')
    expect(html).toContain('Total (Ton)')
  })
})

// ---------------------------------------------------------------------------
// Rekap Hasil Sawmill Per-Meja, piece-work variants
// ---------------------------------------------------------------------------

describe('piece-work sheets merge the main and sub reports', () => {
  const main = (over: Record<string, unknown> = {}) => ({
    NoMeja: 17,
    NamaMeja: 'BANSAW 17',
    TglSawmill: '2026-08-01',
    Jenis: 'RAMBUNG STD',
    Operator: 'MUSLIYAN',
    Tebal: 16,
    Lebar: 29,
    UOM: 'mm',
    TonRacip: 0.5,
    Condition: 'NORMAL',
    IsBorongan: true,
    ...over,
  })
  const sub = (over: Record<string, unknown> = {}) => ({ ...main(), SM: 12, ...over })

  test('the sub report supplies SM for the same line', () => {
    const data = buildBoronganData([main()], [sub()])
    const line = data.mejaGroups[0]!.dateGroups[0]!.lines[0]!
    expect(line.sm).toBe(12)
    expect(line.tonRacip).toBeCloseTo(0.5, 8)
  })

  test('a line with no sub row still appears, with no SM', () => {
    // A day with output but no measurement is still a day that ran.
    const data = buildBoronganData([main()], [])
    expect(data.mejaGroups[0]!.dateGroups[0]!.lines).toHaveLength(1)
    expect(data.mejaGroups[0]!.dateGroups[0]!.lines[0]!.sm).toBe(0)
  })

  test('a sub row with no matching main line is kept', () => {
    const data = buildBoronganData([], [sub()])
    expect(data.mejaGroups[0]!.dateGroups[0]!.lines).toHaveLength(1)
    expect(data.mejaGroups[0]!.dateGroups[0]!.smTotal).toBe(12)
  })

  test('different thicknesses stay separate lines', () => {
    const data = buildBoronganData(
      [main(), main({ Tebal: 45 }), main({ Lebar: 90 })],
      [sub(), sub({ Tebal: 45 }), sub({ Lebar: 90 })],
    )
    expect(data.mejaGroups[0]!.dateGroups[0]!.lines).toHaveLength(3)
  })

  test('lines sort by thickness, then width, then type', () => {
    const data = buildBoronganData(
      [main({ Tebal: 45 }), main({ Tebal: 16, Lebar: 90 }), main({ Tebal: 16, Lebar: 29 })],
      [],
    )
    const lines = data.mejaGroups[0]!.dateGroups[0]!.lines
    expect(lines.map((l) => `${l.tebal}/${l.lebar}`)).toEqual(['16/29', '16/90', '45/29'])
  })

  test('chambers come in numeric order and dates in date order', () => {
    const data = buildBoronganData(
      [main({ NoMeja: 10, TglSawmill: '2026-08-05' }), main({ NoMeja: 2, TglSawmill: '2026-08-09' })],
      [],
    )
    expect(data.mejaGroups.map((g) => g.noMeja)).toEqual([2, 10])
  })

  test('the chamber total is the sum of its own lines', () => {
    const data = buildBoronganData([main({ TonRacip: 1 }), main({ TonRacip: 2 })], [])
    // The two rows share a key, so they are ONE line carrying 3 - which is the
    // point: they must accumulate, not overwrite.
    expect(data.mejaGroups[0]!.dateGroups[0]!.lines).toHaveLength(1)
    expect(data.mejaGroups[0]!.tonTotal).toBeCloseTo(3, 8)
    expect(data.tonTotal).toBeCloseTo(3, 8)
  })

  test('both piece-work reports share one implementation and differ only in name', () => {
    const all = buildBoronganData([main()], [sub()])
    for (const type of [
      'rekap-hasil-sawmill-per-meja-semua-meja',
      'rekap-hasil-sawmill-per-meja-upah-borongan',
    ]) {
      const html = renderWith(type, all as never)
      expect(html).toContain('Ton Racip')
      expect(html).toContain('Grand Total')
    }
  })
})

// ---------------------------------------------------------------------------
// Rekap Kamar KD
// ---------------------------------------------------------------------------

describe('Rekap Kamar KD estimates lot volume from the thickness factor', () => {
  // The main procedure has no volume column. Volume only exists per thickness
  // in Sub1, so the report derives m3/ton per chamber, type and thickness and
  // applies it to each lot.
  const main = (over: Record<string, unknown> = {}) => ({
    NoRuangKD: 1,
    TglMasuk: '2026-08-01',
    TglKeluar: '2026-08-13',
    Hari: 12,
    Jenis: 'JABON',
    Tebal: 18,
    Lebar: 40,
    Ton: 0.8433,
    AveTebal: 18,
    AvePanjang: 3.5,
    ...over,
  })
  const sub1 = (over: Record<string, unknown> = {}) => ({
    NoRuangKD: 1,
    Jenis: 'JABON',
    Tebal: 18,
    Ton: 2.3519,
    m3: 3.3301,
    ...over,
  })

  test('a lot volume is its tonnage times the thickness factor', () => {
    const data = buildRekapKamarKdData([main()], [sub1()], [
      { NoRuangKD: 1, Jenis: 'JABON' },
    ])
    const lot = data.rooms[0]!.jenisGroups[0]!.detailRows[0]!
    // 0.8433 * (3.3301 / 2.3519) = 1.1940
    expect(lot.m3Est).toBeCloseTo(1.194, 4)
  })

  test('percent capacity is that estimate over the 80 m3 chamber', () => {
    const data = buildRekapKamarKdData([main()], [sub1()], [
      { NoRuangKD: 1, Jenis: 'JABON' },
    ])
    // 1.194 / 80 * 100 = 1.4925
    expect(data.rooms[0]!.jenisGroups[0]!.detailRows[0]!.pctCapacity).toBeCloseTo(1.49, 2)
  })

  test('a thickness with no Sub1 row yields zero rather than a wrong number', () => {
    const data = buildRekapKamarKdData([main({ Tebal: 99 })], [sub1()], [
      { NoRuangKD: 1, Jenis: 'JABON' },
    ])
    expect(data.rooms[0]!.jenisGroups[0]!.detailRows[0]!.m3Est).toBe(0)
    // The tonnage is still counted, so the chamber total is not short.
    expect(data.rooms[0]!.jumlahTon).toBeCloseTo(0.8433, 8)
  })

  test('the two capacity percentages are computed differently, on purpose', () => {
    // Sum of per-type percentages, each already rounded to 2 decimals, versus
    // total volume over capacity in one calculation. They are not expected to
    // agree - the legacy sheet shows the first.
    const data = buildRekapKamarKdData(
      [main({ Jenis: 'JABON' }), main({ Jenis: 'PULAI', Ton: 1 })],
      [sub1(), sub1({ Jenis: 'PULAI', m3: 2.5, Ton: 2 })],
      [{ NoRuangKD: 1, Jenis: 'JABON -- PULAI' }],
    )
    const room = data.rooms[0]!
    const sumOfRounded = room.jenisGroups.reduce((sum, g) => sum + g.pctCapacity, 0)
    expect(room.jumlahPctCapacity).toBeCloseTo(sumOfRounded, 8)
    // And the average is one division over the total.
    const totalM3 = 3.3301 + 2.5
    expect(room.avePctCapacity).toBeCloseTo((totalM3 / 80) * 100, 8)
  })

  test('the type order comes from Sub2, not from alphabetical sorting', () => {
    const data = buildRekapKamarKdData(
      [main({ Jenis: 'PULAI' }), main({ Jenis: 'JABON' })],
      [sub1(), sub1({ Jenis: 'PULAI' })],
      [{ NoRuangKD: 1, Jenis: 'PULAI -- JABON' }],
    )
    expect(data.rooms[0]!.jenisGroups.map((g) => g.jenis)).toEqual(['PULAI', 'JABON'])
  })

  test('types are lettered A, B, C within a chamber', () => {
    const data = buildRekapKamarKdData(
      [main({ Jenis: 'JABON' }), main({ Jenis: 'PULAI' }), main({ Jenis: 'RAMBUNG' })],
      [],
      [{ NoRuangKD: 1, Jenis: 'JABON -- PULAI -- RAMBUNG' }],
    )
    expect(data.rooms[0]!.jenisGroups.map((g) => g.label)).toEqual(['A.', 'B.', 'C.'])
  })

  test('the chamber days is the longest any lot spent, not a sum', () => {
    const data = buildRekapKamarKdData(
      [main({ Hari: 5 }), main({ Hari: 12 }), main({ Hari: 3 })],
      [],
      [{ NoRuangKD: 1, Jenis: 'JABON' }],
    )
    expect(data.rooms[0]!.hari).toBe(12)
  })

  test('a chamber numbered zero is dropped', () => {
    const data = buildRekapKamarKdData([main({ NoRuangKD: 0 })], [], [])
    expect(data.rooms).toHaveLength(0)
  })

  test('a type present only in Sub1 still gets a block', () => {
    const data = buildRekapKamarKdData([main()], [sub1(), sub1({ Jenis: 'PULAI' })], [])
    expect(data.rooms[0]!.jenisGroups.map((g) => g.jenis)).toContain('PULAI')
  })

  test('the report shows both capacity figures', () => {
    const data = buildRekapKamarKdData([main()], [sub1()], [
      { NoRuangKD: 1, Jenis: 'JABON' },
    ])
    const html = renderWith('rekap-kamar-kd', data as never)
    expect(html).toContain('Jumlah (% Capacity)')
    expect(html).toContain('Ave Capacity KD 1')
    expect(html).toContain('Jumlah (Ton)')
  })

  test('the two capacity figures are printed separately, not collapsed into one', () => {
    // Two types whose rounded percentages sum to something other than the
    // single-division average. If either were derived from the other, the two
    // printed values would be identical.
    const data = buildRekapKamarKdData(
      [main({ Jenis: 'JABON' }), main({ Jenis: 'PULAI' })],
      [sub1(), sub1({ Jenis: 'PULAI', m3: 2.5, Ton: 2 })],
      [{ NoRuangKD: 1, Jenis: 'JABON -- PULAI' }],
    )
    const room = data.rooms[0]!
    expect(room.jumlahPctCapacity).not.toBeCloseTo(room.avePctCapacity, 6)
    const html = renderWith('rekap-kamar-kd', data as never)
    expect(html).toContain(`>${room.jumlahPctCapacity.toFixed(2)}<`)
    expect(html).toContain(`>${room.avePctCapacity.toFixed(2)}<`)
  })
})

// ---------------------------------------------------------------------------
// Rekap Penerimaan ST Dari Sawmill (Non Rambung)
// ---------------------------------------------------------------------------

describe('Rekap Penerimaan ST Non Rambung derives three missing columns', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    NoPenerimaanST: 'B.162196',
    NmSupplier: 'INDRA KUMALA (PUTRA T)',
    NoTruk: 1663,
    TglLaporan: '2026-08-04',
    NoKayuBulat: 'A.017185',
    Jenis: 'JABON',
    NoMeja: 4,
    KBTon: 1.1841,
    STTon: 1.0583,
    Area: 20.6,
    Potong: 11,
    PcsKB: 7,
    PcsST: 12,
    TotalTblST: 26.3,
    ...over,
  })

  test('rendemen is output tonnage over input tonnage', () => {
    // 1.0583 / 1.1841 = 0.8938, printed as 89.38%
    const data = buildNonRambungData([row()])
    expect(data.suppliers[0]!.rows[0]!.rendStKb).toBeCloseTo(1.0583 / 1.1841, 8)
  })

  test('a receipt with no input tonnage has no rendemen, not a zero', () => {
    const data = buildNonRambungData([row({ KBTon: 0, STTon: 5 })])
    expect(data.suppliers[0]!.rows[0]!.rendStKb).toBe(0)
  })

  test('average diameter is the square root of area over piece count', () => {
    // sqrt(20.6 / 7) = 1.7153
    const data = buildNonRambungData([row()])
    expect(data.suppliers[0]!.rows[0]!.aveDia).toBeCloseTo(Math.sqrt(20.6 / 7), 8)
  })

  test('average table width is total table measure over piece count', () => {
    const data = buildNonRambungData([row()])
    expect(data.suppliers[0]!.rows[0]!.aveTbl).toBeCloseTo(26.3 / 12, 8)
  })

  test('a zero denominator gives zero rather than infinity or NaN', () => {
    const data = buildNonRambungData([row({ Area: 0, PcsKB: 0, PcsST: 0, TotalTblST: 0 })])
    const r = data.suppliers[0]!.rows[0]!
    expect(r.aveDia).toBe(0)
    expect(r.aveTbl).toBe(0)
    expect(Number.isNaN(r.aveDia)).toBe(false)
  })

  test('a blank supplier is bucketed so its tonnage still totals', () => {
    const data = buildNonRambungData([row({ NmSupplier: '' })])
    expect(data.suppliers[0]!.supplier).toBe('Tanpa Supplier')
    expect(data.grandKb).toBeCloseTo(1.1841, 8)
  })

  test('a supplier total is the sum of its own receipts', () => {
    const data = buildNonRambungData([row(), row({ KBTon: 2, STTon: 1.5 })])
    expect(data.suppliers[0]!.tonKb).toBeCloseTo(3.1841, 8)
    expect(data.grandKb).toBeCloseTo(3.1841, 8)
  })

  test('suppliers are alphabetical, receipts are by date inside each', () => {
    const data = buildNonRambungData([
      row({ NmSupplier: 'ZUL', TglLaporan: '2026-08-01' }),
      row({ NmSupplier: 'ARI', TglLaporan: '2026-08-09' }),
      row({ NmSupplier: 'ARI', TglLaporan: '2026-08-02' }),
    ])
    expect(data.suppliers.map((s) => s.supplier)).toEqual(['ARI', 'ZUL'])
    expect(data.suppliers[0]!.rows.map((r) => r.tanggal)).toEqual(['02-Agt-26', '09-Agt-26'])
  })

  test('the report prints rendemen as a percentage, not as a ratio', () => {
    const data = buildNonRambungData([row()])
    const html = renderWith('rekap-penerimaan-st-non-rambung', data as never)
    expect(html).toContain('89.38')
    expect(html).toContain('Rend ST-KB')
  })

  test('the report prints a supplier heading row and a total row', () => {
    const data = buildNonRambungData([row()])
    const html = renderWith('rekap-penerimaan-st-non-rambung', data as never)
    expect(html).toContain('supplier-heading-row')
    expect(html).toContain('supplier-total-row')
    // A total row wrapped in a div is invalid inside a tbody and would not
    // render at all, which is exactly the bug this asserts against.
    expect(html).not.toMatch(/<div[^>]*>\s*<tr/)
  })
})

// ---------------------------------------------------------------------------
// Rekap Produktivitas Sawmill
// ---------------------------------------------------------------------------

describe('Rekap Produktivitas Sawmill folds GroupKayu onto five columns', () => {
  test('the fold is by substring, and JABON is tested first', () => {
    expect(mapJenisToColumn('JABON')).toBe(0)
    expect(mapJenisToColumn('Jabon')).toBe(0)
    expect(mapJenisToColumn('RAMBUNG - MC-1')).toBe(2)
    expect(mapJenisToColumn('RAMBUNG MC 2')).toBe(3)
    expect(mapJenisToColumn('RAMBUNG - STD-560')).toBe(4)
    expect(mapJenisToColumn('RAMBUNG KAYU LAT')).toBe(1)
  })

  test('a group matching nothing is dropped, not given a sixth column', () => {
    expect(mapJenisToColumn('JENIS TIDAK DIKENAL')).toBeNull()
  })

  test('every value the live procedure actually returns is classified', () => {
    // These are the DISTINCT GroupKayu values from
    // SPWps_LapRekapProduktivitasSawmill over 2015-2026, all 9,886 rows. The
    // point of listing them is that each column label is also the needle the
    // fold tests for, so a typo in one needle - a transposed vowel, say -
    // silently empties that column while the sheet still renders and every
    // other column still adds up. That is how three of the five columns read
    // zero for months without anyone noticing.
    expect(mapJenisToColumn('JABON')).toBe(0)
    expect(mapJenisToColumn('JABON TG')).toBe(0)
    expect(mapJenisToColumn('RAMBUNG KAYU LAT')).toBe(1)
    expect(mapJenisToColumn('RAMBUNG MC 1')).toBe(2)
    expect(mapJenisToColumn('RAMBUNG MC 2')).toBe(3)
    expect(mapJenisToColumn('RAMBUNG STD')).toBe(4)
    // Spelled with the separator variants the reference also tolerates.
    expect(mapJenisToColumn('RambungMC1')).toBe(2)
    expect(mapJenisToColumn('RAMBUNG_MC_2')).toBe(3)
    expect(mapJenisToColumn('RambungSTD')).toBe(4)
    // And the ones the reference genuinely has no column for. LOKAL STD and
    // AFKIR/LOKAL/MC/PULAI/LAIN-LAIN are absent from the legacy sheet too, so
    // dropping them matches the reference rather than being our own omission.
    expect(mapJenisToColumn('RAMBUNG LOKAL STD')).toBe(4)
    expect(mapJenisToColumn('RAMBUNG AFKIR')).toBeNull()
    expect(mapJenisToColumn('RAMBUNG LOKAL')).toBeNull()
    expect(mapJenisToColumn('RAMBUNG MC')).toBeNull()
    expect(mapJenisToColumn('PULAI')).toBeNull()
    expect(mapJenisToColumn('LAIN-LAIN')).toBeNull()
    expect(mapJenisToColumn('')).toBeNull()
  })

  test('each column label folds onto its own index, so no needle can be typoed', () => {
    // Independent of the map above: build the needle out of the label itself.
    // A misspelling anywhere in the fold fails here rather than in production.
    const LABELS = [
      'JABON',
      'RAMBUNG KAYU L',
      'RAMBUNG MC 1',
      'RAMBUNG MC 2',
      'RAMBUNG STD',
    ] as const
    LABELS.forEach((label, index) => {
      expect(mapJenisToColumn(label)).toBe(index)
    })
  })

  test('a group naming two families lands in the first one tested', () => {
    // Order is the reference's: JABON, then KAYU LAT, MC 1, MC 2, STD.
    expect(mapJenisToColumn('JABON MC 1')).toBe(0)
    expect(mapJenisToColumn('RAMBUNG MC 1 STD')).toBe(2)
    expect(mapJenisToColumn('RAMBUNG MC 2 STD')).toBe(3)
  })

  test('a dropped group contributes to no column and to no total', () => {
    const data = buildProduktivitasData([
      { TglSawmill: '2026-08-03', JlhMeja: 3, GroupKayu: 'JABON', TonST: 2.6972 },
      { TglSawmill: '2026-08-03', JlhMeja: 3, GroupKayu: 'LAIN-LAIN', TonST: 999 },
    ])
    expect(data.rows[0]!.total).toBeCloseTo(2.6972, 8)
  })

  test('tonnage is summed per day per family', () => {
    const data = buildProduktivitasData([
      { TglSawmill: '2026-08-03', JlhMeja: 3, GroupKayu: 'JABON', TonST: 1 },
      { TglSawmill: '2026-08-03', JlhMeja: 3, GroupKayu: 'JABON', TonST: 2 },
    ])
    expect(data.rows[0]!.byType[0]).toBeCloseTo(3, 8)
  })

  test('the table count is the procedure value, not a row count', () => {
    // A group appearing on two rows for one day would otherwise be counted
    // twice if this were a count of rows.
    const data = buildProduktivitasData([
      { TglSawmill: '2026-08-03', JlhMeja: 3, GroupKayu: 'JABON', TonST: 1 },
      { TglSawmill: '2026-08-03', JlhMeja: 3, GroupKayu: 'PULAI', TonST: 1 },
    ])
    expect(data.rows[0]!.jumlahMeja).toBe(3)
  })

  test('days are ordered, and the totals add up', () => {
    const data = buildProduktivitasData([
      { TglSawmill: '2026-08-24', JlhMeja: 3, GroupKayu: 'JABON', TonST: 6.1558 },
      { TglSawmill: '2026-08-01', JlhMeja: 2, GroupKayu: 'RAMBUNG KAYU LAT', TonST: 0.179 },
    ])
    expect(data.rows.map((r) => r.tanggal)).toEqual(['2026-08-01', '2026-08-24'])
    expect(data.grandTotal).toBeCloseTo(6.3348, 8)
    expect(
      data.totalsByType.reduce((a, b) => a + b, 0),
    ).toBeCloseTo(data.grandTotal, 8)
  })

  test('a row with no date is skipped entirely', () => {
    const data = buildProduktivitasData([
      { TglSawmill: null, JlhMeja: 3, GroupKayu: 'JABON', TonST: 5 },
    ])
    expect(data.rows).toHaveLength(0)
    expect(data.grandTotal).toBeCloseTo(0, 8)
  })

  test('the report renders the five product columns', () => {
    const data = buildProduktivitasData([
      { TglSawmill: '2026-08-03', JlhMeja: 3, GroupKayu: 'JABON', TonST: 2.6972 },
    ])
    const html = renderWith('rekap-produktivitas-sawmill', data as never)
    expect(html).toContain('Jabon')
    expect(html).toContain('Rambung')
    expect(html).toContain('2.6972')
  })
})

// ---------------------------------------------------------------------------
// Cross-cutting
// ---------------------------------------------------------------------------

describe('the nine reports', () => {
  const TYPES = [
    'penerimaan-st-hasil-sawmill',
    'rekap-hasil-sawmill-per-meja',
    'rekap-hasil-sawmill-per-meja-semua-meja',
    'rekap-hasil-sawmill-per-meja-upah-borongan',
    'rekap-kamar-kd',
    'rekap-penerimaan-st-non-rambung',
    'rekap-produktivitas-sawmill',
  ]

  test('are all registered', () => {
    for (const type of TYPES) expect(Object.keys(reports)).toContain(type)
  })

  test('reject a period given in the wrong shape', () => {
    // The two keyed reports take a single identifier, not a date range.
    expect(
      reports['penerimaan-st-hasil-sawmill']!.paramsSchema.safeParse({ noPenST: '' }).success,
    ).toBe(false)
    expect(
      reports['penerimaan-st-hasil-sawmill']!.paramsSchema.safeParse({
        noPenST: 'B.001516',
      }).success,
    ).toBe(true)
    expect(
      reports['rekap-kamar-kd']!.paramsSchema.safeParse({
        tglAwal: '2026-09-01',
        tglAkhir: '2026-08-01',
      }).success,
    ).toBe(false)
  })

  test('publish their titles in the registry, not a generic one', () => {
    for (const type of TYPES) {
      expect(reports[type]!.title).toMatch(/Laporan|Lembaran/)
    }
  })
})
