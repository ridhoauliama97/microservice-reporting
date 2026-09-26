import { describe, expect, test } from 'bun:test'
import { normalizeUmurRows, type UmurRow } from '../src/reports/wps/umur-detail'
import { mainValues } from '../src/reports/wps/mutasi-finger-joint'
import {
  computeConsolidatedTotals,
  groupConsolidatedByMachine,
  hkFromRange,
  normalizeConsolidatedRows,
} from '../src/reports/wps/rekap-produksi-finger-joint-consolidated'

/** The ageing SP always returns five period buckets; fill the unused ones. */
const umurRow = (over: Partial<UmurRow>): UmurRow => ({
  Jenis: 'JABON',
  NamaGrade: 'A/A',
  Tebal: 2,
  Lebar: 4,
  Panjang: 6,
  Period1: 0,
  Period2: 0,
  Period3: 0,
  Period4: 0,
  Period5: 0,
  ...over,
})

describe('normalizeUmurRows', () => {
  test('groups rows that share Jenis and dimensions', () => {
    const rows = normalizeUmurRows([
      umurRow({ Period1: 1 }),
      umurRow({ Period1: 2 }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]!.Period1).toBe(3)
    expect(rows[0]!.Total).toBe(3)
  })

  test('keeps different dimensions as separate rows', () => {
    const rows = normalizeUmurRows([
      umurRow({ Tebal: 2, Period1: 1 }),
      umurRow({ Tebal: 3, Period1: 1 }),
    ])
    expect(rows).toHaveLength(2)
  })

  test('drops zero-total rows like the legacy filter', () => {
    expect(normalizeUmurRows([umurRow({ Period1: 0 })])).toEqual([])
  })

  test('renders "Jenis - NamaGrade"', () => {
    expect(normalizeUmurRows([umurRow({ Period1: 5 })])[0]!.Jenis).toBe('JABON - A/A')
  })

  test('sorts by Jenis then dimensions ascending, nulls last', () => {
    const rows = normalizeUmurRows([
      umurRow({ Jenis: 'RAMBUNG', NamaGrade: 'A/B', Tebal: 9, Period1: 1 }),
      umurRow({ Tebal: null, Period1: 1 }),
      umurRow({ Tebal: 5, Period1: 1 }),
      umurRow({ Tebal: 2, Period1: 1 }),
    ])
    // JABON sorts before RAMBUNG; within JABON the null dimension comes last.
    expect(rows.map((r) => r.Tebal)).toEqual([2, 5, null, 9])
  })
})

describe('mutasi-finger-joint mainValues', () => {
  const base = {
    Jenis: 'JABON',
    FJAwal: 10,
    AdjOutputFJ: 1,
    BSOutputFJ: 2,
    FJProdOutput: 3,
    AdjInptFJ: 4,
    BSInptFJ: 5,
    FJJual: 6,
    CCAInptFJ: 7,
    MldInptFJ: 8,
    S4SInptFJ: 9,
    SandInptFJ: 10,
    FJAkhir: 99,
  }

  test('Total Masuk sums the three Masuk columns only', () => {
    expect(mainValues(base).totalMasuk).toBe(6)
  })

  test('Total Keluar sums the seven Keluar columns only', () => {
    // 4 + 5 + 6 + 7 + 8 + 9 + 10
    expect(mainValues(base).totalKeluar).toBe(49)
  })

  test('Akhir is taken from the SP, not recomputed', () => {
    expect(mainValues(base).akhir).toBe(99)
  })

  test('treats nulls and blank strings as zero', () => {
    const values = mainValues({ ...base, AdjOutputFJ: null, BSOutputFJ: '' })
    expect(values.adjOut).toBe(0)
    expect(values.bsOut).toBe(0)
    expect(values.totalMasuk).toBe(3)
  })

  test('parses comma-decimal strings', () => {
    expect(mainValues({ ...base, FJProdOutput: '1,5' }).prodOut).toBe(1.5)
  })
})

describe('rekap produksi finger joint consolidated', () => {
  const raw = [
    { Tanggal: '2026-08-02', Shift: 2, NamaMesin: 'MESIN B', JamKerja: 8, JmlhAnggota: 4, CCAkhir: 10, S4S: 5, OutPutFJ: 12 },
    { Tanggal: '2026-08-01', Shift: 1, NamaMesin: 'MESIN A', JamKerja: 8, JmlhAnggota: 2, CCAkhir: 6, S4S: 4, OutPutFJ: 8 },
    { Tanggal: '2026-08-01', Shift: 3, NamaMesin: 'MESIN A', JamKerja: 4, JmlhAnggota: 3, CCAkhir: 4, S4S: 2, OutPutFJ: 6 },
  ]

  test('sorts by machine, then date, then shift', () => {
    const rows = normalizeConsolidatedRows(raw)
    expect(rows.map((r) => `${r.namaMesin}/${r.tanggal}/${r.shift}`)).toEqual([
      'MESIN A/2026-08-01/1',
      'MESIN A/2026-08-01/3',
      'MESIN B/2026-08-02/2',
    ])
  })

  test('Total Input is CCAkhir + S4S', () => {
    expect(normalizeConsolidatedRows(raw)[0]!.totalInput).toBe(10)
  })

  test('derives M3/Jam, M3/jam/Org and Rend per row', () => {
    const row = normalizeConsolidatedRows(raw)[0]!
    expect(row.m3Jam).toBe(1) // 8 / 8
    expect(row.m3JamOrg).toBe(0.5) // 8 / (8 * 2)
    expect(row.rend).toBe(80) // 8 / 10 * 100
  })

  test('leaves ratios null when the divisor is zero', () => {
    const rows = normalizeConsolidatedRows([
      { Tanggal: '2026-08-01', Shift: 1, NamaMesin: 'M', JamKerja: 0, JmlhAnggota: 0, CCAkhir: 1, S4S: 1, OutPutFJ: 2 },
    ])
    expect(rows[0]!.m3Jam).toBeNull()
    expect(rows[0]!.m3JamOrg).toBeNull()
    expect(rows[0]!.rend).toBe(100)
  })

  test('totals sum the per-row ratios rather than recomputing them', () => {
    const totals = computeConsolidatedTotals(normalizeConsolidatedRows(raw))
    // 12/8 + 8/8 + 6/4 = 4, which is not 26 / 28.
    expect(totals.m3Jam).toBeCloseTo(4)
    expect(totals.cca).toBe(20)
    expect(totals.s4s).toBe(11)
    expect(totals.output).toBe(26)
    expect(totals.totalInput).toBe(31)
    expect(totals.rend).toBeCloseTo((26 / 31) * 100)
  })

  test('groups per machine and names a blank machine MESIN', () => {
    const rows = normalizeConsolidatedRows([
      ...raw,
      { Tanggal: '2026-08-01', Shift: 1, NamaMesin: '', JamKerja: 1, JmlhAnggota: 1, CCAkhir: 1, S4S: 0, OutPutFJ: 1 },
    ])
    const groups = groupConsolidatedByMachine(rows, 31)
    expect(groups.map((g) => g.namaMesin)).toEqual(['MESIN', 'MESIN A', 'MESIN B'])
    expect(groups[1]!.rows).toHaveLength(2)
  })

  test('HK is calendar days inclusive and 0 for a reversed range', () => {
    expect(hkFromRange('2026-08-01', '2026-08-31')).toBe(31)
    expect(hkFromRange('2026-08-01', '2026-08-01')).toBe(1)
    expect(hkFromRange('2026-08-31', '2026-08-01')).toBe(0)
  })

  test('working days count only dates with activity', () => {
    const rows = normalizeConsolidatedRows([
      { Tanggal: '2026-08-01', Shift: 1, NamaMesin: 'M', JamKerja: 8, JmlhAnggota: 2, CCAkhir: 1, S4S: 0, OutPutFJ: 1 },
      { Tanggal: '2026-08-01', Shift: 2, NamaMesin: 'M', JamKerja: 0, JmlhAnggota: 0, CCAkhir: 0, S4S: 0, OutPutFJ: 0 },
    ])
    expect(groupConsolidatedByMachine(rows, 31)[0]!.hkWorking).toBe(1)
  })
})
